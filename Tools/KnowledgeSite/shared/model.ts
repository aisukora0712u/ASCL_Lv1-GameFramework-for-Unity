import { z } from "zod";
export const kinds = [
  "wiki",
  "roadmap",
  "application",
  "comparison",
  "decision",
] as const;
export const labels: Record<string, string> = {
  wiki: "框架 Wiki",
  roadmap: "扩展路线图",
  application: "项目应用",
  comparison: "对比研究",
  decision: "架构决策",
};
export const safeId = z
  .string()
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/)
  .refine(
    (x) => !/^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i.test(x),
    "Windows 保留名称",
  );
export const sourceRef = z.object({ sourceId: safeId, versionId: safeId });
export const recordSchema = z
  .object({
    format: z.literal(1),
    id: safeId,
    type: z.enum(kinds),
    title: z.string().min(1).max(300),
    modules: z.array(z.string()).default([]),
    tags: z.array(z.string()).default([]),
    status: z.string().default("草稿"),
    createdAt: z.string(),
    updatedAt: z.string(),
    relations: z.array(safeId).default([]),
    dependencies: z.array(safeId).default([]),
    sources: z.array(sourceRef).default([]),
    attachments: z.array(safeId).default([]),
    deleted: z.boolean().default(false),
    fields: z.record(z.string(), z.unknown()).default({}),
  })
  .passthrough();
export type RecordMeta = z.infer<typeof recordSchema>;
export type Entry = {
  meta: RecordMeta;
  body: string;
  revision: string;
  file: string;
  reviewed: boolean;
  reviewDue: boolean;
  lastReview?: { reviewedAt: string; note: string; revision: string };
  backlinks: string[];
};
export type Diagnostic = { file: string; message: string };
export type SourceVersion = {
  format: 1;
  sourceId: string;
  versionId: string;
  title: string;
  summary: string;
  url?: string;
  revision: string;
  collectedAt: string;
  rootId?: string;
  scope: string[];
  inventory: Record<string, string>;
  excerpt: string;
  location: string;
  dirty: boolean;
};
export type Attachment = {
  format: 1;
  id: string;
  name: string;
  description: string;
  mime: string;
  bytes: number;
  digest: string;
  createdAt: string;
  previous?: string;
};
export const sourceVersionSchema = z
  .object({
    format: z.literal(1),
    sourceId: safeId,
    versionId: safeId,
    title: z.string().min(1),
    summary: z.string(),
    revision: z.string().min(1),
    collectedAt: z.string(),
    rootId: safeId.optional(),
    url: z
      .string()
      .regex(/^https?:\/\//)
      .optional(),
    scope: z.array(z.string()),
    inventory: z.record(z.string(), z.string()),
    excerpt: z.string(),
    location: z.string(),
    dirty: z.boolean(),
  })
  .passthrough();
export const attachmentSchema = z
  .object({
    format: z.literal(1),
    id: safeId,
    name: z.string(),
    description: z.string(),
    mime: z.enum([
      "image/png",
      "image/jpeg",
      "image/gif",
      "image/webp",
      "application/pdf",
    ]),
    bytes: z
      .number()
      .int()
      .min(1)
      .max(50 * 1024 * 1024),
    digest: z.string().regex(/^[a-f0-9]{64}$/),
    createdAt: z.string(),
    previous: safeId.optional(),
  })
  .passthrough();
export type Snapshot = {
  generation: number;
  epoch: string;
  entries: Entry[];
  sources: SourceVersion[];
  attachments: Attachment[];
  diagnostics: Diagnostic[];
  checks: Record<
    string,
    { checkedAt: string; state: string; changes: string[] }
  >;
  paused: boolean;
  scannedAt: string;
};
export type RequestContext = {
  operationId: string;
  epoch: string;
  baseline: string | null;
};
export class Failure extends Error {
  status: number;
  details: unknown;
  constructor(message: string, status = 400, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}
export function template(type: (typeof kinds)[number]): RecordMeta {
  const now = new Date().toISOString();
  const fields: Record<string, Record<string, unknown>> = {
    wiki: { 用途: "", 约束: "", 设计取舍: "", 已知限制: "" },
    roadmap: {
      问题: "",
      收益: "",
      优先级: "待研究",
      候选顺序: "",
      验收条件: "",
      依据: "待研究",
    },
    application: {
      项目身份: "待验证",
      需求: "",
      接入方式: "",
      问题: "",
      验证结果: "",
      反馈: "",
    },
    comparison: {
      对象: "",
      ASCL版本: "",
      对方版本: "",
      定位: "",
      架构: "",
      模块: "",
      依赖: "",
      引擎耦合: "",
      接入成本: "",
      测试证据: "",
      性能环境: "",
      性能方法: "",
      性能结果: "",
      维护情况: "",
    },
    decision: {
      背景: "",
      候选方案: "",
      取舍: "",
      结论: "",
      重审条件: "",
      补记时间: now,
      事实: "",
      推断: "",
    },
  };
  return recordSchema.parse({
    format: 1,
    id: crypto.randomUUID(),
    type,
    title: "未命名记录",
    status: "草稿",
    createdAt: now,
    updatedAt: now,
    fields: fields[type],
  });
}
