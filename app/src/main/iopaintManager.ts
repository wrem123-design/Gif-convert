import { app, BrowserWindow } from "electron";
import path from "node:path";
import http from "node:http";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import fs from "fs-extra";

const IOPAINT_REPO_URL = "https://github.com/Sanster/IOPaint.git";
const IOPAINT_HOST = "127.0.0.1";
const IOPAINT_PORT = 8080;
const IOPAINT_URL = `http://${IOPAINT_HOST}:${IOPAINT_PORT}`;
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
  venvDir: string;
  modelDir: string;
  packageDir: string;
  packageWebAppDir: string;
  venvPython: string;
}

interface PythonCommand {
  command: string;
  argsPrefix: string[];
  label: string;
}

function getRuntimePaths(): IOPaintRuntimePaths {
  const runtimeRoot = path.join(app.getPath("userData"), "iopaint");
  const repoDir = path.join(runtimeRoot, "repo");
  const repoPackageDir = path.join(repoDir, "iopaint");
  const repoWebAppDir = path.join(repoPackageDir, "web_app");
  const repoWebAppSourceDir = path.join(repoDir, "web_app");
  const repoWebAppDistDir = path.join(repoWebAppSourceDir, "dist");
  const venvDir = path.join(runtimeRoot, ".venv");
  const modelDir = path.join(runtimeRoot, "models");
  const packageDir = path.join(venvDir, "Lib", "site-packages", "iopaint");
  const packageWebAppDir = path.join(packageDir, "web_app");
  const venvPython = path.join(venvDir, "Scripts", "python.exe");
  return {
    runtimeRoot,
    repoDir,
    repoPackageDir,
    repoWebAppDir,
    repoWebAppSourceDir,
    repoWebAppDistDir,
    venvDir,
    modelDir,
    packageDir,
    packageWebAppDir,
    venvPython
  };
}

function withRuntimePaths(status: IOPaintStatus): IOPaintStatus {
  const paths = getRuntimePaths();
  return {
    ...status,
    repoDir: paths.repoDir,
    venvDir: paths.venvDir,
    modelDir: paths.modelDir
  };
}

