---
format: 1
kind: implementation-goal
id: ASCL-S0-001
title: 世界身份隔离与旧句柄防误用
phase: S0
areas:
  - D02
capabilities:
  - D02-C01
priority: P0
category: committed
changeType: 修整
dependencies: []
status: done
isGate: false
createdAt: 2026-09-15T19:00:34.818Z
updatedAt: 2026-09-19T05:59:11.552Z
startedAt: 2026-09-19T05:29:48.702Z
completedAt: 2026-09-19T05:59:11.552Z
reason: null
evidence:
  - label: 0.2.0 自动验证记录
    reference: Docs/Validation/ASCL-0.2.0.md
    result: .NET 32 项、Unity EditMode 与 PlayMode 通过；消费项目验收独立记录
log:
  - at: 2026-09-19T05:59:11.552Z
    type: verification
    message: 双目标构建、32 项 .NET 测试、Unity 共享边界与 UI/渲染测试通过；不扩大本目标范围。
  - at: 2026-09-19T05:29:48.703Z
    type: progress
    message: Algorithm_Storage 批准的 ASCL 完整接入开始；仅实施本目标及明确关联的接入能力。
  - at: 2026-09-15T19:00:34.818Z
    type: planning
    message: 由已确认长期路线图整理；仅建立目标，尚未安排框架实施。
---

# ASCL-S0-001 · 世界身份隔离与旧句柄防误用

## 问题与预期收益

当前基线尚未完成本目标的正式验收。通过世界身份隔离与旧句柄防误用沉淀可跨项目复用、可观察和可验证的能力。

## 工作内容与边界

- **D02-C01 分用途身份**：运行时句柄、持久实体、内容定义、网络实体、玩家席位和模拟身份分别治理。

只实现本目标列明能力并提供最小完整示例；跨模块需求通过显式依赖接入，不提前实施其他目标。

## 交付物

- 可安装或可组合的规则实现／适配，以及最小完整使用示例。
- 与目标相符的验证结果、支持矩阵、错误诊断和必要迁移说明。

## 公共接口与兼容

扩展 EntityHandle 世界归属，区分运行句柄与持久身份；对公开构造和解析调用提供迁移说明。

遵循 PLAN.md 的身份、生命周期、模拟、内容版本与后端能力边界。稳定接口破坏性变更提供迁移路径；未测试平台不标为支持。

## 验收条件

- [x] 两个世界的相同槽位/代次不能互相解析
- [x] 销毁重建与对象复用不使旧句柄重新有效
- [x] 现有调用迁移有回归测试。
- [x] 交付与验证证据已写入元数据 evidence，实际验证记录写入 log。

## 验证场景

两个世界的相同槽位/代次不能互相解析；销毁重建与对象复用不使旧句柄重新有效；现有调用迁移有回归测试。

提供正常路径与相关失败、取消、重复和恢复路径的可重复样例。先 .NET/Unity 桌面，IL2CPP/移动端在对应目标验证。

## 实施记录

本次已实施并完成自动验证。实际工作记录以本文件 frontmatter 的 log/evidence 为准；不要在总计划或网页另填一份状态。
