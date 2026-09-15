import { z } from "zod";

export const goalStatuses = [
  "planned",
  "in_progress",
  "in_review",
  "done",
  "blocked",
  "deferred",
  "cancelled",
] as const;
export const statusLabels: Record<GoalStatus, string> = {
  planned: "待安排",
  in_progress: "进行中",
  in_review: "待验收",
  done: "已完成",
  blocked: "阻塞",
  deferred: "暂缓",
  cancelled: "取消",
};
export type GoalStatus = (typeof goalStatuses)[number];
export const categories = [
  "committed",
  "project_driven",
  "research",
  "setup",
] as const;
export const categoryLabels = {
  committed: "阶段实施",
  project_driven: "项目驱动",
  research: "暂缓专项",
  setup: "文档与追踪准备",
};
export const phaseIds = ["S0", "S1", "S2", "S3", "S4", "S5", "S6"] as const;
const text = z.string().trim().min(1);
const timestamp = z.iso.datetime({ offset: true });
const goalId = z.string().regex(/^ASCL-(?:S[0-6]|X|DOC)-\d{3}$/);
const areaId = z.string().regex(/^D\d{2}$/);
const capabilityId = z.string().regex(/^D\d{2}-C\d{2}$/);
export const planSchema = z.object({
  format: z.literal(1),
  kind: z.literal("project-plan"),
  id: z.literal("ASCL-LONGTERM"),
  title: text,
  updatedAt: timestamp,
  constraints: z
    .array(z.object({ id: z.string().regex(/^C\d{2}$/), text }))
    .min(1),
  areas: z
    .array(
      z.object({
        id: areaId,
        title: text,
        capabilities: z
          .array(z.object({ id: capabilityId, title: text, description: text }))
          .min(1),
      }),
    )
    .length(16),
});
export const phaseSchema = z.object({
  format: z.literal(1),
  kind: z.literal("phase-plan"),
  id: z.enum(phaseIds),
  title: text,
  objective: text,
  dependencies: z.array(z.enum(phaseIds)),
  deliverables: z.array(text).min(1),
  exitCriteria: z.array(text).min(1),
});
export const goalSchema = z
  .object({
    format: z.literal(1),
    kind: z.literal("implementation-goal"),
    id: goalId,
    title: text,
    phase: z.enum([...phaseIds, "PREP"]),
    areas: z.array(areaId),
    capabilities: z.array(capabilityId),
    priority: z.enum(["P0", "P1", "P2", "P3"]),
    category: z.enum(categories),
    changeType: z.enum(["修整", "增强", "新增", "适配", "验收", "文档与工具"]),
    dependencies: z.array(goalId),
    status: z.enum(goalStatuses),
    isGate: z.boolean(),
    createdAt: timestamp,
    updatedAt: timestamp,
    startedAt: timestamp.nullable(),
    completedAt: timestamp.nullable(),
    reason: text.nullable(),
    evidence: z.array(z.object({ label: text, reference: text, result: text })),
    log: z.array(
      z.object({
        at: timestamp,
        type: z.enum(["planning", "progress", "verification", "scope"]),
        message: text,
      }),
    ),
  })
  .superRefine((g, ctx) => {
    const error = (message: string) =>
      ctx.addIssue({ code: "custom", message });
    if (["blocked", "deferred", "cancelled"].includes(g.status) && !g.reason)
      error("阻塞、暂缓或取消必须记录原因");
    if (["in_progress", "in_review", "done"].includes(g.status) && !g.startedAt)
      error("已开始的目标必须记录实际开始时间");
    if (
      g.status === "done" &&
      (!g.completedAt ||
        !g.evidence.length ||
        !g.log.some((l) => l.type === "verification"))
    )
      error("完成必须有完成时间、证据和验证记录");
    if (g.status !== "done" && g.completedAt)
      error("未完成目标不能填写完成时间");
    if ((g.category === "setup") !== (g.phase === "PREP"))
      error("准备项必须单独归入 PREP，不能计入框架阶段");
    if (
      Date.parse(g.updatedAt) < Date.parse(g.createdAt) ||
      (g.startedAt && Date.parse(g.startedAt) < Date.parse(g.createdAt)) ||
      (g.completedAt &&
        g.startedAt &&
        Date.parse(g.completedAt) < Date.parse(g.startedAt))
    )
      error("目标时间顺序无效");
    if (
      g.log.some((l) => Date.parse(l.at) > Date.parse(g.updatedAt)) ||
      (g.completedAt && Date.parse(g.completedAt) > Date.parse(g.updatedAt))
    )
      error("更新时间必须覆盖实施记录和完成时间");
  });
export type PlanMeta = z.infer<typeof planSchema>;
export type PhaseMeta = z.infer<typeof phaseSchema>;
export type GoalMeta = z.infer<typeof goalSchema>;
export type RoadmapDocument<T> = { meta: T; body: string; file: string };
export type Goal = RoadmapDocument<GoalMeta> & { ready: boolean };
export type Progress = {
  total: number;
  done: number;
  percent: number | null;
  counts: Record<GoalStatus, number>;
  excluded: number;
};
export type ProjectRoadmap = {
  valid: boolean;
  revision: string;
  readAt: string;
  plan: RoadmapDocument<PlanMeta> | null;
  guide: { body: string; file: string } | null;
  phases: RoadmapDocument<PhaseMeta>[];
  goals: Goal[];
  diagnostics: { file: string; message: string }[];
  summary: Progress | null;
  phaseProgress: Record<string, Progress>;
  coverage: { areaId: string; capabilityId: string; goalIds: string[] }[];
};
export function progress(goals: GoalMeta[]): Progress {
  const included = goals.filter(
    (g) =>
      g.category === "committed" &&
      !["deferred", "cancelled"].includes(g.status),
  );
  const counts = Object.fromEntries(
    goalStatuses.map((s) => [s, included.filter((g) => g.status === s).length]),
  ) as Record<GoalStatus, number>;
  return {
    total: included.length,
    done: counts.done,
    percent: included.length
      ? Math.round((counts.done / included.length) * 100)
      : null,
    counts,
    excluded: goals.length - included.length,
  };
}
