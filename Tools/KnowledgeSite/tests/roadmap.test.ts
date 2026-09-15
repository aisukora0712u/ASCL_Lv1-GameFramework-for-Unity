import { test } from "node:test";
import type { TestContext } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { parse, stringify } from "yaml";
import { readProjectRoadmap, projectRoot } from "../server/roadmap.ts";
import { progress } from "../shared/roadmap.ts";
import type { GoalMeta } from "../shared/roadmap.ts";
import { createApp } from "../server/index.ts";
import { Manager } from "../server/manager.ts";
const at = "2026-09-16T00:00:00.000Z";
const body =
  "# 测试目标\n\n" +
  [
    "问题与预期收益",
    "工作内容与边界",
    "交付物",
    "公共接口与兼容",
    "验收条件",
    "验证场景",
    "实施记录",
  ]
    .map((s) => `## ${s}\n\n可观察的合成验证内容。`)
    .join("\n\n");
const md = (meta: unknown, text = body) =>
  `---\n${stringify(meta)}---\n\n${text}\n`;
const goal = (id = "ASCL-S0-001", patch: Partial<GoalMeta> = {}): GoalMeta => ({
  format: 1,
  kind: "implementation-goal",
  id,
  title: "测试目标",
  phase: "S0",
  areas: [],
  capabilities: [],
  priority: "P1",
  category: "committed",
  changeType: "新增",
  dependencies: [],
  status: "planned",
  isGate: false,
  createdAt: at,
  updatedAt: at,
  startedAt: null,
  completedAt: null,
  reason: null,
  evidence: [],
  log: [{ at, type: "planning", message: "合成目标" }],
  ...patch,
});
async function fixture(t: TestContext) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ASCL-roadmap-"));
  t.after(async () => {
    const relative = path.relative(
      path.resolve(os.tmpdir()),
      path.resolve(root),
    );
    assert.ok(
      relative.startsWith("ASCL-roadmap-") && !relative.includes(path.sep),
    );
    await fs.rm(root, { recursive: true, force: true });
  });
  await fs.mkdir(path.join(root, "Docs/Plans"), { recursive: true });
  await fs.mkdir(path.join(root, "Docs/Goals"), { recursive: true });
  const areas = Array.from({ length: 16 }, (_, i) => {
    const id = `D${String(i + 1).padStart(2, "0")}`;
    return {
      id,
      title: `领域${i}`,
      capabilities: [
        { id: `${id}-C01`, title: "能力", description: "明确能力描述" },
      ],
    };
  });
  await fs.writeFile(
    path.join(root, "PLAN.md"),
    md({
      format: 1,
      kind: "project-plan",
      id: "ASCL-LONGTERM",
      title: "合成计划",
      updatedAt: at,
      constraints: [{ id: "C01", text: "仅测试" }],
      areas,
    }),
  );
  await fs.writeFile(path.join(root, "GOALS.md"), "# 目标维护说明");
  for (let i = 0; i < 7; i++) {
    const phase = `S${i}`;
    await fs.writeFile(
      path.join(root, `Docs/Plans/${phase}.md`),
      md({
        format: 1,
        kind: "phase-plan",
        id: phase,
        title: phase,
        objective: "阶段目标",
        dependencies: i ? [`S${i - 1}`] : [],
        deliverables: ["可验证交付"],
        exitCriteria: ["验收通过"],
      }),
    );
    if (i < 6)
      await fs.writeFile(
        path.join(root, `Docs/Goals/ASCL-${phase}-900.md`),
        md(
          goal(`ASCL-${phase}-900`, {
            phase: phase as GoalMeta["phase"],
            isGate: true,
            changeType: "验收",
            dependencies: i === 0 ? ["ASCL-S0-001"] : [],
          }),
        ),
      );
  }
  await fs.writeFile(
    path.join(root, "Docs/Goals/ASCL-S0-001.md"),
    md(
      goal("ASCL-S0-001", {
        areas: areas.map((a) => a.id),
        capabilities: areas.map((a) => a.capabilities[0].id),
      }),
    ),
  );
  const modify = async (
    file: string,
    edit: (meta: any) => void,
    text?: string,
  ) => {
    const raw = await fs.readFile(path.join(root, file), "utf8");
    const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(raw)!;
    const meta = parse(match[1]);
    edit(meta);
    await fs.writeFile(path.join(root, file), md(meta, text ?? match[2]));
  };
  return { root, modify };
}
async function fingerprint(root: string): Promise<string> {
  const hash = createHash("sha256");
  const walk = async (dir: string) => {
    for (const e of (await fs.readdir(dir, { withFileTypes: true })).sort(
      (a, b) => a.name.localeCompare(b.name),
    )) {
      const f = path.join(dir, e.name);
      hash.update(path.relative(root, f));
      if (e.isDirectory()) await walk(f);
      else hash.update(await fs.readFile(f));
    }
  };
  await walk(root);
  return hash.digest("hex");
}
test("真实路线图覆盖完整且可读取；只读 CLI 不创建私人状态", async () => {
  const first = await readProjectRoadmap();
  assert.equal(first.valid, true, JSON.stringify(first.diagnostics));
  assert.equal(first.phases.length, 7);
  assert.equal(first.plan!.meta.areas.length, 16);
  assert.ok(first.coverage.length >= 136);
  assert.ok(first.plan!.meta.constraints.length >= 34);
  assert.ok(first.coverage.every((c) => c.goalIds.length));
  const cli = await promisify(execFile)(process.execPath, [
    path.join(projectRoot, "Tools/KnowledgeSite/server/roadmap-cli.ts"),
    "validate",
  ]);
  assert.equal(JSON.parse(cli.stdout).valid, true);
  assert.equal((await readProjectRoadmap()).revision, first.revision);
});
test("进度只计正式叶子，排除准备/候选/专项/暂缓/取消，分母为空不报完成", () => {
  const list = [
    goal(),
    goal("ASCL-S0-002", { status: "done" }),
    goal("ASCL-S0-003", { status: "blocked" }),
    goal("ASCL-S0-004", { status: "in_review" }),
    goal("ASCL-S0-005", { status: "deferred" }),
    goal("ASCL-S0-006", { status: "cancelled" }),
    goal("ASCL-S6-001", { category: "project_driven" }),
    goal("ASCL-X-001", { category: "research" }),
    goal("ASCL-DOC-001", { category: "setup", status: "done" }),
  ];
  const p = progress(list);
  assert.equal(p.total, 4);
  assert.equal(p.done, 1);
  assert.equal(p.percent, 25);
  assert.equal(p.counts.blocked, 1);
  assert.equal(p.counts.in_review, 1);
  assert.equal(p.excluded, 5);
  assert.equal(progress([]).percent, null);
});
test("读取保持来源字节不变，文件更新使版本及状态刷新", async (t) => {
  const { root, modify } = await fixture(t);
  const before = await fingerprint(root);
  const first = await readProjectRoadmap(root);
  assert.equal(first.valid, true);
  assert.equal(await fingerprint(root), before);
  await modify("Docs/Goals/ASCL-S0-001.md", (m) => {
    m.status = "in_progress";
    m.startedAt = at;
  });
  const second = await readProjectRoadmap(root);
  assert.equal(second.valid, true);
  assert.notEqual(second.revision, first.revision);
  assert.equal(second.summary!.counts.in_progress, 1);
  assert.equal(
    second.goals.find((g) => g.meta.id === "ASCL-S0-900")!.ready,
    false,
  );
});
test("无证据完成和未勾选验收禁止完成率", async (t) => {
  const { root, modify } = await fixture(t);
  await modify("Docs/Goals/ASCL-S0-001.md", (m) => {
    m.status = "done";
    m.startedAt = at;
    m.completedAt = at;
  });
  let d = await readProjectRoadmap(root);
  assert.equal(d.valid, false);
  assert.equal(d.summary, null);
  assert.ok(d.diagnostics.some((e) => e.message.includes("证据")));
  await modify(
    "Docs/Goals/ASCL-S0-001.md",
    (m) => {
      m.evidence = [{ label: "测试", reference: "test", result: "通过" }];
      m.log.push({ at, type: "verification", message: "实际验证" });
    },
    body + "\n- [ ] 未完成验收",
  );
  d = await readProjectRoadmap(root);
  assert.ok(d.diagnostics.some((e) => e.message.includes("验收项")));
});
test("真实完成进入分子，退出验收只在前置完成后就绪", async (t) => {
  const { root, modify } = await fixture(t);
  await modify("Docs/Goals/ASCL-S0-001.md", (m) => {
    m.status = "done";
    m.startedAt = at;
    m.completedAt = at;
    m.evidence = [{ label: "验收", reference: "report.md", result: "通过" }];
    m.log.push({ at, type: "verification", message: "验收通过" });
  });
  const d = await readProjectRoadmap(root);
  assert.equal(d.valid, true, JSON.stringify(d.diagnostics));
  assert.equal(d.summary!.done, 1);
  assert.equal(d.goals.find((g) => g.meta.id === "ASCL-S0-900")!.ready, true);
});
test("重复 ID、未知依赖、未知能力与循环可诊断", async (t) => {
  const { root, modify } = await fixture(t);
  await fs.copyFile(
    path.join(root, "Docs/Goals/ASCL-S0-001.md"),
    path.join(root, "Docs/Goals/duplicate.md"),
  );
  await modify("Docs/Goals/ASCL-S0-001.md", (m) => {
    m.dependencies = ["ASCL-S0-900", "ASCL-S0-999"];
    m.capabilities.push("D99-C01");
  });
  const d = await readProjectRoadmap(root);
  assert.equal(d.summary, null);
  for (const s of ["重复 ID", "缺失依赖", "未知能力"])
    assert.ok(
      d.diagnostics.some((e) => e.message.includes(s)),
      s,
    );
  await fs.unlink(path.join(root, "Docs/Goals/duplicate.md"));
  assert.ok(
    (await readProjectRoadmap(root)).diagnostics.some((e) =>
      e.message.includes("依赖循环"),
    ),
  );
});
test("缺失阶段、未覆盖能力与验收依赖遗漏可诊断", async (t) => {
  const { root, modify } = await fixture(t);
  await fs.unlink(path.join(root, "Docs/Plans/S5.md"));
  await modify("Docs/Goals/ASCL-S0-001.md", (m) => {
    m.capabilities.pop();
  });
  await modify("Docs/Goals/ASCL-S0-900.md", (m) => {
    m.dependencies = [];
  });
  const d = await readProjectRoadmap(root);
  for (const s of ["缺少阶段", "尚无目标承接", "阶段验收缺少"])
    assert.ok(
      d.diagnostics.some((e) => e.message.includes(s)),
      s,
    );
});
test("未完成依赖不能被完成目标绕过，未知阶段被拒绝", async (t) => {
  const { root, modify } = await fixture(t);
  await modify("Docs/Goals/ASCL-S0-900.md", (m) => {
    m.status = "done";
    m.startedAt = at;
    m.completedAt = at;
    m.evidence = [{ label: "验收", reference: "test", result: "通过" }];
    m.log.push({ at, type: "verification", message: "验收" });
  });
  await modify("Docs/Goals/ASCL-S1-900.md", (m) => {
    m.phase = "S9";
  });
  const d = await readProjectRoadmap(root);
  assert.ok(d.diagnostics.some((e) => e.message.includes("依赖尚未完成")));
  assert.ok(
    d.diagnostics.some(
      (e) => e.file.endsWith("ASCL-S1-900.md") && e.message.includes("phase"),
    ),
  );
});
test("阶段调整保留目标 ID；退出范围调整不能绕过阶段验收", async (t) => {
  const { root, modify } = await fixture(t);
  await modify("Docs/Goals/ASCL-S0-001.md", (m) => {
    m.phase = "S1";
    m.dependencies = ["ASCL-S0-900"];
  });
  await modify("Docs/Goals/ASCL-S0-900.md", (m) => {
    m.dependencies = [];
  });
  await modify("Docs/Goals/ASCL-S1-900.md", (m) => {
    m.dependencies = ["ASCL-S0-001"];
  });
  let d = await readProjectRoadmap(root);
  assert.equal(d.valid, true, JSON.stringify(d.diagnostics));
  await modify("Docs/Goals/ASCL-S1-900.md", (m) => {
    m.status = "cancelled";
    m.reason = "范围调整";
  });
  d = await readProjectRoadmap(root);
  assert.equal(d.valid, false);
  assert.ok(d.diagnostics.some((e) => e.message.includes("退出验收")));
  await modify("Docs/Goals/ASCL-S0-001.md", (m) => {
    m.status = "deferred";
    m.reason = "项目延期";
  });
  d = await readProjectRoadmap(root);
  assert.equal(d.valid, true, JSON.stringify(d.diagnostics));
});
test("阻塞、暂缓和取消必须有原因，正文缺章与重复 YAML 键被拒绝", async (t) => {
  const { root, modify } = await fixture(t);
  await modify("Docs/Goals/ASCL-S0-001.md", (m) => {
    m.status = "blocked";
  });
  let d = await readProjectRoadmap(root);
  assert.ok(d.diagnostics.some((e) => e.message.includes("原因")));
  await modify(
    "Docs/Goals/ASCL-S0-001.md",
    (m) => {
      m.reason = "依赖外部输入";
    },
    "# 缺少必要章节",
  );
  d = await readProjectRoadmap(root);
  assert.ok(d.diagnostics.some((e) => e.message.includes("缺少章节")));
  const f = path.join(root, "Docs/Goals/ASCL-S0-001.md");
  await fs.writeFile(
    f,
    (await fs.readFile(f, "utf8")).replace(
      "status: blocked",
      "status: blocked\nstatus: done",
    ),
  );
  d = await readProjectRoadmap(root);
  assert.equal(d.summary, null);
  assert.ok(d.diagnostics.some((e) => e.message.includes("unique")));
});
test("目录重解析点不读取外部 Markdown", async (t) => {
  const { root } = await fixture(t);
  const outside = await fs.mkdtemp(
    path.join(os.tmpdir(), "ASCL-roadmap-outside-"),
  );
  t.after(async () => {
    const relative = path.relative(os.tmpdir(), outside);
    assert.ok(
      relative.startsWith("ASCL-roadmap-outside-") &&
        !relative.includes(path.sep),
    );
    await fs.rm(outside, { recursive: true, force: true });
  });
  await fs.writeFile(path.join(outside, "secret.md"), "private marker");
  await fs.rename(
    path.join(root, "Docs/Goals"),
    path.join(root, "Docs/OriginalGoals"),
  );
  await fs.symlink(
    outside,
    path.join(root, "Docs/Goals"),
    process.platform === "win32" ? "junction" : "dir",
  );
  const d = await readProjectRoadmap(root);
  assert.equal(d.valid, false);
  assert.ok(d.diagnostics.some((e) => e.message.includes("重解析")));
  assert.equal(JSON.stringify(d).includes("private marker"), false);
  await fs.unlink(path.join(root, "Docs/Goals"));
});
test("只读 HTTP 返回目标和诊断，不写来源或私人库", async (t) => {
  const { root, modify } = await fixture(t);
  const manager = await new Manager(path.join(root, "state")).initialize(
    path.join(root, "library"),
  );
  const { app } = await createApp(manager, () => {}, root);
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const port = (server.address() as { port: number }).port;
  // Node fetch rewrites Host to the ephemeral port; exercise the real production Host guard via HTTP.
  const request = (method = "GET") =>
    new Promise<{ status: number; body: any }>((resolve, reject) => {
      const req = http.request(
        {
          hostname: "127.0.0.1",
          port,
          path: "/api/project-roadmap",
          method,
          headers: { Host: "127.0.0.1:4317" },
        },
        (res) => {
          let body = "";
          res.setEncoding("utf8");
          res.on("data", (chunk) => (body += chunk));
          res.on("end", () =>
            resolve({ status: res.statusCode!, body: JSON.parse(body) }),
          );
        },
      );
      req.on("error", reject);
      req.end();
    });
  const before = await fingerprint(root);
  const response = await request();
  assert.equal(response.status, 200);
  assert.equal(response.body.valid, true);
  assert.equal(await fingerprint(root), before);
  const rejected = await request("POST");
  assert.equal(rejected.status, 403);
  await modify("Docs/Goals/ASCL-S0-001.md", (m) => {
    m.dependencies = ["ASCL-S0-999"];
  });
  const invalid = (await request()).body;
  assert.equal(invalid.valid, false);
  assert.equal(invalid.summary, null);
  assert.ok(invalid.diagnostics.length);
});
