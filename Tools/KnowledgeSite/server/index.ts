import express from "express";
import fs from "node:fs/promises";
import path from "node:path";
import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { watch } from "node:fs";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { Manager, installation, installationId } from "./manager.ts";
import { Failure, safeId } from "../shared/model.ts";
import type { RequestContext } from "../shared/model.ts";
import { captureAndCommit, checkSources } from "./evidence.ts";
import { validateAttachment } from "./attachments.ts";
import { durable, hash, json, read, replace, securePath } from "./files.ts";
const origin = "http://127.0.0.1:4317";
export async function createApp(
  manager: Manager,
  onStop: () => void = () => {},
) {
  const app = express();
  const token = randomBytes(32).toString("hex");
  const instanceId = randomUUID();
  app.disable("x-powered-by");
  app.set("trust proxy", false);
  app.use((req, res, next) => {
    res.set({
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Cross-Origin-Resource-Policy": "same-origin",
      "X-Frame-Options": "DENY",
      "Content-Security-Policy":
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self' data:; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
    });
    if (
      req.headers.host !== "127.0.0.1:4317" ||
      (req.headers["sec-fetch-site"] &&
        !["same-origin", "none"].includes(
          String(req.headers["sec-fetch-site"]),
        ))
    )
      return res.status(403).json({ message: "只接受本机同源请求" });
    if (!["GET", "HEAD"].includes(req.method)) {
      const supplied = String(req.headers["x-ascl-token"] ?? "");
      if (
        req.headers.origin !== origin ||
        supplied.length !== token.length ||
        !timingSafeEqual(Buffer.from(supplied), Buffer.from(token))
      )
        return res.status(403).json({ message: "请求来源或实例令牌无效" });
    }
    next();
  });
  const context = (req: express.Request): RequestContext =>
    z
      .object({
        operationId: safeId,
        epoch: safeId,
        baseline: z.string().nullable(),
      })
      .parse(req.body.context);
  app.get("/api/session", async (_req, res) => {
    await manager.ensureCurrent();
    res.json({
      token,
      instanceId,
      installationId,
      protocol: 1,
      epoch: manager.store.state.epoch,
      root: manager.store.root,
    });
  });
  app.get("/api/snapshot", async (_req, res) => {
    await manager.ensureCurrent();
    res.json(manager.store.state);
  });
  app.get("/api/search", (req, res) =>
    res.json(
      manager.store.search(
        String(req.query.q ?? ""),
        String(req.query.type ?? ""),
        String(req.query.status ?? ""),
        String(req.query.module ?? ""),
        req.query.deleted === "true",
      ),
    ),
  );
  app.get("/api/history/:id", async (req, res) =>
    res.json(await manager.store.history(String(req.params.id))),
  );
  app.get("/api/diagnostic/:index", async (req, res) => {
    const d = manager.store.state.diagnostics[Number(req.params.index)];
    if (!d || !d.file.startsWith("records/") || d.file.includes(" ↔ "))
      throw new Failure("此诊断没有唯一原文", 404);
    res
      .type("text/plain")
      .send(
        await fs.readFile(await securePath(manager.store.root, d.file), "utf8"),
      );
  });
  app.get("/api/attachments/:id", async (req, res) => {
    const id = safeId.parse(req.params.id);
    const a = manager.store.state.attachments.find((v) => v.id === id);
    if (!a) throw new Failure("附件不存在", 404);
    const bytes = await fs.readFile(
      await securePath(manager.store.root, `attachments/${id}.bin`),
    );
    if (hash(bytes) !== a.digest) throw new Failure("附件校验失败");
    res
      .set(
        "Content-Disposition",
        `${a.mime === "application/pdf" ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(a.name)}`,
      )
      .type(a.mime)
      .send(bytes);
  });
  app.post(
    "/api/restore",
    express.raw({ type: "application/octet-stream", limit: "512mb" }),
    async (req, res) => {
      const ctx = JSON.parse(String(req.headers["x-ascl-context"]));
      res.json(await manager.restore(ctx, req.body));
    },
  );
  app.use(express.json({ limit: "72mb" }));
  app.post("/api/records", async (req, res) =>
    res.json(
      await manager.run(context(req), (s) =>
        s.save(
          context(req),
          req.body.meta,
          z.string().max(2_000_000).parse(req.body.body),
        ),
      ),
    ),
  );
  app.post("/api/delete", async (req, res) =>
    res.json(
      await manager.run(context(req), (s) =>
        s.remove(context(req), safeId.parse(req.body.id)),
      ),
    ),
  );
  app.post("/api/history/restore", async (req, res) =>
    res.json(
      await manager.run(context(req), (s) =>
        s.restoreHistory(
          context(req),
          safeId.parse(req.body.id),
          safeId.parse(req.body.operationId),
          z.enum(["before", "after"]).parse(req.body.side),
        ),
      ),
    ),
  );
  app.post("/api/review", async (req, res) =>
    res.json(
      await manager.run(context(req), (s) =>
        s.review(
          context(req),
          safeId.parse(req.body.id),
          z.string().max(20000).parse(req.body.note),
        ),
      ),
    ),
  );
  app.post("/api/pause", async (req, res) =>
    res.json(
      await manager.run(context(req), (s) =>
        s.pause(context(req), z.boolean().parse(req.body.paused)),
      ),
    ),
  );
  app.post("/api/scan", async (req, res) =>
    res.json(await manager.run(context(req), (s) => s.reconcile())),
  );
  app.post("/api/sources", async (req, res) =>
    res.json(
      await manager.run(context(req), (s) =>
        captureAndCommit(s, context(req), req.body.source, manager.roots),
      ),
    ),
  );
  app.post("/api/sources/check", async (req, res) =>
    res.json(
      await manager.run(context(req), (s) =>
        checkSources(s, manager.roots, context(req)),
      ),
    ),
  );
  app.post("/api/roots", async (req, res) =>
    res.json(
      await manager.bind(
        context(req),
        safeId.parse(req.body.id),
        z.string().parse(req.body.root),
      ),
    ),
  );
  app.post("/api/attachments", async (req, res) =>
    res.json(
      await manager.run(context(req), (s) => {
        const bytes = Buffer.from(z.string().parse(req.body.base64), "base64");
        return s.addAttachment(
          context(req),
          validateAttachment(
            bytes,
            z.string().parse(req.body.name),
            z.string().parse(req.body.description),
            req.body.previous,
          ),
          bytes,
        );
      }),
    ),
  );
  app.post("/api/backup", async (req, res) => {
    const bytes = await manager.backup(context(req));
    res
      .type("application/zip")
      .set("Content-Disposition", 'attachment; filename="ASCL-backup.zip"')
      .send(bytes);
  });
  app.post("/api/stop", async (req, res) => {
    await manager.run(context(req), async () => {});
    res.json({ stopping: true });
    setTimeout(onStop, 150);
  });
  app.use("/api", (_req, res) =>
    res.status(404).json({ message: "API 不存在" }),
  );
  app.use(
    express.static(path.join(installation, "dist"), { etag: false, maxAge: 0 }),
  );
  app.get("/{*route}", (_req, res) =>
    res.sendFile(path.join(installation, "dist/index.html")),
  );
  app.use(
    (
      e: any,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) =>
      res
        .status(e.status ?? 400)
        .json({ message: e.message ?? "请求失败", details: e.details }),
  );
  return { app, token, instanceId };
}
export async function start() {
  const manager = await new Manager().initialize(
    process.env.ASCL_KNOWLEDGE_LIBRARY,
  );
  let timer: NodeJS.Timeout;
  let watcher: ReturnType<typeof watch> | undefined;
  let debounce: NodeJS.Timeout;
  const { app, token, instanceId } = await createApp(manager, () => {
    clearInterval(timer);
    clearTimeout(debounce);
    watcher?.close();
    server.close(() => process.exit(0));
  });
  const server = app.listen(4317, "127.0.0.1");
  server.on("error", (e) => {
    console.error(e instanceof Error ? e.message : "端口不可用");
    process.exitCode = 1;
  });
  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  await replace(
    path.join(manager.stateDir, "instance.json"),
    json({
      token,
      instanceId,
      installationId,
      protocol: 1,
      pid: process.pid,
      epoch: manager.store.state.epoch,
      root: manager.store.root,
    }),
  );
  const reconcile = async () => {
    try {
      await manager.ensureCurrent();
      await manager.store.reconcile();
    } catch (e: any) {
      if (e.status !== 423) console.error("扫描未完成：" + e.message);
    }
  };
  timer = setInterval(reconcile, 60000);
  if (process.env.ASCL_DISABLE_WATCH !== "1") {
    try {
      watcher = watch(
        manager.store.root,
        { recursive: true },
        (_event, filename) => {
          if (
            filename &&
            /^(records|sources|attachments|reviews)[\\/]/.test(String(filename))
          ) {
            clearTimeout(debounce);
            debounce = setTimeout(reconcile, 500);
          }
        },
      );
    } catch {
      console.error("文件监听不可用，60 秒对账仍启用");
    }
  }
  try {
    await manager.run(
      {
        operationId: randomUUID(),
        epoch: manager.store.state.epoch,
        baseline: null,
      },
      (s) =>
        checkSources(s, manager.roots, {
          operationId: randomUUID(),
          epoch: s.state.epoch,
          baseline: null,
        }),
    );
  } catch (e: any) {
    console.error("启动来源检查：" + e.message);
  }
  console.log("ASCL KnowledgeSite ready: " + origin);
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
)
  start().catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  });
