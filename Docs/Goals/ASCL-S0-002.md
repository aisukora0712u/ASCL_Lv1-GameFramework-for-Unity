---
format: 1
kind: implementation-goal
id: ASCL-S0-002
title: 调度清空与异步等待终态
phase: S0
areas:
  - D02
capabilities:
  - D02-C04
priority: P0
category: committed
changeType: 修整
dependencies: []
status: planned
isGate: false
createdAt: 2026-09-15T19:00:34.818Z
updatedAt: 2026-09-15T19:00:34.818Z
startedAt: null
completedAt: null
reason: null
evidence: []
log:
  - at: 2026-09-15T19:00:34.818Z
    type: planning
    message: 由已确认长期路线图整理；仅建立目标，尚未安排框架实施。
---

# ASCL-S0-002 · 调度清空与异步等待终态

## 问题与预期收益

当前基线尚未完成本目标的正式验收。通过调度清空与异步等待终态沉淀可跨项目复用、可观察和可验证的能力。

## 工作内容与边界

- **D02-C04 异步任务作用域**：跟随世界、实体、场景、行为管理取消、停止完成、异常和过期运行结果。

只实现本目标列明能力并提供最小完整示例；跨模块需求通过显式依赖接入，不提前实施其他目标。

## 交付物

- 可安装或可组合的规则实现／适配，以及最小完整使用示例。
- 与目标相符的验证结果、支持矩阵、错误诊断和必要迁移说明。

## 公共接口与兼容

增强 Scheduler 与生命周期清理契约；取消请求不冒充任务已停止。

遵循 PLAN.md 的身份、生命周期、模拟、内容版本与后端能力边界。稳定接口破坏性变更提供迁移路径；未测试平台不标为支持。

## 验收条件

- [ ] DelayAsync 等待在 Clear、Dispose、取消竞态后均进入明确终态
- [ ] 重复清理不会二次完成
- [ ] 记录并回归当前挂起问题。
- [ ] 交付与验证证据已写入元数据 evidence，实际验证记录写入 log。

## 验证场景

DelayAsync 等待在 Clear、Dispose、取消竞态后均进入明确终态；重复清理不会二次完成；记录并回归当前挂起问题。

提供正常路径与相关失败、取消、重复和恢复路径的可重复样例。先 .NET/Unity 桌面，IL2CPP/移动端在对应目标验证。

## 实施记录

当前仅登记目标，未开始实际实施。实际工作记录以本文件 frontmatter 的 log/evidence 为准；不要在总计划或网页另填一份状态。
