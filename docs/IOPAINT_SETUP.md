# IOPaint Setup

`IOPaint` integration does more than open a cloned repo. On first run, the app tries to:

1. Clone `https://github.com/Sanster/IOPaint.git`
2. Download and prepare an embedded Python runtime inside the app data folder
3. Run `pip install .`
4. Recover `web_app` assets if they are missing
5. Start a local loopback server on an available port chosen at runtime

If one of the prerequisites is missing, the tab stays in the setup or error state.

## Required software

- Git for Windows
- Node.js 20 or newer

Python is bundled by the app on first install. A separate system Python installation is not required.

## Windows install checklist

1. Install Git for Windows and confirm:

```powershell
git --version
```

2. Install Node.js 20+ and confirm:

```powershell
npm --version
```

Node.js is only needed when the app has to rebuild or recover the `web_app` assets from source.

## First run notes

- The first successful launch can take a while because clone, pip install, frontend asset recovery, and model download may all happen together.
- Internet access is required on the first setup run.
- The runtime paths and the actual local server URL are shown inside the app in the `IOPaint` tab.

## When the tab does not start

Check these first:

1. `git --version`
2. `npm --version`

If either command fails in a fresh terminal, fix that first and then reopen the app.
