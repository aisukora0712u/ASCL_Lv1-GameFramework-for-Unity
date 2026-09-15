import { z } from "zod";
import { kinds, safeId } from "../shared/model.ts";
export function registerWorkspaceTools(actions: {
  search: (query: string) => Promise<unknown>;
  open: (id: string) => Promise<boolean>;
  begin: (kind: (typeof kinds)[number]) => Promise<boolean>;
}) {
  const registry = (document as any).modelContext;
  if (!registry?.registerTool) return () => {};
  const life = new AbortController();
  const definitions = [
    {
      name: "search_records",
      title: "检索本地记录",
      description:
        "搜索当前库的文章、代码、结构化字段与附件说明；更新页面搜索结果。PDF 正文与 OCR 未索引。",
      schema: z.object({ query: z.string().max(300) }),
      properties: { query: { type: "string", maxLength: 300 } },
      readOnly: false,
      execute: ({ query }: any) => actions.search(query),
    },
    {
      name: "open_record",
      title: "打开稳定记录",
      description: "通过稳定 ID 打开当前库的记录，保留未提交草稿的离开提醒。",
      schema: z.object({ id: safeId }),
      properties: { id: { type: "string" } },
      readOnly: false,
      execute: async ({ id }: any) => {
        return (await actions.open(id)) ? { opened: id } : { cancelled: true };
      },
    },
    {
      name: "start_record_creation",
      title: "开始新建记录",
      description:
        "打开指定类型的编辑表单；只开始编辑，尚未提交或创建磁盘记录。",
      schema: z.object({ kind: z.enum(kinds) }),
      properties: { kind: { type: "string", enum: kinds } },
      readOnly: false,
      execute: async ({ kind }: any) => {
        return (await actions.begin(kind))
          ? { editing: kind, saved: false }
          : { cancelled: true };
      },
    },
  ];
  for (const d of definitions) {
    try {
      Promise.resolve(
        registry.registerTool(
          {
            name: d.name,
            title: d.title,
            description: d.description,
            inputSchema: {
              type: "object",
              properties: d.properties,
              required: Object.keys(d.properties),
              additionalProperties: false,
            },
            annotations: {
              readOnlyHint: d.readOnly,
              untrustedContentHint: true,
            },
            execute: (input: unknown) =>
              d.execute(d.schema.strict().parse(input)),
          },
          { signal: life.signal },
        ),
      ).catch(() => {});
    } catch {
      /* Optional capability; browser UI remains fully usable. */
    }
  }
  return () => life.abort();
}
