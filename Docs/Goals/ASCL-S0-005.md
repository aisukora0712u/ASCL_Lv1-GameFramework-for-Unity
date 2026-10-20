---
format: 1
kind: implementation-goal
id: ASCL-S0-005
title: OEvent 静态事件系统正式接入
phase: S0
areas: [D01]
capabilities: [D01-C07]
priority: P0
category: committed
changeType: 适配
dependencies: []
status: done
isGate: false
createdAt: 2026-10-21T04:18:39+09:00
updatedAt: 2026-10-21T04:35:40+09:00
startedAt: 2026-10-21T04:18:39+09:00
completedAt: 2026-10-21T04:35:40+09:00
reason: null
evidence:
  - label: 旧版分支与来源哈希
    reference: Docs/WorkLogs/OEvent-0.3.0/source-manifest.json
    result: 旧分支远端哈希为 3dcaaa3；五项来源哈希复核未变，原工程未修改。
  - label: .NET 与 Unity 回归
    reference: Docs/Validation/ASCL-0.3.0.md
    result: .NET 56/56、双目标编译、Unity EditMode 51/51、PlayMode 5/5 通过；包含关闭 Domain Reload 的重复运行及场景重载。
  - label: 事件迁移说明
    reference: Packages/com.operationgamestudio.ascl/MIGRATION-0.3.0.md
    result: 0.3.0 接口替换、来源、单例生命周期、取消及平台边界已记录。
  - label: 离线审查交付
    reference: Docs/WorkLogs/OEvent-0.3.0/review.html
    result: 四个编号项、实际代码差异、证据和结论导出；本地 Edge 检查通过，不记录为人工通过。
  - label: 路线图校验
    reference: Docs/WorkLogs/OEvent-0.3.0/roadmap-validation.txt
    result: 7 阶段、16 领域、137 能力、100 目标结构校验通过；未启动其他目标。
log:
  - at: 2026-10-21T04:35:40+09:00
    type: verification
    message: 本目标技术验收完成；Boost 10/12/14/16 且上限不变，经 OEvent 各刷新一次。证据、迁移和离线审查页齐备；IL2CPP、移动端 Player 与外部项目迁移未验证。
  - at: 2026-10-21T04:34:34+09:00
    type: verification
    message: .NET 56/56、双目标编译、Unity EditMode 51/51 与 PlayMode 5/5 通过；完成 Demo 逐次数值断言，正在核对离线审查页及最终证据。
  - at: 2026-10-21T04:18:39+09:00
    type: scope
    message: 用户批准旧版分支归档，使用全局 OEvent 替换 EventScope，保留原事件类写法；仅安排本目标。
  - at: 2026-10-21T04:18:39+09:00
    type: progress
    message: 已复核干净基线 3dcaaa3，并向 origin 推送 codex/legacy-pre-oevent-20261021，远端哈希一致。
---

# ASCL-S0-005 · OEvent 静态事件系统正式接入

## 问题与预期收益

将借鉴 OEvent 的作用域事件替换为原 OEvent 的特性注册、事件处理类和全局入口，使现有事件编写方式可以复用。

## 工作内容与边界

- **D01-C07 静态事件声明与分发**：四类处理器、稳定优先级、初始化/清理及全局分发。
- 旧版分支归档；纯 C# 核心、Unity 应用生命周期、实际 Boost Demo、迁移文档和回归测试。
- 不修改来源工程，不改写其他模块的普通 C# 回调，不增加多世界事件域，不启动其他阶段目标。

## 交付物

ASCL 0.3.0、来源哈希、迁移说明、共享测试、Unity 运行证据和本地 HTML 审查页。

## 公共接口与兼容

保留 OEvent / OEvent.Module 命名空间、OEventManager.Instance、四种 MethodObject 及广播 API。移除 EventScope 专属 API，明确 0.3.0 破坏性迁移。单线程全局事件不承诺多世界隔离；已进入的异步 Run 不能被管理器强制终止。

## 验收条件

- [x] 旧版分支已推送且哈希与原基线一致。
- [x] 四类事件、自动注册、异常、返回值、订阅变化和初始化回滚的共享测试通过。
- [x] 清理/重新初始化后旧广播取消，重复运行无重复订阅和场景引用残留。
- [x] Boost Demo 经 OEvent 更新 Power 10/12/14/16、三层 Buff 与原呈现。
- [x] .NET 双目标、完整回归、Unity EditMode/PlayMode 和路线图检查通过。
- [x] 来源、迁移、支持限制、测试及审查页证据完整。

## 验证场景

共享 OEvent 测试覆盖静态声明和分发生命周期；Unity 测试覆盖真实启动、关闭 Domain Reload、场景重载和 Demo 分发。IL2CPP、移动端与外部消费项目不在本次验收范围。

## 实施记录

实际时间、结果与证据以本文件元数据为准。