let serviceProcess: ChildProcessWithoutNullStreams | null = null;
let ensurePromise: Promise<IOPaintStatus> | null = null;
let resolvedPython: PythonCommand | null = null;
let currentStatus: IOPaintStatus = {
  phase: "idle",
  message: "대기 중",
  ready: false,
  managed: false,
  url: IOPAINT_URL,
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

function waitForExit(process: ChildProcessWithoutNullStreams): Promise<number | null> {
  return new Promise((resolve) => {
    process.once("close", resolve);
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

async function ensurePrerequisites(): Promise<void> {
  const missing: string[] = [];

  if (!(await canRunCommand("git", ["--version"]))) {
    missing.push("Git is not available. Install Git for Windows and confirm `git --version` works in a new terminal.");
  }

  const hasPython = (await canRunCommand("python", ["--version"])) || (await canRunCommand("py", ["-3", "--version"]));
  if (!hasPython) {
    missing.push(
      "Python 3 is not available. Install Python 3.10+ and enable 'Add python.exe to PATH', then confirm `python --version` works."
    );
  }

  if (!(await canRunCommand("cmd", ["/c", "npm", "--version"]))) {
    missing.push("npm is not available. Install Node.js 20+ and confirm `npm --version` works in a new terminal.");
  }

  if (missing.length > 0) {
    throw new Error(`Missing prerequisites for IOPaint:\n- ${missing.join("\n- ")}`);
  }
}

async function getSystemPython(): Promise<PythonCommand> {
  if (resolvedPython) {
    return resolvedPython;
  }

  if (await canRunCommand("python", ["--version"])) {
    resolvedPython = { command: "python", argsPrefix: [], label: "python" };
    appendLog("시스템 Python 실행기로 python 을 사용합니다.");
    return resolvedPython;
  }

  if (await canRunCommand("py", ["-3", "--version"])) {
    resolvedPython = { command: "py", argsPrefix: ["-3"], label: "py -3" };
    appendLog("시스템 Python 실행기로 py -3 를 사용합니다.");
    return resolvedPython;
  }

  throw new Error("Python 3 실행기를 찾을 수 없습니다. python 또는 py -3 명령이 필요합니다.");
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

async function ensureRepo(): Promise<void> {
  const { runtimeRoot, repoDir } = getRuntimePaths();
  const gitDir = path.join(repoDir, ".git");
  if (await fs.pathExists(gitDir)) {
    appendLog("IOPaint 저장소가 이미 존재합니다. 기존 복제본을 사용합니다.");
    return;
  }

  await fs.ensureDir(runtimeRoot);
  setStatus({
    phase: "cloning",
    message: "IOPaint 저장소를 가져오는 중...",
    ready: false,
    managed: false,
    error: null
  });

  if (await fs.pathExists(repoDir)) {
    await fs.remove(repoDir);
  }

  await runCommand("git", ["clone", "--depth", "1", IOPAINT_REPO_URL, repoDir], runtimeRoot);
}

async function ensureVenv(): Promise<void> {
  const { runtimeRoot, venvDir, venvPython } = getRuntimePaths();
  if (await fs.pathExists(venvPython)) {
    appendLog("IOPaint 전용 Python 가상환경이 이미 존재합니다.");
    return;
  }

  setStatus({
    phase: "creating_venv",
    message: "IOPaint 전용 Python 환경을 만드는 중...",
    ready: false,
    managed: false,
    error: null
  });

  const systemPython = await getSystemPython();
  await runCommand(systemPython.command, [...systemPython.argsPrefix, "-m", "venv", venvDir], runtimeRoot);
}

async function directoryHasIndexHtml(dir: string): Promise<boolean> {
  return await fs.pathExists(path.join(dir, "index.html"));
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

  appendLog("IOPaint web_app 빌드 산출물이 없어 프론트엔드 빌드를 수행합니다.");
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
    await ensureWebAppBuild();
    preferredSource = await webAppDirectoryLooksBuilt(repoWebAppDistDir) ? repoWebAppDistDir : null;
  }

  if (!preferredSource) {
    throw new Error("IOPaint web_app 정적 파일을 찾지 못했습니다.");
  }

  const targets = [packageWebAppDir, repoWebAppDir];
  for (const target of targets) {
    if (await webAppDirectoryLooksBuilt(target)) {
      continue;
    }
    await fs.remove(target);
    await fs.ensureDir(path.dirname(target));
    await fs.copy(preferredSource, target, { overwrite: true });
    appendLog(`IOPaint web_app 자산을 복구했습니다: ${target}`);
  }
}

async function installIopaint(): Promise<void> {
  const { runtimeRoot, modelDir, repoDir, venvPython } = getRuntimePaths();
  const stampPath = path.join(runtimeRoot, "install.stamp");
  if (await fs.pathExists(stampPath)) {
    appendLog("IOPaint 파이썬 패키지가 이미 설치되어 있습니다.");
    await ensureWebAppAssets();
    return;
  }

  setStatus({
    phase: "installing",
    message: "IOPaint 의존성과 패키지를 설치하는 중...",
    ready: false,
    managed: false,
    error: null
  });

  await fs.ensureDir(modelDir);
  await runCommand(venvPython, ["-m", "pip", "install", "--upgrade", "pip", "setuptools", "wheel"], runtimeRoot);
  await runCommand(venvPython, ["-m", "pip", "install", "."], repoDir);
  await ensureWebAppAssets();
  await fs.writeFile(stampPath, new Date().toISOString(), "utf8");
}

async function waitForServiceReady(timeoutMs: number): Promise<boolean> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await httpReachable(IOPAINT_URL)) {
      return true;
    }
    await wait(2000);
  }
  return false;
}

async function startManagedService(): Promise<void> {
  const { modelDir, runtimeRoot, venvPython } = getRuntimePaths();
  if (await httpReachable(IOPAINT_URL)) {
    setStatus({
      phase: "ready",
      message: "이미 실행 중인 IOPaint 서버를 감지했습니다.",
      ready: true,
      managed: false,
      error: null
    });
    return;
  }

  setStatus({
    phase: "starting",
    message: "IOPaint 서버를 시작하는 중...",
    ready: false,
    managed: true,
    error: null
  });

  serviceProcess = spawn(
    venvPython,
    [
      "-m",
      "iopaint",
      "start",
      "--model=lama",
      "--device=cpu",
      "--host",
      IOPAINT_HOST,
      "--port",
      String(IOPAINT_PORT),
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
    ready: true,
    managed: true,
    error: null
  });
}

export function getIOPaintStatus(): IOPaintStatus {
  return withRuntimePaths(currentStatus);
}

export async function ensureIOPaintReady(): Promise<IOPaintStatus> {
  if (currentStatus.ready) {
    return currentStatus;
  }

  if (ensurePromise) {
    return await ensurePromise;
  }

  ensurePromise = (async () => {
    setStatus({
      phase: "checking",
      message: "IOPaint 런타임을 점검하는 중...",
      ready: false,
      managed: false,
      error: null
    });

    try {
      await ensurePrerequisites();
      await ensureRepo();
      await ensureVenv();
      await installIopaint();
      await startManagedService();
      return currentStatus;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatus({
        phase: "error",
        message: "IOPaint 자동 설정에 실패했습니다.",
        ready: false,
        managed: false,
        error: message
      });
      throw error;
    } finally {
      ensurePromise = null;
    }
  })();

  return await ensurePromise;
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
