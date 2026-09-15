import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Manager } from "./manager.ts";
import { parseRecord, serialize } from "./store.ts";
import { template, kinds, Failure } from "../shared/model.ts";
import type { RequestContext } from "../shared/model.ts";
import { captureAndCommit, checkSources } from "./evidence.ts";
import { validateAttachment } from "./attachments.ts";
const [command, ...args] = process.argv.slice(2);
const option = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
try {
  if (command === "template") {
    const type = args[0] as (typeof kinds)[number];
    if (!kinds.includes(type)) throw new Failure("类型：" + kinds.join(", "));
    console.log(
      serialize(
        template(type),
        "# 用途\n\n## 最小用法\n\n## 约束与取舍\n\n## 已知限制\n\n## 事实、推断与待验证\n",
      ),
    );
  } else {
    const manager = await new Manager(option("state")).initialize(
      option("library"),
    );
    const store = manager.store;
    const ctx: RequestContext = {
      operationId: option("op") ?? randomUUID(),
      epoch: option("epoch") ?? "",
      baseline:
        option("baseline") === "null" ? null : (option("baseline") ?? null),
    };
    if (
      ["scan", "validate", "list", "show", "history", "status"].includes(
        command,
      )
    ) {
      if (command === "scan" || command === "validate") {
        const s = await store.reconcile();
        console.log(
          JSON.stringify(
            {
              epoch: s.epoch,
              diagnostics: s.diagnostics,
              count: s.entries.length,
            },
            null,
            2,
          ),
        );
        if (s.diagnostics.length) process.exitCode = 1;
      }
      if (command === "status")
        console.log(
          JSON.stringify({
            root: store.root,
            epoch: store.state.epoch,
            paused: store.state.paused,
          }),
        );
      if (command === "list")
        console.log(
          JSON.stringify(
            store.state.entries.map((e) => ({
              id: e.meta.id,
              title: e.meta.title,
              revision: e.revision,
            })),
            null,
            2,
          ),
        );
      if (command === "show")
        console.log(JSON.stringify(store.entry(args[0]), null, 2));
      if (command === "history")
        console.log(JSON.stringify(await store.history(args[0]), null, 2));
    } else {
      if (!ctx.epoch || !option("op"))
        throw new Failure(
          "写入必须显式提供 --epoch 和 --op；编辑还需要 --baseline。先运行 status/show。",
        );
      let result;
      if (command === "bind")
        result = await manager.bind(ctx, args[0], args[1]);
      else if (command === "restore-backup")
        result = await manager.restore(ctx, await fs.readFile(args[0]));
      else if (command === "backup") {
        const bytes = await manager.backup(ctx);
        await fs.writeFile(args[0], bytes, { flag: "wx" });
        result = { bytes: bytes.length };
      } else
        result = await manager.run(ctx, async (s) => {
          switch (command) {
            case "save": {
              const raw = await fs.readFile(args[0], "utf8");
              const r = parseRecord(raw);
              return s.save(ctx, r.meta, r.body);
            }
            case "delete":
              return s.remove(ctx, args[0]);
            case "restore":
              return s.restoreHistory(
                ctx,
                args[0],
                args[1],
                args[2] === "before" ? "before" : "after",
              );
            case "pause":
              return s.pause(ctx, true);
            case "resume":
              return s.pause(ctx, false);
            case "review":
              return s.review(ctx, args[0], args[1]);
            case "source":
              return captureAndCommit(
                s,
                ctx,
                JSON.parse(await fs.readFile(args[0], "utf8")),
                manager.roots,
              );
            case "check":
              return checkSources(s, manager.roots, ctx);
            case "attach": {
              const bytes = await fs.readFile(args[0]);
              return s.addAttachment(
                ctx,
                validateAttachment(
                  bytes,
                  path.basename(args[0]),
                  args[1] ?? "",
                ),
                bytes,
              );
            }
            default:
              throw new Failure(
                "命令：status/list/show/template/validate/scan/save/delete/history/restore/pause/resume/source/bind/check/review/attach/backup/restore-backup",
              );
          }
        });
      console.log(JSON.stringify(result, null, 2));
    }
  }
} catch (e: any) {
  console.error(JSON.stringify({ message: e.message, details: e.details }));
  process.exitCode = 1;
}
