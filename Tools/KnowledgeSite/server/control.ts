import fs from "node:fs/promises";
import { openSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { Manager, installation, installationId } from "./manager.ts";
const manager = new Manager();
const url = "http://127.0.0.1:4317";
async function probe() {
  try {
    const r = await fetch(url + "/api/session", {
      signal: AbortSignal.timeout(1500),
    });
    if (!r.ok) throw new Error("端口已有其他服务");
    return await r.json();
  } catch (e: any) {
    if (e.cause?.code === "ECONNREFUSED") return null;
    throw new Error("4317 端口已占用或服务身份无法确认；不会停止其他进程");
  }
}
async function verified(remote: any) {
  if (
    process.env.ASCL_KNOWLEDGE_LIBRARY &&
    path.resolve(process.env.ASCL_KNOWLEDGE_LIBRARY).toLowerCase() !==
      path.resolve(remote.root).toLowerCase()
  )
    throw new Error("请求库与运行实例不匹配，不能复用");
  let instance;
  try {
    instance = JSON.parse(
      await fs.readFile(path.join(manager.stateDir, "instance.json"), "utf8"),
    );
  } catch {
    throw new Error("实例身份文件缺失，不复用或停止未知服务");
  }
  const active = JSON.parse(
    await fs.readFile(path.join(manager.stateDir, "active.json"), "utf8"),
  );
  if (
    remote.installationId !== installationId ||
    remote.protocol !== 1 ||
    remote.instanceId !== instance.instanceId ||
    remote.token !== instance.token ||
    path.resolve(remote.root).toLowerCase() !==
      path.resolve(active.root).toLowerCase()
  )
    throw new Error("端口实例的安装、库或协议身份不匹配");
  return remote;
}
try {
  const command = process.argv[2] ?? "start";
  let remote = await probe();
  if (command === "stop") {
    if (!remote) {
      console.log("服务未运行");
    } else {
      await verified(remote);
      const r = await fetch(url + "/api/stop", {
        method: "POST",
        headers: {
          Origin: url,
          "X-ASCL-Token": remote.token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          context: {
            operationId: randomUUID(),
            epoch: remote.epoch,
            baseline: null,
          },
        }),
      });
      if (!r.ok) throw new Error((await r.json()).message);
      console.log("已请求停止经验证的 ASCL 实例");
    }
  } else {
    if (remote) {
      await verified(remote);
      console.log("复用已验证的 ASCL 实例：" + url);
    } else {
      await fs.access(path.join(installation, "dist/index.html")).catch(() => {
        throw new Error("缺少生产构建，请先运行 Prepare.ps1");
      });
      await manager.initialize(process.env.ASCL_KNOWLEDGE_LIBRARY);
      const log = openSync(path.join(manager.stateDir, "server.log"), "a");
      const child = spawn(
        process.execPath,
        [path.join(installation, "server/index.ts")],
        {
          cwd: installation,
          detached: true,
          windowsHide: true,
          stdio: ["ignore", log, log],
        },
      );
      child.unref();
      for (let i = 0; i < 40; i++) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        remote = await probe();
        if (remote) break;
      }
      if (!remote) throw new Error("启动超时，请检查本机状态目录的 server.log");
      await verified(remote);
      console.log("本地网站已启动：" + url);
    }
  }
} catch (e: any) {
  console.error(e.message);
  process.exitCode = 1;
}
