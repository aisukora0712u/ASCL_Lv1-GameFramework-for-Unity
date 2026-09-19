# ASCL 阶段目标导航与维护规范

[总计划](PLAN.md)是范围基线；本文件负责导航和规则；每份 Docs/Goals/*.md 是该目标状态的唯一编辑点。网页从仓库文件实时读取，不写回、不复制到私人知识库。

## 阶段入口

- [S0 基础修整与关键可行性验证](Docs/Plans/S0.md)
- [S1 模块基础与内容基础](Docs/Plans/S1.md)
- [S2 俯视角射击：单机与本地多人](Docs/Plans/S2.md)
- [S3 射击联机、预测与回滚](Docs/Plans/S3.md)
- [S4 回合策略示例](Docs/Plans/S4.md)
- [S5 经营建造示例](Docs/Plans/S5.md)
- [S6 项目驱动扩展与平台验证](Docs/Plans/S6.md)
- [ASCL-DOC-001 文档与追踪准备](Docs/Goals/ASCL-DOC-001.md)：不计入框架进度。

## 目标状态

| 元数据值 | 显示 | 使用条件 |
| --- | --- | --- |
| planned | 待安排 | 已登记范围；依赖满足只表示可以安排 |
| in_progress | 进行中 | 已实际开工，填写 startedAt |
| in_review | 待验收 | 实现就绪但尚未满足全部验收 |
| done | 已完成 | 验收勾选通过，有 completedAt、evidence 及 verification 日志 |
| blocked | 阻塞 | 明确记录 reason，保留实际进展 |
| deferred | 暂缓 | 明确 reason 与范围调整日志 |
| cancelled | 取消 | 明确 reason，保留原 ID 和历史 |

## 安排类别与完成率

- committed：纳入阶段实施；本路线图 S0–S5 的功能与退出验收目标。
- project_driven：S6 项目驱动候选，未安排前单独计数。收到具体任务后改为 committed 并记录 scope 日志。
- research：暂缓专项；正式回滚不属于此类。
- setup：本次文档/追踪准备，与框架实施分开。

总完成率 = 状态为 done 的纳入目标数 / 纳入目标数。纳入目标指 category=committed 且 status 不为 deferred/cancelled 的叶子目标。阻塞和待验收仍在分母；准备、未安排候选和已退出范围目标单列数量。分母为 0 时显示“尚未纳入实施”，不显示 100%。

每个目标均是叶子，不将阶段与领域重复计数。每阶段的退出验收是单独叶子目标，依赖本阶段全部有效正式功能目标。新增阶段目标时同步补充验收依赖。S6 是开放目录，首次纳入正式目标时新增退出验收；后续扩大范围同步更新并重新安排验收，保留旧验收记录。范围变化会改变分母，必须记录原因和 scope 日志；不能靠删除目标提高完成率。

目标因阶段调整或专项正式立项而改变分类时保留原 ID，ID 中的阶段表示初次登记位置。暂缓/取消功能目标时显式调整验收依赖；仍有实施目标的阶段必须保留有效退出验收，不能仅取消验收来提高完成率。

## 后续任务更新流程

1. 读取 PLAN、GOALS 和对应目标；依赖和范围以目标文件为准。未收到实施任务时不自动启动就绪目标。
2. 实际开工更新 status/startedAt/updatedAt 和 progress 日志。多个任务分别更新各自目标，避免覆盖其他改动。
3. 完成实现后记录交付、测试命令/环境/结果、剩余限制和证据引用；没有证据不可标完成。
4. 验收通过后勾选正文验收项、设置 done/completedAt，增加 verification 日志；依赖也必须完成。
5. 本次代码及目标状态同批提交。提交号在已知后引用，不编造自引用哈希；可用已提交报告和可重复命令作为证据。
6. 调整范围、拆分或新增目标保留旧 ID 和 scope 日志，更新阶段导航、依赖与覆盖。
7. 在 Tools/KnowledgeSite 运行 pnpm roadmap:validate（只读），再运行与实际改动相关的检查。

## 数据格式

目标 YAML：format/kind/id/title/phase/areas/capabilities/priority/category/changeType/dependencies/status/isGate/createdAt/updatedAt/startedAt/completedAt/reason/evidence/log。时间为带时区的 ISO 8601；尚未发生填 null。evidence 项包含 label/reference/result；log 项包含 at/type/message。

正文保留：问题与预期收益、工作内容与边界、交付物、公共接口与兼容、验收条件、验证场景、实施记录。API 和 CLI 使用同一读取器，重复 ID、未知引用、循环、未覆盖能力及完成状态缺证据会使校验失败；网页抑制无效完成率。

## 网页与命令

- [实施目标页面](http://127.0.0.1:4317/#implementation)
- pnpm roadmap:validate：验证文档、依赖、覆盖和状态。
- pnpm roadmap:summary：输出机器可读汇总。
- GET /api/project-roadmap：只读文档快照、阶段、目标、汇总、覆盖与诊断。
- [本次追踪工具验收记录](Docs/ROADMAP_TRACKING_VALIDATION.md)：交付时的覆盖、测试和浏览器证据快照。

页面支持阶段/领域/状态/优先级筛选、搜索、目标深链接、实施动态及候选目录；可见时定时刷新、回到页面刷新、手动刷新。此文件不保存会过期的手工计数或进度副本。

## 2026-09-19 项目接入范围

Algorithm_Storage 批准的接入关联 [S0-001](Docs/Goals/ASCL-S0-001.md)、[S0-002](Docs/Goals/ASCL-S0-002.md)，新增 [S6-040](Docs/Goals/ASCL-S6-040.md) 及 [S6-900](Docs/Goals/ASCL-S6-900.md)。这是受限单机能力交付，不替代 S0/S4 的完整验收。能力覆盖继续由每份目标元数据计算。
