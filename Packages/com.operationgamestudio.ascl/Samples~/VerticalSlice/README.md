# ASCL Vertical Slice

1. Create an empty scene and add `UnityWorldDriver` to one GameObject.
2. Add `VerticalSliceDemo` to another GameObject.
3. Optionally configure a `PopupSystem` with ten digit sprites.
4. Enter Play Mode: Space casts a stacking numeric Buff, F5 saves, and F9 loads.

The sample deliberately constructs runtime definitions in code so the complete
Entity → Skill → Action → Buff → Numeric → Save flow is visible in one file.
Production projects should convert validated ScriptableObject authoring assets
to the same immutable runtime definitions during loading.

