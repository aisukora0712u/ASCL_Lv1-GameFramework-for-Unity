# ASCL 通用单机框架：首个纵向切片实施与评审

## 1. 交付结论

本仓库已经从空目录形成可安装的 Unity Package 与可脱离 Unity 验证的纯 C# 运行时。首个纵向切片覆盖：实体生命周期、事件、数值、Skill–Buff–Action、引用池/对象池、时间与调度、MemoryPack 存档、Unity 适配、uGUI、跳字和源码生成注册。

框架采用“纯 C# 内核 + 薄引擎适配层”。游戏规则、存档协议和大部分测试不引用 `UnityEngine`；Unity 只负责帧驱动、ScriptableObject 配置、预制件、图形与输入呈现。因此未来接入 Godot 等 C# 引擎时，主要工作是实现时钟、生命周期、资源加载、UI 与日志适配，不需要重写玩法核心。

这不是完整商业游戏所需的所有模块，而是一个可运行、可测试、可继续演进的架构基线。当前版本号为 `0.1.0`。

## 2. 目录与分层

| 层 | 责任 | 是否引用 Unity |
| --- | --- | --- |
| `ASCL.Core` | Entity、Event、Pool、Clock、Scheduler、Binding、零分配字符缓冲 | 否 |
| `ASCL.Gameplay` | Numeric、Action、Buff、Skill | 否 |
| `ASCL.Persistence` | MemoryPack 容器、版本迁移、校验、备份恢复、槽位管理 | 否 |
| `ASCL.Unity` | MonoBehaviour 驱动、SO 配置、JSON 开发镜像 | 是 |
| `ASCL.Unity.UI` | uGUI Panel、Router、MVVM 绑定接口、Tween/Timeline 接口 | 是 |
| `ASCL.Unity.Popup` | 预热池化的 Sprite 跳字 | 是 |
| `ASCL.SourceGen` | Entity System 显式注册代码生成 | 编译期工具 |

Unity 包位于 `Packages/com.operationgamestudio.ascl`；`DotNet` 工程复用同一份 Core、Gameplay、Persistence 源码，防止“Unity 中能跑、纯 C# 已被污染”。

## 3. 参考框架的取舍

### 3.1 Entity

保留了 ET 的关键优点：实体拥有子实体与组件，父对象启用、禁用和销毁时级联生命周期；逻辑由外置 System 承担，实体本身尽量只保存状态。

有意简化了服务端/热更新导向的复杂度：

- 使用带代数的 `EntityHandle`，已释放实体的旧句柄不会错误指向复用 ID。
- 子实体与组件分开存储；同一实体默认只允许一个“精确类型”的组件，避免含糊查询。
- `EntityWorld.Tick` 在迭代期间用空洞稳定删除，实体在同帧销毁不会导致后续实体被跳过。
- `Entity.Track(IDisposable)` 可让事件订阅、计时器等资源自然跟随实体销毁。
- `[EntitySystem]` 配合源码生成器生成显式注册；没有生成器时仍可通过 `EntitySystemRegistry.Register` 手动注册，不依赖运行时全程序集反射。

### 3.2 Event

事件域借鉴项目中的 OEventSystem，选择“作用域实例”而非全局静态总线：World、Scene、UI 或测试可以各有自己的 `EventScope`。

- 支持同步广播、按优先级稳定排序、异步串行广播和唯一查询。
- 发布中退订立即生效；发布中新增订阅从下一次发布开始生效。
- 订阅返回 `IDisposable`，可交给 Entity 托管。
- 热路径不使用反射扫描；异步统一使用 UniTask。

### 3.3 Numeric

数值以稳定整数 `NumericKey` 和字典存储，避免每个属性都增加字段的定义地狱。每个属性支持基础值、固定加成、基础百分比、最终固定加成、最终百分比五个通道，并提供：

- 可撤销的 modifier handle；
- 来源 ID；
- 缓存后的最终值；
- 批量事务，只在提交时发送一次变化通知；
- 非有限浮点数防护。

键值应由项目级代码生成或固定清单管理，发布后不要重新编号。

### 3.4 Skill–Buff–Action

