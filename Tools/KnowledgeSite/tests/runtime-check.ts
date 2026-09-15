// Explicit integration check: requires the fixed port to be free. Never stops an existing service.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { installation, installationId } from "../server/manager.ts";
const execute = promisify(execFile);
const base = "http://127.0.0.1:4317";
try {
  await fetch(base, { signal: AbortSignal.timeout(1000) });
  throw new Error(
    "端口已占用：请先自行停止测试实例再运行；不会停止任何既有服务。",
  );
} catch (error: any) {
  if (error.cause?.code !== "ECONNREFUSED") throw error;
}
const root = await fs.mkdtemp(path.join(os.tmpdir(), "ASCL 启停 space-"));
const state = path.join(root, "private state");
const library = path.join(root, "知识 library");
const env = {
  ...process.env,
  ASCL_KNOWLEDGE_STATE: state,
  ASCL_KNOWLEDGE_LIBRARY: library,
};
const control = (command: string, overrides = {}) =>
  execute(
    process.execPath,
    [path.join(installation, "server/control.ts"), command],
    { env: { ...env, ...overrides }, windowsHide: true, timeout: 30000 },
  );
const checks: string[] = [];
let started = false;
let fake: http.Server | undefined;
try {
  fake = http.createServer((_req, res) => res.end("unrelated service"));
  await new Promise<void>((resolve) =>
    fake!.listen(4317, "127.0.0.1", resolve),
  );
  await assert.rejects(control("start"), /占用|身份/);
  await assert.rejects(control("stop"), /占用|身份/);
  assert.equal(await (await fetch(base)).text(), "unrelated service");
  checks.push("其他程序占用固定端口：启动和停止均拒绝，原程序继续响应");
  await new Promise<void>((resolve) => {
    fake!.close(() => resolve());
    fake!.closeAllConnections();
  });
  fake = undefined;
  await fs.mkdir(state);
  await fs.writeFile(
    path.join(state, "instance.json"),
    JSON.stringify({
      pid: process.pid,
      installationId,
      instanceId: "stale",
      token: "stale-fixture",
    }),
  );
  await control("start");
  started = true;
  const first = await (await fetch(base + "/api/session")).json();
  assert.equal(first.root.toLowerCase(), library.toLowerCase());
  assert.notEqual(first.instanceId, "stale");
  checks.push(
    "中文和空格目录、陈旧实例文件：启动正确的新实例，不按陈旧 PID 杀进程",
  );
  assert.match((await control("start")).stdout, /复用/);
  const second = await (await fetch(base + "/api/session")).json();
  assert.equal(first.instanceId, second.instanceId);
  await assert.rejects(
    control("start", { ASCL_KNOWLEDGE_LIBRARY: path.join(root, "different") }),
    /不匹配/,
  );
  await assert.rejects(
    control("stop", { ASCL_KNOWLEDGE_STATE: path.join(root, "unknown state") }),
    /身份文件缺失/,
  );
  checks.push("重复启动复用同一实例；错误库和未知身份拒绝复用或停止");
  const page = await fetch(base);
  const csp = page.headers.get("content-security-policy")!;
  assert.match(csp, /connect-src 'self'/);
  assert.match(csp, /script-src 'self'/);
  assert.match(page.headers.get("cache-control")!, /no-store/);
  const html = await page.text();
  assert.doesNotMatch(html, /(?:src|href)="https?:\/\//);
  let count = 0;
  for (const file of await fs.readdir(path.join(installation, "dist/assets"))) {
    const result = await fetch(base + "/assets/" + encodeURIComponent(file), {
      cache: "no-store",
    });
    assert.equal(result.status, 200, file);
    assert.match(result.headers.get("cache-control")!, /no-store/);
    await result.arrayBuffer();
    count++;
  }
  checks.push(
    `生产入口与 ${count} 个本地构建资源在无缓存请求中全部可取；CSP 禁止非本地脚本与连接`,
  );
  await control("stop");
  started = false;
  for (let i = 0; i < 20; i++) {
    try {
      await fetch(base, { signal: AbortSignal.timeout(500) });
    } catch (error: any) {
      if (error.cause?.code === "ECONNREFUSED") break;
      throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.match((await control("stop")).stdout, /未运行/);
  checks.push("启动命令退出后服务独立运行；受保护停止成功，再次停止无副作用");
  console.log(JSON.stringify({ passed: checks.length, checks }, null, 2));
} finally {
  if (fake)
    await new Promise<void>((resolve) => {
      fake!.close(() => resolve());
      fake!.closeAllConnections();
    });
  if (started) await control("stop").catch(() => {});
  const relative = path.relative(path.resolve(os.tmpdir()), path.resolve(root));
  if (relative.startsWith("ASCL 启停 space-") && !relative.includes(path.sep))
    await fs.rm(root, { recursive: true, force: true });
}
