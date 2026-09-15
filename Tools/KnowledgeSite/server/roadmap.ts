import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { parseDocument } from "yaml";
import {
  planSchema,
  phaseSchema,
  goalSchema,
  phaseIds,
  progress,
} from "../shared/roadmap.ts";
import type {
  ProjectRoadmap,
  RoadmapDocument,
  PlanMeta,
  PhaseMeta,
  GoalMeta,
  Goal,
} from "../shared/roadmap.ts";

export const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const sections = [
  "问题与预期收益",
  "工作内容与边界",
  "交付物",
  "公共接口与兼容",
  "验收条件",
  "验证场景",
  "实施记录",
];
export async function readProjectRoadmap(
  root = projectRoot,
): Promise<ProjectRoadmap> {
  const diagnostics: ProjectRoadmap["diagnostics"] = [];
  const digest = createHash("sha256");
  const observed: { file: string; size: number; mtimeMs: number }[] = [];
  const inventories = new Map<string, string[]>();
  const fail = (file: string, message: string) =>
    diagnostics.push({ file, message });
  const read = async (file: string) => {
    // Only fixed paths / direct children discovered below are read. Reject links, including parent junctions.
    let current = root;
    for (const segment of file.split("/")) {
      current = path.join(current, segment);
      if ((await fs.lstat(current)).isSymbolicLink())
        throw new Error("路线图目录和文件不能是符号链接或重解析点");
    }
    const before = await fs.stat(current);
    if (!before.isFile() || before.size > 2 * 1024 * 1024)
      throw new Error("需要不超过 2 MiB 的 Markdown 文件");
    const raw = await fs.readFile(current, "utf8");
    const after = await fs.stat(current);
    if (before.size !== after.size || before.mtimeMs !== after.mtimeMs)
      throw new Error("文件正在变更，请刷新后重试");
    observed.push({ file, size: after.size, mtimeMs: after.mtimeMs });
    digest.update(file + "\0" + raw + "\0");
    return raw.replace(/^\uFEFF/, "");
  };
  const document = async <T>(
    file: string,
    schema: { parse: (v: unknown) => T },
  ): Promise<RoadmapDocument<T> | null> => {
    try {
      const raw = await read(file);
      const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/.exec(
        raw,
      );
      if (!match) throw new Error("缺少 YAML 元数据边界");
      const yaml = parseDocument(match[1], { uniqueKeys: true });
      if (yaml.errors.length)
        throw new Error(yaml.errors.map((e) => e.message).join("；"));
      const meta = schema.parse(yaml.toJS({ maxAliasCount: 0 }));
      if (!match[2].trim()) throw new Error("Markdown 正文不能为空");
      return { meta, body: match[2].trim(), file };
    } catch (e: any) {
      fail(file, e.message);
      return null;
    }
  };
  const files = async (dir: string) => {
    try {
      // lstat every directory segment even if the directory is empty.
      let current = root;
      for (const part of dir.split("/")) {
        current = path.join(current, part);
        if ((await fs.lstat(current)).isSymbolicLink())
          throw new Error("拒绝重解析目录");
      }
      const entries = await fs.readdir(current, { withFileTypes: true });
      const result = entries
        .filter((e) => e.name.endsWith(".md"))
        .map((e) => `${dir}/${e.name}`)
        .sort();
      inventories.set(dir, result);
      return result;
    } catch (e: any) {
      fail(dir, e.message);
      return [];
    }
  };
  const plan = await document<PlanMeta>("PLAN.md", planSchema);
  let guide: ProjectRoadmap["guide"] = null;
  try {
    guide = { file: "GOALS.md", body: (await read("GOALS.md")).trim() };
    if (!guide.body) fail("GOALS.md", "目标导航不能为空");
  } catch (e: any) {
    fail("GOALS.md", e.message);
  }
  const phases: RoadmapDocument<PhaseMeta>[] = [];
  for (const file of await files("Docs/Plans")) {
    const d = await document(file, phaseSchema);
    if (d) phases.push(d);
  }
  const goals: Goal[] = [];
  for (const file of await files("Docs/Goals")) {
    const d = await document<GoalMeta>(file, goalSchema);
    if (!d) continue;
    for (const section of sections)
      if (!d.body.includes(`## ${section}`)) fail(file, `缺少章节：${section}`);
    if (d.meta.status === "done" && /^\s*- \[ \]/m.test(d.body))
      fail(file, "已完成目标仍有未通过的验收项");
    goals.push({ ...d, ready: false });
  }
  const unique = (values: { id: string; file: string }[]) => {
    const seen = new Set<string>();
    for (const v of values) {
      if (seen.has(v.id)) fail(v.file, `重复 ID：${v.id}`);
      seen.add(v.id);
    }
  };
  unique([...phases, ...goals].map((d) => ({ id: d.meta.id, file: d.file })));
  for (const id of phaseIds)
    if (!phases.some((p) => p.meta.id === id))
      fail("Docs/Plans", `缺少阶段：${id}`);
  const goalMap = new Map(goals.map((g) => [g.meta.id, g]));
  const areaMap = new Map(plan?.meta.areas.map((a) => [a.id, a]) ?? []);
  const capabilities =
    plan?.meta.areas.flatMap((a) =>
      a.capabilities.map((c) => ({ ...c, areaId: a.id })),
    ) ?? [];
  unique((plan?.meta.areas ?? []).map((a) => ({ id: a.id, file: "PLAN.md" })));
  unique(capabilities.map((c) => ({ id: c.id, file: "PLAN.md" })));
  unique(
    (plan?.meta.constraints ?? []).map((c) => ({ id: c.id, file: "PLAN.md" })),
  );
  const capMap = new Map(capabilities.map((c) => [c.id, c]));
  for (const c of capabilities)
    if (!c.id.startsWith(c.areaId + "-"))
      fail("PLAN.md", `能力归属不匹配：${c.id}`);
  for (const g of goals) {
    // IDs remain stable when a goal moves to another phase or a research goal is scheduled.
    if (g.meta.id.startsWith("ASCL-DOC-") !== (g.meta.category === "setup"))
      fail(g.file, "文档准备 ID 只能用于独立准备项");
    for (const values of [
      g.meta.dependencies,
      g.meta.areas,
      g.meta.capabilities,
    ])
      if (new Set(values).size !== values.length)
        fail(g.file, "列表包含重复引用");
    for (const id of g.meta.areas)
      if (!areaMap.has(id)) fail(g.file, `未知领域：${id}`);
    for (const id of g.meta.capabilities) {
      const c = capMap.get(id);
      if (!c) fail(g.file, `未知能力：${id}`);
      else if (!g.meta.areas.includes(c.areaId))
        fail(g.file, `能力 ${id} 不在目标所属领域内`);
    }
    if (
      !g.meta.isGate &&
      !["setup", "research"].includes(g.meta.category) &&
      !g.meta.capabilities.length
    )
      fail(g.file, "功能目标必须映射原始能力项");
    for (const dep of g.meta.dependencies) {
      if (!goalMap.has(dep)) fail(g.file, `缺失依赖：${dep}`);
      else if (
        g.meta.status === "done" &&
        goalMap.get(dep)!.meta.status !== "done"
      )
        fail(g.file, `完成目标的依赖尚未完成：${dep}`);
    }
    g.ready =
      g.meta.status === "planned" &&
      g.meta.category === "committed" &&
      g.meta.dependencies.every((d) => goalMap.get(d)?.meta.status === "done");
  }
  const cycle = (graph: Map<string, string[]>, file: string) => {
    const visited = new Set<string>(),
      stack = new Set<string>();
    const visit = (id: string) => {
      if (stack.has(id)) {
        fail(file, `依赖循环：${[...stack, id].join(" → ")}`);
        return;
      }
      if (visited.has(id)) return;
      visited.add(id);
      stack.add(id);
      for (const next of graph.get(id) ?? []) visit(next);
      stack.delete(id);
    };
    for (const id of graph.keys()) visit(id);
  };
  cycle(
    new Map(goals.map((g) => [g.meta.id, g.meta.dependencies])),
    "Docs/Goals",
  );
  cycle(
    new Map(phases.map((p) => [p.meta.id, p.meta.dependencies])),
    "Docs/Plans",
  );
  for (const p of phases) {
    const members = goals.filter(
      (g) => g.meta.phase === p.meta.id && g.meta.category === "committed",
    );
    if (
      (p.meta.id !== "S6" || members.length) &&
      !members.some((g) => g.meta.isGate)
    )
      fail(p.file, "阶段缺少独立退出验收目标");
    const active = members.filter(
      (g) => !["deferred", "cancelled"].includes(g.meta.status),
    );
    if (
      active.some((g) => !g.meta.isGate) &&
      !active.some((g) => g.meta.isGate)
    )
      fail(p.file, "阶段仍有实施目标，不能暂缓或取消全部退出验收");
    for (const gate of active.filter((g) => g.meta.isGate))
      for (const member of active.filter((g) => !g.meta.isGate))
        if (!gate.meta.dependencies.includes(member.meta.id))
          fail(gate.file, `阶段验收缺少目标依赖：${member.meta.id}`);
  }
  const coverage = capabilities.map((c) => ({
    areaId: c.areaId,
    capabilityId: c.id,
    goalIds: goals
      .filter((g) => g.meta.capabilities.includes(c.id))
      .map((g) => g.meta.id),
  }));
  for (const c of coverage)
    if (!c.goalIds.length)
      fail("PLAN.md", `原始能力尚无目标承接：${c.capabilityId}`);
  // Detect ordinary multi-file edits during a read; never present a mixed snapshot as verified progress.
  for (const item of observed) {
    try {
      const stat = await fs.lstat(path.join(root, item.file));
      if (
        stat.isSymbolicLink() ||
        stat.size !== item.size ||
        stat.mtimeMs !== item.mtimeMs
      )
        fail(item.file, "文档读取期间发生修改，请刷新");
    } catch {
      fail(item.file, "文档读取期间被移除，请刷新");
    }
  }
  for (const [dir, list] of inventories) {
    try {
      const current = (await fs.readdir(path.join(root, dir)))
        .filter((n) => n.endsWith(".md"))
        .map((n) => `${dir}/${n}`)
        .sort();
      if (JSON.stringify(list) !== JSON.stringify(current))
        fail(dir, "目标目录读取期间发生修改，请刷新");
    } catch {
      fail(dir, "目标目录读取期间不可用");
    }
  }
  const valid = !diagnostics.length;
  // No cached success or percentage is returned for a partially invalid source tree.
  return {
    valid,
    revision: digest.digest("hex"),
    readAt: new Date().toISOString(),
    plan,
    guide,
    phases,
    goals,
    diagnostics,
    summary: valid ? progress(goals.map((g) => g.meta)) : null,
    phaseProgress: valid
      ? Object.fromEntries(
          phases.map((p) => [
            p.meta.id,
            progress(
              goals
                .filter((g) => g.meta.phase === p.meta.id)
                .map((g) => g.meta),
            ),
          ]),
        )
      : {},
    coverage,
  };
}
