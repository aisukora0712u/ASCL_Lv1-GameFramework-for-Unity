# ASCL 本地知识与研究工作台

个人、本机、中文的框架 Wiki 与研究工作台。提供 Wiki、扩展路线图、项目应用、框架对比和架构决策五类记录，以及证据版本、附件、历史、回收与完整备份。程序不改变 ASCL 运行时 API。

## 首次准备与日常使用

要求 Windows、Node.js **24.x** 和 pnpm（依赖锁定在 `pnpm-lock.yaml`）。首次联网执行：

```powershell
cd Tools/KnowledgeSite
.\Prepare.ps1
```

如果 Node/pnpm 没有加入 PATH，可以显式传入 `-NodePath`、`-PnpmPath`。准备脚本保存本机 Node 路径到被忽略的 `.local/runtime.json`。

日常双击 **Start.cmd** 启动，双击 **Stop.cmd** 停止；也可执行 `Start.ps1 -NoBrowser`。页面地址为 **http://127.0.0.1:4317**。日常启动只运行生产构建，不安装、升级或自动重建依赖，不创建开机自启动。后台 Node 进程独立于启动终端，关闭终端不会停止服务。

重复启动会核验安装身份、协议、实例随机身份和活动库。端口被其他程序占用或实例身份不明时停止操作，不凭 PID 杀进程。浏览器扩展若对该地址显示 `ERR_BLOCKED_BY_CLIENT`，服务仍可在 Codex 应用内浏览器使用；程序不会更改浏览器保护设置。

## 程序与正式内容分离

默认库为仓库**同级**的 `ASCL_Knowledge_Local`，不在程序目录中。这里不包含正式内容种子、项目资料、附件、索引、日志或截图。`templates/` 只提供通用格式；测试使用临时合成库。

本机状态在 `%LOCALAPPDATA%/ASCL/KnowledgeSite/<安装路径摘要>/`，保存活动目录指针、源码根映射、实例身份和服务日志。源码映射不进入备份。可在启动前设置 `ASCL_KNOWLEDGE_STATE` 和 `ASCL_KNOWLEDGE_LIBRARY` 来使用独立测试实例；同一固定端口只能运行一个实例。已有活动指针时，不允许以不同目录参数静默覆盖它。

库内组织：

| 路径 | 内容 |
| --- | --- |
| `library.json` | 格式版本、库世代、暂停状态 |
| `records/*.md` | YAML frontmatter + Markdown 正文，权威来源 |
| `sources/<资料ID>/<版本ID>.json` | 不可变证据版本及范围摘要 |
| `attachments/<ID>.json` / `.bin` | 不可变附件版本及说明 |
| `reviews/`、`checks/` | 实质复核与自动检查；旧版保留在事务历史 |
| `history/<操作ID>/` | 完整前后快照、事务清单、提交或回滚标记 |
| `recycle/` | 软删除前的原文；记录身份及关联继续保留 |
| `observed/` | 扫描实际观察到的外部编辑版本 |

不自动清理历史、回收内容或未引用附件。备份前请确认本机磁盘空间足够。

## 日常内容维护

- 网页提供结构化字段、Markdown 即时预览、GFM 表格、代码、严格 Mermaid、本地位图与 PDF 预览。
- 草稿按浏览器标签页与库世代隔离保存在本机浏览器；关闭编辑器后可从库管理恢复。浏览器清除站点数据会删除浏览器草稿，不影响已提交文件。
- 稳定 ID 用于路由和关系，改标题或移动 Markdown 文件不会改变身份。一般关系允许循环，实施依赖不允许循环。
- 更新附件或来源时创建新版本；文章明确选择版本，不自动指向最新版本。更改附件名称或说明也以新附件版本保存。
- 实质复核需要填写依据，绑定文章完整摘要及引用版本；文章变化后旧复核不适用于新版。自动来源检查只报告变化，不代表重新认可结论。
- 性能结论应填写环境、方法与结果；对比记录要填写双方固定版本。正式对象由人指定，不自动搜索或抓取 GitHub。
- 搜索覆盖标题、正文、代码、表格、结构化字段、来源摘要及附件名称/说明；支持中文单字、连续词组及 API 标识符。**PDF 正文与图片文字不索引**。
- 监听只用于加快更新；每次启动、每分钟以及手动扫描都会对账并一起更新检索、筛选统计和反向引用。

外部编辑安全路径：**暂停网页与 CLI 受管写入 → 编辑文件 → 扫描并修复诊断 → 恢复写入**。绕过协议的并发改动只能尽力检测；停服期间多次外部修改无法生成逐次历史。

## Codex / CLI

CLI 与网页共用 `server/store.ts`，不建立第二套写入逻辑。修改前读取库世代和完整文件摘要，写入使用稳定操作 ID。正文建议 UTF-8。

