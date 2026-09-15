---
format: 1
kind: implementation-goal
id: ASCL-S6-039
title: Windows IL2CPP 与移动端验证
phase: S6
areas:
  - D16
capabilities:
  - D16-C05
  - D16-C09
  - D16-C10
priority: P2
category: project_driven
changeType: 验收
dependencies:
  - ASCL-S3-900
  - ASCL-S6-035
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

# ASCL-S6-039 · Windows IL2CPP 与移动端验证

## 问题与预期收益

当前基线尚未完成本目标的正式验收。通过Windows IL2CPP 与移动端验证沉淀可跨项目复用、可观察和可验证的能力。

## 工作内容与边界

- **D16-C05 性能基线**：记录热路径分配、池峰值、加载、保存与重演成本及环境。
- **D16-C09 构建与发布检查**：依赖清单、内容版本、构建标识和平台支持矩阵。
- **D16-C10 模板与示例生成**：按模块组合创建最小项目，验证安装与依赖。

只实现本目标列明能力并提供最小完整示例；跨模块需求通过显式依赖接入，不提前实施其他目标。

## 交付物

- 可安装或可组合的规则实现／适配，以及最小完整使用示例。
- 与目标相符的验证结果、支持矩阵、错误诊断和必要迁移说明。

## 公共接口与兼容

平台构建配置、必要生成辅助和性能报告；不把编辑器测试当成 Player 验证。

遵循 PLAN.md 的身份、生命周期、模拟、内容版本与后端能力边界。稳定接口破坏性变更提供迁移路径；未测试平台不标为支持。

## 验收条件

- [ ] 先验证 Windows IL2CPP 再选择代表性移动设备
- [ ] 记录 AOT/裁剪、长时间战斗、分配与重演成本
- [ ] 支持矩阵只标已测结果。
- [ ] 交付与验证证据已写入元数据 evidence，实际验证记录写入 log。

## 验证场景

先验证 Windows IL2CPP 再选择代表性移动设备；记录 AOT/裁剪、长时间战斗、分配与重演成本；支持矩阵只标已测结果。

提供正常路径与相关失败、取消、重复和恢复路径的可重复样例。先 .NET/Unity 桌面，IL2CPP/移动端在对应目标验证。

## 实施记录

当前仅登记目标，未开始实际实施。实际工作记录以本文件 frontmatter 的 log/evidence 为准；不要在总计划或网页另填一份状态。
