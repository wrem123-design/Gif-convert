import { app, BrowserWindow } from "electron";
import path from "node:path";
import http from "node:http";
import net from "node:net";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import fs from "fs-extra";

const IOPAINT_REPO_URL = "https://github.com/Sanster/IOPaint.git";
const IOPAINT_HOST = "127.0.0.1";
const IOPAINT_DEFAULT_PORT = 8080;
const EMBEDDED_PYTHON_VERSION = "3.12.7";
const LOG_LIMIT = 80;

export type IOPaintPhase =
  | "idle"
  | "checking"
  | "cloning"
  | "creating_venv"
  | "installing"
  | "starting"
  | "ready"
  | "error";

export interface IOPaintStatus {
  phase: IOPaintPhase;
  message: string;
  installed: boolean;
  ready: boolean;
  managed: boolean;
  url: string;
  repoDir: string;
  venvDir: string;
  modelDir: string;
  logs: string[];
  error: string | null;
}

interface IOPaintRuntimePaths {
  runtimeRoot: string;
  repoDir: string;
  repoPackageDir: string;
  repoWebAppDir: string;
  repoWebAppSourceDir: string;
  repoWebAppDistDir: string;
  pythonDir: string;
  modelDir: string;
  packageDir: string;
  packageWebAppDir: string;
  pythonExe: string;
  pythonPth: string;
  installStamp: string;
}

function getRuntimePaths(): IOPaintRuntimePaths {
  const runtimeRoot = path.join(app.getPath("userData"), "iopaint");
  const repoDir = path.join(runtimeRoot, "repo");
  const repoPackageDir = path.join(repoDir, "iopaint");
  const repoWebAppDir = path.join(repoPackageDir, "web_app");
  const repoWebAppSourceDir = path.join(repoDir, "web_app");
  const repoWebAppDistDir = path.join(repoWebAppSourceDir, "dist");
  const pythonDir = path.join(runtimeRoot, "python");
  const modelDir = path.join(runtimeRoot, "models");
  const packageDir = path.join(pythonDir, "Lib", "site-packages", "iopaint");
  const packageWebAppDir = path.join(packageDir, "web_app");
  const pythonExe = path.join(pythonDir, "python.exe");
  const pythonPth = path.join(pythonDir, "python312._pth");
  const installStamp = path.join(runtimeRoot, "install.stamp");

  return {
    runtimeRoot,
    repoDir,
    repoPackageDir,
    repoWebAppDir,
    repoWebAppSourceDir,
    repoWebAppDistDir,
    pythonDir,
    modelDir,
    packageDir,
    packageWebAppDir,
    pythonExe,
    pythonPth,
    installStamp
  };
}

function detectInstalledSync(): boolean {
  const { pythonExe, installStamp, packageWebAppDir, repoWebAppDir, repoWebAppDistDir } = getRuntimePaths();
  return fs.existsSync(pythonExe)
    && fs.existsSync(installStamp)
    && (
      fs.existsSync(path.join(packageWebAppDir, "index.html"))
      || fs.existsSync(path.join(repoWebAppDir, "index.html"))
      || fs.existsSync(path.join(repoWebAppDistDir, "index.html"))
    );
}

function withRuntimePaths(status: IOPaintStatus): IOPaintStatus {
  const paths = getRuntimePaths();
  return {
    ...status,
    installed: detectInstalledSync(),
    url: currentUrl,
    repoDir: paths.repoDir,
    venvDir: paths.pythonDir,
    modelDir: paths.modelDir
  };
}

let serviceProcess: ChildProcessWithoutNullStreams | null = null;
let installPromise: Promise<IOPaintStatus> | null = null;
let startPromise: Promise<IOPaintStatus> | null = null;
let currentPort = IOPAINT_DEFAULT_PORT;
let currentUrl = `http://${IOPAINT_HOST}:${currentPort}`;
let currentStatus: IOPaintStatus = {
  phase: "idle",
  message: "대기 중",
  installed: false,
  ready: false,
  managed: false,
  url: currentUrl,
  repoDir: "",
  venvDir: "",
  modelDir: "",
  logs: [],
  error: null
};

