# ASCL Unity 6.3 / URP 3D

此目录是框架的可运行 Unity 开发与验证项目；仓库根目录保留独立的 UPM 包与 .NET 工程。

## 打开与运行

1. 使用 **6000.3.23f1**（revision `09d2ecc7fb28`），在仓库根目录运行：

   ```powershell
   ./Tools/Open-Unity.ps1 -UnityEditor 'C:\soft\UnityEditors\6000.3.23f1\Editor\Unity.exe'
   ```

2. 等待 Package Manager 解析依赖并完成编译。
3. 选择 **ASCL > Open URP 3D Demo**，或打开 `Assets/Scenes/ASCL_URP3D.unity`。
4. 进入 Play Mode，按空格或点击 **Boost +2**。Power 从 10 增长到 12、14、16，
   Buff 最多三层；立方体随数值增高。场景已经加入 Build Profiles 的场景列表。

场景包含透视相机、方向光、地面、URP Lit 材质、Global Volume、uGUI 和
`UnityWorldDriver`。示例通过现有的 `SkillRunner -> ApplyBuffEffect -> NumericTable`
驱动呈现，退出场景时释放 Entity。该演示的 Buff 永久存在于本次运行中，重启后重置。
存档示例仍位于框架包的 `Samples~/VerticalSlice`。

### Windows 长路径

当前仓库所在目录较深，Shader Graph 的部分缓存文件完整路径超过 260 字符，
直接从原长路径打开会触发 `DirectoryNotFoundException` 和 URP 资源类型加载错误。
启动与验证脚本会将较长的仓库路径映射到空闲盘符（优先 U:），并使用例如
`U:\DevProject` 启动。映射始终指向同一份文件，ASCL 的相对本地包引用也保持有效。

已有的本仓库映射会复用；被其他用途占用的盘符会跳过。可在 Unity Hub 中添加脚本输出的
短项目路径，重启电脑后先再运行脚本恢复映射。关闭 Unity 后可用 `subst U: /D`
移除映射（替换为脚本实际选用的盘符）。不要同时从长短两个路径启动同一项目。
若曾经从长路径导入失败，关闭 Unity 后删除派生的 `DevProject/Library` 缓存，再用脚本启动。

相关问题：[Unity Shader Graph 长路径问题记录](https://issuetracker.unity.com/issues/22209/directorynotfoundexception-is-thrown-and-shader-graph-does-not-open-when-opening-a-shadegraph-from-a-long-path)。

## 渲染与依赖

| 配置 | 内容 |
| --- | --- |
| 编辑器 | Unity 6000.3.23f1 / Unity 6.3 LTS |
| URP / Core RP / Shader Graph | 17.3.0，随编辑器提供 |
| 色彩空间 | Linear |
| 默认质量 | PC：Universal Renderer / Forward+ |
| 低成本配置 | Mobile：Universal Renderer / Forward |
| 输入 | 内置 Input Manager，供空格与 uGUI 示例使用 |
| ASCL | `file:../../Packages/com.operationgamestudio.ascl` |
| UniTask | Git tag 2.5.11；具体提交记录在 packages-lock.json |
| NUnit / Unity Test Framework | 随已锁定的编辑器和包解析 |

`Assets/Settings` 的初始资源来自本机 6000.3.23f1 随附的官方 Universal 3D 模板
`com.unity.template.3d-cross-platform-17.0.14.tgz`，由目标编辑器导入升级并保存。
Graphics Settings 与所有 Quality 档位均显式引用 URP 资产。
两档对所有平台开放以便验证和切换；桌面默认 PC，Android / iOS 默认 Mobile。
URP 依赖只加入此宿主项目；ASCL 的纯 C# 内核与可安装包保持渲染管线独立。
`Packages/packages-lock.json` 随 Git 提交，Library、日志和本地测试输出不提交。

## 验证

关闭此项目的交互式 Unity 编辑器后，在仓库根目录运行：

```powershell
./Tools/Validate-Unity.ps1 -UnityEditor 'C:\soft\UnityEditors\6000.3.23f1\Editor\Unity.exe'
```

也可以设置 `UNITY_EDITOR_PATH`，或加 `-TestPlatform EditMode` / `PlayMode`。
脚本核对精确编辑器版本，并检查退出码、测试结果文件和实际执行的测试数。

- EditMode：现有框架测试，以及 Linear / 3D / URP 配置、各质量档的 Renderer、
  构建场景、序列化引用和材质检查。
- PlayMode：真实场景启动、World 帧驱动、uGUI 按钮、技能和 Buff 数值上限、
  Entity 清理，以及 PC/Mobile 两档实际渲染和错误材质检查。
- PlayMode 使用 Windows D3D11，必须具有可用 GPU；不要附加 `-nographics`。
- XML 与渲染截图写入 `DevProject/TestResults`，编辑器日志写入 `DevProject/Logs`。
  这验证编辑器内的接入行为；未代表 Windows IL2CPP 或移动端 Player 验证。

纯 C# 回归验证：

```powershell
dotnet build Tools/ASCL.SourceGen/ASCL.SourceGen.csproj -c Release
dotnet test ASCL.sln -c Release
```

2026-09-12 验证结果：.NET 15/15、Unity EditMode 6/6、PlayMode 2/2 通过。
已通过短路径从空 Library 完成导入，并在 Windows D3D11 上分别验证 Mobile / PC
的实际渲染；两张截图分别为 `TestResults/urp3d-Mobile.png` 和 `TestResults/urp3d-PC.png`。
最终导入没有编译错误或长路径资源错误；框架原有源码在 Unity 冷编译时仍会输出
CS8632 nullable 注解上下文警告，未更改其源码或抑制这些警告。

官方版本记录：[Unity 6000.3.23f1](https://unity.com/releases/editor/whats-new/6000.3.23f1)。
