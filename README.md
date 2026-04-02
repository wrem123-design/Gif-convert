# Sprite Studio

Sprite Studio is a Windows desktop tool for sprite workflow tasks: import, frame cleanup, pixel editing, background removal, AI inpainting, and export.

## Highlights
- Import GIF, video, PNG sequence, WebP, and spritesheets
- Edit frame offsets, pivots, crop, and per-frame pixels
- Use the built-in photo editor directly inside the app
- Remove backgrounds, inpaint selected areas, and remove watermarks with AI tools
- Export sprite sheets, PNG sequences, GIFs, and project metadata

## Tech Stack
- Electron + React + TypeScript + Vite
- Zustand state management
- Worker-based processing pipeline
- Shared processing core in [`/core`](./core)
- Optional helper scripts in [`/unity`](./unity)

## Repository Layout
- [`/app`](./app): Electron app
- [`/core`](./core): shared processing pipeline
- [`/unity`](./unity): optional helper scripts
- [`/docs`](./docs): supporting documentation
- [`/samples`](./samples): sample assets

## Requirements
- Windows 10/11
- Node.js 20+
- Git for Windows

Notes:
- The app prepares its embedded Python runtime automatically for the AI tools.
- First-time AI setup can take time because models and packages are downloaded locally.

## Development
From the repository root:

```bash
npm install
npm run dev
npm run build
npm run test
```

## Packaging
From the repository root:

```bash
npm run package
npm run package:portable
```

Output location:
- Portable build: [`app/release`](./app/release)

## Installation

Detailed setup and install methods:
- [`docs/INSTALL.md`](./docs/INSTALL.md)

## Quick Run
- Run [`run-single.bat`](./run-single.bat) from the repository root.
- It installs dependencies when needed, rebuilds the app, creates the latest portable package, and launches it.

## AI Tools
The `AI Edit` screen includes:
- IOPaint for inpainting
- AI watermark removal

First use requirements:
- `git --version`
- `npm --version`

The app installs and manages the remaining runtime components on its own.

## Release Page
GitHub Releases:
- https://github.com/wrem123-design/Gif-convert/releases

## Release Notes

- [`docs/releases/v1.0.4.md`](./docs/releases/v1.0.4.md)

## Local-Only Behavior
- No telemetry
- No analytics
- AI runtimes and downloaded assets are stored locally on the user's PC

## Related Docs
- [`docs/IOPAINT_SETUP.md`](./docs/IOPAINT_SETUP.md)
- [`docs/INSTALL.md`](./docs/INSTALL.md)
- [`docs/releases/v1.0.4.md`](./docs/releases/v1.0.4.md)