```powershell
node server/cli.ts status
node server/cli.ts list
node server/cli.ts show <记录ID>
node server/cli.ts template wiki
node server/cli.ts validate

# 从 show 获取 revision，从 status 获取 epoch；新建的 baseline 使用 null。
node server/cli.ts save <草稿.md> --epoch <库世代> --baseline <完整摘要或null> --op <唯一操作ID>
node server/cli.ts delete <记录ID> --epoch <库世代> --baseline <完整摘要> --op <唯一操作ID>
node server/cli.ts history <记录ID>
node server/cli.ts restore <记录ID> <历史操作ID> before --epoch <库世代> --baseline <当前摘要> --op <新操作ID>
node server/cli.ts pause --epoch <库世代> --op <唯一操作ID>
node server/cli.ts scan
node server/cli.ts resume --epoch <库世代> --op <唯一操作ID>
node server/cli.ts bind ascl <源码目录> --epoch <库世代> --op <唯一操作ID>
node server/cli.ts source <来源输入.json> --epoch <库世代> --op <唯一操作ID>
node server/cli.ts check --epoch <库世代> --op <唯一操作ID>
node server/cli.ts review <记录ID> "本次核验方法与结果" --epoch <库世代> --baseline <当前摘要> --op <唯一操作ID>
node server/cli.ts attach <附件文件> "可搜索说明" --epoch <库世代> --op <唯一操作ID>
node server/cli.ts backup <新的备份.zip> --epoch <库世代> --op <唯一操作ID>
node server/cli.ts restore-backup <备份.zip> --epoch <库世代> --op <唯一操作ID>
```

所有命令可追加 `--state <私有状态目录>`；首次初始化可追加 `--library <库目录>`。示例中的尖括号是占位符，不可原样执行。

来源输入示例：

```json
{
  "sourceId": "module-contract",
  "title": "某模块契约",
  "summary": "本次研究涉及的公开 API 与约束",
  "rootId": "ascl",
  "scope": ["Runtime/Example", "package.json"],
  "location": "入口方法与配置字段定位",
  "excerpt": "与结论直接相关的必要摘录"
}
```

范围路径相对于明确绑定的根目录。实际路径必须存在或被记录为缺失；目录范围追踪新增、删除及修改。外部人工资料省略 rootId，填写 `url` 和固定 `revision`；网页不会自动抓取该 URL。

## 写入、恢复与本地边界

统一锁覆盖完整读取、摘要比较、校验、前后快照、同卷临时文件刷新、原子重命名和提交标记。活跃或身份不明的锁不会因超时被抢占。确认进程不存在后才恢复陈旧锁；PID 被复用为活跃进程时保守拒绝。回复丢失可以用**同一操作 ID、同一请求**确认原结果，不能换 ID 盲目重发。

启动恢复未提交事务时，目标匹配旧值/新值则回滚到旧状态；第三种内容保留全部版本并阻止受管写入。请先备份现有磁盘原文，再根据事务清单及快照人工核对，不手工删除未知锁或事务目录。确定目标应回到已记录旧值/新值后再启动扫描。强杀进程测试不等于断电或介质损坏保证。

完整备份在冻结受管写入期间建立文件清单和磁盘暂存副本，释放库锁后压缩。检测到外部变动会拒绝该次导出。恢复验证格式、路径、摘要及解包限额后写入新目录，再原子切换活动指针；旧库保留，旧标签页和 CLI 世代被拒绝。格式错误的文章原文保留并显示诊断，不按检索索引过滤备份。

服务只监听 `127.0.0.1:4317`，校验准确 Host、写入 Origin 和实例令牌。GET 无修改操作；上传、绑定、备份、恢复、停止均受相同边界保护。程序没有多用户认证，也不将本机同账户下的恶意进程视为可隔离租户。

文件按稳定 ID 定位，校验真实路径与目录边界，拒绝路径穿越、Windows 设备名、ADS 和重解析点。Markdown 原始 HTML 禁用；Mermaid 不接受正文内配置指令。外部链接需用户明确点击，自动加载只允许本地资源。PDF 以本地 PDF.js 绘制画布，不执行文档脚本或链接动作。

限制：附件每个 50 MiB；图片单边最多 16,384、累计最多 4,000 万像素，动画最多 200 帧；备份压缩包最多 512 MiB、解包总量 1 GiB、50,000 文件、单条目 100 MiB。首版不自动清理历史，也不进行 OCR 或 PDF 正文提取。

## 开发与验证

```powershell
pnpm test
pnpm build
# 仅在 4317 端口空闲时执行运行集成检查：
node tests/runtime-check.ts
```

生产页面从 `dist` 提供，所有运行资源在本地。开发时分别启动 Node 服务与 `pnpm dev`；Vite 代理用于阅读调试，写入必须在生产同源地址验收。不要放宽生产 Host/Origin 校验来方便开发。

`tests/storage.test.ts` 覆盖隔离临时库上的事务、真实强杀子进程、故障注入、CLI、来源、备份、路径与 HTTP。`tests/browser-fixture.ts` **仅用于明确指定的隔离测试状态/库**，生成合成图像和 PDF，不能指向正式库。验证范围与实际结果见 [VALIDATION.md](VALIDATION.md)。

页面在支持 WebMCP 的浏览器提供 `search_records`、`open_record`、`start_record_creation` 三个接口。它们调用同一页面状态；新建接口仅打开编辑器，不冒充已保存。没有网页 AI 调用。
