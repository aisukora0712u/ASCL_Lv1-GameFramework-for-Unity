import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { Store } from "./store.ts";
import { acquire, durable, exists, hash, json, replace } from "./files.ts";
import { Failure, safeId } from "../shared/model.ts";
import type { RequestContext } from "../shared/model.ts";
import type { Roots } from "./evidence.ts";
import { importBackup, stageBackup, compressBackup } from "./backup.ts";
export const installation = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
export const defaultLibrary = path.resolve(
  installation,
  "../../..",
  "ASCL_Knowledge_Local",
);
export const installationId = hash(installation.toLowerCase());
export class Manager {
  stateDir: string;
  store!: Store;
  roots: Roots = {};
  constructor(
    stateDir = process.env.ASCL_KNOWLEDGE_STATE ??
      path.join(
        process.env.LOCALAPPDATA ?? os.homedir(),
        "ASCL",
        "KnowledgeSite",
        installationId,
      ),
  ) {
    this.stateDir = stateDir;
  }
  async initialize(library?: string) {
    await fs.mkdir(this.stateDir, { recursive: true });
    const unlock = await acquire(this.stateDir);
    try {
      const pointer = path.join(this.stateDir, "active.json");
      if (!(await exists(pointer)))
        await durable(
          pointer,
          json({ format: 1, root: path.resolve(library ?? defaultLibrary) }),
        );
      const config = JSON.parse(await fs.readFile(pointer, "utf8"));
      if (config.format !== 1) throw new Failure("未知活动库配置格式");
      if (
        library &&
        path.resolve(library).toLowerCase() !==
          path.resolve(config.root).toLowerCase()
      )
        throw new Failure("指定库与此实例活动库不匹配");
      this.store = await new Store(config.root).initialize();
      await this.loadRoots();
    } finally {
      await unlock();
    }
    return this;
  }
  async loadRoots() {
    const file = path.join(
      this.stateDir,
      `roots-${this.store.state.epoch}.json`,
    );
    this.roots = (await exists(file))
      ? JSON.parse(await fs.readFile(file, "utf8"))
      : {};
  }
  async ensureCurrent() {
    const config = JSON.parse(
      await fs.readFile(path.join(this.stateDir, "active.json"), "utf8"),
    );
    if (path.resolve(config.root) !== this.store.root) {
      this.store = await new Store(config.root).initialize();
      await this.loadRoots();
    } else await this.loadRoots();
  }
  async run<T>(
    ctx: RequestContext,
    fn: (store: Store) => Promise<T>,
  ): Promise<T> {
    const unlock = await acquire(this.stateDir);
    try {
      await this.ensureCurrent();
      if (ctx.epoch !== (await this.store.config()).epoch)
        throw new Failure("库世代已改变，请刷新后重新提交", 409, {
          staleEpoch: true,
        });
      return await fn(this.store);
    } finally {
      await unlock();
    }
  }
  async bind(ctx: RequestContext, id: string, root: string) {
    return this.run(ctx, async (store) => {
      safeId.parse(id);
      const absolute = path.resolve(root);
      const stat = await fs.lstat(absolute);
      if (!stat.isDirectory() || stat.isSymbolicLink())
        throw new Failure("源码根必须是实际目录");
      // Root mapping has its own durable result journal, outside the portable library.
      const opFile = path.join(
        this.stateDir,
        `binding-${ctx.operationId}.json`,
      );
      safeId.parse(ctx.operationId);
      const fingerprint = hash(json({ ctx, id, root: absolute }));
      if (await exists(opFile)) {
        const op = JSON.parse(await fs.readFile(opFile, "utf8"));
        if (op.fingerprint !== fingerprint)
          throw new Failure("操作 ID 已使用", 409);
        return op.result;
      }
      await this.loadRoots();
      const result = { bound: id };
      await replace(
        path.join(this.stateDir, `roots-${store.state.epoch}.json`),
        json({ ...this.roots, [id]: absolute }),
      );
      await durable(opFile, json({ fingerprint, result }));
      await this.loadRoots();
      return result;
    });
  }
  async backup(ctx: RequestContext) {
    const staging = await this.run(ctx, (store) => stageBackup(store, ctx));
    // Both the library lock and the active-library lock are now released.
    return compressBackup(staging, () =>
      this.store.stage("backup-compressing"),
    );
  }
  async restore(ctx: RequestContext, bytes: Buffer) {
    const unlock = await acquire(this.stateDir);
    try {
      const pointerPath = path.join(this.stateDir, "active.json");
      const pointer = JSON.parse(await fs.readFile(pointerPath, "utf8"));
      const fingerprint = hash(json({ ctx, digest: hash(bytes) }));
      if (pointer.restore?.operationId === ctx.operationId) {
        if (pointer.restore.fingerprint !== fingerprint)
          throw new Failure("操作 ID 已用于不同恢复请求", 409);
        await this.ensureCurrent();
        return pointer.restore.result;
      }
      await this.ensureCurrent();
      const store = this.store;
      if (ctx.epoch !== (await store.config()).epoch)
        throw new Failure("库世代已改变，请刷新", 409);
      safeId.parse(ctx.operationId);
      const target = path.join(
        path.dirname(store.root),
        `ASCL_Knowledge_Restored_${ctx.operationId}`,
      );
      const newStore = await importBackup(bytes, target);
      await store.stage("before-switch");
      const result = {
        root: target,
        epoch: newStore.state.epoch,
        diagnostics: newStore.state.diagnostics,
      };
      // Atomic pointer replacement is the activation point. Old library and clients remain recoverable.
      await replace(
        path.join(this.stateDir, "active.json"),
        json({
          format: 1,
          root: target,
          operationId: ctx.operationId,
          restore: { operationId: ctx.operationId, fingerprint, result },
        }),
      );
      this.store = newStore;
      this.roots = {};
      await store.stage("switch-response");
      return result;
    } finally {
      await unlock();
    }
  }
}
