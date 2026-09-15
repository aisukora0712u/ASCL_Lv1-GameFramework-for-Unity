import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import http from "node:http";
import { fileURLToPath } from "node:url";
import { zipSync, unzipSync } from "fflate";
import { Store, serialize } from "../server/store.ts";
import { template, kinds } from "../shared/model.ts";
import {
  hash,
  securePath,
  relativeSafe,
  acquire,
  json,
} from "../server/files.ts";
import { capture, captureAndCommit, checkSources } from "../server/evidence.ts";
import { exportBackup, importBackup } from "../server/backup.ts";
import { validateAttachment } from "../server/attachments.ts";
import { Manager } from "../server/manager.ts";
import { createApp } from "../server/index.ts";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const ctx = (
  s: Store,
  baseline: string | null = null,
  operationId = randomUUID(),
) => ({ epoch: s.state.epoch, baseline, operationId });
const example = (id = "example", type: (typeof kinds)[number] = "wiki") => ({
  ...template(type),
  id,
  title: "测试记录 数值",
  modules: ["Numeric"],
});
test("删除、来源采集、附件上传的操作重放不生成额外版本", async (t) => {
  const { store: s } = await fixture(t);
  await s.save(ctx(s), example(), "initial");
  const deletion = ctx(s, s.entry("example")!.revision);
  const first = await s.remove(deletion, "example");
  assert.deepEqual(await s.remove(deletion, "example"), first);
  assert.equal(s.search("数值").length, 0);
  assert.equal(s.search("数值", "wiki", "草稿", "Numeric", true).length, 1);
  assert.equal(s.search("不匹配", "", "", "", true).length, 0);
  const request = ctx(s);
  const input = { title: "external", summary: "manual", revision: "v1" };
  const source = await captureAndCommit(s, request, input, {});
  assert.deepEqual(await captureAndCommit(s, request, input, {}), source);
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jVZkAAAAASUVORK5CYII=",
    "base64",
  );
  const upload = ctx(s);
  const a = await s.addAttachment(
    upload,
    validateAttachment(png, "same.png", "note"),
    png,
  );
  assert.deepEqual(
    await s.addAttachment(
      upload,
      validateAttachment(png, "same.png", "note"),
      png,
    ),
    a,
  );
});
test("备份冻结期间的外部变动拒绝导出，旧历史附件完整保留", async (t) => {
  const { store: s, root } = await fixture(t);
  await s.save(ctx(s), example(), "before");
  s.hooks.stage = async (stage) => {
    if (stage === "backup-staged")
      await fs.appendFile(path.join(s.root, "records/example.md"), "external");
  };
  await assert.rejects(exportBackup(s, ctx(s)), /外部修改/);
  s.hooks = {};
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jVZkAAAAASUVORK5CYII=",
    "base64",
  );
  const a = validateAttachment(png, "first.png", "first");
  await s.addAttachment(ctx(s), a, png);
  const b = validateAttachment(png, "second.png", "second", a.id);
  await s.addAttachment(ctx(s), b, png);
  const copy = await importBackup(
    await exportBackup(s, ctx(s)),
    path.join(root, "backup assets"),
  );
  assert.equal(copy.state.attachments.length, 2);
  assert.equal(
    hash(await fs.readFile(path.join(copy.root, `attachments/${a.id}.bin`))),
    a.digest,
  );
});
test("切换中断保留旧库，切换后响应丢失可按原操作确认", async (t) => {
  const { root } = await fixture(t);
  const m = await new Manager(path.join(root, "switch state")).initialize(
    path.join(root, "switch library"),
  );
  const old = m.store;
  await old.save(ctx(old), example(), "original");
  const bytes = await exportBackup(old, ctx(old));
  old.hooks.stage = async (stage) => {
    if (stage === "before-switch") throw new Error("switch interrupted");
  };
  await assert.rejects(m.restore(ctx(old), bytes), /interrupted/);
  assert.equal(m.store.root, old.root);
  old.hooks.stage = async (stage) => {
    if (stage === "switch-response") throw new Error("response lost");
  };
  const request = ctx(old);
  await assert.rejects(m.restore(request, bytes), /response lost/);
  const confirmed = await m.restore(request, bytes);
  assert.equal(confirmed.epoch, m.store.state.epoch);
  assert.notEqual(confirmed.epoch, old.state.epoch);
});
test("备份压缩阶段释放全部写锁，后续修改不进入已暂存备份", async (t) => {
  const { root } = await fixture(t);
  const manager = await new Manager(path.join(root, "state")).initialize(
    path.join(root, "live"),
  );
  const store = manager.store;
  await manager.run(ctx(store), (s) =>
    s.save(ctx(s), example(), "staged version"),
  );
  store.hooks.stage = async (stage) => {
    if (stage === "backup-compressing")
      await manager.run(ctx(store), (s) =>
        s.save(
          ctx(s, s.entry("example")!.revision),
          example(),
          "later version",
        ),
      );
  };
  const restored = await importBackup(
    await manager.backup(ctx(store)),
    path.join(root, "restored"),
  );
  assert.equal(store.entry("example")!.body, "later version");
  assert.equal(restored.entry("example")!.body, "staged version");
});
test("真实 CLI 提交与网页共用摘要，陈旧 CLI 保存被拒绝", async (t) => {
  const { root } = await fixture(t);
  const state = path.join(root, "cli state");
  const m = await new Manager(state).initialize(path.join(root, "cli lib"));
  const s = m.store;
  const file = path.join(root, "draft.md");
  await fs.writeFile(file, serialize(example(), "CLI saved"));
  const execute = promisify(execFile);
  const cli = fileURLToPath(new URL("../server/cli.ts", import.meta.url));
  const args = [
    "--state",
    state,
    "--epoch",
    s.state.epoch,
    "--baseline",
    "null",
    "--op",
    randomUUID(),
  ];
  await execute(process.execPath, [cli, "save", file, ...args], {
    windowsHide: true,
  });
  await s.reconcile();
  assert.equal(s.entry("example")!.body, "CLI saved");
  await assert.rejects(
    execute(
      process.execPath,
      [cli, "save", file, ...args.slice(0, -1), randomUUID()],
      { windowsHide: true },
    ),
    /改变/,
  );
});
test("Git 源码范围标记未提交修改，并忽略范围外修改", async (t) => {
  const { root } = await fixture(t);
  const code = path.join(root, "git-source");
  await fs.mkdir(code);
  const execute = promisify(execFile);
  const git = (...args: string[]) =>
    execute("git", ["-C", code, ...args], { windowsHide: true });
  await git("init");
  await fs.writeFile(path.join(code, "a.cs"), "tracked");
  await git("add", "a.cs");
  await git(
    "-c",
    "user.name=Fixture",
    "-c",
    "user.email=fixture@example.invalid",
    "commit",
    "-m",
    "synthetic fixture",
  );
  await fs.writeFile(path.join(code, "outside.txt"), "untracked");
  const input = {
    title: "scope",
    summary: "scope",
    rootId: "source",
    scope: ["a.cs"],
  };
  const clean = await capture(input, { source: code });
  assert.equal(clean.dirty, false);
  await fs.appendFile(path.join(code, "a.cs"), "changed");
  const dirty = await capture(input, { source: code });
  assert.equal(dirty.dirty, true);
  assert.equal(clean.revision, dirty.revision);
  assert.notDeepEqual(clean.inventory, dirty.inventory);
});
async function httpFetch(url: string, options: any = {}) {
  return new Promise<any>((resolve, reject) => {
    const req = http.request(url, options, (res) => {
      const parts: Buffer[] = [];
      res.on("data", (d) => parts.push(d));
      res.on("end", () =>
        resolve({
          status: res.statusCode,
          headers: { get: (key: string) => res.headers[key] },
          json: async () => JSON.parse(Buffer.concat(parts).toString()),
        }),
      );
    });
    req.on("error", reject);
    req.end(options.body);
  });
}
async function fixture(t: any) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ASCL 测试 space-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return {
    root,
    store: await new Store(path.join(root, "library")).initialize(),
  };
}
test("五类创建编辑、普通关联成环与实施依赖环校验", async (t) => {
  const { store: s } = await fixture(t);
  for (const kind of kinds)
    await s.save(ctx(s), example(kind, kind), `## 实例\n${kind}`);
  let a = s.entry("wiki")!;
  await s.save(
    ctx(s, a.revision),
    { ...a.meta, relations: ["roadmap"] },
    a.body,
  );
  let b = s.entry("roadmap")!;
  await s.save(
    ctx(s, b.revision),
    { ...b.meta, relations: ["wiki"], dependencies: ["wiki"] },
    b.body,
  );
  a = s.entry("wiki")!;
  assert.deepEqual(a.backlinks, ["roadmap"]);
  await assert.rejects(
    s.save(
      ctx(s, a.revision),
      { ...a.meta, dependencies: ["roadmap"] },
      a.body,
    ),
    /成环/,
  );
  assert.equal(s.state.entries.length, 5);
});
test("摘要覆盖 YAML 与正文，未知字段和正文保留，文件重命名不破坏身份", async (t) => {
  const { store: s } = await fixture(t);
  const meta = { ...example(), customExtension: { a: [1, 2] } };
  await s.save(ctx(s), meta, "原始正文\r\n|a|b|\n");
  let e = s.entry("example")!;
  await fs.rename(
    path.join(s.root, e.file),
    path.join(s.root, "records/重命名.md"),
  );
  await s.reconcile();
  e = s.entry("example")!;
  await s.save(ctx(s, e.revision), { ...e.meta, title: "更新标题" }, e.body);
  assert.deepEqual(s.entry("example")!.meta.customExtension, { a: [1, 2] });
  assert.equal(s.entry("example")!.body, "原始正文\r\n|a|b|\n");
  const stale = s.entry("example")!;
  await fs.appendFile(path.join(s.root, stale.file), "外部修改");
  await assert.rejects(
    s.save(ctx(s, stale.revision), stale.meta, "changed"),
    /改变/,
  );
});
test("未知格式、重复 ID、失效关系具体诊断且禁止覆盖", async (t) => {
  const { store: s } = await fixture(t);
  await s.save(ctx(s), example(), "first");
  const e = s.entry("example")!;
  await fs.copyFile(
    path.join(s.root, e.file),
    path.join(s.root, "records/duplicate.md"),
  );
  await fs.writeFile(
    path.join(s.root, "records/bad.md"),
    "---\nformat: 999\nid: unknown\n---\nraw preserved",
  );
  await s.reconcile();
  assert.ok(
    s.state.diagnostics.some(
      (d) => d.message.includes("重复 ID") && d.file.includes("duplicate"),
    ),
  );
  await assert.rejects(s.save(ctx(s, e.revision), e.meta, "overwrite"), /重复/);
  assert.match(
    await fs.readFile(path.join(s.root, "records/bad.md"), "utf8"),
    /999/,
  );
});
test("两写入者和 CLI 模块竞争，不丢失赢家；保存与删除竞争", async (t) => {
  const { store: a } = await fixture(t);
  await a.save(ctx(a), example(), "original");
  const b = await new Store(a.root).initialize();
  const e = a.entry("example")!;
  const result = await Promise.allSettled([
    a.save(ctx(a, e.revision), e.meta, "A"),
    b.save(ctx(b, e.revision), e.meta, "B"),
  ]);
  assert.equal(result.filter((x) => x.status === "fulfilled").length, 1);
  await a.reconcile();
  await assert.rejects(b.remove(ctx(b, e.revision), e.meta.id), /改变/);
  assert.ok(["A", "B"].includes(a.entry(e.meta.id)!.body));
});
test("响应丢失时相同操作返回原结果，无重复历史", async (t) => {
  const { store: s } = await fixture(t);
  const request = ctx(s);
  const meta = example();
  s.hooks.stage = async (n) => {
    if (n === "response") throw new Error("lost response");
  };
  await assert.rejects(s.save(request, meta, "content"), /lost response/);
  s.hooks = {};
  const again = await s.save(request, meta, "content");
  assert.equal(again.revision, s.entry(meta.id)!.revision);
  assert.equal((await s.history(meta.id)).length, 1);
  await assert.rejects(s.save(request, meta, "different"), /不同请求/);
});
for (const stage of [
  "snapshots",
  "prepared",
  "before-replace",
  "temporary",
  "replaced-0",
  "before-commit",
  "response",
])
  test(`真实强杀进程恢复：${stage}`, async (t) => {
    const { store: s } = await fixture(t);
    await s.save(ctx(s), example(), "original");
    const e = s.entry("example")!;
    const op = randomUUID();
    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [
          fileURLToPath(new URL("./crash-worker.ts", import.meta.url)),
          s.root,
          stage,
          op,
          s.state.epoch,
          e.revision,
        ],
        { windowsHide: true, stdio: "pipe" },
      );
      let stderr = "";
      child.stderr.on("data", (d) => (stderr += d));
      child.once("error", reject);
      child.once("exit", (code) => {
        if (code === 0) reject(new Error("进程未被强杀 " + stderr));
        else resolve();
      });
    });
    const recovered = await new Store(s.root).initialize();
    assert.equal(
      recovered.entry("example")!.body,
      stage === "response" ? "changed by subprocess" : "original",
    );
    assert.ok(
      await fs.readFile(
        path.join(
          s.root,
          "history",
          op,
          stage === "snapshots"
            ? "0.after"
            : stage === "response"
              ? "committed.json"
              : "rolled-back.json",
        ),
      ),
    );
  });