function appendLog(line: string): void {
  const trimmed = line.trim();
  if (!trimmed) {
    return;
  }
  currentStatus = {
    ...currentStatus,
    logs: [...currentStatus.logs, trimmed].slice(-LOG_LIMIT)
  };
  broadcastStatus();
}

function setStatus(patch: Partial<IOPaintStatus>): void {
  currentStatus = withRuntimePaths({
    ...currentStatus,
    ...patch
  });
  broadcastStatus();
}

function broadcastStatus(): void {
  const payload = withRuntimePaths(currentStatus);
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send("iopaint:status", payload);
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitForExit(process: ChildProcessWithoutNullStreams): Promise<number | null> {
  return new Promise((resolve) => {
    process.once("close", resolve);
  });
}

function psQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

async function canRunCommand(command: string, args: string[]): Promise<boolean> {
  return await new Promise<boolean>((resolve) => {
    const child = spawn(command, args, {
      shell: false,
      windowsHide: true
    });
    child.on("error", () => resolve(false));
    child.on("close", (code) => resolve(code === 0));
  });
}

async function runCommand(command: string, args: string[], cwd?: string): Promise<void> {
  appendLog(`> ${command} ${args.join(" ")}`);
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      shell: false,
      windowsHide: true
    });

    let stderr = "";
    child.stdout.on("data", (data) => appendLog(data.toString()));
    child.stderr.on("data", (data) => {
      const text = data.toString();
      stderr += text;
      appendLog(text);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(stderr.trim() || `Command failed: ${command} ${args.join(" ")}`));
    });
  });
}

async function ensurePrerequisites(): Promise<void> {
  const missing: string[] = [];

  if (!(await canRunCommand("git", ["--version"]))) {
    missing.push("Git for Windows 설치 후 `git --version` 확인");
  }

  if (!(await canRunCommand("powershell", ["-Command", "$PSVersionTable.PSVersion.ToString()"]))) {
    missing.push("Windows PowerShell 사용 가능 상태 확인");
  }

  if (!(await canRunCommand("cmd", ["/c", "npm", "--version"])) && false) {
    missing.push("Node.js 20+ 설치 후 `npm --version` 확인");
  }

  if (missing.length > 0) {
    throw new Error(`IOPaint 사전 준비 항목이 부족합니다.\n- ${missing.join("\n- ")}`);
  }
}

async function httpReachable(url: string): Promise<boolean> {
  return await new Promise<boolean>((resolve) => {
    const req = http.get(url, (res) => {
      res.resume();
      resolve((res.statusCode ?? 500) < 500);
    });
    req.setTimeout(3000, () => {
      req.destroy();
      resolve(false);
    });
    req.on("error", () => resolve(false));
  });
}

async function ensureNodeBuildTooling(): Promise<void> {
  if (await canRunCommand("cmd", ["/c", "npm", "--version"])) {
    return;
  }
  throw new Error("IOPaint web_app build requires Node.js/npm. Install Node.js 20+ and confirm `npm --version`.");
}

async function isPortFree(port: number): Promise<boolean> {
  return await new Promise<boolean>((resolve) => {
    const server = net.createServer();
    server.unref();
    server.once("error", () => resolve(false));
    server.listen(port, IOPAINT_HOST, () => {
      server.close(() => resolve(true));
    });
  });
}

async function allocateServicePort(preferredPort = IOPAINT_DEFAULT_PORT): Promise<number> {
  const maxAttempts = 20;
  for (let offset = 0; offset < maxAttempts; offset += 1) {
    const candidate = preferredPort + offset;
    if (await isPortFree(candidate)) {
      currentPort = candidate;
      currentUrl = `http://${IOPAINT_HOST}:${candidate}`;
      return candidate;
    }
  }
  throw new Error(`No available IOPaint port found between ${preferredPort} and ${preferredPort + maxAttempts - 1}.`);
}

