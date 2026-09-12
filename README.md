# ASCL Game Framework

ASCL is a Unity-first, engine-isolated C# framework for single-player games. The
first vertical slice contains hierarchical entities, scoped events, numeric
modifiers, Skill-Buff-Action resolution, MemoryPack saves, uGUI presentation
adapters, and allocation-free-after-warmup popup rendering.

The installable Unity package lives at `Packages/com.operationgamestudio.ascl`.
See `Documentation~/INSTALLATION.md` and `IMPLEMENTATION_REVIEW_ZH.md`.

The runnable host project is `DevProject`, pinned to **Unity 6000.3.23f1
(Unity 6.3 LTS)** and **Universal Render Pipeline 17.3.0**. On Windows, launch it
with `Tools/Open-Unity.ps1 -UnityEditor <path-to-Unity.exe>` to handle long checkout
paths, then use **ASCL > Open URP 3D Demo** and press Play. Space or the
Boost button applies a framework skill/buff and increases the cube's height.

See [the host project guide](DevProject/README.md) for rendering profiles,
dependencies, and automated validation.
