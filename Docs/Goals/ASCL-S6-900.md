---
format: 1
kind: implementation-goal
id: ASCL-S6-900
title: S6 已安排范围退出验收
phase: S6
areas: []
capabilities: []
priority: P0
category: committed
changeType: 验收
dependencies: ["ASCL-S6-040"]
status: in_review
isGate: true
createdAt: 2026-09-19T05:51:54.807Z
updatedAt: 2026-09-19T05:59:11.552Z
startedAt: 2026-09-19T05:51:54.807Z
completedAt: null
reason: null
evidence:
  - label: 0.2.0 自动验证记录
    reference: Docs/Validation/ASCL-0.2.0.md
    result: .NET 32 项、Unity EditMode 与 PlayMode 通过；消费项目验收独立记录
log:
  - at: 2026-09-19T05:59:11.552Z
    type: verification
    message: 双目标构建、32 项 .NET 测试、Unity 共享边界与 UI/渲染测试通过；不扩大本目标范围。
  - at: 2026-09-19T05:51:54.807Z
    type: scope
    message: Algorithm_Storage 已批准完整接入；只安排本目标，保留 S0/S4 及其他项目驱动目标的原范围。
---

# ASCL-S6-900 · S6 已安排范围退出验收

## 问题与预期收益

现有消费项目需要可恢复、事务化的单机战斗及明确的界面生命周期。

## 工作内容与边界

验收本阶段当前唯一已安排的 ASCL-S6-040；新增正式范围必须更新依赖并重新安排验收。
本次不实现联网、确定性回滚、服务器身份、完整回合示例平台，也不据此宣称 S0/S4 完成。身份与调度修复分别见 ASCL-S0-001/002。

## 交付物

- 0.2.0 可嵌入 Unity 包，独立 .NET 编译同份核心。
- API 迁移文档、共享边界测试、Unity 实际生命周期和渲染证据。

## 公共接口与兼容

详见 [0.2.0 迁移说明](../../Packages/com.operationgamestudio.ascl/MIGRATION-0.2.0.md)。整数取整、几何、物品规则由消费项目决定。

## 验收条件

- [ ] double 精度、随机序列及完整恢复通过 .NET/Unity 共享测试
- [ ] 异常、取消、预算失败丢弃暂存状态，提交后观察者失败不重复结算
- [ ] 回合恢复与 UI 绑定释放、过晚加载返回通过实际测试
- [ ] 依赖、文档和路线图校验通过，支持范围和限制如实归档

## 验证场景

IntegrationFoundationTests、UIOwnershipTests、Urp3DPlayModeTests；运行记录见 Docs/Validation/ASCL-0.2.0.md。

## 实施记录

Algorithm_Storage 的已批准计划是本次范围来源。失败结果保留并修复根因，人工验收与自动验证分别记录。
