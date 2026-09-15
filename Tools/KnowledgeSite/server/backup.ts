import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
import { zip, unzipSync } from "fflate";
import { Failure } from "../shared/model.ts";
import type { RequestContext } from "../shared/model.ts";
import { Store } from "./store.ts";
import {
  durable,
  hash,
  inventory,
  json,
  securePath,
  relativeSafe,
  replace,
} from "./files.ts";
const MAX_TOTAL = 1024 * 1024 * 1024;
export async function exportBackup(store: Store, ctx: RequestContext) {
  return compressBackup(await stageBackup(store, ctx));
}
export async function stageBackup(store: Store, ctx: RequestContext) {
  const staging = await fs.mkdtemp(path.join(os.tmpdir(), "ASCL-backup-"));
  try {
    // Freeze while collecting durable staging files; compression happens after releasing the library lock.
    await store.locked(async () => {
      if (ctx.epoch !== (await store.config()).epoch)
        throw new Failure("库已切换", 409);
      const before = await inventory(store.root, [".lock"]);
      let total = 0;
      for (const [name, digest] of Object.entries(before)) {
        const bytes = await fs.readFile(await securePath(store.root, name));
        if (hash(bytes) !== digest)
          throw new Failure("备份中发现外部修改，请重试", 409);
        total += bytes.length;
        if (total > MAX_TOTAL)
          throw new Failure("首版单次备份限 1 GiB 未压缩资料");
        await durable(await securePath(staging, name), bytes);
      }
      await store.stage("backup-staged");
      if (json(before) !== json(await inventory(store.root, [".lock"])))
        throw new Failure("备份中发现外部修改，请重试", 409);
      await durable(
        path.join(staging, "backup-manifest.json"),
        Buffer.from(
          json({
            format: 1,
            createdAt: new Date().toISOString(),
            files: before,
          }),
        ),
      );
    });
    return staging;
  } catch (error) {
    await removeStaging(staging);
    throw error;
  }
}
export async function compressBackup(
  staging: string,
  beforeCompress = async () => {},
) {
  try {
    await beforeCompress();
    const staged: Record<string, Uint8Array> = {};
    for (const name of Object.keys(await inventory(staging)))
      staged[name] = await fs.readFile(await securePath(staging, name));
    return Buffer.from(
      await new Promise<Uint8Array>((resolve, reject) =>
        zip(staged, { level: 6 }, (error, result) =>
          error ? reject(error) : resolve(result),
        ),
      ),
    );
  } finally {
    await removeStaging(staging);
  }
}
async function removeStaging(staging: string) {
  const relative = path.relative(
    path.resolve(os.tmpdir()),
    path.resolve(staging),
  );
  if (relative.startsWith("ASCL-backup-") && !relative.includes(path.sep))
    await fs.rm(staging, { recursive: true, force: true });
}
export async function importBackup(bytes: Buffer, target: string) {
  if (bytes.length > 512 * 1024 * 1024)
    throw new Failure("备份压缩包超过 512 MiB");
  let total = 0;
  let count = 0;
  const names = new Set<string>();
  let data: Record<string, Uint8Array>;
  try {
    data = unzipSync(bytes, {
      filter: (file) => {
        relativeSafe(file.name);
        const normalized = file.name.toLowerCase();
        if (names.has(normalized))
          throw new Failure("压缩包路径重复或大小写冲突");
        names.add(normalized);
        total += file.originalSize;
        count++;
        if (
          total > MAX_TOTAL ||
          count > 50000 ||
          file.originalSize > 100 * 1024 * 1024
        )
          throw new Failure("备份解包总量或文件数量超限");
        return true;
      },
    });
  } catch (e: any) {
    throw new Failure(`备份包无效：${e.message}`);
  }
  let manifest;
  try {
    manifest = JSON.parse(Buffer.from(data["backup-manifest.json"]).toString());
  } catch {
    throw new Failure("备份清单缺失或损坏");
  }
  if (
    manifest.format !== 1 ||
    !manifest.files ||
    typeof manifest.files !== "object"
  )
    throw new Failure("未知备份格式");
  const entries = Object.entries(manifest.files) as [string, string][];
  if (Object.keys(data).length !== entries.length + 1)
    throw new Failure("备份存在未声明文件");
  for (const [name, digest] of entries) {
    relativeSafe(name);
    if (
      name === ".lock" ||
      name.startsWith(".lock/") ||
      !data[name] ||
      hash(data[name]) !== digest
    )
      throw new Failure(`备份校验失败：${name}`);
  }
  let config;
  try {
    config = JSON.parse(Buffer.from(data["library.json"]).toString());
  } catch {
    throw new Failure("缺少库配置");
  }
  if (config.format !== 1) throw new Failure("未知库格式");
  await fs.mkdir(target); // Must be a new directory. Never merge into an existing library.
  for (const [name] of entries)
    await durable(await securePath(target, name), data[name]);
  await replace(
    path.join(target, "library.json"),
    json({ format: 1, epoch: randomUUID(), paused: false }),
  );
  return await new Store(target).initialize();
}
