import React, { useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { kinds, labels, template } from "../shared/model.ts";
import type {
  Entry,
  RecordMeta,
  Snapshot,
  SourceVersion,
  RequestContext,
} from "../shared/model.ts";
import * as api from "./api.ts";
import { Markdown, Pdf } from "./Markdown.tsx";
import { Implementation, ImplementationSummary } from "./Implementation.tsx";
import { registerWorkspaceTools } from "./webmcp.ts";
import "./style.css";
import { Dialogs, useDialogs } from "./Dialogs.tsx";
const glyphs: Record<string, string> = {
  home: "◈",
  wiki: "▤",
  roadmap: "↗",
  application: "▦",
  comparison: "⇄",
  decision: "◇",
  sources: "⌁",
  settings: "⚙",
  recycle: "↺",
};
const when = (s: string) =>
  new Date(s).toLocaleString("zh-CN", { hour12: false });
const list = (s: string) =>
  s
    .split(/[,，\n]/)
    .map((x) => x.trim())
    .filter(Boolean);
const draftTabId =
  sessionStorage.getItem("ascl-draft-tab") ?? crypto.randomUUID();
sessionStorage.setItem("ascl-draft-tab", draftTabId);
const draftKey = (epoch: string, id: string) =>
  `ascl-draft-${epoch}-${id}-${draftTabId}`;
function Badge({
  children,
  muted = false,
}: {
  children: React.ReactNode;
  muted?: boolean;
}) {
  return <span className={"badge " + (muted ? "muted" : "")}>{children}</span>;
}
function CsvInput({
  value,
  onChange,
  ...props
}: {
  value: string[];
  onChange: (value: string[]) => void;
  list?: string;
  placeholder?: string;
}) {
  const [text, setText] = useState(value.join(", "));
  return (
    <input
      {...props}
      value={text}
      onChange={(event) => {
        setText(event.target.value);
        onChange(list(event.target.value));
      }}
    />
  );
}
function App() {
  const { confirmAction, promptAction } = useDialogs();
  const [data, setData] = useState<Snapshot>();
  const [route, setRoute] = useState(location.hash.slice(1) || "home");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [module, setModule] = useState("");
  const [status, setStatus] = useState("");
  const [results, setResults] = useState<Entry[]>([]);
  const [edit, setEdit] = useState<{
    meta: RecordMeta;
    body: string;
    baseline: string | null;
    epoch: string;
  }>();
  const [dirty, setDirty] = useState(false);
  const [conflict, setConflict] = useState<Entry>();
  const [history, setHistory] = useState<any[]>();
  const [theme, setTheme] = useState(
    localStorage.getItem("ascl-theme") ?? "light",
  );
  const pending = useRef<{ signature: string; context: RequestContext } | null>(
    null,
  );
  const refresh = useCallback(async () => {
    const d = await api.snapshot();
    setData(d);
  }, []);
  const act = async (fn: () => Promise<unknown>, message = "已完成") => {
    setError("");
    setNotice("");
    setBusy(true);
    try {
      await fn();
      await refresh();
      setNotice(message);
    } catch (e: any) {
      setError(e.message);
      if (e.details?.current) setConflict(e.details.current);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    api
      .connect()
      .then(refresh)
      .catch((e) => setError(e.message));
    const timer = setInterval(() => refresh().catch(() => {}), 15000);
    return () => clearInterval(timer);
  }, [refresh]);
  useEffect(() => {
    const onHash = () => setRoute(location.hash.slice(1) || "home");
    addEventListener("hashchange", onHash);
    return () => removeEventListener("hashchange", onHash);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("ascl-theme", theme);
  }, [theme]);
  useEffect(() => {
    if (!data) return;
    let current = true;
    api
      .get<Entry[]>(
        `/search?q=${encodeURIComponent(query)}&type=${kinds.includes(route as any) ? route : ""}&status=${encodeURIComponent(status)}&module=${encodeURIComponent(module)}&deleted=${route === "recycle"}`,
      )
      .then((r) => current && setResults(r))
      .catch((e) => setError(e.message));
    return () => {
      current = false;
    };
  }, [query, module, status, route, data]);
  useEffect(() => {
    const unload = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
      }
    };
    addEventListener("beforeunload", unload);
    return () => removeEventListener("beforeunload", unload);
  }, [dirty]);
  useEffect(() => {
    if (edit && dirty) {
      try {
        localStorage.setItem(
          draftKey(edit.epoch, edit.meta.id),
          JSON.stringify(edit),
        );
      } catch {
        setError("本地草稿空间不足，请复制正文保存");
      }
    }
  }, [edit, dirty]);
  useEffect(() => {
    const keys = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        document.getElementById("search")?.focus();
      }
    };
    addEventListener("keydown", keys);
    return () => removeEventListener("keydown", keys);
  }, []);
  const go = async (target: string) => {
    if (
      dirty &&
      !(await confirmAction(
        "尚有未提交编辑，草稿已保存在此浏览器。离开编辑器？",
      ))
    )
      return false;
    setEdit(undefined);
    setDirty(false);
    setHistory(undefined);
    setConflict(undefined);
    setStatus("");
    setModule("");
    location.hash = target;
    setRoute(target);
    window.scrollTo({ top: 0 });
    return true;
  };
  const begin = async (e?: Entry, kind = "wiki") => {
    if (!data) return false;
    if (
      dirty &&
      !(await confirmAction("当前草稿尚未提交，保留草稿并开始另一条记录？"))
    )
      return false;
    const next = {
      meta: e ? structuredClone(e.meta) : template(kind as any),
      body:
        e?.body ??
        "## 用途\n\n## 最小用法\n\n```csharp\n// 在这里填写经核验的最小示例\n```\n\n## 约束与设计取舍\n\n## 已知限制\n\n## 事实、推断与待验证\n",
      baseline: e?.revision ?? null,
      epoch: data.epoch,
    };
    const cached = localStorage.getItem(draftKey(next.epoch, next.meta.id));
    const restoreDraft =
      !!cached && (await confirmAction("发现此记录的本地草稿，恢复草稿？"));
    setEdit(restoreDraft ? JSON.parse(cached!) : next);
    setDirty(restoreDraft);
    setHistory(undefined);
    setConflict(undefined);
    window.scrollTo({ top: 0 });
    return true;
  };
  const toolActions = useRef<Parameters<typeof registerWorkspaceTools>[0]>(
    null!,
  );
  toolActions.current = {
    search: async (query) => {
      if (!(await go("search"))) return { cancelled: true };
      setQuery(query);
      const entries = await api.get<Entry[]>(
        "/search?q=" + encodeURIComponent(query),
      );
      setResults(entries);
      return {
        matches: entries.map((e) => ({ id: e.meta.id, title: e.meta.title })),
      };
    },
    open: (id) => {
      if (!data?.entries.some((e) => e.meta.id === id))
        throw new Error("记录不存在");
      return go("record/" + id);
    },
    begin: (kind) => begin(undefined, kind),
  };
  useEffect(
    () =>
      registerWorkspaceTools({
        search: (q) => toolActions.current.search(q),
        open: (id) => toolActions.current.open(id),
        begin: (k) => toolActions.current.begin(k),
      }),
    [],
  );
  const save = () =>
    act(async () => {
      if (!edit) return;
      const signature = JSON.stringify(edit);
      if (pending.current?.signature !== signature)
        pending.current = {
          signature,
          context: { ...api.context(edit.baseline), epoch: edit.epoch },
        };
      await api.send(
        "/records",
        { meta: edit.meta, body: edit.body },
        pending.current.context,
      );
      localStorage.removeItem(draftKey(edit.epoch, edit.meta.id));
      pending.current = null;
      setDirty(false);
      setEdit(undefined);
      location.hash = "record/" + edit.meta.id;
      setRoute("record/" + edit.meta.id);
    }, "记录已保存，历史快照已保留");
  const change = (patch: Partial<typeof edit>) => {
    if (edit) {
      setEdit({ ...edit, ...patch } as typeof edit);
      setDirty(true);
    }
  };
  const entry = data?.entries.find((e) => route === `record/${e.meta.id}`);
  const active = data?.entries.filter((e) => !e.meta.deleted) ?? [];
  const listed = results.filter(
    (e) =>
      e.meta.deleted === (route === "recycle") &&
      (!kinds.includes(route as any) || e.meta.type === route) &&
      (!module || e.meta.modules.includes(module)) &&
      (!status || e.meta.status === status),
  );
  const filterEntries =
    route === "recycle"
      ? (data?.entries.filter((e) => e.meta.deleted) ?? [])
      : active;
  const heading =
    route === "home"
      ? "工作台"
      : route === "implementation" || route.startsWith("implementation/")
        ? "实施目标"
        : (entry?.meta.title ??
          labels[route] ??
          (
            {
              sources: "来源与附件",
              settings: "库与运行管理",
              implementation: "实施目标",
              recycle: "回收区",
            } as any
          )[route] ??
          "记录");
  const rows = (entries: Entry[]) => (
    <div className="record-list">
      {entries.length ? (
        entries.map((e) => (
          <button
            className="record-row"
            key={e.file}
            onClick={() => go(`record/${e.meta.id}`)}
          >
            <div className="row-icon">{glyphs[e.meta.type]}</div>
            <div className="row-main">
              <div className="row-title">{e.meta.title}</div>
              <div className="row-sub">
                {e.meta.modules.join(" · ") || labels[e.meta.type]}{" "}
                <span>·</span> {when(e.meta.updatedAt)}
              </div>
            </div>
            <Badge muted>{e.meta.status}</Badge>
            <span className="arrow">↗</span>
          </button>
        ))
      ) : (
        <div className="empty">
          此处还没有记录。
          <br />
          <small>
            {route === "comparison"
              ? "等待人工指定 GitHub 项目后建立对比；既有设计参考不作为指定对象。"
              : "创建记录，或调整搜索和筛选条件。"}
          </small>
        </div>
      )}
    </div>
  );
  if (!data)
    return (
      <div className="loading">
        <div className="brand-mark">A</div>
        <h1>ASCL 知识与研究工作台</h1>
        <p>{error || "正在连接本地资料库…"}</p>
      </div>
    );
  return (
    <div className="app">
      <a
        className="skip"
        href="#main-content"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById("main-content")?.focus();
        }}
      >
        跳到正文
      </a>
      <aside className="sidebar">
        <button className="brand" onClick={() => go("home")}>
          <span className="brand-mark">A</span>
          <span>
            ASCL<small>知识与研究工作台</small>
          </span>
        </button>
        <div className="nav-caption">
          WORKSPACE <span>本地</span>
        </div>
        <nav>
          <button
            className={route === "home" ? "selected" : ""}
            onClick={() => go("home")}
          >
            {glyphs.home}
            <span>工作台</span>
          </button>
          {kinds.map((k) => (
            <button
              key={k}
              className={
                route === k || entry?.meta.type === k ? "selected" : ""
              }
              onClick={() => go(k)}
            >
              {glyphs[k]}
              <span>{labels[k]}</span>
              <small>{active.filter((e) => e.meta.type === k).length}</small>
            </button>
          ))}
          <button
            className={route.startsWith("implementation") ? "selected" : ""}
            onClick={() => go("implementation")}
          >
            ◎<span>实施目标</span>
          </button>
        </nav>
        <div className="nav-caption">资料与维护</div>
        <nav>
          {["sources", "recycle", "settings"].map((k) => (
            <button
              key={k}
              className={route === k ? "selected" : ""}
              onClick={() => go(k)}
            >
              {glyphs[k]}
              <span>
                {
                  (
                    {
                      sources: "来源与附件",
                      recycle: "回收区",
                      settings: "库与运行管理",
                    } as any
                  )[k]
                }
              </span>
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <span className="status-dot" />
          本机资料库 <small>127.0.0.1 : 4317</small>
          <button
            onClick={() => setTheme(theme === "light" ? "dark" : "light")}
          >
            {theme === "light" ? "◐ 深色外观" : "◑ 浅色外观"}
          </button>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="crumb">
            ASCL / <strong>{edit ? "编辑记录" : heading}</strong>
          </div>
          <div className="search">
            <span>⌕</span>
            <input
              id="search"
              aria-label="全文搜索"
              placeholder="搜索知识、API、证据…"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                if (edit) return;
                if (!kinds.includes(route as any)) {
                  setRoute("search");
                  location.hash = "search";
                }
              }}
            />
            <kbd>Ctrl K</kbd>
          </div>
        </header>
        <main id="main-content" tabIndex={-1}>
          <div aria-live="polite">
            {error && (
              <div className="alert error">
                {error}
                <button onClick={() => setError("")}>关闭</button>
              </div>
            )}
            {notice && (
              <div className="alert success">
                {notice}
                <button onClick={() => setNotice("")}>关闭</button>
              </div>
            )}
            {data.paused && (
              <div className="alert">
                受管写入已暂停。外部编辑完成后，请扫描校验并恢复写入。
              </div>
            )}
            {data.epoch !== api.session.epoch && (
              <div className="alert error">
                活动库已切换。草稿保留在旧库世代下，刷新页面后才能写入新库。
                <button onClick={() => location.reload()}>刷新页面</button>
              </div>
            )}
          </div>
          {edit ? (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">
                    EDITOR / {labels[edit.meta.type]}
                  </div>
                  <h1>编辑记录</h1>
                  <p>
                    {dirty
                      ? "有未提交修改 · 浏览器草稿自动保存"
                      : "修改内容后提交，将生成完整历史快照"}
                  </p>
                </div>
                <div className="toolbar">
                  <button
                    onClick={async () => {
                      if (
                        !dirty ||
                        (await confirmAction("关闭编辑器并保留草稿？"))
                      ) {
                        setEdit(undefined);
                        setDirty(false);
                      }
                    }}
                  >
                    关闭
                  </button>
                  <button
                    className="primary"
                    disabled={busy || data.paused}
                    onClick={save}
                  >
                    保存记录
                  </button>
                </div>
              </div>
              {conflict && (
                <section className="panel">
                  <h2>保存冲突 · 两份内容均保留</h2>
                  <div className="two-col">
                    <div>
                      <h3>你的草稿</h3>
                      <pre>
                        {JSON.stringify(edit.meta, null, 2)}
                        {"\n"}
                        {edit.body}
                      </pre>
                    </div>
                    <div>
                      <h3>当前磁盘</h3>
                      <pre>
                        {JSON.stringify(conflict.meta, null, 2)}
                        {"\n"}
                        {conflict.body}
                      </pre>
                    </div>
                  </div>
                  <button
                    onClick={async () => {
                      if (
                        await confirmAction(
                          "已比较双方内容，使用当前磁盘版本作为下一次提交基线？请先将需要保留的磁盘修改合并到草稿。",
                        )
                      ) {
                        change({ baseline: conflict.revision });
                        setConflict(undefined);
                      }
                    }}
                  >
                    已比较，更新提交基线
                  </button>
                </section>
              )}
              <section className="panel form-grid">
                <label className="wide">
                  标题
                  <input
                    value={edit.meta.title}
                    onChange={(e) =>
                      change({ meta: { ...edit.meta, title: e.target.value } })
                    }
                  />
                </label>
                <label>
                  稳定 ID
                  <input
                    value={edit.meta.id}
                    readOnly={edit.baseline !== null}
                    onChange={(e) =>
                      change({ meta: { ...edit.meta, id: e.target.value } })
                    }
                  />
                </label>
                <label>
                  状态
                  <input
                    value={edit.meta.status}
                    onChange={(e) =>
                      change({ meta: { ...edit.meta, status: e.target.value } })
                    }
                  />
                </label>
                {(
                  [
                    "modules",
                    "tags",
                    "relations",
                    "dependencies",
                    "attachments",
                  ] as const
                ).map((key) => (
                  <label key={key}>
                    {
                      {
                        modules: "模块",
                        tags: "标签",
                        relations: "一般关联 ID",
                        dependencies: "实施依赖 ID",
                        attachments: "附件 ID",
                      }[key]
                    }
                    <CsvInput
                      key={edit.meta.id + key}
                      value={edit.meta[key]}
                      onChange={(values) =>
                        change({
                          meta: { ...edit.meta, [key]: values },
                        })
                      }
                      placeholder="逗号分隔"
                      list={
                        key === "relations" || key === "dependencies"
                          ? "record-ids"
                          : undefined
                      }
                    />
                  </label>
                ))}
                <datalist id="record-ids">
                  {data.entries.map((e) => (
                    <option key={e.file} value={e.meta.id}>
                      {e.meta.title}
                    </option>
                  ))}
                </datalist>
                <label>
                  固定证据版本
                  <select
                    value=""
                    onChange={(e) => {
                      if (e.target.value) {
                        const [sourceId, versionId] = e.target.value.split("/");
                        change({
                          meta: {
                            ...edit.meta,
                            sources: [
                              ...edit.meta.sources.filter(
                                (s) => s.versionId !== versionId,
                              ),
                              { sourceId, versionId },
                            ],
                          },
                        });
                      }
                    }}
                  >
                    <option value="">添加来源版本…</option>
                    {data.sources.map((s) => (
                      <option
                        key={s.versionId}
                        value={`${s.sourceId}/${s.versionId}`}
                      >
                        {s.title} · {s.versionId.slice(0, 8)}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="wide toolbar wrap">
                  {edit.meta.sources.map((s) => (
                    <button
                      key={s.versionId}
                      onClick={() =>
                        change({
                          meta: {
                            ...edit.meta,
                            sources: edit.meta.sources.filter(
                              (v) => v.versionId !== s.versionId,
                            ),
                          },
                        })
                      }
                    >
                      {data.sources.find((v) => v.versionId === s.versionId)
                        ?.title ?? s.sourceId}{" "}
                      · {s.versionId.slice(0, 8)} ×
                    </button>
                  ))}
                </div>
                {Object.entries(edit.meta.fields).map(([key, value]) => (
                  <label key={key}>
                    {key}
                    <textarea
                      rows={2}
                      value={
                        typeof value === "string"
                          ? value
                          : JSON.stringify(value)
                      }
                      onChange={(e) =>
                        change({
                          meta: {
                            ...edit.meta,
                            fields: {
                              ...edit.meta.fields,
                              [key]:
                                typeof value === "string"
                                  ? e.target.value
                                  : (() => {
                                      try {
                                        return JSON.parse(e.target.value);
                                      } catch {
                                        return e.target.value;
                                      }
                                    })(),
                            },
                          },
                        })
                      }
                    />
                  </label>
                ))}
              </section>
              <div className="editor-grid">
                <section className="panel">
                  <div className="section-top">
                    <h2>Markdown</h2>
                    <small>GFM · Mermaid · 本地附件</small>
                  </div>
                  <textarea
                    className="markdown-input"
                    aria-label="Markdown 正文"
                    value={edit.body}
                    onChange={(e) => change({ body: e.target.value })}
                  />
                </section>
                <section className="panel preview">
                  <div className="section-top">
                    <h2>即时预览</h2>
                    <Badge muted>原始 HTML 禁用</Badge>
                  </div>
                  <Markdown text={edit.body} attachments={data.attachments} />
                </section>
              </div>
            </>
          ) : route === "implementation" ||
            route.startsWith("implementation/") ? (
            <Implementation route={route} />
          ) : route === "home" ? (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">FRAMEWORK KNOWLEDGE / RESEARCH</div>
                  <h1>
                    让每次迭代，
                    <br />
                    都有据可循。
                  </h1>
                  <p>连接框架知识、项目反馈与架构决策。</p>
                </div>
                <button className="primary" onClick={() => begin()}>
                  ＋ 新建记录
                </button>
              </div>
              <div className="stats">
                {[
                  { n: active.length, l: "知识记录", s: "五类内容，统一管理" },
                  {
                    n: data.sources.length,
                    l: "证据版本",
                    s: "不可变版本，可追溯",
                  },
                  {
                    n: active.filter((e) => e.reviewDue).length,
                    l: "待实质复核",
                    s: "自动检查不替代人工复核",
                  },
                  {
                    n: data.diagnostics.length,
                    l: "资料诊断",
                    s: "格式、关系与来源完整性",
                  },
                ].map((s, i) => (
                  <div className="stat" key={s.l}>
                    <small>
                      0{i + 1} / {s.l}
                    </small>
                    <strong>{s.n.toString().padStart(2, "0")}</strong>
                    <span>{s.s}</span>
                  </div>
                ))}
              </div>
              <div className="home-grid">
                <ImplementationSummary />
                <section className="panel">
                  <div className="section-top">
                    <h2>近期修改</h2>
                    <button className="text-button" onClick={() => go("wiki")}>
                      浏览 Wiki ↗
                    </button>
                  </div>
                  {rows(
                    [...active]
                      .sort((a, b) =>
                        b.meta.updatedAt.localeCompare(a.meta.updatedAt),
                      )
                      .slice(0, 6),
                  )}
                </section>
                <section className="panel roadmap-card">
                  <div className="section-top">
                    <h2>扩展候选</h2>
                    <Badge>研究中</Badge>
                  </div>
                  <p className="muted-text">
                    保留候选原顺序；实施优先级等待证据。
                  </p>
                  {active
                    .filter((e) => e.meta.type === "roadmap")
                    .sort(
                      (a, b) =>
                        Number(a.meta.fields.候选顺序) -
                        Number(b.meta.fields.候选顺序),
                    )
                    .slice(0, 5)
                    .map((e, i) => (
                      <button
                        className="candidate"
                        key={e.meta.id}
                        onClick={() => go(`record/${e.meta.id}`)}
                      >
                        <span>0{i + 1}</span>
                        <strong>{e.meta.title}</strong>
                        <span>↗</span>
                      </button>
                    ))}
                </section>
                <section className="panel">
                  <div className="section-top">
                    <h2>待复核内容</h2>
                    <small>文章版本与证据版本共同绑定</small>
                  </div>
                  {rows(active.filter((e) => e.reviewDue).slice(0, 4))}
                </section>
                <section className="panel note-card">
                  <div className="eyebrow">RESEARCH PRINCIPLE</div>
                  <h2>
                    事实、推断、待验证。
                    <br />
                    各自清楚，才能前进。
                  </h2>
                  <p>
                    性能结论需同时记录环境、方法与结果。来源变化只触发提醒，原结论与旧证据始终保留。
                  </p>
                  <button className="text-button" onClick={() => go("sources")}>
                    检查证据来源 ↗
                  </button>
                </section>
              </div>
            </>
          ) : entry ? (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">
                    {labels[entry.meta.type]} / {entry.meta.modules.join(" · ")}
                  </div>
                  <h1>{entry.meta.title}</h1>
                  <div className="toolbar">
                    <Badge muted>{entry.meta.status}</Badge>
                    <Badge muted>
                      {entry.reviewed ? "当前版本已复核" : "待实质复核"}
                    </Badge>
                    {entry.meta.deleted && <Badge>回收区</Badge>}
                    <small>{when(entry.meta.updatedAt)}</small>
                  </div>
                </div>
                <div className="toolbar wrap">
                  <button
                    onClick={() =>
                      act(
                        async () =>
                          setHistory(
                            await api.get<any[]>(`/history/${entry.meta.id}`),
                          ),
                        "已加载历史",
                      )
                    }
                  >
                    历史
                  </button>
                  {!entry.meta.deleted && (
                    <button
                      className="primary"
                      disabled={data.paused}
                      onClick={() => begin(entry)}
                    >
                      编辑记录
                    </button>
                  )}
                </div>
              </div>
              {history && (
                <section className="panel">
                  <div className="section-top">
                    <h2>完整版本历史</h2>
                    <button onClick={() => setHistory(undefined)}>收起</button>
                  </div>
                  {history.length ? (
                    history.map((h) => (
                      <details key={h.operationId}>
                        <summary>
                          {when(h.createdAt)} ·{" "}
                          {h.committed ? "已提交" : "已回滚 / 未提交"} ·{" "}
                          {h.operationId.slice(0, 8)}
                        </summary>
                        <div className="two-col">
                          {(["before", "after"] as const).map((side) => (
                            <div key={side}>
                              <h3>{side === "before" ? "修改前" : "修改后"}</h3>
                              <pre>{h[side] ?? "不存在"}</pre>
                              {h[side] && (
                                <button
                                  onClick={() =>
                                    act(async () => {
                                      await api.send(
                                        "/history/restore",
                                        {
                                          id: entry.meta.id,
                                          operationId: h.operationId,
                                          side,
                                        },
                                        api.context(entry.revision),
                                      );
                                      setHistory(
                                        await api.get(
                                          `/history/${entry.meta.id}`,
                                        ),
                                      );
                                    }, "已作为新版本恢复")
                                  }
                                >
                                  恢复此版本
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      </details>
                    ))
                  ) : (
                    <p>此记录没有受管提交历史；直接外部编辑不保证逐次历史。</p>
                  )}
                </section>
              )}
              <div className="reading-layout">
                <article className="panel article">
                  <div className="metadata-grid">
                    {Object.entries(entry.meta.fields)
                      .filter(([, v]) => v !== "")
                      .map(([k, v]) => (
                        <div key={k}>
                          <small>{k}</small>
                          <p>{typeof v === "string" ? v : JSON.stringify(v)}</p>
                        </div>
                      ))}
                  </div>
                  <Markdown text={entry.body} attachments={data.attachments} />
                  <div className="article-footer">
                    <span>
                      稳定 ID：<code>{entry.meta.id}</code>
                    </span>
                    <button
                      onClick={() =>
                        navigator.clipboard
                          .writeText(location.href)
                          .then(() => setNotice("稳定链接已复制"))
                      }
                    >
                      复制链接
                    </button>
                  </div>
                </article>
                <aside className="right-rail">
                  <section>
                    <h3>本页目录</h3>
                    {entry.body
                      .split("\n")
                      .filter((l) => /^#{1,3} /.test(l))
                      .map((h, i) => (
                        <a
                          key={i}
                          href={"#" + h.replace(/^#+ /, "")}
                          onClick={(e) => {
                            e.preventDefault();
                            document
                              .getElementById(h.replace(/^#+ /, ""))
                              ?.scrollIntoView({ behavior: "smooth" });
                          }}
                        >
                          {h.replace(/^#+ /, "")}
                        </a>
                      ))}
                  </section>
                  <section>
                    <h3>
                      固定证据版本 <span>{entry.meta.sources.length}</span>
                    </h3>
                    {entry.meta.sources.map((ref) => {
                      const s = data.sources.find(
                        (s) =>
                          s.sourceId === ref.sourceId &&
                          s.versionId === ref.versionId,
                      );
                      return (
                        <details key={ref.versionId}>
                          <summary>{s?.title ?? "缺失来源"}</summary>
                          {s && <SourceCard source={s} data={data} />}
                        </details>
                      );
                    })}
                    <button
                      onClick={async () => {
                        const note = await promptAction(
                          "记录本次实质复核：核验方法、证据与结果。",
                        );
                        if (note)
                          act(
                            () =>
                              api.send(
                                "/review",
                                { id: entry.meta.id, note },
                                api.context(entry.revision),
                              ),
                            "复核已绑定当前文章及证据版本",
                          );
                      }}
                    >
                      记录实质复核
                    </button>
                    {entry.lastReview && (
                      <div className="review-note">
                        <p>实质复核：{when(entry.lastReview.reviewedAt)}</p>
                        <p>{entry.lastReview.note}</p>
                        <small>
                          {entry.reviewed
                            ? "复核匹配当前文章版本"
                            : "旧复核不适用于当前文章版本"}
                          {entry.reviewDue ? " · 当前待复核" : ""}
                        </small>
                      </div>
                    )}
                  </section>
                  <section>
                    <h3>关联记录</h3>
                    {[...entry.meta.relations, ...entry.meta.dependencies].map(
                      (id) => (
                        <button
                          key={id}
                          className="text-button"
                          onClick={() => go("record/" + id)}
                        >
                          {data.entries.find((e) => e.meta.id === id)?.meta
                            .title ?? id}{" "}
                          ↗
                        </button>
                      ),
                    )}
                    <h3>反向引用</h3>
                    {entry.backlinks.map((id) => (
                      <button
                        key={id}
                        className="text-button"
                        onClick={() => go("record/" + id)}
                      >
                        {data.entries.find((e) => e.meta.id === id)?.meta
                          .title ?? id}{" "}
                        ↗
                      </button>
                    ))}
                  </section>
                  <section>
                    <h3>附件</h3>
                    {entry.meta.attachments.map((id) => {
                      const a = data.attachments.find((a) => a.id === id);
                      return (
                        a && (
                          <div key={id}>
                            <a
                              href={`/api/attachments/${id}`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {a.name}
                            </a>
                            <p>{a.description}</p>
                            <small>
                              {a.mime === "application/pdf"
                                ? "PDF 正文未索引"
                                : "图片文字未索引"}
                            </small>
                          </div>
                        )
                      );
                    })}
                  </section>
                  {!entry.meta.deleted && (
                    <button
                      className="danger"
                      onClick={async () => {
                        if (
                          await confirmAction(
                            "移入可恢复回收区？关联身份将保留。",
                          )
                        )
                          act(
                            () =>
                              api.send(
                                "/delete",
                                { id: entry.meta.id },
                                api.context(entry.revision),
                              ),
                            "已移入回收区",
                          );
                      }}
                    >
                      移入回收区
                    </button>
                  )}
                </aside>
              </div>
            </>
          ) : route === "sources" ? (
            <Sources data={data} act={act} />
          ) : route === "settings" ? (
            <Settings
              data={data}
              act={act}
              beginDraft={(d) => {
                setEdit(d);
                setDirty(true);
              }}
            />
          ) : (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">KNOWLEDGE LIBRARY</div>
                  <h1>{route === "search" ? "全文搜索" : heading}</h1>
                  <p>
                    {route === "recycle"
                      ? "保留稳定身份、历史和入站引用。通过记录历史恢复。"
                      : "以证据组织知识，让研究结论可以追溯。"}
                  </p>
                </div>
                {kinds.includes(route as any) && (
                  <button
                    className="primary"
                    onClick={() => begin(undefined, route)}
                  >
                    ＋ 新建{labels[route]}
                  </button>
                )}
              </div>
              <div className="filters">
                <select
                  aria-label="模块筛选"
                  value={module}
                  onChange={(e) => setModule(e.target.value)}
                >
                  <option value="">全部模块</option>
                  {[...new Set(filterEntries.flatMap((e) => e.meta.modules))]
                    .sort()
                    .map((m) => (
                      <option key={m}>{m}</option>
                    ))}
                </select>
                <select
                  aria-label="状态筛选"
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                >
                  <option value="">全部状态</option>
                  {[...new Set(filterEntries.map((e) => e.meta.status))]
                    .sort()
                    .map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                </select>
                <small>
                  {query ? `包含“${query}” · ` : ""}
                  {listed.length} 条匹配 · 文章与附件说明已索引；PDF 正文 / OCR
                  未索引
                </small>
              </div>
              <section className="panel">{rows(listed)}</section>
              {route === "comparison" && listed.length > 0 && (
                <section className="panel matrix">
                  <h2>统一维度矩阵</h2>
                  <table>
                    <thead>
                      <tr>
                        <th>比较维度</th>
                        {listed.map((e) => (
                          <th key={e.meta.id}>{e.meta.title}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {Object.keys(template("comparison").fields).map((k) => (
                        <tr key={k}>
                          <th>{k}</th>
                          {listed.map((e) => (
                            <td key={e.meta.id}>
                              {String(e.meta.fields[k] || "待研究")}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              )}
            </>
          )}
          <footer>
            ASCL / 本地知识与研究工作台{" "}
            <span>
              索引代次 {data.generation} · {when(data.scannedAt)}
            </span>
          </footer>
        </main>
      </div>
    </div>
  );
}
function SourceCard({
  source: s,
  data,
}: {
  source: SourceVersion;
  data: Snapshot;
}) {
  const check = data.checks[s.versionId];
  return (
    <div className="source-detail">
      <p>{s.summary}</p>
      <dl>
        <dt>固定版本</dt>
        <dd>
          {s.revision}
          {s.dirty ? " + 未提交范围内容" : ""}
        </dd>
        <dt>来源 / 版本 ID</dt>
        <dd>
          {s.sourceId}
          <br />
          {s.versionId}
        </dd>
        <dt>采集时间</dt>
        <dd>{when(s.collectedAt)}</dd>
        <dt>检查状态</dt>
        <dd>
          {check?.state ?? "尚未检查"}
          {check && <small>{when(check.checkedAt)}</small>}
        </dd>
        <dt>源码范围与定位</dt>
        <dd>
          {s.rootId ?? "外部资料"} / {s.scope.join(", ")} {s.location}
        </dd>
      </dl>
      {check?.changes.map((c) => (
        <p className="notice" key={c}>
          {c}
        </p>
      ))}
      {s.url && (
        <a href={s.url} target="_blank" rel="noreferrer">
          明确打开外部来源 ↗
        </a>
      )}
      {s.excerpt && <pre>{s.excerpt}</pre>}
    </div>
  );
}
function Sources({
  data,
  act,
}: {
  data: Snapshot;
  act: (fn: () => Promise<unknown>, message?: string) => void;
}) {
  const [source, setSource] = useState({
    sourceId: "",
    title: "",
    summary: "",
    revision: "",
    rootId: "",
    scope: "",
    url: "",
    location: "",
    excerpt: "",
  });
  const [file, setFile] = useState<File>();
  const [description, setDescription] = useState("");
  const [previous, setPrevious] = useState("");
  const [preview, setPreview] = useState("");
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">EVIDENCE & ATTACHMENTS</div>
          <h1>来源与附件</h1>
          <p>引用固定版本。更新资料不会改变历史结论的依据。</p>
        </div>
        <button
          onClick={() =>
            act(
              () => api.send("/sources/check"),
              "来源检查完成，实质复核时间未改变",
            )
          }
        >
          检查全部来源
        </button>
      </div>
      <section className="panel">
        <h2>采集来源版本</h2>
        <p className="muted-text">
          源码根先在库管理绑定。文件或目录相对路径每行一项；自动记录提交、范围摘要与未提交状态。
        </p>
        <div className="form-grid">
          {Object.keys(source)
            .filter((k) => k !== "excerpt")
            .map((k) => (
              <label key={k}>
                {
                  (
                    {
                      sourceId: "稳定来源 ID（新资料可留空）",
                      title: "标题",
                      summary: "来源摘要",
                      revision: "外部固定提交 / 版本",
                      rootId: "源码根 ID（外部资料留空）",
                      scope: "检查范围（逗号或换行分隔）",
                      url: "外部 URL（可选）",
                      location: "行号 / 定位说明",
                    } as any
                  )[k]
                }
                <input
                  value={(source as any)[k]}
                  onChange={(e) =>
                    setSource({ ...source, [k]: e.target.value })
                  }
                />
              </label>
            ))}
          <label className="wide">
            必要摘录
            <textarea
              value={source.excerpt}
              onChange={(e) =>
                setSource({ ...source, excerpt: e.target.value })
              }
            />
          </label>
        </div>
        <button
          className="primary"
          onClick={() =>
            act(
              () =>
                api.send("/sources", {
                  source: {
                    ...source,
                    sourceId: source.sourceId || undefined,
                    rootId: source.rootId || undefined,
                    scope: list(source.scope),
                    url: source.url || undefined,
                  },
                }),
              "不可变来源版本已创建",
            )
          }
        >
          保存新证据版本
        </button>
      </section>
      <section className="panel">
        <div className="section-top">
          <h2>已有来源</h2>
          <Badge muted>{data.sources.length} 个版本</Badge>
        </div>
        {data.sources.map((s) => (
          <details key={s.versionId}>
            <summary>
              {s.title}{" "}
              <small>
                {s.versionId.slice(0, 8)} ·{" "}
                {data.checks[s.versionId]?.state ?? "未检查"}
              </small>
            </summary>
            <SourceCard source={s} data={data} />
            <button
              onClick={() =>
                setSource({
                  sourceId: s.sourceId,
                  title: s.title,
                  summary: s.summary,
                  revision: s.revision,
                  rootId: s.rootId ?? "",
                  scope: s.scope.join(", "),
                  url: s.url ?? "",
                  location: s.location,
                  excerpt: s.excerpt,
                })
              }
            >
              以此资料创建新版本
            </button>
          </details>
        ))}
      </section>
      <section className="panel">
        <h2>附件版本</h2>
        <div className="form-grid">
          <label>
            选择文件 · 最多 50 MiB
            <input
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp,application/pdf"
              onChange={(e) => setFile(e.target.files?.[0])}
            />
          </label>
          <label>
            替代附件 ID（可选）
            <input
              value={previous}
              onChange={(e) => setPrevious(e.target.value)}
            />
          </label>
          <label className="wide">
            可搜索的附件说明
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
        </div>
        <button
          disabled={!file}
          onClick={() =>
            act(
              () => api.upload(file!, description, previous || undefined),
              "附件版本已保存，旧版本保留",
            )
          }
        >
          上传新版本
        </button>
        <p className="muted-text">
          附件名称与说明参与搜索；PDF 正文和图片文字不提取。
        </p>
        {data.attachments.map((a) => (
          <div className="attachment-row" key={a.id}>
            <div>
              <strong>{a.name}</strong>
              <p>{a.description}</p>
              <code>{a.id}</code>
              <small>
                {" "}
                {Math.ceil(a.bytes / 1024)} KiB ·{" "}
                {a.mime === "application/pdf"
                  ? "PDF 正文未索引"
                  : "图片文字未索引"}
              </small>
            </div>
            <button onClick={() => setPreview(preview === a.id ? "" : a.id)}>
              预览
            </button>
            {preview === a.id &&
              (a.mime === "application/pdf" ? (
                <Pdf id={a.id} />
              ) : (
                <img alt={a.name} src={"/api/attachments/" + a.id} />
              ))}
          </div>
        ))}
      </section>
    </>
  );
}
function Settings({
  data,
  act,
  beginDraft,
}: {
  data: Snapshot;
  act: (fn: () => Promise<unknown>, message?: string) => void;
  beginDraft: (d: any) => void;
}) {
  const { confirmAction } = useDialogs();
  const [rootId, setRootId] = useState("ascl");
  const [root, setRoot] = useState("");
  const [restoreFile, setRestoreFile] = useState<File>();
  const drafts = Object.keys(localStorage).filter((k) =>
    k.startsWith("ascl-draft-"),
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">LOCAL LIBRARY</div>
          <h1>库与运行管理</h1>
          <p>文件是权威来源。索引、筛选与反向引用可随时重建。</p>
        </div>
      </div>
      <section className="panel">
        <h2>当前资料库</h2>
        <p className="path">{api.session.root}</p>
        <small>库世代：{data.epoch}</small>
        <div className="toolbar wrap">
          <button
            onClick={() =>
              act(() => api.send("/scan"), "扫描完成，索引与反向引用已更新")
            }
          >
            扫描并重建索引
          </button>
          <button
            onClick={() =>
              act(
                () => api.send("/pause", { paused: !data.paused }),
                data.paused ? "写入已恢复" : "受管写入已暂停",
              )
            }
          >
            {data.paused ? "校验后恢复写入" : "暂停网页与 CLI 写入"}
          </button>
        </div>
        <p>
          安全外部编辑：暂停受管写入 → 编辑 Markdown/YAML → 扫描校验 →
          恢复写入。绕过协议的并发修改只做尽力检测，停服期间不保证逐次历史。
        </p>
      </section>
      <section className="panel">
        <h2>源码根映射 · 本机私有</h2>
        <p>源码始终只读；映射不进入备份，迁移后需重新绑定。</p>
        <div className="form-grid">
          <label>
            源码根 ID
            <input value={rootId} onChange={(e) => setRootId(e.target.value)} />
          </label>
          <label>
            本机目录
            <input
              value={root}
              onChange={(e) => setRoot(e.target.value)}
              placeholder="D:\项目目录"
            />
          </label>
        </div>
        <button
          onClick={() =>
            act(
              () => api.send("/roots", { id: rootId, root }),
              "本机源码根已绑定",
            )
          }
        >
          绑定根目录
        </button>
      </section>
      <section className="panel">
        <h2>完整备份与迁移</h2>
        <p>
          包含正文、附件、来源、复核、历史、回收内容及格式错误原文。导入通过校验后切换到新库并保留旧库；旧客户端不能写入新库。
        </p>
        <div className="toolbar wrap">
          <button
            className="primary"
            onClick={() => act(api.backup, "备份已生成并开始下载")}
          >
            导出完整备份
          </button>
          <input
            aria-label="选择备份包"
            type="file"
            accept=".zip"
            onChange={(e) => setRestoreFile(e.target.files?.[0])}
          />
          <button
            disabled={!restoreFile}
            onClick={async () => {
              if (
                await confirmAction(
                  "将备份恢复到新目录，并切换活动资料库？当前资料库会保留。",
                )
              )
                act(async () => {
                  await api.restore(restoreFile!);
                }, "恢复校验通过，已切换库；刷新页面以使用新库");
            }}
          >
            恢复到新库并切换
          </button>
        </div>
      </section>
      <section className="panel">
        <h2>诊断 · {data.diagnostics.length}</h2>
        {data.diagnostics.length ? (
          data.diagnostics.map((d, i) => (
            <div className="diagnostic" key={i}>
              <strong>{d.message}</strong>
              <p>{d.file}</p>
              {d.file.startsWith("records/") && !d.file.includes(" ↔ ") && (
                <a
                  href={"/api/diagnostic/" + i}
                  target="_blank"
                  rel="noreferrer"
                >
                  查看保留原文
                </a>
              )}
            </div>
          ))
        ) : (
          <p>当前扫描未发现格式、重复身份或关系错误。</p>
        )}
      </section>
      <section className="panel">
        <h2>浏览器草稿 · {drafts.length}</h2>
        <p>旧库草稿可查看与复制；不会自动跨库提交。</p>
        {drafts.map((k) => {
          try {
            const d = JSON.parse(localStorage.getItem(k)!);
            return (
              <div className="attachment-row" key={k}>
                <div>
                  <strong>{d.meta.title}</strong>
                  <small>
                    {" "}
                    {d.epoch === data.epoch ? "当前库" : "旧库世代"}
                  </small>
                </div>
                <button onClick={() => beginDraft(d)}>查看草稿</button>
                <button
                  onClick={async () => {
                    if (await confirmAction("永久删除此浏览器草稿？")) {
                      localStorage.removeItem(k);
                      act(async () => {}, "草稿已删除");
                    }
                  }}
                >
                  删除草稿
                </button>
              </div>
            );
          } catch {
            return <p key={k}>草稿格式错误：{k}</p>;
          }
        })}
      </section>
      <section className="panel">
        <h2>按需停止</h2>
        <p>停止前请保存编辑；再次使用时运行启动脚本。</p>
        <button
          className="danger"
          onClick={async () => {
            if (await confirmAction("停止当前 ASCL 本地服务？"))
              act(() => api.send("/stop"), "停止请求已发送");
          }}
        >
          停止本实例
        </button>
      </section>
    </>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Dialogs>
      <App />
    </Dialogs>
  </React.StrictMode>,
);