当前实现遵循以下语义：

```text
Skill（玩家直接发动）
  -> 顺序执行 Effect
  -> 创建/推进 ActionPipeline
  -> Action 在各阶段执行满足条件的 Effect
  -> ApplyBuffEffect 添加 Buff
  -> Buff 可即时修改 Numeric，也可组合其他 Buff
```

Action 具备阶段、深度上限和单次结算效果预算，防止效果递归失控。Buff 支持叠层、刷新、替换、拒绝等策略，并检查组合环。组合 Buff 删除时只撤销自身贡献的子 Buff 层数，不会误删目标原本已有的同名 Buff。

首版刻意没有引入脚本语言、复杂表达式树或反射型配置执行器。后续应在真实游戏案例出现后，再扩展条件、目标选择、伤害上下文和可视化编辑器。

### 3.5 Pool

引用池与对象池保持 GameFramework 风格的轻 API，但增加重复归还检查。它们用于降低稳定热路径的临时分配；不应把有明确所有权的普通业务对象全部池化。

## 4. 存档设计

`MemoryPackSaveStore<TDto>` 只接受显式存档 DTO，不直接序列化运行时 Entity 或 Unity Object。文件容器包含：格式版本、负载版本、时间戳、负载和 SHA-256 校验值。

写入流程为：序列化到内存 → 写临时文件 → 原子替换主文件并保留备份；平台不支持原子替换时回退为可恢复流程。读取主文件失败时尝试 `.bak`。更旧版本通过显式迁移链升级；未来版本默认拒绝读取，避免静默破坏数据。

开发构建可注入 `NewtonsoftDevelopmentMirrorWriter<T>` 生成同名 JSON 镜像，Release 中不要注入即可。JSON 仅用于阅读和排查，不参与正式加载。

## 5. 0 GC 边界

“0 GC”被定义为：完成初始化和池预热后，在受约束的每帧热路径中不产生托管堆分配。它不是对所有公开 API 的无条件承诺。

- `ReusableCharBuffer` 使用预分配 `char[]` 与 `TryFormat`；`ToString()` 明确会分配，应只用于边界层或调试。
- 跳字系统预创建 item 和 glyph 数组，数字采用整数拆位，显示时不创建字符串、列表或协程。
- 池容量耗尽时可选择丢弃最新项或复用最旧项，因此不会在战斗峰值临时扩容。
- Unity 测试已对 `ReusableCharBuffer` 预热后的 1000 次格式化断言 0 B 分配。

仍需在目标平台、IL2CPP、实际字体/材质和真实 UI 场景下用 Unity Profiler 再做整帧验证；编辑器本身的分配不能等同于 Player 分配。

## 6. UI 设计

UI 以预制件为 View 单位：`UIRouter` 负责异步加载、层级、模态栈、缓存和释放；`UIPanel<TViewModel>` 接受强类型 ViewModel；`Bindable<T>` 和 `UICommand` 提供轻量数据与命令绑定。

绑定层同时保留两个入口：生成的 `IUIBinder<T>` 用于正式代码，`UIBind` 特性作为生成依据；若不使用生成器，可手写 binder。动画采用可取消的 CanvasGroup tween，并留出 `IUITimelinePlayer` 接口接 Timeline 或项目自己的动画方案。

框架没有强制所有 UI 都走双向绑定。高频战斗 HUD 更适合单向推送与显式刷新，菜单和设置页才适合完整 MVVM。

## 7. 更新模式与热更新决策

纯单机、以 Steam 为主要发行渠道时，当前阶段不需要代码热更新。Steam 的常规版本分发已经能替换程序集、资源和可执行文件；再加入 HybridCLR/脚本热更会带来 AOT 泛型、裁剪、调试、审核、存档兼容和安全面的持续成本。

首版只保留以下可演进边界：

- 存档格式独立版本与迁移；
- 稳定 Numeric/Buff/Skill ID；
- 玩法定义 DTO 与 Unity SO 分离；
- 资源加载通过 UI loader 等接口隔离。