async function ensureRepo(): Promise<void> {
  const { runtimeRoot, repoDir } = getRuntimePaths();
  const gitDir = path.join(repoDir, ".git");
  if (await fs.pathExists(gitDir)) {
    appendLog("IOPaint 저장소를 재사용합니다.");
    return;
  }

  await fs.ensureDir(runtimeRoot);
  setStatus({
    phase: "cloning",
    message: "IOPaint 저장소를 가져오는 중...",
    installed: false,
    ready: false,
    managed: false,
    error: null
  });

  if (await fs.pathExists(repoDir)) {
    await fs.remove(repoDir);
  }

  await runCommand("git", ["clone", "--depth", "1", IOPAINT_REPO_URL, repoDir], runtimeRoot);
}

async function ensureEmbeddedPython(): Promise<void> {
  const { runtimeRoot, pythonDir, pythonExe, pythonPth } = getRuntimePaths();
  if (await fs.pathExists(pythonExe)) {
    appendLog("IOPaint 내장 Python을 재사용합니다.");
    return;
  }

  const arch = process.arch === "x64" ? "amd64" : "win32";
  const zipName = `python-${EMBEDDED_PYTHON_VERSION}-embed-${arch}.zip`;
  const zipPath = path.join(runtimeRoot, zipName);
  const pythonUrl = `https://www.python.org/ftp/python/${EMBEDDED_PYTHON_VERSION}/${zipName}`;
  const getPipPath = path.join(runtimeRoot, "get-pip.py");

  setStatus({
    phase: "creating_venv",
    message: "IOPaint용 내장 Python을 준비하는 중...",
    installed: false,
    ready: false,
    managed: false,
    error: null
  });

  await runCommand(
    "powershell",
    ["-Command", `Invoke-WebRequest -Uri ${psQuote(pythonUrl)} -OutFile ${psQuote(zipPath)} -UseBasicParsing`],
    runtimeRoot
  );
  await fs.ensureDir(pythonDir);
  await runCommand(
    "powershell",
    ["-Command", `Expand-Archive -Path ${psQuote(zipPath)} -DestinationPath ${psQuote(pythonDir)} -Force`],
    runtimeRoot
  );
  await fs.remove(zipPath);

  if (await fs.pathExists(pythonPth)) {
    const current = await fs.readFile(pythonPth, "utf8");
    const normalized = current.includes("import site") ? current : current.replace("#import site", "import site");
    const withSitePackages = normalized.includes("Lib\\site-packages")
      ? normalized
      : `${normalized}\nLib\\site-packages`;
    await fs.writeFile(pythonPth, withSitePackages, "utf8");
  }

  await fs.ensureDir(path.join(pythonDir, "Lib", "site-packages"));
  await runCommand(
    "powershell",
    ["-Command", `Invoke-WebRequest -Uri 'https://bootstrap.pypa.io/get-pip.py' -OutFile ${psQuote(getPipPath)} -UseBasicParsing`],
    runtimeRoot
  );
  await runCommand(pythonExe, [getPipPath, "--no-warn-script-location"], runtimeRoot);
  await fs.remove(getPipPath);
}

async function webAppDirectoryLooksBuilt(dir: string): Promise<boolean> {
  const indexPath = path.join(dir, "index.html");
  if (!(await fs.pathExists(indexPath))) {
    return false;
  }
  const html = await fs.readFile(indexPath, "utf8");
  return !html.includes("/src/main.tsx") && !html.includes("./src/main.tsx");
}

