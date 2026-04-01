# IOPaint Setup

`IOPaint` tab does more than open a cloned repo. On first run, the app tries to:

1. Clone `https://github.com/Sanster/IOPaint.git`
2. Create a dedicated Python virtual environment
3. Run `pip install .`
4. Build the bundled `web_app`
5. Start a local server at `http://127.0.0.1:8080`

If one of the prerequisites is missing, the tab will stay in the setup/error state.

## Required software

- Git for Windows
- Python 3.10 or newer
- Node.js 20 or newer

## Windows install checklist

1. Install Git for Windows and confirm:

```powershell
git --version
```

2. Install Python 3.10+ and make sure `Add python.exe to PATH` is enabled during setup. Then confirm:

```powershell
python --version
```

If `python` does not work, the app cannot create the IOPaint virtual environment.

3. Install Node.js 20+ and confirm:

```powershell
npm --version
```

## First run notes

- The first successful launch can take a while because clone, pip install, frontend build, and model download may all happen together.
- Internet access is required on the first setup run.
- The runtime paths are shown inside the app in the `IOPaint` tab.

## When the tab does not start

Check these first:

1. `git --version`
2. `python --version`
3. `npm --version`

If any of those fail in a fresh terminal, fix that first and then reopen the app or use the `서비스 재시작` button in the `IOPaint` tab.
