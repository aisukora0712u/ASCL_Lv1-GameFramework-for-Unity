# ASCL 0.2.0 API 迁移

本版本按 Algorithm_Storage 的实际接入需求增加通用能力。网络、回滚、完整 S0/S4 路线图不属于本次范围。

- EntityHandle 构造参数改为 (worldId, id, generation)。只保存实体自己的稳定业务 ID，加载新世界后重新绑定运行句柄；不可跨世界使用。EntityWorld 拒绝已经附着的工厂对象，初始化失败及释放异常仍清理整棵所有权树。
- Scheduler 的 TimerHandle 也带实例归属；Clear/Dispose/Cancel 使 DelayAsync 进入取消终态。回调仍在 Tick 调用线程执行。LifetimeScope.Dispose 请求停止并释放资源，StopAsync 另外等待所有 Track 任务结束；任务须响应 Token。所有实体及作用域操作在所有者线程进行。
- NumericKey、定义、基值、Modifier、计算结果与通知使用 double。Unity 表现需要 float 时在边界显式转换；整数费用与取整由领域层执行。
- RestorableRandomSource(seed) 固定为 system-random-compat-v1。NextDouble 与 .NET 旧种子 Random 一致；Capture/Restore/Fork 保存 56 个槽位及两个游标，不能仅存 seed。预览使用无随机规则；事务在 Fork 上结算，成功提交时恢复其最终状态。
- ActionPipeline.ExecuteAsync 默认暂存源与目标的 Numeric/Buff。多目标/额外资源用 ExecuteTransactionalAsync 和 IActionTransaction，先 Prepare、效果及 ValidateCommit，再一次 Commit，最后 Publish。Commit 只能安装已经校验完成的状态，不执行用户回调或可失败的 IO。拒绝应抛出异常，取消使用 CancellationToken；失败不提交。NotificationErrors 是提交后的观察者错误，不能据此重试动作。
- 自定义 Buff runtime 必须实现 IForkableBuffEffectRuntime 并深复制可变运行状态。效果仅操作暂存上下文，不捕获或写入活对象；外部副作用只能在 Publish。任意 C# 代码违反这个契约不能被框架自动回滚。所有参与结算的 Combatant 必须加入事务。
- TurnSequence.TryNext 只计算候选，Restore 才安装状态。TurnState 保存轮次、顺序索引、序号和阶段；ActionResource 统一非负 AP 检查。游戏可以将 Buff.TickAsync(1) 和整数冷却推进安排在离散回合边界，不用帧 deltaTime 驱动回合 Buff。
- UIRouter.SetRoot 可以显式配置各层；Open/Close 支持所属路由取消，每个 panelId 同时只允许一个操作。Dispose 取消加载并释放已缓存界面；延迟返回的资源也归还 loader。UIPanel<T> 重绑前 Unbind，BindingToken 在释放时取消，派生类在 OnUnbind 中移除订阅。UI tween 使用 unscaledDeltaTime。
- PopupSystem.Initialize 显式预热固定池，Clear 清理战斗反馈；DropNewest 或 ReuseOldest 是明确溢出策略。每个所属场景可有独立实例；旧 Instance 仅兼容默认入口，不用于跨战斗资源所有权。

消费项目应固定来源提交并校验嵌入文件；框架改动先回补源库，再同步整个包。UniTask 2.5.11、MemoryPack 1.10.0、uGUI 2.0.0、Newtonsoft 3.2.1。Unity 程序集分别引用 ASCL.Core/Gameplay/Persistence/Unity/UI/Popup（实际程序集名见 asmdef）。独立 .NET 编译 Runtime/Core、Gameplay、Persistence。

自动测试支持 .NET 8、netstandard2.1 编译、Unity 6000.3.23f1 Windows 编辑器；未据此宣称 IL2CPP、移动端或整帧零分配。