for (const fault of ["ENOSPC", "EPERM"])
  test(`注入 ${fault}，目标文件和历史保持`, async (t) => {
    const { store: s } = await fixture(t);
    await s.save(ctx(s), example(), "original");
    const e = s.entry("example")!;
    s.hooks.stage = async (n) => {
      if (n === "before-replace")
        throw Object.assign(new Error(fault), { code: fault });
    };
    await assert.rejects(
      s.save(ctx(s, e.revision), e.meta, "new"),
      new RegExp(fault),
    );
    s.hooks = {};
    await s.reconcile();
    assert.equal(s.entry("example")!.body, "original");
  });
for (const stage of ["replaced-0", "replaced-1"])
  test(`附件双文件事务强杀恢复 ${stage}`, async (t) => {
    const { store: s } = await fixture(t);
    const op = randomUUID();
    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [
          fileURLToPath(new URL("./crash-worker.ts", import.meta.url)),
          s.root,
          stage,
          op,
          s.state.epoch,
          "null",
          "attachment",
        ],
        { windowsHide: true, stdio: "pipe" },
      );
      child.once("error", reject);
      child.once("exit", (code) =>
        code === 0 ? reject(new Error("未强杀")) : resolve(),
      );
    });
    const recovered = await new Store(s.root).initialize();
    assert.equal(recovered.state.attachments.length, 0);
    assert.deepEqual(await fs.readdir(path.join(s.root, "attachments")), []);
  });
