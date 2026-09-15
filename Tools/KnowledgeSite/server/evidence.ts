import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { Failure, safeId } from "../shared/model.ts";
import type { SourceVersion, RequestContext } from "../shared/model.ts";
import { hash, inventory, json, securePath, exists } from "./files.ts";
import type { Store } from "./store.ts";
const execute = promisify(execFile);
export type Roots = Record<string, string>;
export async function captureScope(root: string, scope: string[]) {
  if (!scope.length) throw new Failure("至少指定一个相对文件或目录范围");
  const result: Record<string, string> = {};
  for (const relative of scope) {
    const full = await securePath(root, relative);
    if (!(await exists(full))) {
      result[relative] = "MISSING";
      continue;
    }
    if ((await fs.stat(full)).isDirectory()) {
      result[relative + "/"] = "DIRECTORY";
      for (const [file, digest] of Object.entries(
        await inventory(full, [".git", "node_modules", "Library", "Temp"]),
      ))
        result[relative + "/" + file] = digest;
    } else result[relative] = hash(await fs.readFile(full));
  }
  return Object.fromEntries(
    Object.entries(result).sort(([a], [b]) => a.localeCompare(b)),
  );
}
export async function capture(
  input: Partial<SourceVersion>,
  roots: Roots,
): Promise<SourceVersion> {
  input = z
    .object({
      sourceId: safeId.optional(),
      title: z.string().min(1).max(300),
      summary: z.string().min(1).max(20000),
      revision: z.string().max(1000).optional(),
      rootId: safeId.optional(),
      scope: z.array(z.string().max(1000)).max(100).default([]),
      url: z
        .string()
        .regex(/^https?:\/\//)
        .max(4000)
        .optional(),
      location: z.string().max(10000).optional(),
      excerpt: z.string().max(100000).optional(),
    })
    .parse(input);
  const { rootId } = input;
  let revision = input.revision ?? "";
  let dirty = false;
  let files = {};
  if (rootId) {
    safeId.parse(rootId);
    const root = roots[rootId];
    if (!root) throw new Failure("源码根未绑定");
    files = await captureScope(root, input.scope ?? []);
    try {
      revision = (
        await execute("git", ["-C", root, "rev-parse", "HEAD"])
      ).stdout.trim();
      const status = (
        await execute("git", [
          "-C",
          root,
          "status",
          "--porcelain",
          "--",
          ...(input.scope ?? []),
        ])
      ).stdout;
      dirty = !!status.trim();
    } catch {
      revision = input.revision || "非 Git 来源";
    }
  }
  if (!input.title?.trim() || !input.summary?.trim() || !revision)
    throw new Failure("来源必须有标题、摘要和固定版本");
  if (input.url && !/^https?:\/\//i.test(input.url))
    throw new Failure("来源 URL 只支持 http/https");
  return {
    format: 1,
    sourceId: safeId.parse(input.sourceId ?? randomUUID()),
    versionId: randomUUID(),
    title: input.title,
    summary: input.summary,
    revision,
    collectedAt: new Date().toISOString(),
    ...(rootId ? { rootId } : {}),
    scope: input.scope ?? [],
    inventory: files,
    excerpt: input.excerpt ?? "",
    location: input.location ?? "",
    dirty,
    ...(input.url ? { url: input.url } : {}),
  };
}
export async function captureAndCommit(
  store: Store,
  ctx: RequestContext,
  input: Partial<SourceVersion>,
  roots: Roots,
) {
  return store.commit(ctx, { capture: input }, async () => {
    const version = await capture(input, roots);
    const file = `sources/${version.sourceId}/${version.versionId}.json`;
    if (await exists(await securePath(store.root, file)))
      throw new Failure("来源版本不可变", 409);
    return { changes: [{ file, data: json(version) }], result: version };
  });
}
export async function checkSources(
  store: Store,
  roots: Roots,
  ctx: RequestContext,
) {
  return store.commit(
    ctx,
    { check: true },
    async () => {
      const changes: { file: string; data: string }[] = [];
      for (const s of store.state.sources) {
        let state = "外部来源：需人工复核";
        let reasons: string[] = [];
        if (s.rootId) {
          const root = roots[s.rootId];
          if (!root) state = "未绑定";
          else {
            try {
              const now = await captureScope(root, s.scope);
              reasons = [
                ...new Set([...Object.keys(now), ...Object.keys(s.inventory)]),
              ]
                .filter((f) => now[f] !== s.inventory[f])
                .map(
                  (f) =>
                    `${!(f in now) || now[f] === "MISSING" ? "删除" : !(f in s.inventory) || s.inventory[f] === "MISSING" ? "新增" : "修改"}：${f}`,
                );
              state = reasons.length ? "来源已变化" : "范围未变化";
            } catch (e: any) {
              state = "检查失败";
              reasons = [e.message];
            }
          }
        }
        changes.push({
          file: `checks/${s.versionId}.json`,
          data: json({
            checkedAt: new Date().toISOString(),
            state,
            changes: reasons,
          }),
        });
      }
      return { changes, result: { checked: changes.length } };
    },
    { allowPaused: true },
  );
}
