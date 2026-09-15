import { Store } from "../server/store.ts";
import { validateAttachment } from "../server/attachments.ts";
const [root, stage, operationId, epoch, baseline, mode] = process.argv.slice(2);
const s = await new Store(root, {
  stage: async (name) => {
    if (name === stage) process.kill(process.pid, "SIGKILL");
  },
}).initialize();
const e = s.entry("example")!;
if (mode === "attachment") {
  const bytes = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jVZkAAAAASUVORK5CYII=",
    "base64",
  );
  await s.addAttachment(
    { operationId, epoch, baseline: null },
    validateAttachment(bytes, "fixture.png", "crash fixture"),
    bytes,
  );
} else
  await s.save(
    { operationId, epoch, baseline },
    e.meta,
    "changed by subprocess",
  );
