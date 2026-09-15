import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Attachment } from "../shared/model.ts";
function Mermaid({ code }: { code: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    setError("");
    if (/%%\s*\{|^\s*---/m.test(code) || code.length > 30000) {
      setError("图表不能包含配置指令，且最多 30,000 字符");
      return;
    }
    import("mermaid")
      .then(async ({ default: mermaid }) => {
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          suppressErrorRendering: true,
          maxTextSize: 30000,
          maxEdges: 300,
          fontFamily: "system-ui",
          theme: "neutral",
        });
        const { svg } = await mermaid.render(
          "mermaid-" + crypto.randomUUID(),
          code,
        );
        if (alive && ref.current) ref.current.innerHTML = svg;
      })
      .catch((e) => alive && setError(String(e.message)));
    return () => {
      alive = false;
    };
  }, [code]);
  return error ? (
    <pre className="error">{error}</pre>
  ) : (
    <div className="mermaid" ref={ref} aria-label="Mermaid 图表" />
  );
}
export function Pdf({ id }: { id: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");
  useEffect(() => {
    let disposed = false;
    let task: any;
    let render: any;
    Promise.all([
      import("pdfjs-dist"),
      import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
    ])
      .then(async ([pdf, worker]) => {
        pdf.GlobalWorkerOptions.workerSrc = worker.default;
        task = pdf.getDocument({
          url: `/api/attachments/${id}`,
          disableFontFace: true,
          useSystemFonts: false,
          useWorkerFetch: false,
          isOffscreenCanvasSupported: false,
          maxImageSize: 16_000_000,
          disableAutoFetch: true,
        });
        const doc = await task.promise;
        if (disposed) return;
        setTotal(doc.numPages);
        const p = await doc.getPage(page);
        const base = p.getViewport({ scale: 1 });
        const scale = Math.min(
          1.5,
          1200 / base.width,
          Math.sqrt(4_000_000 / (base.width * base.height)),
        );
        const viewport = p.getViewport({ scale });
        if (disposed || !canvas.current) return;
        canvas.current.width = viewport.width;
        canvas.current.height = viewport.height;
        render = p.render({
          canvas: canvas.current,
          viewport,
          annotationMode: pdf.AnnotationMode.DISABLE,
        });
        await render.promise;
      })
      .catch((e) => !disposed && setError(e.message));
    return () => {
      disposed = true;
      render?.cancel();
      task?.destroy();
    };
  }, [id, page]);
  return (
    <div className="pdf">
      <div className="toolbar">
        <button disabled={page <= 1} onClick={() => setPage(page - 1)}>
          上一页
        </button>
        <span>
          {page} / {total || "…"}
        </span>
        <button disabled={page >= total} onClick={() => setPage(page + 1)}>
          下一页
        </button>
      </div>
      <small>受限预览 · 不执行脚本或链接 · PDF 正文未索引</small>
      {error ? <p className="error">{error}</p> : <canvas ref={canvas} />}
    </div>
  );
}
export function Markdown({
  text,
  attachments = [],
}: {
  text: string;
  attachments?: Attachment[];
}) {
  return (
    <div className="prose">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        components={{
          h1: ({ children }) => <h1 id={String(children)}>{children}</h1>,
          h2: ({ children }) => <h2 id={String(children)}>{children}</h2>,
          h3: ({ children }) => <h3 id={String(children)}>{children}</h3>,
          code: ({ className, children, ...props }) =>
            className === "language-mermaid" ? (
              <Mermaid code={String(children).trim()} />
            ) : (
              <code className={className} {...props}>
                {children}
              </code>
            ),
          img: ({ src, alt }) =>
            typeof src === "string" &&
            /^\/api\/attachments\/[\w-]+$/.test(src) ? (
              <img src={src} alt={alt} loading="lazy" />
            ) : (
              <span className="notice">图片未加载：仅支持本地附件。{alt}</span>
            ),
          a: ({ href, children }) => {
            const a = attachments.find(
              (v) => href === `/api/attachments/${v.id}`,
            );
            if (a?.mime === "application/pdf")
              return (
                <span className="pdf-ref">
                  <span>{children}</span>
                  <Pdf id={a.id} />
                </span>
              );
            return (
              <a
                href={href}
                target={href?.startsWith("http") ? "_blank" : undefined}
                rel="noreferrer noopener"
              >
                {children}
              </a>
            );
          },
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