只有在出现“无法等待平台发版的线上运营需求”或“用户生成脚本内容”等明确业务条件后，再单独立项代码热更新。资源热更新也不应默认加入；若以后确有 DLC/远程内容需求，优先在 Unity 适配层增加 Addressables/内容目录，而不污染 Core。

## 8. 已完成验证

在 2026-08-31 的本地环境完成：

- `.NET 8`：15 个 NUnit 测试全部通过。
- `ASCL.Runtime`：`netstandard2.1` Release 构建，0 警告、0 错误。
- Unity 6.3.5f2：包导入、所有 asmdef 与源码编译成功。
- Unity EditMode：Entity、Numeric、字符缓冲和 MemoryPack 实际往返 4 个测试全部通过。

测试覆盖父子生命周期、失效句柄、迭代中删除、事件优先级与订阅变更、异步事件、订阅随实体释放、计时器顺序/取消、数值公式与事务、Buff 叠层与组合所有权、循环检查、Skill 执行、MemoryPack 往返、JSON 镜像、备份恢复、未来版本拒绝、源码生成注册和热路径字符格式化。冷启动验收还验证了 UPM 包内 MemoryPack 的直接运行时依赖和 Roslyn 生成器能够被 Unity 正确加载。

## 9. 已知边界与推荐路线

### 2026-09-12：Unity 6.3.23f1 / URP 3D 接入更新

`DevProject` 已升级到正式编辑器版本 `6000.3.23f1`（`09d2ecc7fb28`），
使用随编辑器提供的 URP `17.3.0`。新增可直接运行的 `ASCL_URP3D` 场景，
通过 uGUI / 空格触发 Skill–Buff–Numeric，并在 3D 立方体上呈现数值变化。
PC / Mobile 两套 Universal Renderer 配置、Global Settings、Linear 色彩空间、
构建场景列表和包锁文件均已入库；ASCL 包仍保持渲染管线独立。

此轮验证：.NET 15/15、Unity EditMode 6/6、PlayMode 2/2 通过，
包括从空 Library 导入、框架帧驱动与 Entity 清理，以及两套配置在 D3D11 上的实际渲染。
当前深目录会触发 Unity 的 Windows 长路径导入问题，`Tools/Open-Unity.ps1`
和 `Tools/Validate-Unity.ps1` 自动使用指向同一仓库的短盘符路径。
启动、验证命令与已有 nullable 编译警告说明见 `DevProject/README.md`。
此轮未进行 Player / IL2CPP 或移动设备构建验证。

当前最值得继续实现的顺序：

1. 用一个真实战斗场景扩展 Action 条件、目标选择、伤害/治疗上下文和战斗日志，并补可重复的确定性回放测试。
2. 为 Numeric、Buff、Skill 的稳定 ID 增加 Unity Editor 生成器、重复检查和重命名保护。
3. 为 UI binder 完成源码生成器，并实现 Addressables 与 Godot 两个 loader/driver 示例，验证隔离是否真实成立。
4. 增加输入映射、音频、场景流程、配置表导入、本地化等单机常用模块；每个模块继续遵循纯接口与引擎适配分离。
5. 在 Windows IL2CPP Player 中运行长时间战斗基准，记录每帧 GC、峰值池使用量、存档耗时和恢复行为。

暂不建议加入：代码热更新、网络同步、重型 IOC 容器、全运行时反射注册、无明确案例的通用行为树，以及把所有对象都池化。这些内容会显著提高框架成本，却还没有由当前单机目标证明其价值。

## 10. 使用入口

- 安装说明：`Packages/com.operationgamestudio.ascl/Documentation~/INSTALLATION.md`
- 纵向切片示例：`Packages/com.operationgamestudio.ascl/Samples~/VerticalSlice`
- 纯 C# 测试：`DotNet/ASCL.Tests`
- Unity 验证项目：`DevProject`

最小接入方式是在 Unity Package Manager 中以本地包或 Git 子路径加入本包，添加 UniTask 2.5.11，然后导入 Vertical Slice 示例。其他 C# 引擎应直接引用 `ASCL.Core`、`ASCL.Gameplay`、`ASCL.Persistence` 的源代码或构建产物，并自行实现呈现适配层。
