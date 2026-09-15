---
format: 1
kind: implementation-goal
id: ASCL-DOC-001
title: 长期目标文档与只读追踪工作台
phase: PREP
areas: []
capabilities: []
priority: P0
category: setup
changeType: 文档与工具
dependencies: []
status: done
isGate: false
createdAt: 2026-09-15T19:00:34.818Z
updatedAt: 2026-09-15T19:32:47.530Z
startedAt: 2026-09-15T19:00:34.818Z
completedAt: 2026-09-15T19:32:47.530Z
reason: null
evidence:
  - label: 交付与覆盖验收报告
    reference: Docs/ROADMAP_TRACKING_VALIDATION.md
    result: 7 阶段、16 领域、136 能力全部映射；96 个未来目标保持待安排。
  - label: 文档与回归检查
    reference: Tools/KnowledgeSite/tests/roadmap.test.ts；pnpm roadmap:validate；pnpm
      test；pnpm build
    result: 45 项测试、TypeScript 和生产构建通过。
  - label: 浏览器验收
    reference: http://127.0.0.1:4317/#implementation
    result: 概览、阶段、筛选、目标详情、覆盖矩阵、错误诊断与恢复通过；框架完成率 0/49。
log:
  - at: 2026-09-15T19:00:34.818Z
    type: planning
    message: 由已确认长期路线图整理；仅建立目标，尚未安排框架实施。
  - at: 2026-09-15T19:19:05.711Z
    type: progress
    message: 文档、读取器、页面与校验已实现；44 项测试和生产构建通过，正在完成浏览器复核与交付。
  - at: 2026-09-15T19:32:47.530Z
    type: verification
    message: 路线图覆盖、45 项工作台测试、TypeScript、生产构建及实际浏览器验收通过；文档与工具准备完成，未来框架实施仍待另行安排。
---
# ASCL-DOC-001 · 长期目标文档与只读追踪工作台

## 问题与预期收益

建立仓库文档与网页的一致追踪入口，供后续独立任务使用。

## 工作内容与边界

- 仅建设本次文档和追踪工具；S0–S6 功能留待另行安排。


## 交付物

- PLAN/GOALS、阶段与目标文档、只读 API/CLI、网页和验证报告。
- 与目标相符的验证结果、支持矩阵、错误诊断和必要迁移说明。

## 公共接口与兼容

新增独立只读路线图 API/CLI 和页面；仓库 Markdown 唯一权威，路线图不迁移、不写入现有私人知识库。

保持现有知识库读写和备份协议。

## 验收条件

- [x] 所有原始能力有阶段目标映射
- [x] 校验、测试和构建通过
- [x] 浏览器可查看阶段/目标/覆盖/诊断
- [x] 未来框架目标全部待安排。
- [x] 交付与验证证据已写入元数据 evidence，实际验证记录写入 log。

## 验证场景

所有原始能力有阶段目标映射；校验、测试和构建通过；浏览器可查看阶段/目标/覆盖/诊断；未来框架目标全部待安排。

验证解析、关系、进度计算、错误状态与浏览器真实显示；GET/CLI 不修改来源。

## 实施记录

本准备项已验收完成，S0–S6 框架目标仍未开始。实际工作记录以本文件 frontmatter 的 log/evidence 为准；不要在总计划或网页另填一份状态。