test(
  "Windows 原生文件共享锁导致替换失败时保留原文件",
  { skip: process.platform !== "win32" },
  async (t) => {
    const { store: s } = await fixture(t);
    await s.save(ctx(s), example(), "original");
    const e = s.entry("example")!;
    const file = path.join(s.root, e.file);
    const literal = file.replaceAll("'", "''");
    const child = spawn(
      "powershell.exe",
      [
        "-NoProfile",
        "-Command",
        `$held=[System.IO.File]::Open('${literal}',[System.IO.FileMode]::Open,[System.IO.FileAccess]::Read,[System.IO.FileShare]::Read); Write-Output 'READY'; [System.Threading.Thread]::Sleep(30000); $held.Close()`,
      ],
      { windowsHide: true, stdio: "pipe" },
    );
    await new Promise<void>((resolve, reject) => {
      child.stdout.once("data", () => resolve());
      child.once("error", reject);
      child.once("exit", (code) => {
        if (code !== null && code !== 0) reject(new Error("文件锁进程失败"));
      });
    });
    try {
      await assert.rejects(s.save(ctx(s, e.revision), e.meta, "changed"));
      assert.equal(
        await fs.readFile(file, "utf8"),
        serialize(e.meta, "original"),
      );
    } finally {
      const exited = new Promise<void>((resolve) =>
        child.once("exit", () => resolve()),
      );
      child.kill();
      await exited;
    }
    assert.equal(
      (await new Store(s.root).initialize()).entry("example")!.body,
      "original",
    );
  },
);
test("第三种磁盘内容不自动覆盖", async (t) => {
  const { store: s } = await fixture(t);
  await s.save(ctx(s), example(), "original");
  const e = s.entry("example")!;
  s.hooks.stage = async (n) => {
    if (n === "replaced-0") {
      await fs.writeFile(path.join(s.root, e.file), "third party");
      throw new Error("crash");
    }
  };
  await assert.rejects(s.save(ctx(s, e.revision), e.meta, "new"), /第三种/);
  assert.equal(
    await fs.readFile(path.join(s.root, e.file), "utf8"),
    "third party",
  );
});
test("历史恢复产生新版本，回收仍保留入站关系", async (t) => {
  const { store: s } = await fixture(t);
  await s.save(ctx(s), example(), "original");
  const original = s.entry("example")!;
  await s.save(
    ctx(s),
    { ...example("linked"), relations: ["example"] },
    "linked",
  );
  await s.remove(ctx(s, original.revision), "example");
  assert.deepEqual(s.entry("example")!.backlinks, ["linked"]);
  assert.equal(s.entry("example")!.meta.deleted, true);
  const old = (await s.history("example")).find((h) => h.before === null)!;
  await s.restoreHistory(
    ctx(s, s.entry("example")!.revision),
    "example",
    old.operationId,
    "after",
  );
  assert.equal(s.entry("example")!.body, "original");
  assert.equal(s.entry("example")!.meta.deleted, false);
});
test("单字/词组/API/表格/代码/附件说明搜索与对账更新", async (t) => {
  const { store: s } = await fixture(t);
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jVZkAAAAASUVORK5CYII=",
    "base64",
  );
  const asset = validateAttachment(png, "证据.png", "附件说明索引");
  await s.addAttachment(ctx(s), asset, png);
  await s.save(
    ctx(s),
    { ...example(), attachments: [asset.id], fields: { 可见: "特别内容" } },
    "数值系统\n```csharp\nWorld.Create<T>()\n```\n|标题|值|\n|--|--|\n|表格|说明|",
  );
  for (const q of [
    "数",
    "数值系统",
    "World.Create<T>()",
    "Create",
    "特别内容",
    "附件说明",
    "证据.png",
    "表格",
  ])
    assert.equal(s.search(q).length, 1, q);
  assert.equal(s.search("数", "roadmap").length, 0);
  assert.equal(s.search("数", "wiki", "草稿", "Numeric").length, 1);
  await fs.writeFile(
    path.join(s.root, "records/example.md"),
    serialize(example(), "监听关闭后的新内容"),
  );
  await s.reconcile();
  assert.equal(s.search("监听关闭").length, 1);
  assert.equal(s.search("World.Create").length, 0);
});
test("来源文件/目录新增删除/配置变化，未绑定与未变化；实质复核不被检查刷新", async (t) => {
  const { store: s, root } = await fixture(t);
  const code = path.join(root, "源码");
  await fs.mkdir(path.join(code, "module"), { recursive: true });
  await fs.writeFile(path.join(code, "module/a.cs"), "a");
  await fs.writeFile(path.join(code, "config.json"), "{}");
  const source = await capture(
    {
      title: "源码",
      summary: "固定范围",
      revision: "manual-r1",
      rootId: "code",
      scope: ["module", "config.json"],
    },
    { code },
  );
  await s.addSource(ctx(s), source);
  await s.save(
    ctx(s),
    {
      ...example(),
      sources: [{ sourceId: source.sourceId, versionId: source.versionId }],
    },
    "结论",
  );
  let e = s.entry("example")!;
  await s.review(ctx(s, e.revision), e.meta.id, "核验摘录与用法");
  const review = await fs.readFile(
    path.join(s.root, "reviews/example.json"),
    "utf8",
  );
  await fs.writeFile(path.join(code, "unrelated.txt"), "irrelevant");
  await checkSources(s, { code }, ctx(s));
  assert.equal(s.state.checks[source.versionId].state, "范围未变化");
  assert.equal(
    await fs.readFile(path.join(s.root, "reviews/example.json"), "utf8"),
    review,
  );
  await fs.writeFile(path.join(code, "module/new.cs"), "new");
  await fs.unlink(path.join(code, "module/a.cs"));
  await fs.writeFile(path.join(code, "config.json"), '{"changed":true}');
  await checkSources(s, { code }, ctx(s));
  assert.equal(s.state.checks[source.versionId].changes.length, 3);
  await checkSources(s, {}, ctx(s));
  assert.equal(s.state.checks[source.versionId].state, "未绑定");
  e = s.entry("example")!;
  await s.save(ctx(s, e.revision), e.meta, "新的结论");
  assert.equal(s.entry("example")!.reviewed, false);
  assert.equal(s.state.sources[0].inventory["module/a.cs"], hash("a"));
});
test("备份包含错误原文、历史与旧附件；损坏/越界/未知格式阻止恢复", async (t) => {
  const { store: s, root } = await fixture(t);
  await s.save(ctx(s), example(), "before");
  const e = s.entry("example")!;
  await s.save(ctx(s, e.revision), e.meta, "after");
  await fs.writeFile(
    path.join(s.root, "records/malformed.md"),
    "原文: [broken",
  );
  await fs.writeFile(path.join(s.root, "notes.tmp"), "user-authored raw file");
  const bytes = await exportBackup(s, ctx(s));
  const restored = await importBackup(bytes, path.join(root, "restored"));
  assert.equal(restored.entry("example")!.body, "after");
  assert.equal((await restored.history("example")).length, 2);
  assert.ok(
    restored.state.diagnostics.some((d) => d.file.endsWith("malformed.md")),
  );
  assert.notEqual(restored.state.epoch, s.state.epoch);
  const files = unzipSync(bytes);
  assert.equal(
    Buffer.from(files["notes.tmp"]).toString(),
    "user-authored raw file",
  );
  files["records/example.md"] = Buffer.from("tampered");
  await assert.rejects(
    importBackup(Buffer.from(zipSync(files)), path.join(root, "bad")),
    /校验/,
  );
  await assert.rejects(
    importBackup(
      Buffer.from(zipSync({ "../escape.txt": Buffer.from("bad") })),
      path.join(root, "escape"),
    ),
    /路径/,
  );
  const unknown = unzipSync(bytes);
  const manifest = JSON.parse(
    Buffer.from(unknown["backup-manifest.json"]).toString(),
  );
  manifest.format = 999;
  unknown["backup-manifest.json"] = Buffer.from(json(manifest));
  await assert.rejects(
    importBackup(Buffer.from(zipSync(unknown)), path.join(root, "unknown")),
    /未知/,
  );
});
test("切换库拒绝旧 CLI 世代，旧库保留", async (t) => {
  const { root } = await fixture(t);
  const m = await new Manager(path.join(root, "private state")).initialize(
    path.join(root, "managed"),
  );
  const old = m.store;
  await old.save(ctx(old), example(), "saved");
  const bytes = await exportBackup(old, ctx(old));
  const stale = ctx(old);
  await m.restore(ctx(old), bytes);
  assert.notEqual(m.store.root, old.root);
  assert.equal(
    await fs.readFile(path.join(old.root, "records/example.md"), "utf8"),
    serialize(old.entry("example")!.meta, "saved"),
  );
  await assert.rejects(
    m.run(stale, (s) => s.save(stale, example("new"), "bad")),
    /世代/,
  );
});
test("暂停写入、未知活跃锁不会因超时抢占", async (t) => {
  const { store: s } = await fixture(t);
  await s.pause(ctx(s), true);
  await assert.rejects(s.save(ctx(s), example(), "blocked"), /暂停/);
  await s.pause(ctx(s), false);
  const release = await acquire(s.root);
  await assert.rejects(acquire(s.root), /状态不明|活动/);
  await release();
});
test("路径边界、Windows 保留名、大小写路径及重解析点", async (t) => {
  const { store: s, root } = await fixture(t);
  for (const value of [
    "../escape",
    "C:/foo",
    "a/CON.md",
    "a/nul",
    "a/file:ads",
    "a\\b",
    "a./b",
    "//server/a",
  ])
    assert.throws(() => relativeSafe(value));
  assert.ok(
    (await securePath(s.root, "records/中文 路径.md")).includes("中文 路径"),
  );
  await fs.symlink(root, path.join(s.root, "jump"), "junction");
  await assert.rejects(securePath(s.root, "jump/file.md"), /重解析/);
});
test("文件签名拒绝伪造类型与过大像素", () => {
  assert.throws(
    () => validateAttachment(Buffer.from("<svg>evil</svg>"), "image.png", ""),
    /识别/,
  );
  assert.throws(
    () => validateAttachment(Buffer.from("%PDF-1.7 invalid"), "file.pdf", ""),
    /结束/,
  );
  assert.throws(
    () =>
      validateAttachment(Buffer.alloc(50 * 1024 * 1024 + 1), "too-big.png", ""),
    /50/,
  );
});
test("HTTP 精确 Host、Origin、令牌，危险原文安全 JSON 返回", async (t) => {
  const { root } = await fixture(t);
  const m = await new Manager(path.join(root, "http state")).initialize(
    path.join(root, "http lib"),
  );
  const { app, token } = await createApp(m);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  t.after(
    () => new Promise<void>((r, j) => server.close((e) => (e ? j(e) : r()))),
  );
  const address = server.address() as any;
  const base = `http://127.0.0.1:${address.port}`;
  assert.equal((await fetch(base + "/api/session")).status, 403);
  const headers = {
    Host: "127.0.0.1:4317",
    Origin: "http://127.0.0.1:4317",
    "X-ASCL-Token": token,
    "Content-Type": "application/json",
  };
  assert.equal(
    (
      await fetch(base + "/api/pause", {
        method: "POST",
        headers: { ...headers, Origin: "https://evil.invalid" },
        body: "{}",
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await fetch(base + "/api/pause", {
        method: "POST",
        headers: { ...headers, "X-ASCL-Token": "wrong" },
        body: "{}",
      })
    ).status,
    403,
  );
  const response = await httpFetch(base + "/api/records", {
    method: "POST",
    headers,
    body: JSON.stringify({
      context: ctx(m.store),
      meta: example(),
      body: "<script>alert(1)</script>",
    }),
  });
  assert.equal(response.status, 200);
  assert.match(
    response.headers.get("content-security-policy")!,
    /object-src 'none'/,
  );
  assert.equal((await httpFetch(base + "/api/stop", { headers })).status, 404);
});
