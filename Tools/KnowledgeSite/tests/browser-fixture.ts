import fs from "node:fs/promises";
import { Manager, defaultLibrary } from "../server/manager.ts";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { template } from "../shared/model.ts";
import { validateAttachment } from "../server/attachments.ts";
if (
  !process.env.ASCL_KNOWLEDGE_LIBRARY ||
  !process.env.ASCL_KNOWLEDGE_STATE ||
  path.resolve(process.env.ASCL_KNOWLEDGE_LIBRARY).toLowerCase() ===
    defaultLibrary.toLowerCase()
)
  throw new Error(
    "合成验收必须显式指定独立 ASCL_KNOWLEDGE_LIBRARY 和 ASCL_KNOWLEDGE_STATE，禁止使用正式默认库。",
  );
const m = await new Manager().initialize(process.env.ASCL_KNOWLEDGE_LIBRARY);
const s = m.store;
const ctx = () => ({
  operationId: randomUUID(),
  epoch: s.state.epoch,
  baseline: null,
});
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jVZkAAAAASUVORK5CYII=",
  "base64",
);
// A synthetic one-page fixture, no real project contents.
const pdfParts = [
  "%PDF-1.4\n",
  "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
  "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
  "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 240 120] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n",
  "4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
];
const stream = "BT /F1 18 Tf 20 60 Td (ASCL PDF TEST) Tj ET";
pdfParts.push(
  `5 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj\n`,
);
let offset = 0;
const positions = pdfParts.map((p) => {
  const n = offset;
  offset += Buffer.byteLength(p);
  return n;
});
pdfParts.push(
  "xref\n0 6\n0000000000 65535 f \n" +
    positions
      .slice(1)
      .map((p) => String(p).padStart(10, "0") + " 00000 n \n")
      .join("") +
    `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${offset}\n%%EOF`,
);
const pdf = Buffer.from(pdfParts.join(""));
const a = validateAttachment(png, "合成像素.png", "中文附件说明");
const b = validateAttachment(pdf, "synthetic.pdf", "合成 PDF 预览");
await s.addAttachment(ctx(), a, png);
await s.addAttachment(ctx(), b, pdf);
await s.save(
  ctx(),
  {
    ...template("wiki"),
    id: "fixture",
    title: "隔离验收样例",
    modules: ["TEST"],
    attachments: [a.id, b.id],
  },
  `## 表格与 API\n\n|名称|值|\n|--|--|\n|EntityWorld.Create<T>()|中文数值|\n\n\`\`\`csharp\nworld.Create<Entity>();\n\`\`\`\n\n## 图表\n\n\`\`\`mermaid\nflowchart LR\n  A[记录] --> B[证据]\n\`\`\`\n\n## 位图\n\n![像素](/api/attachments/${a.id})\n\n## PDF\n\n[测试 PDF](/api/attachments/${b.id})\n\n<script>alert('must not run')</script>\n\n![禁止远端图片](https://invalid.example/tracker.png)\n`,
);
await fs.writeFile(new URL("../.local/qa-upload.png", import.meta.url), png);
console.log("Synthetic browser library prepared.");
