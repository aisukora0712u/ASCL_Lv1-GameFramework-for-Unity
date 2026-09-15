import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { parseDocument, stringify } from "yaml";
import {
  recordSchema,
  safeId,
  Failure,
  sourceVersionSchema,
  attachmentSchema,
} from "../shared/model.ts";
import type {
  Entry,
  Snapshot,
  RequestContext,
  RecordMeta,
  SourceVersion,
  Attachment,
} from "../shared/model.ts";
import {
  acquire,
  durable,
  exists,
  hash,
  inventory,
  json,
  read,
  replace,
  securePath,
} from "./files.ts";

export function parseRecord(raw: string): { meta: RecordMeta; body: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(raw);
  if (!match) throw new Failure("缺少 YAML frontmatter 分隔符");
  const doc = parseDocument(match[1], { uniqueKeys: true });
  if (doc.errors.length)
    throw new Failure(doc.errors.map((e) => e.message).join("; "));
  return {
    meta: recordSchema.parse(doc.toJS({ maxAliasCount: 50 })),
    body: raw.slice(match[0].length),
  };
}
export const serialize = (meta: RecordMeta, body: string) =>
  `---\n${stringify(meta)}---\n${body}`;
export function patchRecord(
  raw: string | null,
  meta: RecordMeta,
  body: string,
) {
  // YAML AST retains comments and unknown extensions. Metadata from old clients cannot erase extensions.
  if (!raw) return serialize(meta, body);
  const header = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(raw)!;
  const doc = parseDocument(header[1]);
  for (const [key, value] of Object.entries(meta)) doc.set(key, value);
  return `---\n${doc.toString()}---\n${body}`;
}
type Change = { file: string; before: string | null; after: string | null };
type Transaction = {
  format: 1;
  operationId: string;
  fingerprint: string;
  changes: Change[];
  createdAt: string;
  result: any;
};
export class Store {
  root: string;
  state!: Snapshot;
  recoveryError = "";
  hooks: { stage?: (name: string) => Promise<void> };
  constructor(root: string, hooks: Store["hooks"] = {}) {
    this.root = path.resolve(root);
    this.hooks = hooks;
  }
  async initialize() {
    await fs.mkdir(this.root, { recursive: true });
    if ((await fs.lstat(this.root)).isSymbolicLink())
      throw new Failure("库根不允许重解析点");
    const unlock = await acquire(this.root);
    try {
      for (const dir of [
        "records",
        "sources",
        "attachments",
        "reviews",
        "history",
        "checks",
        "observed",
        "recycle",
      ])
        await fs.mkdir(path.join(this.root, dir), { recursive: true });
      if (!(await exists(path.join(this.root, "library.json"))))
        await durable(
          path.join(this.root, "library.json"),
          json({ format: 1, epoch: randomUUID(), paused: false }),
        );
      const config = await this.config();
      if (config.format !== 1) throw new Failure("未知库格式，禁止写入");
      try {
        await this.recover();
      } catch (e: any) {
        if (e.status !== 409) throw e;
        this.recoveryError = e.message;
      }
      await this.scan();
    } finally {
      await unlock();
    }
    return this;
  }
  async config() {
    return JSON.parse(
      await fs.readFile(path.join(this.root, "library.json"), "utf8"),
    );
  }
  async stage(name: string) {
    await this.hooks.stage?.(name);
  }
  async locked<T>(fn: () => Promise<T>): Promise<T> {
    const unlock = await acquire(this.root);
    try {
      await this.recover();
      return await fn();
    } finally {
      await unlock();
    }
  }
  async recover() {
    for (const op of await fs.readdir(path.join(this.root, "history"))) {
      const dir = await securePath(this.root, `history/${op}`);
      if (
        (await exists(path.join(dir, "committed.json"))) ||
        (await exists(path.join(dir, "rolled-back.json")))
      )
        continue;
      const raw = await read(path.join(dir, "prepared.json"));
      if (!raw) continue; // Orphan immutable snapshots are retained.
      const tx: Transaction = JSON.parse(raw.toString());
      for (const c of tx.changes) {
        const target = await securePath(this.root, c.file);
        const current = await read(target);
        const value = current ? hash(current) : null;
        if (value !== c.before && value !== c.after)
          throw new Failure(
            `恢复冲突：${c.file} 出现第三种内容。磁盘及历史版本均保留，停止受管写入。`,
            409,
            { operationId: op },
          );
      }
      for (let i = 0; i < tx.changes.length; i++) {
        const c = tx.changes[i];
        const target = await securePath(this.root, c.file);
        const current = await read(target);
        if ((current ? hash(current) : null) === c.before) continue;
        if (c.before === null) {
          if (await exists(target)) await fs.unlink(target);
        } else {
          const old = await fs.readFile(path.join(dir, `${i}.before`));
          if (hash(old) !== c.before)
            throw new Failure("历史快照校验失败", 409);
          await replace(target, old);
        }
      }
      await durable(
        path.join(dir, "rolled-back.json"),
        json({
          at: new Date().toISOString(),
          reason: "未收到提交标记，恢复到旧状态",
        }),
      );
    }
    this.recoveryError = "";
  }
  async commit(
    ctx: RequestContext,
    intent: unknown,
    prepare: () => Promise<{
      changes: { file: string; data: Buffer | string }[];
      result: any;
    }>,
    options: { allowPaused?: boolean } = {},
  ) {
    safeId.parse(ctx.operationId);
    return this.locked(async () => {
      const config = await this.config();
      if (ctx.epoch !== config.epoch)
        throw new Failure("库已切换，请刷新；旧草稿仍可查看", 409, {
          staleEpoch: true,
        });
      const dir = await securePath(this.root, `history/${ctx.operationId}`);
      const fingerprint = hash(json({ ctx, intent }));
      const committed = await read(path.join(dir, "committed.json"));
      if (committed) {
        const result = JSON.parse(committed.toString());
        if (result.fingerprint !== fingerprint)
          throw new Failure("操作 ID 已用于不同请求", 409);
        return result.result;
      }
      if (await exists(dir))
        throw new Failure(
          "此操作已回滚或状态未确认；请核对后用新操作 ID 提交",
          409,
        );
      if (config.paused && !options.allowPaused)
        throw new Failure("网页和 CLI 受管写入已暂停", 423);
      await this.scan();
      const prepared = await prepare();
      const tx: Transaction = {
        format: 1,
        operationId: ctx.operationId,
        fingerprint,
        changes: [],
        createdAt: new Date().toISOString(),
        result: prepared.result,
      };
      await fs.mkdir(dir);
      for (let i = 0; i < prepared.changes.length; i++) {
        const c = prepared.changes[i];
        const target = await securePath(this.root, c.file);
        const old = await read(target);
        if (old) await durable(path.join(dir, `${i}.before`), old);
        await durable(path.join(dir, `${i}.after`), c.data);
        tx.changes.push({
          file: c.file,
          before: old ? hash(old) : null,
          after: hash(c.data),
        });
      }
      await this.stage("snapshots");
      await durable(path.join(dir, "prepared.json"), json(tx));
      await this.stage("prepared");
      try {
        for (let i = 0; i < prepared.changes.length; i++) {
          const c = prepared.changes[i];
          const target = await securePath(this.root, c.file);
          await fs.mkdir(path.dirname(target), { recursive: true });
          const current = await read(target);
          if ((current ? hash(current) : null) !== tx.changes[i].before)
            throw new Failure("外部编辑与提交冲突，保留所有版本", 409);
          await this.stage("before-replace");
          await replace(target, c.data, () => this.stage("temporary"));
          await this.stage(`replaced-${i}`);
        }
        await this.stage("before-commit");
        await durable(
          path.join(dir, "committed.json"),
          json({
            fingerprint,
            result: tx.result,
            committedAt: new Date().toISOString(),
          }),
        );
      } catch (e) {
        await this.recover();
        throw e;
      }
      await this.scan();
      await this.stage("response");
      return tx.result;
    });
  }
  async scan(): Promise<Snapshot> {
    const config = await this.config();
    const snapshot: Snapshot = {
      generation: (this.state?.generation ?? 0) + 1,
      epoch: config.epoch,
      paused: config.paused,
      entries: [],
      sources: [],
      attachments: [],
      diagnostics: [],
      checks: {},
      scannedAt: new Date().toISOString(),
    };
    if (this.recoveryError)
      snapshot.diagnostics.push({
        file: "history",
        message: this.recoveryError,
      });
    const files = await inventory(this.root, [
      ".lock",
      "history",
      "observed",
      "recycle",
    ]);
    const ids = new Map<string, string[]>();
    for (const [file, digest] of Object.entries(files)) {
      try {
        if (file.startsWith("records/") && file.endsWith(".md")) {
          const raw = await fs.readFile(
            await securePath(this.root, file),
            "utf8",
          );
          const { meta, body } = parseRecord(raw);
          const entry: Entry = {
            meta,
            body,
            revision: digest,
            file,
            reviewed: false,
            reviewDue: true,
            backlinks: [],
          };
          ids.set(meta.id, [...(ids.get(meta.id) ?? []), file]);
          snapshot.entries.push(entry);
        } else if (file.startsWith("sources/") && file.endsWith(".json")) {
          const s = sourceVersionSchema.parse(
            JSON.parse(
              await fs.readFile(await securePath(this.root, file), "utf8"),
            ),
          );
          if (
            s.format !== 1 ||
            !safeId.safeParse(s.sourceId).success ||
            !safeId.safeParse(s.versionId).success
          )
            throw new Failure("未知或无效来源版本");
          snapshot.sources.push(s);
        } else if (file.startsWith("attachments/") && file.endsWith(".json")) {
          const a = attachmentSchema.parse(
            JSON.parse(
              await fs.readFile(await securePath(this.root, file), "utf8"),
            ),
          );
          if (a.format !== 1 || !safeId.safeParse(a.id).success)
            throw new Failure("未知附件格式");
          snapshot.attachments.push(a);
        } else if (file.startsWith("checks/") && file.endsWith(".json"))
          snapshot.checks[path.basename(file, ".json")] = JSON.parse(
            await fs.readFile(await securePath(this.root, file), "utf8"),
          );
      } catch (e: any) {
        snapshot.diagnostics.push({ file, message: e.message });
      }
    }
    for (const [id, paths] of ids)
      if (paths.length > 1)
        snapshot.diagnostics.push({
          file: paths.join(" ↔ "),
          message: `重复 ID：${id}；相关记录禁止写入`,
        });
    const lookup = new Map(snapshot.entries.map((e) => [e.meta.id, e]));
    for (const e of snapshot.entries) {
      for (const id of new Set([...e.meta.relations, ...e.meta.dependencies])) {
        const target = lookup.get(id);
        if (!target)
          snapshot.diagnostics.push({
            file: e.file,
            message: `失效关系：${id}`,
          });
        else target.backlinks.push(e.meta.id);
      }
      for (const s of e.meta.sources)
        if (
          !snapshot.sources.some(
            (v) => v.sourceId === s.sourceId && v.versionId === s.versionId,
          )
        )
          snapshot.diagnostics.push({
            file: e.file,
            message: `缺失证据版本：${s.sourceId}/${s.versionId}`,
          });
      for (const a of e.meta.attachments)
        if (!snapshot.attachments.some((v) => v.id === a))
          snapshot.diagnostics.push({
            file: e.file,
            message: `缺失附件：${a}`,
          });
      const review = await read(
        path.join(this.root, "reviews", `${e.meta.id}.json`),
      );
      if (review) {
        try {
          const r = JSON.parse(review.toString());
          e.lastReview = {
            reviewedAt: r.reviewedAt,
            note: r.note,
            revision: r.revision,
          };
          e.reviewed =
            r.revision === e.revision &&
            json(r.sources) === json(e.meta.sources);
        } catch {
          snapshot.diagnostics.push({
            file: `reviews/${e.meta.id}.json`,
            message: "复核记录格式错误",
          });
        }
      }
      e.reviewDue =
        !e.reviewed ||
        e.meta.sources.some((ref) => {
          const check = snapshot.checks[ref.versionId];
          return (
            !snapshot.sources.some(
              (s) =>
                s.sourceId === ref.sourceId && s.versionId === ref.versionId,
            ) || ["来源已变化", "检查失败", "未绑定"].includes(check?.state)
          );
        });
    }
    try {
      this.validateDependencies(snapshot.entries);
    } catch (e: any) {
      snapshot.diagnostics.push({ file: "records", message: e.message });
    }
    this.state = snapshot;
    return snapshot;
  }
  validateDependencies(entries: Entry[]) {
    const graph = new Map(entries.map((e) => [e.meta.id, e.meta.dependencies]));
    const visited = new Set<string>();
    const active = new Set<string>();
    function visit(id: string) {
      if (active.has(id))
        throw new Failure(`实施依赖成环：${[...active, id].join(" → ")}`);
      if (visited.has(id)) return;
      active.add(id);
      for (const next of graph.get(id) ?? []) visit(next);
      active.delete(id);
      visited.add(id);
    }
    for (const id of graph.keys()) visit(id);
  }
  entry(id: string) {
    safeId.parse(id);
    const matches = this.state.entries.filter((e) => e.meta.id === id);
    if (matches.length > 1) throw new Failure("重复 ID，不能安全定位", 409);
    return matches[0];
  }
  async save(
    ctx: RequestContext,
    metadata: RecordMeta,
    body: string,
    restoreDeleted = false,
  ) {
    const incoming = recordSchema.parse(metadata);
    return this.commit(
      ctx,
      { action: "save", incoming, body, restoreDeleted },
      async () => {
        const current = this.entry(incoming.id);
        if ((current?.revision ?? null) !== ctx.baseline)
          throw new Failure("记录已改变，请比较磁盘内容和草稿", 409, {
            current,
          });
        if (current?.meta.deleted && !restoreDeleted)
          throw new Failure("记录已在回收区，请通过历史恢复", 409);
        if (
          !current &&
          Object.keys(await inventory(path.join(this.root, "records"))).some(
            (f) =>
              path.basename(f).toLowerCase() ===
              `${incoming.id}.md`.toLowerCase(),
          )
        )
          throw new Failure("目标文件已存在或仅大小写不同，禁止覆盖", 409);
        const meta = recordSchema.parse({
          ...current?.meta,
          ...incoming,
          updatedAt: new Date().toISOString(),
        });
        if (current && current.meta.type !== meta.type)
          throw new Failure("现有记录类型不能改变");
        for (const id of [...meta.relations, ...meta.dependencies])
          if (id !== meta.id && !this.entry(id))
            throw new Failure(`关系目标不存在：${id}`);
        for (const s of meta.sources)
          if (
            !this.state.sources.some(
              (v) => v.sourceId === s.sourceId && v.versionId === s.versionId,
            )
          )
            throw new Failure(`来源版本不存在：${s.sourceId}/${s.versionId}`);
        for (const a of meta.attachments)
          if (!this.state.attachments.some((v) => v.id === a))
            throw new Failure(`附件不存在：${a}`);
        const candidate = { meta } as Entry;
        this.validateDependencies([
          ...this.state.entries.filter((e) => e.meta.id !== meta.id),
          candidate,
        ]);
        const file = current?.file ?? `records/${meta.id}.md`;
        const old = await read(await securePath(this.root, file));
        if ((old ? hash(old) : null) !== ctx.baseline)
          throw new Failure("磁盘在扫描后已改变", 409);
        const raw = patchRecord(old?.toString() ?? null, meta, body);
        const changes = [{ file, data: raw }];
        if (meta.deleted && old)
          changes.push({
            file: `recycle/${meta.id}/${ctx.operationId}.md`,
            data: old.toString(),
          });
        return { changes, result: { id: meta.id, revision: hash(raw) } };
      },
    );
  }
  async remove(ctx: RequestContext, id: string) {
    safeId.parse(id);
    return this.commit(ctx, { delete: id }, async () => {
      const e = this.entry(id);
      if (!e) throw new Failure("记录不存在", 404);
      if (e.revision !== ctx.baseline)
        throw new Failure("记录已改变，请刷新后删除", 409, { current: e });
      const old = await fs.readFile(await securePath(this.root, e.file));
      if (hash(old) !== ctx.baseline) throw new Failure("外部编辑冲突", 409);
      const raw = patchRecord(
        old.toString(),
        { ...e.meta, deleted: true, updatedAt: new Date().toISOString() },
        e.body,
      );
      return {
        changes: [
          { file: e.file, data: raw },
          { file: `recycle/${id}/${ctx.operationId}.md`, data: old },
        ],
        result: { id, revision: hash(raw) },
      };
    });
  }
  async history(id: string) {
    safeId.parse(id);
    const results: any[] = [];
    for (const op of await fs.readdir(path.join(this.root, "history"))) {
      const dir = await securePath(this.root, `history/${op}`);
      const raw = await read(path.join(dir, "prepared.json"));
      if (!raw) continue;
      const tx: Transaction = JSON.parse(raw.toString());
      for (let i = 0; i < tx.changes.length; i++)
        if (tx.changes[i].file.startsWith("records/")) {
          const after = await fs.readFile(path.join(dir, `${i}.after`), "utf8");
          try {
            if (parseRecord(after).meta.id === id)
              results.push({
                operationId: op,
                createdAt: tx.createdAt,
                committed: await exists(path.join(dir, "committed.json")),
                after,
                before:
                  (await read(path.join(dir, `${i}.before`)))?.toString() ??
                  null,
              });
          } catch {
            /* malformed snapshots remain in backup */
          }
        }
    }
    return results.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  async restoreHistory(
    ctx: RequestContext,
    id: string,
    operationId: string,
    side: "before" | "after",
  ) {
    const version = (await this.history(id)).find(
      (x) => x.operationId === operationId,
    );
    if (!version || !version[side]) throw new Failure("历史版本不存在");
    const { meta, body } = parseRecord(version[side]);
    return this.save(ctx, { ...meta, deleted: false }, body, true);
  }
  async pause(ctx: RequestContext, paused: boolean) {
    return this.commit(
      ctx,
      { paused },
      async () => {
        const c = await this.config();
        if (!paused) {
          await this.scan();
          if (this.state.diagnostics.length)
            throw new Failure(
              "扫描存在诊断，先修复再恢复写入",
              409,
              this.state.diagnostics,
            );
        }
        return {
          changes: [{ file: "library.json", data: json({ ...c, paused }) }],
          result: { paused },
        };
      },
      { allowPaused: true },
    );
  }
  async review(ctx: RequestContext, id: string, note: string) {
    return this.commit(ctx, { review: id, note }, async () => {
      const e = this.entry(id);
      if (!e || e.revision !== ctx.baseline)
        throw new Failure("复核对象已改变", 409);
      if (!note.trim()) throw new Failure("请填写实质复核依据");
      return {
        changes: [
          {
            file: `reviews/${id}.json`,
            data: json({
              format: 1,
              revision: e.revision,
              sources: e.meta.sources,
              reviewedAt: new Date().toISOString(),
              note,
            }),
          },
        ],
        result: { reviewed: true },
      };
    });
  }
  async addSource(ctx: RequestContext, source: SourceVersion) {
    safeId.parse(source.sourceId);
    safeId.parse(source.versionId);
    return this.commit(ctx, { source }, async () => {
      const file = `sources/${source.sourceId}/${source.versionId}.json`;
      if (await exists(await securePath(this.root, file)))
        throw new Failure("来源版本不可变，请创建新版本", 409);
      return { changes: [{ file, data: json(source) }], result: source };
    });
  }
  async addAttachment(ctx: RequestContext, meta: Attachment, data: Buffer) {
    safeId.parse(meta.id);
    return this.commit(
      ctx,
      {
        attachment: {
          name: meta.name,
          description: meta.description,
          mime: meta.mime,
          digest: hash(data),
          previous: meta.previous,
        },
      },
      async () => {
        if (
          await exists(
            await securePath(this.root, `attachments/${meta.id}.json`),
          )
        )
          throw new Failure("附件版本不可变", 409);
        if (meta.digest !== hash(data)) throw new Failure("附件摘要不匹配");
        if (
          meta.previous &&
          !this.state.attachments.some((a) => a.id === meta.previous)
        )
          throw new Failure("被替代的附件不存在");
        return {
          changes: [
            { file: `attachments/${meta.id}.bin`, data },
            { file: `attachments/${meta.id}.json`, data: json(meta) },
          ],
          result: meta,
        };
      },
    );
  }
  search(query = "", type = "", status = "", module = "", deleted = false) {
    const normalize = (s: string) => s.normalize("NFKC").toLocaleLowerCase();
    const terms = normalize(query).trim().split(/\s+/).filter(Boolean);
    return this.state.entries
      .filter(
        (e) =>
          e.meta.deleted === deleted &&
          (!type || e.meta.type === type) &&
          (!status || e.meta.status === status) &&
          (!module || e.meta.modules.includes(module)),
      )
      .filter((e) => {
        const sourceText = e.meta.sources
          .map((r) =>
            this.state.sources.find(
              (s) => s.sourceId === r.sourceId && s.versionId === r.versionId,
            ),
          )
          .map((s) => (s ? `${s.title} ${s.summary}` : ""))
          .join(" ");
        const assetText = e.meta.attachments
          .map((id) => this.state.attachments.find((a) => a.id === id))
          .map((a) => (a ? `${a.name} ${a.description}` : ""))
          .join(" ");
        const raw = `${JSON.stringify(e.meta)} ${e.body} ${sourceText} ${assetText}`;
        const full = normalize(raw);
        const splitApi = normalize(
          raw
            .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
            .replace(/[^\p{L}\p{N}]+/gu, " "),
        );
        return terms.every((t) => full.includes(t) || splitApi.includes(t));
      });
  }
  async reconcile() {
    // Only observed states can become external-edit snapshots; unmanaged intermediate states are unknowable.
    return this.locked(async () => {
      const files = await inventory(path.join(this.root, "records"));
      for (const [file, digest] of Object.entries(files)) {
        const target = await securePath(this.root, `observed/${digest}.raw`);
        if (!(await exists(target)))
          await durable(
            target,
            await fs.readFile(await securePath(this.root, `records/${file}`)),
          );
      }
      return this.scan();
    });
  }
}
