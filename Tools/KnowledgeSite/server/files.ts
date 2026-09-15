import fs from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { Failure } from "../shared/model.ts";
export const hash = (data: string | Uint8Array) =>
  createHash("sha256").update(data).digest("hex");
export const json = (value: unknown) => JSON.stringify(value, null, 2) + "\n";
export async function exists(file: string) {
  try {
    await fs.lstat(file);
    return true;
  } catch (e: any) {
    if (e.code === "ENOENT") return false;
    throw e;
  }
}
export async function read(file: string): Promise<Buffer | null> {
  try {
    return await fs.readFile(file);
  } catch (e: any) {
    if (e.code === "ENOENT") return null;
    throw e;
  }
}
export function relativeSafe(name: string) {
  if (
    !name ||
    name.includes("\\") ||
    path.posix.isAbsolute(name) ||
    name
      .split("/")
      .some(
        (p) =>
          !p ||
          p === "." ||
          p === ".." ||
          /[<>:"|?*\x00-\x1f]/.test(p) ||
          /[. ]$/.test(p) ||
          /^(con|prn|aux|nul|conin\$|conout\$|com[0-9¹²³]|lpt[0-9¹²³])(?:\.|$)/i.test(
            p,
          ),
      )
  )
    throw new Failure("路径包含越界或 Windows 不安全名称");
  return name;
}
export async function securePath(root: string, name: string) {
  relativeSafe(name);
  const realRoot = await fs.realpath(root);
  let current = realRoot;
  for (const part of name.split("/")) {
    current = path.join(current, part);
    try {
      const stat = await fs.lstat(current);
      if (stat.isSymbolicLink()) throw new Failure("不允许符号链接或重解析点");
      const real = await fs.realpath(current);
      const rel = path.relative(realRoot, real);
      if (rel.startsWith("..") || path.isAbsolute(rel))
        throw new Failure("路径越界");
    } catch (e: any) {
      if (e.code !== "ENOENT") throw e;
    }
  }
  return current;
}
export async function durable(file: string, data: string | Uint8Array) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const h = await fs.open(file, "wx");
  try {
    await h.writeFile(data);
    await h.sync();
  } finally {
    await h.close();
  }
}
export async function replace(
  file: string,
  data: string | Uint8Array,
  afterTemporary?: () => Promise<void>,
) {
  const temp = `${file}.${randomUUID()}.tmp`;
  await durable(temp, data);
  try {
    await afterTemporary?.();
    await fs.rename(temp, file);
  } catch (e) {
    await fs.unlink(temp).catch(() => {});
    throw e;
  }
}
export async function inventory(
  root: string,
  skip: string[] = [],
): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  async function walk(dir: string, prefix: string) {
    for (const item of await fs.readdir(dir, { withFileTypes: true })) {
      const rel = prefix + item.name;
      if (
        skip.includes(rel) ||
        /\.[a-f0-9]{8}-[a-f0-9-]{27}\.tmp$/i.test(item.name)
      )
        continue;
      const full = await securePath(root, rel);
      if (item.isDirectory()) await walk(full, rel + "/");
      else if (item.isFile()) result[rel] = hash(await fs.readFile(full));
      else throw new Failure(`无法备份的文件类型: ${rel}`);
    }
  }
  await walk(root, "");
  return Object.fromEntries(
    Object.entries(result).sort(([a], [b]) => a.localeCompare(b)),
  );
}
// A living or unidentifiable holder is never displaced. No lease timeout is used.
export async function acquire(root: string) {
  const dir = path.join(root, ".lock");
  const owner = { pid: process.pid, id: randomUUID() };
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await fs.mkdir(dir);
      await durable(path.join(dir, "owner.json"), json(owner));
      return async () => {
        const now = JSON.parse(
          await fs.readFile(path.join(dir, "owner.json"), "utf8"),
        );
        if (now.id !== owner.id) throw new Failure("锁身份变化，停止写入", 423);
        await fs.unlink(path.join(dir, "owner.json"));
        await fs.rmdir(dir);
      };
    } catch (e: any) {
      if (e.code !== "EEXIST") throw e;
      let prior: any;
      try {
        prior = JSON.parse(
          await fs.readFile(path.join(dir, "owner.json"), "utf8"),
        );
      } catch {
        throw new Failure("锁持有者状态不明，请检查运行进程", 423);
      }
      if (!Number.isSafeInteger(prior.pid) || prior.pid < 1)
        throw new Failure("锁身份无效", 423);
      try {
        process.kill(prior.pid, 0);
        throw new Failure("库正在写入，请重试", 423);
      } catch (error: any) {
        if (error.code !== "ESRCH")
          throw new Failure("锁持有者活动或状态不明", 423);
      }
      try {
        await fs.mkdir(path.join(dir, "reaper"));
      } catch {
        throw new Failure("锁正在恢复或恢复状态不明", 423);
      }
      try {
        const again = JSON.parse(
          await fs.readFile(path.join(dir, "owner.json"), "utf8"),
        );
        if (again.id !== prior.id) throw new Failure("锁发生变化", 423);
        await fs.unlink(path.join(dir, "owner.json"));
      } finally {
        await fs.rmdir(path.join(dir, "reaper"));
      }
      await fs.rmdir(dir);
    }
  }
  throw new Failure("无法获得写入锁", 423);
}
