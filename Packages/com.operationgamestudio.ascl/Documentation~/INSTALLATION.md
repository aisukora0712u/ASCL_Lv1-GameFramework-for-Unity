# Installation

1. Add UniTask 2.5.11 to the host project's `Packages/manifest.json` using
   `https://github.com/Cysharp/UniTask.git?path=src/UniTask/Assets/Plugins/UniTask#2.5.11`.
2. Add this repository as a local package or Git package with
   `?path=/Packages/com.operationgamestudio.ascl`.
3. Import the Vertical Slice sample from Package Manager.

The package targets Unity 6 and API Compatibility Level .NET Standard 2.1.
MemoryPack 1.10.0 runtime and generator binaries are bundled under its MIT
license; the official Unity Newtonsoft JSON package is resolved by UPM.

For a ready-to-run host when working from a full repository checkout, use
`DevProject`: Unity 6000.3.23f1 with URP 17.3.0, Linear color space, and a 3D
framework demo. See `DevProject/README.md` for the Windows launcher (including
long-path handling) and EditMode/PlayMode validation commands. URP is a host
dependency; installing the ASCL package does not force a rendering pipeline.
