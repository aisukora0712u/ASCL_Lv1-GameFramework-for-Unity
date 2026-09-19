---
format: 1
kind: implementation-goal
id: ASCL-S6-040
title: 战术项目接入基础能力
phase: S6
areas: [D02, D10, D11]
capabilities: ["D02-C06","D02-C07","D10-C01","D11-C01","D11-C02"]
priority: P0
category: committed
changeType: 新增
dependencies: ["ASCL-S0-001","ASCL-S0-002"]
status: in_review
isGate: false
createdAt: 2026-09-19T05:51:54.807Z
updatedAt: 2026-09-19T07:22:26.175Z
startedAt: 2026-09-19T05:51:54.807Z
completedAt: null
reason: null
evidence:
  - label: 0.2.0 自动验证记录
    reference: Docs/Validation/ASCL-0.2.0.md
    result: .NET 32 项、Unity EditMode 与 PlayMode 通过；消费项目验收独立记录
log:
  - at: 2026-09-19T07:22:26.175Z
    type: verification
    message: 消费项目连续读档发现已完成后台任务结果保留，现已修复并补等待及异常回归；.NET34/34、Unity EditMode25/25和PlayMode4/4通过。
  - at: 2026-09-19T05:59:11.552Z
    type: verification
    message: 双目标构建、32 项 .NET 测试、Unity 共享边界与 UI/渲染测试通过；不扩大本目标范围。
  - at: 2026-09-19T05:51:54.807Z
    type: scope
    message: Algorithm_Storage 已批准完整接入；只安排本目标，保留 S0/S4 及其他项目驱动目标的原范围。
---

# ASCL-S6-040 · 战术项目接入基础能力

## 问题与预期收益

现有消费项目需要可恢复、事务化的单机战斗及明确的界面生命周期。

## 工作内容与边界

Numeric 及通知统一 double；兼容 .NET 旧种子的随机流完整状态；Action 事务暂存 Numeric/Buff 与扩展资源；离散回合顺序/阶段/AP；UIRouter 异步加载与绑定生命周期、Popup 预热/溢出策略。
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
