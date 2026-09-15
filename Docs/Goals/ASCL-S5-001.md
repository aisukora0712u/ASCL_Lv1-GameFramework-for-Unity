---
format: 1
kind: implementation-goal
id: ASCL-S5-001
title: 建筑放置与拆除
phase: S5
areas:
  - D12
capabilities:
  - D12-C01
priority: P2
category: committed
changeType: 新增
dependencies:
  - ASCL-S4-900
  - ASCL-S5-002
status: planned
isGate: false
createdAt: 2026-09-15T19:00:34.818Z
updatedAt: 2026-09-15T19:19:05.711Z
startedAt: null
completedAt: null
reason: null
evidence: []
log:
  - at: 2026-09-15T19:00:34.818Z
    type: planning
    message: 由已确认长期路线图整理；仅建立目标，尚未安排框架实施。
  - at: 2026-09-15T19:19:05.711Z
    type: planning
    message: 整理时明确跨模块前置目标；仍未开始功能实施。
---

# ASCL-S5-001 · 建筑放置与拆除

## 问题与预期收益

当前基线尚未完成本目标的正式验收。通过建筑放置与拆除沉淀可跨项目复用、可观察和可验证的能力。

## 工作内容与边界

- **D12-C01 建造规则**：预览、占地、旋转、合法性、成本、拆除返还。

只实现本目标列明能力并提供最小完整示例；跨模块需求通过显式依赖接入，不提前实施其他目标。

## 交付物

- 可安装或可组合的规则实现／适配，以及最小完整使用示例。
- 与目标相符的验证结果、支持矩阵、错误诊断和必要迁移说明。

## 公共接口与兼容

建筑定义、占用和建造指令；复用空间和交易规则。

遵循 PLAN.md 的身份、生命周期、模拟、内容版本与后端能力边界。稳定接口破坏性变更提供迁移路径；未测试平台不标为支持。

## 验收条件

- [ ] 预览不扣资源
- [ ] 占地/旋转/阻挡验证
- [ ] 成功提交才扣费，失败不改变世界
- [ ] 拆除返还可核对。
- [ ] 交付与验证证据已写入元数据 evidence，实际验证记录写入 log。

## 验证场景

预览不扣资源；占地/旋转/阻挡验证；成功提交才扣费，失败不改变世界；拆除返还可核对。

提供正常路径与相关失败、取消、重复和恢复路径的可重复样例。先 .NET/Unity 桌面，IL2CPP/移动端在对应目标验证。

## 实施记录

当前仅登记目标，未开始实际实施。实际工作记录以本文件 frontmatter 的 log/evidence 为准；不要在总计划或网页另填一份状态。