async function ensureWebAppBuild(): Promise<void> {
  const { repoWebAppSourceDir, repoWebAppDistDir } = getRuntimePaths();
  if (await webAppDirectoryLooksBuilt(repoWebAppDistDir)) {
    return;
  }

  appendLog("IOPaint web_app를 빌드합니다.");
  await runCommand("cmd", ["/c", "npm", "install"], repoWebAppSourceDir);
  await runCommand("cmd", ["/c", "npm", "run", "build"], repoWebAppSourceDir);
}

async function ensureWebAppAssets(): Promise<void> {
  const { repoWebAppDir, repoWebAppDistDir, packageWebAppDir } = getRuntimePaths();
  let preferredSource = await webAppDirectoryLooksBuilt(packageWebAppDir)
    ? packageWebAppDir
    : await webAppDirectoryLooksBuilt(repoWebAppDir)
      ? repoWebAppDir
      : await webAppDirectoryLooksBuilt(repoWebAppDistDir)
        ? repoWebAppDistDir
        : null;

  if (!preferredSource) {
    await ensureNodeBuildTooling();
    await ensureWebAppBuild();
    preferredSource = await webAppDirectoryLooksBuilt(repoWebAppDistDir) ? repoWebAppDistDir : null;
  }

  if (!preferredSource) {
    throw new Error("IOPaint web_app 정적 파일을 찾지 못했습니다.");
  }

  for (const target of [packageWebAppDir, repoWebAppDir]) {
    if (await webAppDirectoryLooksBuilt(target)) {
      continue;
    }
    await fs.remove(target);
    await fs.ensureDir(path.dirname(target));
    await fs.copy(preferredSource, target, { overwrite: true });
    appendLog(`web_app 자산을 복구했습니다: ${target}`);
  }
}

async function installIopaint(): Promise<void> {
  const { runtimeRoot, modelDir, repoDir, pythonExe, installStamp } = getRuntimePaths();
  if (await fs.pathExists(installStamp)) {
    appendLog("IOPaint 설치 흔적이 있어 기존 환경을 확인합니다.");
    await ensureWebAppAssets();
    return;
  }

  setStatus({
    phase: "installing",
    message: "IOPaint 패키지와 모델 환경을 설치하는 중...",
    installed: false,
    ready: false,
    managed: false,
    error: null
  });

  await fs.ensureDir(modelDir);
  await runCommand(pythonExe, ["-m", "pip", "install", "--upgrade", "pip", "setuptools", "wheel"], runtimeRoot);
  await runCommand(pythonExe, ["-m", "pip", "install", "."], repoDir);
  await ensureWebAppAssets();
  await fs.writeFile(installStamp, new Date().toISOString(), "utf8");
}

async function installRuntime(): Promise<void> {
  await ensurePrerequisites();
  await ensureRepo();
  await ensureEmbeddedPython();
  await installIopaint();
}

async function waitForServiceReady(timeoutMs: number): Promise<boolean> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await httpReachable(currentUrl)) {
      return true;
    }
    await wait(2000);
  }
  return false;
}

