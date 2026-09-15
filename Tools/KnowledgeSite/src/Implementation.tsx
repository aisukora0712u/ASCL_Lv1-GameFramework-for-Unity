import { useEffect, useMemo, useState } from "react";
import {
  categoryLabels,
  goalStatuses,
  phaseIds,
  statusLabels,
} from "../shared/roadmap.ts";
import type { Goal, ProjectRoadmap, Progress } from "../shared/roadmap.ts";
import { Markdown } from "./Markdown.tsx";
import { get } from "./api.ts";
import "./implementation.css";

const goalLink = (id: string) => `#implementation/goal/${id}`;
const stageLink = (id: string) => `#implementation/phase/${id}`;
const date = (value: string | null) =>
  value
    ? new Date(value).toLocaleString("zh-CN", { hour12: false })
    : "尚未发生";
function documentLinks(body: string) {
  return body.replace(
    /\[([^\]]+)\]\(([^)]+\.md)(?:#[^)]*)?\)/g,
    (all, label: string, file: string) => {
      if (/^[a-z][a-z\d+.-]*:|^\/\//i.test(file)) return all;
      const name = file.split("/").pop();
      if (name === "PLAN.md") return `[${label}](#implementation/plan)`;
      if (name === "GOALS.md") return `[${label}](#implementation/guide)`;
      if (/^ASCL-(?:S[0-6]|X|DOC)-\d{3}\.md$/.test(name ?? ""))
        return `[${label}](${goalLink(name!.slice(0, -3))})`;
      if (/^S[0-6]\.md$/.test(name ?? ""))
        return `[${label}](${stageLink(name!.slice(0, -3))})`;
      // Other repository documents are references, not URLs served by this fixed-scope reader.
      return `${label}（仓库文件：${file}）`;
    },
  );
}
function useRoadmap() {
  const [data, setData] = useState<ProjectRoadmap>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  useEffect(() => {
    let alive = true,
      fetching = false;
    const load = async () => {
      if (fetching) return;
      fetching = true;
      setLoading(true);
      try {
        const result = await get<ProjectRoadmap>("/project-roadmap");
        if (alive) {
          setData(result);
          setError("");
        }
      } catch (e: any) {
        if (alive) setError(e.message);
      } finally {
        fetching = false;
        if (alive) setLoading(false);
      }
    };
    const visible = () => {
      if (document.visibilityState === "visible") void load();
    };
    void load();
    const timer = window.setInterval(visible, 30000);
    window.addEventListener("focus", visible);
    document.addEventListener("visibilitychange", visible);
    return () => {
      alive = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", visible);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [refreshKey]);
  return { data, error, loading, refresh: () => setRefreshKey((n) => n + 1) };
}
function Status({ goal }: { goal: Goal }) {
  return (
    <span className={`goal-status status-${goal.meta.status}`}>
      {statusLabels[goal.meta.status]}
    </span>
  );
}
function Meter({ value }: { value?: Progress | null }) {
  return (
    <div className="implementation-meter">
      <div>
        <strong>{value?.percent == null ? "—" : `${value.percent}%`}</strong>
        <span>
          {value ? `${value.done} / ${value.total} 已完成` : "等待有效数据"}
        </span>
      </div>
      {value?.percent != null && (
        <progress
          value={value.done}
          max={Math.max(1, value.total)}
          aria-label="阶段实施完成率"
        />
      )}
      {value && value.total === 0 && <small>尚未纳入实施</small>}
    </div>
  );
}
function StageCounts({ value }: { value?: Progress | null }) {
  return (
    <div className="phase-counts" aria-label="阶段状态统计">
      {(["in_progress", "in_review", "blocked"] as const).map((s) => (
        <span key={s}>
          {statusLabels[s]} <strong>{value ? value.counts[s] : "—"}</strong>
        </span>
      ))}
    </div>
  );
}
export function ImplementationSummary() {
  const { data, error } = useRoadmap();
  return (
    <section className="panel implementation-home">
      <div className="section-top">
        <h2>框架实施目标</h2>
        <a href="#implementation">查看阶段与目标 ↗</a>
      </div>
      {error || (data && !data.valid) ? (
        <p role="alert" className="error">
          目标数据暂不可用，请进入专页查看诊断。
        </p>
      ) : (
        <>
          <Meter value={data?.summary} />
          <p className="muted-text">
            S0–S6 · 以仓库 Markdown 为准 · 准备工作与框架实施分别统计
          </p>
          {data && (
            <small>
              {
                data.goals.filter((g) => g.meta.category === "project_driven")
                  .length
              }{" "}
              项项目驱动 ·{" "}
              {data.goals.filter((g) => g.meta.category === "research").length}{" "}
              项暂缓专项
            </small>
          )}
        </>
      )}
    </section>
  );
}
export function Implementation({ route }: { route: string }) {
  const { data, error, loading, refresh } = useRoadmap();
  const [view, setView] = useState("phases");
  const [query, setQuery] = useState("");
  const [phase, setPhase] = useState("");
  const [area, setArea] = useState("");
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [category, setCategory] = useState("");
  const [selection, setSelection] = useState("");
  const goals = data?.goals ?? [];
  const parts = route.split("/");
  const selected =
    parts[1] === "goal" ? goals.find((g) => g.meta.id === parts[2]) : undefined;
  const selectedPhase =
    parts[1] === "phase"
      ? data?.phases.find((p) => p.meta.id === parts[2])
      : undefined;
  const areaName = (id: string) =>
    data?.plan?.meta.areas.find((a) => a.id === id)?.title ?? id;
  const filtered = useMemo(
    () =>
      goals.filter(
        (g) =>
          (!phase || g.meta.phase === phase) &&
          (!area || g.meta.areas.includes(area)) &&
          (!status || g.meta.status === status) &&
          (!priority || g.meta.priority === priority) &&
          (!category || g.meta.category === category) &&
          (!query ||
            `${g.meta.id} ${g.meta.title} ${g.body} ${g.meta.capabilities.join(" ")}`
              .toLocaleLowerCase()
              .includes(query.toLocaleLowerCase())),
      ),
    [goals, phase, area, status, priority, category, query],
  );
  const rows = (list: Goal[]) => (
    <div className="goal-list">
      {list.map((g) => (
        <a className="goal-row" href={goalLink(g.meta.id)} key={g.meta.id}>
          <span className="goal-code">
            {g.meta.id}
            <small>
              {g.meta.priority} · {categoryLabels[g.meta.category]}
            </small>
          </span>
          <span className="goal-title">
            <strong>{g.meta.title}</strong>
            <small>
              {g.meta.areas.map(areaName).join(" · ") ||
                (g.meta.isGate ? "阶段退出验收" : "独立登记项")}
            </small>
          </span>
          <Status goal={g} />
          <span aria-hidden="true">↗</span>
        </a>
      ))}
      {!list.length && <p className="empty">没有匹配目标，请调整筛选条件。</p>}
    </div>
  );
  const tabs = [
    ["phases", "阶段进度"],
    ["goals", "目标清单"],
    ["coverage", "模块覆盖"],
    ["activity", "实施动态"],
    ["backlog", "项目驱动与专项"],
    ["setup", "追踪准备"],
  ];
  const trusted = data?.valid && !error;
  return (
    <div className="implementation-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">IMPLEMENTATION / REPOSITORY ROADMAP</div>
          <h1>框架实施目标</h1>
          <p>从计划到验证，每个阶段都有明确的交付与证据。</p>
        </div>
        <button onClick={refresh} disabled={loading}>
          {loading ? "正在读取…" : "刷新文档"}
        </button>
      </div>
      <div className="implementation-meta">
        <span>仓库 Markdown · 只读追踪</span>
        {data && (
          <span>
            {data.goals.length} 个目标 · {data.coverage.length} 项能力
          </span>
        )}
        <a href="#implementation/plan">完整计划</a>
        <a href="#implementation/guide">维护规范</a>
        {data && (
          <small>
            读取于 {date(data.readAt)} · 版本 {data.revision.slice(0, 8)}
          </small>
        )}
      </div>
      {error && (
        <section className="error" role="alert">
          <h2>读取失败</h2>
          <p>{error}</p>
          <p>下方内容若存在，为上次读取结果；完成率已暂停显示。</p>
        </section>
      )}
      {data && !data.valid && (
        <section className="error roadmap-diagnostics" role="alert">
          <h2>目标文档校验未通过</h2>
          <p>修复以下问题后刷新。当前不计算完成率。</p>
          <ul>
            {data.diagnostics.map((d, i) => (
              <li key={i}>
                <strong>{d.file}</strong>：{d.message}
              </li>
            ))}
          </ul>
        </section>
      )}
      {!data ? (
        <p className="empty">
          {error ? "等待恢复读取。" : "正在读取阶段与目标…"}
        </p>
      ) : (
        <>
          {parts.length > 1 && (
            <a className="implementation-back" href="#implementation">
              ← 返回实施概览
            </a>
          )}
          {parts[1] === "plan" || parts[1] === "guide" ? (
            <section className="panel implementation-document">
              <Markdown
                text={documentLinks(
                  parts[1] === "plan"
                    ? (data.plan?.body ?? "总计划无法解析。")
                    : (data.guide?.body ?? "维护规范无法读取。"),
                )}
              />
            </section>
          ) : selected ? (
            <>
              <section className="panel goal-detail-header">
                <div className="section-top">
                  <div>
                    <small>
                      {selected.meta.id} · {selected.meta.changeType}
                    </small>
                    <h2>{selected.meta.title}</h2>
                  </div>
                  <Status goal={selected} />
                </div>
                <div className="goal-facts">
                  <span>
                    阶段{" "}
                    {selected.meta.phase === "PREP" ? (
                      "文档与追踪准备"
                    ) : (
                      <a href={stageLink(selected.meta.phase)}>
                        {selected.meta.phase}
                      </a>
                    )}
                  </span>
                  <span>优先级 {selected.meta.priority}</span>
                  <span>{categoryLabels[selected.meta.category]}</span>
                  <span>
                    {selected.ready
                      ? "依赖已满足，可另行安排"
                      : "依赖与实施状态见下方"}
                  </span>
                </div>
                <p className="muted-text">
                  来源：{selected.file} · 更新：{date(selected.meta.updatedAt)}
                </p>
                {selected.meta.reason && (
                  <p className="notice">原因：{selected.meta.reason}</p>
                )}
                <div className="goal-facts">
                  <span>开始：{date(selected.meta.startedAt)}</span>
                  <span>完成：{date(selected.meta.completedAt)}</span>
                </div>
              </section>
              <div className="goal-detail-grid">
                <section className="panel implementation-document">
                  <Markdown text={documentLinks(selected.body)} />
                </section>
                <aside>
                  <section className="panel">
                    <h3>实施依赖</h3>
                    {selected.meta.dependencies.length ? (
                      selected.meta.dependencies.map((id) => {
                        const dep = goals.find((g) => g.meta.id === id);
                        return (
                          <div className="goal-dependency" key={id}>
                            <a href={goalLink(id)}>
                              {id} · {dep?.meta.title ?? "缺失目标"}
                            </a>
                            {dep && <Status goal={dep} />}
                          </div>
                        );
                      })
                    ) : (
                      <p>无前置目标；开始仍需另行安排。</p>
                    )}
                  </section>
                  <section className="panel">
                    <h3>承接能力</h3>
                    {selected.meta.capabilities.map((id) => (
                      <p key={id}>
                        <code>{id}</code>{" "}
                        {
                          data.plan?.meta.areas
                            .flatMap((a) => a.capabilities)
                            .find((c) => c.id === id)?.title
                        }
                      </p>
                    ))}
                    {!selected.meta.capabilities.length && (
                      <p>阶段验收或独立登记项。</p>
                    )}
                  </section>
                  <section className="panel">
                    <h3>验证证据</h3>
                    {selected.meta.evidence.length ? (
                      selected.meta.evidence.map((e, i) => (
                        <div key={i}>
                          <strong>{e.label}</strong>
                          <p>{e.result}</p>
                          <code className="evidence-reference">
                            {e.reference}
                          </code>
                        </div>
                      ))
                    ) : (
                      <p>尚无验收证据。</p>
                    )}
                  </section>
                  <section className="panel">
                    <h3>实施记录</h3>
                    {[...selected.meta.log]
                      .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
                      .map((l, i) => (
                        <div className="activity-item" key={i}>
                          <small>
                            {date(l.at)} ·{" "}
                            {l.type === "planning"
                              ? "目标登记"
                              : l.type === "verification"
                                ? "验证"
                                : l.type === "scope"
                                  ? "范围调整"
                                  : "实施进展"}
                          </small>
                          <p>{l.message}</p>
                        </div>
                      ))}
                  </section>
                </aside>
              </div>
            </>
          ) : selectedPhase ? (
            <>
              <section className="panel">
                <h2>
                  {selectedPhase.meta.id} · {selectedPhase.meta.title}
                </h2>
                <Meter
                  value={
                    trusted ? data.phaseProgress[selectedPhase.meta.id] : null
                  }
                />
                <p>{selectedPhase.meta.objective}</p>
                <StageCounts
                  value={
                    trusted ? data.phaseProgress[selectedPhase.meta.id] : null
                  }
                />
              </section>
              <section className="panel implementation-document">
                <Markdown text={documentLinks(selectedPhase.body)} />
              </section>
              <section className="panel">
                <h2>阶段目标状态</h2>
                {rows(
                  goals.filter((g) => g.meta.phase === selectedPhase.meta.id),
                )}
              </section>
            </>
          ) : parts.length > 1 ? (
            <section className="panel">
              <h2>未找到目标或阶段</h2>
              <p>检查链接中的稳定 ID，或返回概览搜索。</p>
            </section>
          ) : (
            <>
              <section className="implementation-overview">
                <div className="panel implementation-total">
                  <small>阶段实施完成率</small>
                  <Meter value={trusted ? data.summary : null} />
                  <p>按纳入实施的叶子目标计算。文档与追踪准备独立统计。</p>
                </div>
                <div className="implementation-counts">
                  {[
                    ["in_progress", "进行中"],
                    ["in_review", "待验收"],
                    ["blocked", "阻塞"],
                    ["planned", "待安排"],
                  ].map(([s, label]) => (
                    <div className="panel" key={s}>
                      <small>{label}</small>
                      <strong>
                        {trusted
                          ? data.summary?.counts[s as keyof Progress["counts"]]
                          : "—"}
                      </strong>
                    </div>
                  ))}
                </div>
              </section>
              <div
                className="implementation-tabs"
                role="tablist"
                aria-label="实施目标视图"
              >
                {tabs.map(([id, label]) => (
                  <button
                    role="tab"
                    aria-selected={view === id}
                    key={id}
                    onClick={() => setView(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {view === "phases" && (
                <div className="phase-grid">
                  {data.phases.map((p) => (
                    <a
                      className="panel phase-card"
                      href={stageLink(p.meta.id)}
                      key={p.meta.id}
                    >
                      <div className="section-top">
                        <span className="phase-number">{p.meta.id}</span>
                        <small>
                          {p.meta.id === "S6" ? "按项目推进" : "阶段实施"}
                        </small>
                      </div>
                      <h2>{p.meta.title}</h2>
                      <p>{p.meta.objective}</p>
                      <Meter
                        value={trusted ? data.phaseProgress[p.meta.id] : null}
                      />
                      <StageCounts
                        value={trusted ? data.phaseProgress[p.meta.id] : null}
                      />
                      {p.meta.id === "S6" && (
                        <p className="muted-text">
                          {
                            goals.filter(
                              (g) =>
                                g.meta.phase === "S6" &&
                                g.meta.category === "project_driven",
                            ).length
                          }{" "}
                          项项目驱动 ·{" "}
                          {
                            goals.filter((g) => g.meta.category === "research")
                              .length
                          }{" "}
                          项暂缓专项
                        </p>
                      )}
                      <small>
                        前置阶段：
                        {p.meta.dependencies.join(" → ") || "主线入口"}
                      </small>
                      <p className="phase-exit">
                        退出条件：{p.meta.exitCriteria[0]}
                      </p>
                    </a>
                  ))}
                </div>
              )}
              {view === "goals" && (
                <section className="panel">
                  <div className="goal-filters">
                    <input
                      type="search"
                      aria-label="搜索目标"
                      placeholder="搜索目标、ID、能力或正文"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                    <select
                      aria-label="阶段筛选"
                      value={phase}
                      onChange={(e) => setPhase(e.target.value)}
                    >
                      <option value="">全部阶段</option>
                      {[...phaseIds, "PREP"].map((p) => (
                        <option key={p}>{p}</option>
                      ))}
                    </select>
                    <select
                      aria-label="领域筛选"
                      value={area}
                      onChange={(e) => setArea(e.target.value)}
                    >
                      <option value="">全部领域</option>
                      {data.plan?.meta.areas.map((a) => (
                        <option value={a.id} key={a.id}>
                          {a.id} {a.title}
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label="目标状态筛选"
                      value={status}
                      onChange={(e) => setStatus(e.target.value)}
                    >
                      <option value="">全部状态</option>
                      {goalStatuses.map((s) => (
                        <option value={s} key={s}>
                          {statusLabels[s]}
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label="优先级筛选"
                      value={priority}
                      onChange={(e) => setPriority(e.target.value)}
                    >
                      <option value="">全部优先级</option>
                      {["P0", "P1", "P2", "P3"].map((p) => (
                        <option key={p}>{p}</option>
                      ))}
                    </select>
                    <select
                      aria-label="安排类别筛选"
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                    >
                      <option value="">全部类别</option>
                      {Object.entries(categoryLabels).map(([id, label]) => (
                        <option value={id} key={id}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <p className="muted-text">{filtered.length} 个匹配目标</p>
                  {rows(filtered)}
                </section>
              )}
              {view === "coverage" && (
                <section className="panel">
                  <div className="section-top">
                    <h2>原始能力 → 阶段 → 目标</h2>
                    <span>
                      {data.coverage.length} 项能力 ·{" "}
                      {data.plan?.meta.areas.length} 个领域
                    </span>
                  </div>
                  <p className="muted-text">
                    映射存在表示有目标承接，不表示能力已经实现。展开领域查看每项能力。
                  </p>
                  {data.plan?.meta.areas.map((a) => {
                    const matching = goals.filter((g) =>
                      g.meta.areas.includes(a.id),
                    );
                    return (
                      <details className="coverage-area" key={a.id}>
                        <summary>
                          <strong>
                            {a.id} {a.title}
                          </strong>
                          <span>
                            {a.capabilities.length} 项能力 ·{" "}
                            {[...new Set(matching.map((g) => g.meta.phase))]
                              .sort()
                              .join(" / ")}
                          </span>
                        </summary>
                        <div className="coverage-scroll">
                          <table>
                            <thead>
                              <tr>
                                <th>原始能力</th>
                                <th>内容</th>
                                <th>阶段与目标</th>
                              </tr>
                            </thead>
                            <tbody>
                              {a.capabilities.map((c) => (
                                <tr key={c.id}>
                                  <td>
                                    <code>{c.id}</code>
                                    <br />
                                    {c.title}
                                  </td>
                                  <td>{c.description}</td>
                                  <td>
                                    {data.coverage
                                      .find((v) => v.capabilityId === c.id)
                                      ?.goalIds.map((id) => (
                                        <a
                                          className="coverage-goal"
                                          href={goalLink(id)}
                                          key={id}
                                        >
                                          {id} ·{" "}
                                          {
                                            goals.find((g) => g.meta.id === id)
                                              ?.meta.title
                                          }
                                        </a>
                                      ))}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </details>
                    );
                  })}
                </section>
              )}
              {view === "activity" && (
                <section className="panel">
                  <div className="section-top">
                    <h2>实施动态</h2>
                    <label>
                      <input
                        type="checkbox"
                        checked={selection === "planning"}
                        onChange={(e) =>
                          setSelection(e.target.checked ? "planning" : "")
                        }
                      />{" "}
                      包含目标登记
                    </label>
                  </div>
                  {goals
                    .flatMap((g) =>
                      g.meta.log
                        .filter(
                          (l) =>
                            l.type !== "planning" || selection === "planning",
                        )
                        .map((l) => ({ g, l })),
                    )
                    .sort((a, b) => Date.parse(b.l.at) - Date.parse(a.l.at))
                    .map(({ g, l }, i) => (
                      <div className="activity-item" key={i}>
                        <small>
                          {date(l.at)} · {categoryLabels[g.meta.category]}
                        </small>
                        <a href={goalLink(g.meta.id)}>
                          {g.meta.id} · {g.meta.title}
                        </a>
                        <p>{l.message}</p>
                      </div>
                    ))}
                  {!goals.some((g) =>
                    g.meta.log.some(
                      (l) => l.type !== "planning" || selection === "planning",
                    ),
                  ) && (
                    <p className="empty">
                      尚无实施记录。目标登记不计作功能实施。
                    </p>
                  )}
                </section>
              )}
              {view === "backlog" && (
                <>
                  <section className="panel">
                    <h2>项目驱动目录</h2>
                    <p>具体项目安排后进入实施范围，当前独立计数。</p>
                    {rows(
                      goals.filter((g) => g.meta.category === "project_driven"),
                    )}
                  </section>
                  <section className="panel">
                    <h2>暂缓专项与退出范围</h2>
                    <p>正式预测回滚保留在 S0–S3 主线。</p>
                    {rows(
                      goals.filter(
                        (g) =>
                          g.meta.category === "research" ||
                          ["deferred", "cancelled"].includes(g.meta.status),
                      ),
                    )}
                  </section>
                </>
              )}
              {view === "setup" && (
                <section className="panel">
                  <h2>文档与追踪准备</h2>
                  <p>此处完成不提高框架实施完成率。</p>
                  {rows(goals.filter((g) => g.meta.category === "setup"))}
                </section>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
