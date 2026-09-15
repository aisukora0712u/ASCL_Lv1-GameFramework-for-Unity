---
format: 1
kind: implementation-goal
id: ASCL-S3-007
title: 无引擎 .NET 专用服务器
phase: S3
areas:
  - D14
capabilities:
  - D14-C10
priority: P1
category: committed
changeType: 适配
dependencies:
  - ASCL-S3-003
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

# ASCL-S3-007 · 无引擎 .NET 专用服务器

## 问题与预期收益

当前基线尚未完成本目标的正式验收。通过无引擎 .NET 专用服务器沉淀可跨项目复用、可观察和可验证的能力。

## 工作内容与边界

- **D14-C10 专用服务器入口**：纯 C# 规则在 .NET 无引擎环境运行，可选部署。

只实现本目标列明能力并提供最小完整示例；跨模块需求通过显式依赖接入，不提前实施其他目标。

## 交付物

- 可安装或可组合的规则实现／适配，以及最小完整使用示例。
- 与目标相符的验证结果、支持矩阵、错误诊断和必要迁移说明。

## 公共接口与兼容

服务器宿主与会话适配，复用规则、内容与快照实现。

遵循 PLAN.md 的身份、生命周期、模拟、内容版本与后端能力边界。稳定接口破坏性变更提供迁移路径；未测试平台不标为支持。

## 验收条件

- [ ] 同一规则在 .NET 服务器运行并接受 Unity 客户端
- [ ] 与主机模式比较结果
- [ ] 没有 UnityEngine 运行依赖。
- [ ] 交付与验证证据已写入元数据 evidence，实际验证记录写入 log。

## 验证场景

同一规则在 .NET 服务器运行并接受 Unity 客户端；与主机模式比较结果；没有 UnityEngine 运行依赖。

提供正常路径与相关失败、取消、重复和恢复路径的可重复样例。先 .NET/Unity 桌面，IL2CPP/移动端在对应目标验证。

## 实施记录

当前仅登记目标，未开始实际实施。实际工作记录以本文件 frontmatter 的 log/evidence 为准；不要在总计划或网页另填一份状态。
