# Sprite Forge (Unity Asset Maker)

Sprite Forge is a local-only desktop tool for importing animated sources, editing frame alignment/pivots/pixels, and exporting Unity-ready assets.

## Tech stack
- Electron + React + TypeScript + Vite
- Zustand state
- Canvas 2D viewport + onion skin
- Worker-thread processing for imports/exports
- Core pipeline in `/core`
- Unity importer scripts in `/unity`

## Repository layout
- `/app` Electron app (main/preload/renderer)
- `/core` Processing pipeline + tests
- `/unity` Unity Editor integration scripts
- `/docs` Architecture and schema docs
- `/samples` Sample export artifact

## Requirements
- Node.js 20+
- Windows 10/11
- Git for Windows
- Python 3.10+

## Commands
From repo root:

```bash
npm install
npm run dev
npm run build
npm run test
npm run package
npm run package:portable
```

## One-Click Run
- Run `run-single.bat` from repo root.
- Behavior:
  - Installs dependencies if `node_modules` is missing.
  - Always deletes previous runtime/build artifacts (`core/dist`, `app/dist`, `app/release`).
  - Always rebuilds latest portable package (`npm run package:portable`).
  - Launches the freshly built EXE automatically.

## IOPaint prerequisites
- The `IOPaint` tab is not a static bundled page.
- On first use the app clones the IOPaint repo, creates a Python venv, installs the package, builds `web_app`, and starts a local server.
- Before opening that tab, confirm these commands work in a new terminal:
  - `git --version`
  - `python --version`
  - `npm --version`
- Detailed setup guide: `docs/IOPAINT_SETUP.md`

## MVP features
- Import: GIF, MP4/WebM, PNG sequence, spritesheet, WebP
- Sprite tab:
  - Sprite sheet upload
  - Auto background transparency
  - Auto slicing for frame timeline
  - Per-frame pixel editing + live preview
- Timeline:
  - Drag reorder
  - Duplicate/delete
  - Per-frame delay edits
  - Loop mode: loop/once/pingpong/reverse
- Pixel tab (lite):
  - Pencil, eraser, eyedropper, fill
  - Rect selection + move/copy/paste
  - Previous-frame overlay
- Export tab:
  - Sprite sheet (default), PNG sequence, GIF
  - `meta.json` for Unity
- Unity importer:
  - Auto-slice sprites
  - Create/update AnimationClip + AnimatorController
  - Optional Prefab
  - Idempotent outputs under `UnityGenerated/`

## Shortcuts
- `Space`: play/pause
- `Ctrl+Z` / `Ctrl+Y`: undo/redo
- `Left` / `Right`: prev/next frame
- `Ctrl+C` / `Ctrl+V`: duplicate selected frame(s) in timeline, copy/paste in Pixel tab
- `Delete`: delete selected frames
- `Wheel`: zoom
- `Middle drag` or `Space+drag`: pan

## Local-only policy
- No telemetry
- No analytics
- No runtime network calls

See `docs/ARCHITECTURE.md`, `docs/JSON_SCHEMA.md`, `docs/ASSUMPTIONS.md`, and `docs/UNITY_IMPORT_GUIDE.md`.