async function startManagedService(): Promise<void> {
  const { modelDir, runtimeRoot, pythonExe } = getRuntimePaths();
  const port = await allocateServicePort();

  if (await httpReachable(currentUrl)) {
    setStatus({
      phase: "ready",
      message: "기존 IOPaint 서버를 감지했습니다.",
      installed: true,
      ready: true,
      managed: false,
      error: null
    });
    return;
  }

  setStatus({
    phase: "starting",
    message: "IOPaint 서버를 시작하는 중...",
    installed: true,
    ready: false,
    managed: true,
    error: null
  });

  serviceProcess = spawn(
    pythonExe,
    [
      "-m",
      "iopaint",
      "start",
      "--model=lama",
      "--device=cpu",
      "--host",
      IOPAINT_HOST,
      "--port",
      String(port),
      "--model-dir",
      modelDir
    ],
    {
      cwd: runtimeRoot,
      shell: false,
      windowsHide: true
    }
  );

  serviceProcess.stdout.on("data", (data) => appendLog(data.toString()));
  serviceProcess.stderr.on("data", (data) => appendLog(data.toString()));
  serviceProcess.on("error", (error) => {
    setStatus({
      phase: "error",
      message: "IOPaint 서버 시작에 실패했습니다.",
      installed: detectInstalledSync(),
      ready: false,
      managed: false,
      error: error.message
    });
  });
  serviceProcess.on("close", (code) => {
    const wasReady = currentStatus.phase === "ready";
    serviceProcess = null;
    setStatus({
      phase: wasReady ? "error" : currentStatus.phase,
      message: wasReady ? "IOPaint 서버가 종료되었습니다." : currentStatus.message,
      installed: detectInstalledSync(),
      ready: false,
      managed: false,
      error: wasReady ? `IOPaint exited with code ${code ?? "unknown"}` : currentStatus.error
    });
  });

  const ready = await waitForServiceReady(180000);
  if (!ready) {
    const process = serviceProcess;
    if (process) {
      process.kill();
      await waitForExit(process);
    }
    throw new Error("IOPaint 서버가 180초 안에 준비되지 않았습니다.");
  }

  setStatus({
    phase: "ready",
    message: "IOPaint 서버가 준비되었습니다.",
    installed: true,
    ready: true,
    managed: true,
    error: null
  });
}

export function getIOPaintStatus(): IOPaintStatus {
  return withRuntimePaths(currentStatus);
}

export async function ensureIOPaintInstalled(): Promise<IOPaintStatus> {
  if (detectInstalledSync()) {
    setStatus({
      phase: currentStatus.ready ? currentStatus.phase : "idle",
      message: currentStatus.ready ? currentStatus.message : "IOPaint 설치가 완료되었습니다.",
      installed: true,
      ready: currentStatus.ready,
      managed: currentStatus.managed,
      error: currentStatus.error
    });
    return currentStatus;
  }

  if (installPromise) {
    return await installPromise;
  }

  installPromise = (async () => {
    setStatus({
      phase: "checking",
      message: "IOPaint 설치 상태를 확인하는 중...",
      installed: false,
      ready: false,
      managed: false,
      error: null
    });

    try {
      await installRuntime();
      setStatus({
        phase: "idle",
        message: "IOPaint 설치가 완료되었습니다.",
        installed: true,
        ready: false,
        managed: false,
        error: null
      });
      return currentStatus;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatus({
        phase: "error",
        message: "IOPaint 설치에 실패했습니다.",
        installed: detectInstalledSync(),
        ready: false,
        managed: false,
        error: message
      });
      throw error;
    } finally {
      installPromise = null;
    }
  })();

  return await installPromise;
}

export async function ensureIOPaintReady(): Promise<IOPaintStatus> {
  if (currentStatus.ready) {
    return currentStatus;
  }

  if (startPromise) {
    return await startPromise;
  }

  startPromise = (async () => {
    try {
      await ensureIOPaintInstalled();
      await startManagedService();
      return currentStatus;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatus({
        phase: "error",
        message: "IOPaint 실행 준비에 실패했습니다.",
        installed: detectInstalledSync(),
        ready: false,
        managed: false,
        error: message
      });
      throw error;
    } finally {
      startPromise = null;
    }
  })();

  return await startPromise;
}

export async function restartIOPaint(): Promise<IOPaintStatus> {
  if (serviceProcess) {
    const process = serviceProcess;
    serviceProcess = null;
    process.kill();
    await waitForExit(process);
  }

  setStatus({
    phase: "idle",
    message: "IOPaint 서버를 다시 시작하는 중...",
    installed: detectInstalledSync(),
    ready: false,
    managed: false,
    error: null
  });

  return await ensureIOPaintReady();
}

export async function shutdownIOPaint(): Promise<void> {
  if (!serviceProcess) {
    return;
  }

  const process = serviceProcess;
  serviceProcess = null;
  process.kill();
  await waitForExit(process);
}
