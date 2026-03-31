# Sprite Forge Unity Package

Copy the `unity` folder into your Unity project (for example under `Assets/SpriteForge`).

It includes:
- `Editor/SpriteForgeMetaImporter.cs`
- `Editor/SpriteForgeMenu.cs`

On importing `meta.json` exported by Sprite Forge:
1. Texture importer settings are configured.
2. Sheet sprites are sliced with rect + pivot data.
3. `UnityGenerated/<ClipName>.anim` is created/updated.
4. `UnityGenerated/<ClipName>.controller` is created/updated.
5. Optional prefab is created/updated (`SpriteRenderer` or `UI`).

Use menu `Sprite Forge/Regenerate From Meta (Selected)` to force regenerate for selected `meta.json` files.
