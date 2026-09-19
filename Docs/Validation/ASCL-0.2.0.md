# ASCL 0.2.0 integration validation

Date: 2026-09-19T05:59:11.552Z. Windows / Unity 6000.3.23f1 / URP 17.3.0 / .NET SDK 10.0.101 targeting .NET 8 and netstandard2.1.

- dotnet build DotNet/ASCL.Runtime/ASCL.Runtime.csproj: both targets passed, zero warnings/errors.
- dotnet test DotNet/ASCL.Tests/ASCL.Tests.csproj: 32/32 passed; [TRX](ASCL-0.2.0/dotnet.trx).
- Unity EditMode: [NUnit XML](ASCL-0.2.0/editmode.xml), all tests passed.
- Unity PlayMode: 4/4 passed; [NUnit XML](ASCL-0.2.0/playmode.xml). Actual rendered geometry verified at both quality levels; typed UIRouter rebinding, unscaled paused UI, release after late load tested.
- pnpm roadmap:validate: passed; explicit scoped S6-040 and dependent S6-900 added without claiming whole S0/S4 completion.

Shared tests compare 10,000 exact legacy NextDouble values for each of five seeds in both .NET and Unity. They cover state restoration/fork, double integer precision, cross-world handles, factory misuse, partial initialization/cleanup failures, cancellation races, scheduler clear/dispose, Numeric/Buff transaction rollback, action budgets, observer failure after complete multi-target commit, discrete turn state.

Failures retained in the consuming project's artifacts/ascl: a test originally checked Task cancellation instead of UniTask cancellation status; test assembly needed its explicit UniTask reference; a lifecycle change altered disable-before-dispose order and was fixed without changing expected behavior. The longer Windows checkout path caused URP shader importer host-type errors; Tools/Unity-Environment.ps1 maps the same tree, then IntegrationImportRepair.ReimportShaders reimports the two affected Unity package resources. Actual render test subsequently passed. New UI test compilation issues were fixed with a concrete typed model and explicit UnityEngine.Time.

Use Tools/Validate-Unity.ps1 -UnityEditor <Unity.exe> for short-path execution. Source records are hashed in [hashes.json](ASCL-0.2.0/hashes.json). No GPU allocation, whole-frame zero-allocation, IL2CPP or mobile support claim is made. Consumer game parity, save/load, all-scene UI and manual acceptance remain in Algorithm_Storage's separate integration task. Custom transaction effects must honor the staged-state contract; external IO cannot be rolled back.

## Consumer lifetime follow-up (2026-09-19T07:22:26.175Z)

Repeated game-worker queries exposed retention of completed task results until session shutdown. LifetimeScope now prunes completed/cancelled tasks on tracking and inspection, while retaining faults for StopAsync to report after joining every worker. Owner-thread semantics are unchanged.

- .NET: 34/34 passed ([TRX](ASCL-0.2.0/lifetime/dotnet.trx)); Unity EditMode: 25/25 ([XML](ASCL-0.2.0/lifetime/editmode.xml)); Unity PlayMode: 4/4 ([XML](ASCL-0.2.0/lifetime/playmode.xml)).
- Consumer 1600×900 PlayMode: 12/12 passed, including four save/load/restart cycles, discarded worlds/items/Buffs, stable UI/popup object counts, corrupt-file preservation. The consumer retains its detailed evidence and final delivery gate.
