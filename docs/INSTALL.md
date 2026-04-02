# Installation Guide

Sprite Studio is distributed in two Windows-friendly forms:

## 1. Portable build

Use this when you want to run the app without a formal installation.

1. Download the latest portable package from the GitHub Releases page.
2. Extract the archive to any writable folder.
3. Run `Sprite Studio.exe`.

Recommended locations:
- `C:\Tools\Sprite Studio`
- `D:\Apps\Sprite Studio`

Avoid:
- network drives with restricted execution policies
- protected folders such as `C:\Program Files` when using the portable build

## 2. Installer build

Use this when you want Start Menu registration and a standard uninstall flow.

1. Download the latest installer from the GitHub Releases page.
2. Run the installer.
3. Choose the install location if needed.
4. Finish the setup wizard and launch the app.

## 3. First run notes

- The app stores local settings under your Windows user profile.
- AI tools may take longer on first use because local runtimes or models can be prepared.
- If you enabled `시작 시 최소화`, the app may launch minimized instead of opening in front.

## 4. Development install

From the repository root:

```bash
npm install
npm run dev
```

Build locally:

```bash
npm run build
```

Create distributables:

```bash
npm run package
npm run package:portable
```

Output folder:
- [`app/release`](../app/release)
