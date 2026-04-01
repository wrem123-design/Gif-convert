import { app, BrowserWindow } from "electron";
import path from "node:path";
import fs from "fs-extra";
import { spawn, type ChildProcess } from "node:child_process";
import sharp from "sharp";

const MARKREMOVER_REPO_URL = "https://github.com/D-Ogi/WatermarkRemover-AI.git";
const LOG_LIMIT = 120;
const EMBEDDED_PYTHON_VERSION = "3.12.7";
const BASE_PACKAGES = [
  "torch>=2.4.0",
  "torchvision>=0.19.0",
  "transformers>=4.50.0",
  "diffusers>=0.30.0",
  "numpy<2",
  "opencv-python-headless>=4.8.0,<4.12.0",
  "Pillow>=10.0.0",
  "pywebview>=4.0",
  "loguru",
  "click",
  "tqdm",
  "psutil",
  "pyyaml",
  "qtpy"
];
const IOPAINT_DEP_PACKAGES = [
  "fastapi>=0.115.0",
  "uvicorn>=0.30.0",
  "python-multipart>=0.0.9",
  "rich>=13.0.0",
  "typer-config>=1.4.0",
  "pydantic>=2.7.0",
  "typer>=0.12.0",
  "einops",
  "omegaconf",
  "easydict",
  "yacs"
];
const BASE_IMPORTS = ["torch", "transformers", "webview", "cv2", "yaml", "PIL"];
const IOPAINT_IMPORTS = ["iopaint", "fastapi", "uvicorn", "multipart", "rich", "pydantic", "typer", "omegaconf", "easydict", "yacs"];
const UI_THEME_MARKER = "sprite-forge-markremover-theme";

const KO_TRANSLATIONS = {
  app: {
    title: "Sprite Studio AI Remover",
    brandLine1: "AI",
    brandLine2: "리무버"
  },
  modes: {
    label: "처리 방식",
    single: "단일 파일",
    single_tooltip: "이미지 또는 동영상 파일 하나를 처리합니다.",
    batch: "폴더 일괄 처리",
    batch_tooltip: "선택한 폴더 안의 이미지와 동영상을 한 번에 처리합니다."
  },
  settings: {
    gaslight: {
      label: "기존 결과 덮어쓰기",
      sublabel: "",
      tooltip: "같은 이름의 출력 파일이 있으면 덮어씁니다."
    },
    ghost: {
      label: "투명 처리",
      sublabel: "(PNG/WEBP 권장)",
      tooltip: "워터마크 영역을 배경으로 메우지 않고 투명하게 남깁니다."
    },
    sigma_detect: {
      label: "최대 검출 크기",
      tooltip: "이미지 대비 워터마크 최대 허용 비율입니다. 더 큰 영역은 건너뜁니다."
    },
    detection_prompt: {
      label: "검출 프롬프트",
      placeholder: "watermark",
      tooltip: "찾을 대상입니다. 예: watermark, logo, text, signature"
    },
    output_format: {
      label: "출력 형식",
      tooltip: "자동은 원본 형식을 유지합니다.",
      auto: "자동",
      png: "PNG",
      jpg: "JPG",
      webp: "WEBP",
      mp4: "MP4",
      avi: "AVI"
    }
  },
  video_settings: {
    title: "동영상 설정",
    detection_skip: {
      label: "검출 간격",
      unit: "프레임",
      hint: "값이 높을수록 빠르지만 짧게 나타나는 워터마크는 놓칠 수 있습니다."
    },
    fade_in: {
      label: "페이드 인 보정",
      hint: "워터마크가 서서히 나타날 때 앞쪽 구간까지 함께 제거합니다."
    },
    fade_out: {
      label: "페이드 아웃 보정",
      hint: "워터마크가 서서히 사라질 때 뒤쪽 구간까지 함께 제거합니다."
    }
  },
  buttons: {
    preview: "검출 미리보기",
    preview_tooltip: "실제 제거 전에 검출된 영역을 확인합니다.",
    preview_loading: "검출 중...",
    start: "처리 시작",
    start_processing: "처리 중...",
    stop: "중지",
    browse: "찾아보기",
    try_again: "다시 시도",
    close: "닫기",
    copy_error: "오류 복사"
  },
  dropzone: {
    title: "파일을 끌어놓거나 클릭해서 선택하세요",
    subtitle: "이미지 또는 동영상 파일 지원",
    video_hint: "동영상 파일입니다. 클릭해 다른 파일로 바꿀 수 있습니다.",
    image_hint: "이미지 파일입니다. 클릭해 다른 파일로 바꿀 수 있습니다."
  },
  output: {
    placeholder: "출력 폴더를 선택하세요"
  },
  status_bar: {
    cuda: "CUDA",
    ffmpeg: "FFmpeg",
    ram: "RAM",
    on: "사용",
    off: "미사용",
    cpu_mode: "CPU 모드"
  },
  preview_modal: {
    title: "검출 미리보기",
    prompt: "프롬프트",
    detected: "검출 수",
    source: "입력",
    regions: "개 영역",
    bounding_boxes: "검출 영역",
    of_image: "% 크기",
    too_large: "(너무 커서 제외됨)",
    loading: "미리보기를 생성하는 중...",
    loading_hint: "처음 한 번은 모델 다운로드 때문에 시간이 걸릴 수 있습니다."
  },
  marquee: "SPRITE FORGE AI REMOVER",
  processing_status: [
    "입력 파일을 분석하는 중...",
    "워터마크를 찾는 중...",
    "복원 처리를 적용하는 중...",
    "마무리 중..."
  ],
  logs: {
    init: "AI 리무버가 준비되었습니다.",
    starting: "처리를 시작합니다...",
    first_run_hint: "(처음 한 번은 AI 모델을 다운로드할 수 있습니다.)",
    done: "처리가 완료되었습니다.",
    stopped: "사용자가 작업을 중지했습니다.",
    no_input: "먼저 입력 파일을 선택하세요.",
    ghost_video_warning: "투명 처리는 동영상에서 사용할 수 없어 자동으로 꺼집니다.",
    no_ffmpeg: "FFmpeg가 없어 동영상 오디오가 유지되지 않을 수 있습니다.",
    api_error: "Python API에 연결할 수 없습니다. 앱에서 다시 실행해 주세요.",
    preview_failed: "미리보기 실패:",
    preview_result: "총 {total}개 중 {accepted}개 영역을 제거합니다.",
    cooking: "처리 중..."
  },
  lang: {
    label: "언어"
  }
};

const SPRITEFORGE_THEME = `
/* ${UI_THEME_MARKER} */
body.theme-spriteforge {
    background: #0f1117 !important;
    color: #e8eaed !important;
    font-family: Inter, 'Segoe UI', sans-serif !important;
}

body.theme-spriteforge .crt::before,
body.theme-spriteforge .fixed.inset-0.z-0,
body.theme-spriteforge .bg-neon-pink.text-black.font-bold.text-xs.py-1 {
    display: none !important;
}

body.theme-spriteforge .font-glitch {
    font-family: Inter, 'Segoe UI', sans-serif !important;
    font-weight: 800 !important;
    letter-spacing: -0.02em !important;
    filter: none !important;
    text-shadow: none !important;
    font-size: 2rem !important;
    color: #f5f7fa !important;
    background: none !important;
    -webkit-text-fill-color: currentColor !important;
}

body.theme-spriteforge aside,
body.theme-spriteforge .glass-panel,
body.theme-spriteforge .bg-black\\/60,
body.theme-spriteforge .bg-card,
body.theme-spriteforge .bg-black\\/40 {
    background: #161922 !important;
    border-color: rgba(255, 255, 255, 0.08) !important;
    box-shadow: none !important;
    backdrop-filter: none !important;
}

body.theme-spriteforge .border-white\\/10,
body.theme-spriteforge .border-white\\/5 {
    border-color: rgba(255, 255, 255, 0.08) !important;
}

body.theme-spriteforge .text-neon-green,
body.theme-spriteforge .text-neon-cyan {
    color: #7bb3ff !important;
    text-shadow: none !important;
}

body.theme-spriteforge .bg-neon-green,
body.theme-spriteforge .bg-neon-cyan,
body.theme-spriteforge .bg-neon-pink {
    background: #5b9cf6 !important;
    color: #ffffff !important;
    box-shadow: none !important;
}

body.theme-spriteforge button {
    border-radius: 12px !important;
}

body.theme-spriteforge button.bg-neon-green,
body.theme-spriteforge button.bg-neon-cyan\\/20,
body.theme-spriteforge button.bg-neon-cyan\\/40 {
    background: #5b9cf6 !important;
    color: #ffffff !important;
    border: 1px solid #5b9cf6 !important;
}

body.theme-spriteforge button:not(.bg-neon-green):not(.w-12):not(.rounded-full) {
    background: #1c2030 !important;
    color: #e8eaed !important;
    border: 1px solid rgba(255, 255, 255, 0.1) !important;
}

body.theme-spriteforge button:hover {
    filter: brightness(1.05);
}

body.theme-spriteforge input[type="text"],
body.theme-spriteforge select {
    background: #111420 !important;
    color: #e8eaed !important;
    border: 1px solid rgba(255, 255, 255, 0.12) !important;
    border-radius: 10px !important;
}

body.theme-spriteforge #logs-container {
    background: #0c0e14 !important;
    border: 1px solid rgba(255, 255, 255, 0.08) !important;
    border-radius: 12px !important;
}

body.theme-spriteforge .border-dashed {
    border-color: rgba(123, 179, 255, 0.45) !important;
    background: rgba(91, 156, 246, 0.05) !important;
}

body.theme-spriteforge a[href*="buymeacoffee"],
body.theme-spriteforge a[href*="buymeacoffee.com"],
body.theme-spriteforge a[href*="ko-fi"],
body.theme-spriteforge a[href*="kofi"],
body.theme-spriteforge a[href*="patreon"],
body.theme-spriteforge a[href*="sponsor"],
body.theme-spriteforge img[src*="kofi_button"],
body.theme-spriteforge img[src*="buymeacoffee"] {
    display: none !important;
}
`;

export type MarkRemoverPhase =
  | "idle"
  | "checking"
  | "cloning"
  | "installing"
  | "starting"
  | "ready"
  | "error";

export type MarkRemoverTaskState = "idle" | "previewing" | "processing";

export interface MarkRemoverDetection {
  bbox: [number, number, number, number];
  areaPercent: number;
  accepted: boolean;
}

export interface MarkRemoverPreviewOptions {
  inputPath: string;
  detectionPrompt: string;
  maxBBoxPercent: number;
}

export interface MarkRemoverPreviewResult {
  imageDataUrl: string;
  detections: MarkRemoverDetection[];
  source: string;
  sourceType: "image" | "video";
  sourceFrame: number | null;
  promptUsed: string;
  maxBBoxPercent: number;
}

export interface MarkRemoverRunOptions {
  inputPath: string;
  outputPath: string;
  overwrite: boolean;
  transparent: boolean;
  maxBBoxPercent: number;
  forceFormat: "PNG" | "WEBP" | "JPG" | "MP4" | "AVI" | null;
  detectionPrompt: string;
  detectionSkip: number;
  fadeIn: number;
  fadeOut: number;
}

export interface MarkRemoverRunResult {
  status: MarkRemoverStatus;
  outputPath: string | null;
}

export interface MarkRemoverStatus {
  phase: MarkRemoverPhase;
  message: string;
  installed: boolean;
  ready: boolean;
  running: boolean;
  managed: boolean;
  taskState: MarkRemoverTaskState;
  progress: number;
  currentPath: string | null;
  lastOutputPath: string | null;
  repoDir: string;
  pythonExe: string;
  entryHtml: string;
  logs: string[];
  error: string | null;
}

interface MarkRemoverRuntimePaths {
  runtimeRoot: string;
  repoDir: string;
  pythonDir: string;
  pythonExe: string;
  pythonwExe: string;
  pythonPth: string;
  guiScript: string;
  entryHtml: string;
  installStamp: string;
  uiDir: string;
  uiConfigPath: string;
  uiThemesPath: string;
  uiLangDir: string;
  uiKoPath: string;
  uiYamlPath: string;
}

function getRuntimePaths(): MarkRemoverRuntimePaths {
  const runtimeRoot = app.getPath("userData");
  const repoDir = path.join(runtimeRoot, "MarkRemover-AI");
  const pythonDir = path.join(repoDir, "python");
  const pythonExe = path.join(pythonDir, "python.exe");
  const pythonwExe = path.join(pythonDir, "pythonw.exe");
  const pythonPth = path.join(pythonDir, "python312._pth");
  const guiScript = path.join(repoDir, "remwmgui.py");
  const uiDir = path.join(repoDir, "ui");
  const entryHtml = path.join(uiDir, "index.html");
  const installStamp = path.join(repoDir, ".sprite-forge-install.stamp");
  const uiConfigPath = path.join(uiDir, "config.json");
  const uiThemesPath = path.join(uiDir, "themes.css");
  const uiLangDir = path.join(uiDir, "lang");
  const uiKoPath = path.join(uiLangDir, "ko.json");
  const uiYamlPath = path.join(repoDir, "ui.yml");

  return {
    runtimeRoot,
    repoDir,
    pythonDir,
    pythonExe,
    pythonwExe,
    pythonPth,
    guiScript,
    entryHtml,
    installStamp,
    uiDir,
    uiConfigPath,
    uiThemesPath,
    uiLangDir,
    uiKoPath,
    uiYamlPath
  };
}

function detectInstalledSync(): boolean {
  const { pythonExe, guiScript, entryHtml, installStamp } = getRuntimePaths();
  return fs.existsSync(pythonExe)
    && fs.existsSync(guiScript)
    && fs.existsSync(entryHtml)
    && fs.existsSync(installStamp);
}

function withRuntimePaths(status: MarkRemoverStatus): MarkRemoverStatus {
  const paths = getRuntimePaths();
  return {
    ...status,
    installed: detectInstalledSync(),
    repoDir: paths.repoDir,
    pythonExe: paths.pythonExe,
    entryHtml: paths.entryHtml
  };
}

let appProcess: ChildProcess | null = null;
let cliProcess: ChildProcess | null = null;
let cliStopRequested = false;
let installPromise: Promise<MarkRemoverStatus> | null = null;
let startPromise: Promise<MarkRemoverStatus> | null = null;
let currentStatus: MarkRemoverStatus = {
  phase: "idle",
  message: "대기 중",
  installed: false,
  ready: false,
  running: false,
  managed: false,
  taskState: "idle",
  progress: 0,
  currentPath: null,
  lastOutputPath: null,
  repoDir: "",
  pythonExe: "",
  entryHtml: "",
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

function setStatus(patch: Partial<MarkRemoverStatus>): void {
  currentStatus = withRuntimePaths({
    ...currentStatus,
    ...patch
  });
  broadcastStatus();
}

function broadcastStatus(): void {
  const payload = withRuntimePaths(currentStatus);
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send("markremover:status", payload);
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function canRunCommand(command: string, args: string[]): Promise<boolean> {
  return await new Promise<boolean>((resolve) => {
    let settled = false;
    const child = spawn(command, args, {
      shell: false,
      windowsHide: true
    });
    const finish = (result: boolean): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      resolve(result);
    };
    const timeout = setTimeout(() => {
      child.kill();
      finish(false);
    }, 8000);
    child.on("error", () => finish(false));
    child.on("close", (code) => finish(code === 0));
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
    child.stdout?.on("data", (data) => appendLog(data.toString()));
    child.stderr?.on("data", (data) => {
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

function psQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function makePowerShellArgs(command: string): string[] {
  return ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", command];
}

async function ensurePrerequisites(needsClone: boolean): Promise<void> {
  const missing: string[] = [];
  appendLog("AI 도구 사전 준비 항목을 확인합니다.");

  if (needsClone && !(await canRunCommand("git", ["--version"]))) {
    missing.push("Git for Windows 설치 후 `git --version` 확인");
  }

  if (!(await canRunCommand("powershell", makePowerShellArgs("$PSVersionTable.PSVersion.ToString()")))) {
    missing.push("Windows PowerShell 사용 가능 상태 확인");
  }

  if (missing.length > 0) {
    throw new Error(`AI 도구 사전 준비 항목이 부족합니다.\n- ${missing.join("\n- ")}`);
  }
}

async function ensureRepo(): Promise<void> {
  const { runtimeRoot, repoDir } = getRuntimePaths();
  const gitDir = path.join(repoDir, ".git");
  if (await fs.pathExists(gitDir)) {
    appendLog("MarkRemover-AI 저장소를 재사용합니다.");
    return;
  }

  await ensurePrerequisites(true);
  await fs.ensureDir(runtimeRoot);
  setStatus({
    phase: "cloning",
    message: "AI 저장소를 가져오는 중...",
    installed: false,
    ready: false,
    running: false,
    managed: false,
    error: null
  });

  if (await fs.pathExists(repoDir)) {
    await fs.remove(repoDir);
  }

  await runCommand("git", ["clone", "--depth", "1", MARKREMOVER_REPO_URL, repoDir], runtimeRoot);
}

async function ensureEmbeddedPython(): Promise<void> {
  const { repoDir, pythonDir, pythonExe, pythonPth } = getRuntimePaths();
  if (await fs.pathExists(pythonExe)) {
    appendLog("내장 Python을 재사용합니다.");
    return;
  }

  const arch = process.arch === "x64" ? "amd64" : "win32";
  const zipName = `python-${EMBEDDED_PYTHON_VERSION}-embed-${arch}.zip`;
  const zipPath = path.join(repoDir, zipName);
  const pythonUrl = `https://www.python.org/ftp/python/${EMBEDDED_PYTHON_VERSION}/${zipName}`;
  const getPipPath = path.join(repoDir, "get-pip.py");

  appendLog(`Embedded Python ${EMBEDDED_PYTHON_VERSION} 다운로드를 시작합니다.`);
  await runCommand(
    "powershell",
    makePowerShellArgs(`Invoke-WebRequest -Uri ${psQuote(pythonUrl)} -OutFile ${psQuote(zipPath)} -UseBasicParsing`),
    repoDir
  );
  await fs.ensureDir(pythonDir);
  await runCommand(
    "powershell",
    makePowerShellArgs(`Expand-Archive -Path ${psQuote(zipPath)} -DestinationPath ${psQuote(pythonDir)} -Force`),
    repoDir
  );
  await fs.remove(zipPath);

  if (await fs.pathExists(pythonPth)) {
    const current = await fs.readFile(pythonPth, "utf8");
    const normalized = current.includes("import site") ? current : current.replace("#import site", "import site");
    const withSitePackages = normalized.includes("Lib\\site-packages") ? normalized : `${normalized}\nLib\\site-packages`;
    await fs.writeFile(pythonPth, withSitePackages, "utf8");
  }

  await fs.ensureDir(path.join(pythonDir, "Lib", "site-packages"));
  await runCommand(
    "powershell",
    makePowerShellArgs(`Invoke-WebRequest -Uri 'https://bootstrap.pypa.io/get-pip.py' -OutFile ${psQuote(getPipPath)} -UseBasicParsing`),
    repoDir
  );
  await runCommand(pythonExe, [getPipPath, "--no-warn-script-location"], repoDir);
  await fs.remove(getPipPath);
}

async function installPythonPackages(pythonExe: string, packages: string[], extraArgs: string[] = []): Promise<void> {
  await runCommand(
    pythonExe,
    ["-m", "pip", "install", "--upgrade", ...packages, "--no-cache-dir", ...extraArgs],
    getRuntimePaths().repoDir
  );
}

async function verifyPythonImports(pythonExe: string, imports: string[]): Promise<void> {
  const importCode = `${imports.map((name) => `import ${name}`).join("; ")}; print("OK")`;
  await runCommand(pythonExe, ["-c", importCode], getRuntimePaths().repoDir);
}

async function canImportPythonModules(pythonExe: string, imports: string[]): Promise<boolean> {
  const importCode = `${imports.map((name) => `import ${name}`).join("; ")}; print("OK")`;
  return await new Promise<boolean>((resolve) => {
    const child = spawn(pythonExe, ["-c", importCode], {
      cwd: getRuntimePaths().repoDir,
      shell: false,
      windowsHide: true
    });
    child.on("error", () => resolve(false));
    child.on("close", (code) => resolve(code === 0));
  });
}

async function repairMarkRemoverRuntime(pythonExe: string): Promise<void> {
  const baseReady = await canImportPythonModules(pythonExe, BASE_IMPORTS);
  if (!baseReady) {
    appendLog("AI 핵심 Python 패키지를 복구합니다.");
    await installPythonPackages(pythonExe, BASE_PACKAGES, ["--extra-index-url", "https://download.pytorch.org/whl/cu124"]);
    await verifyPythonImports(pythonExe, BASE_IMPORTS);
  }

  const iopaintReady = await canImportPythonModules(pythonExe, IOPAINT_IMPORTS);
  if (!iopaintReady) {
    appendLog("AI 제거용 IOPaint 런타임 패키지가 누락되어 복구를 진행합니다.");
    await runCommand(
      pythonExe,
      ["-m", "pip", "install", "--upgrade", "iopaint", "--no-deps", "--no-cache-dir"],
      getRuntimePaths().repoDir
    );
    await installPythonPackages(pythonExe, IOPAINT_DEP_PACKAGES);
    await verifyPythonImports(pythonExe, IOPAINT_IMPORTS);
  }
}

async function patchIndexHtml(entryHtml: string): Promise<void> {
  if (!(await fs.pathExists(entryHtml))) {
    return;
  }

  let html = await fs.readFile(entryHtml, "utf8");
  const replacements: Array<[string, string]> = [
    ["<title>WM REMOVER - OHIO EDITION</title>", "<title>Sprite Studio AI Remover</title>"],
    ['x-show="availableThemes.length > 0"', 'x-show="availableThemes.length > 1"'],
    ['x-show="availableLanguages.length > 0"', 'x-show="availableLanguages.length > 1"'],
    [
      "const themes = ['theme-slay', 'theme-sigma', 'theme-witch', 'theme-korpo', 'theme-coquette', 'theme-xp', 'theme-anime'];",
      "const themes = ['theme-slay', 'theme-sigma', 'theme-witch', 'theme-korpo', 'theme-coquette', 'theme-xp', 'theme-anime', 'theme-spriteforge'];"
    ],
    ["theme: 'brainrot',  // Default theme for loading screen", "theme: 'spriteforge',"],
    ["lang: 'en',", "lang: 'ko',"],
    ["this.availableThemes = [{ id: 'brainrot' }];", "this.availableThemes = [{ id: 'spriteforge', name: 'Sprite Studio' }];"],
    [
      "this.availableLanguages = [{ id: 'brainrot', randomizable: true }, { id: 'en', randomizable: false }];",
      "this.availableLanguages = [{ id: 'ko', icon: 'KO', name: '한국어', randomizable: false }, { id: 'en', icon: 'EN', name: 'English', randomizable: false }];"
    ],
    ["document.title = this.t.app?.title || 'WM Remover';", "document.title = this.t.app?.title || 'Sprite Studio AI Remover';"],
    ["WM<br>REMOVER", "<span x-text=\"t.app?.brandLine1 || 'AI'\"></span><br><span x-text=\"t.app?.brandLine2 || '리무버'\"></span>"]
  ];

  for (const [from, to] of replacements) {
    html = html.replace(from, to);
  }

  await fs.writeFile(entryHtml, html, "utf8");
}

async function patchGuiScript(guiScript: string): Promise<void> {
  if (!(await fs.pathExists(guiScript))) {
    return;
  }

  let script = await fs.readFile(guiScript, "utf8");
  script = script.replace("WatermarkRemover-AI GUI - Ohio Edition", "Sprite Studio AI Remover GUI");
  script = script.replace("'WatermarkRemover AI - Ohio Edition'", "'Sprite Studio AI Remover'");
  await fs.writeFile(guiScript, script, "utf8");
}

async function patchThemes(themesPath: string): Promise<void> {
  if (!(await fs.pathExists(themesPath))) {
    return;
  }

  const themes = await fs.readFile(themesPath, "utf8");
  if (themes.includes(UI_THEME_MARKER)) {
    return;
  }

  await fs.writeFile(themesPath, `${themes.trimEnd()}\n\n${SPRITEFORGE_THEME}\n`, "utf8");
}

async function syncUiYaml(uiYamlPath: string): Promise<void> {
  let content = "";
  if (await fs.pathExists(uiYamlPath)) {
    content = await fs.readFile(uiYamlPath, "utf8");
  }

  if (/^theme:/m.test(content)) {
    content = content.replace(/^theme:.*$/m, "theme: spriteforge");
  } else {
    content += `${content.endsWith("\n") || content.length === 0 ? "" : "\n"}theme: spriteforge\n`;
  }

  if (/^lang:/m.test(content)) {
    content = content.replace(/^lang:.*$/m, "lang: ko");
  } else {
    content += `${content.endsWith("\n") || content.length === 0 ? "" : "\n"}lang: ko\n`;
  }

  await fs.writeFile(uiYamlPath, content, "utf8");
}

async function applyUiCustomizations(): Promise<void> {
  const { uiConfigPath, uiThemesPath, uiLangDir, uiKoPath, entryHtml, uiYamlPath, guiScript } = getRuntimePaths();
  if (!(await fs.pathExists(entryHtml))) {
    return;
  }

  await fs.ensureDir(uiLangDir);
  await fs.writeJson(
    uiConfigPath,
    {
      version: "0.67",
      themes: [{ id: "spriteforge", name: "Sprite Studio" }],
      languages: [{ id: "ko", icon: "KO", name: "한국어", randomizable: false }]
    },
    { spaces: 2 }
  );
  await fs.writeJson(uiKoPath, KO_TRANSLATIONS, { spaces: 2 });
  await patchThemes(uiThemesPath);
  await patchIndexHtml(entryHtml);
  await patchGuiScript(guiScript);
  await syncUiYaml(uiYamlPath);
}

async function installMarkRemover(): Promise<void> {
  const { repoDir, pythonExe, installStamp } = getRuntimePaths();
  if (detectInstalledSync()) {
    appendLog("AI 실행 환경을 재사용합니다.");
    await repairMarkRemoverRuntime(pythonExe);
    await applyUiCustomizations();
    return;
  }

  await ensurePrerequisites(false);
  setStatus({
    phase: "installing",
    message: "AI 도구 실행 환경을 설치하는 중...",
    installed: false,
    ready: false,
    running: false,
    managed: false,
    error: null
  });

  await ensureEmbeddedPython();
  await runCommand(pythonExe, ["-m", "pip", "install", "--upgrade", "pip", "setuptools", "wheel"], repoDir);
  await installPythonPackages(pythonExe, BASE_PACKAGES, ["--extra-index-url", "https://download.pytorch.org/whl/cu124"]);
  await verifyPythonImports(pythonExe, BASE_IMPORTS);
  await installPythonPackages(pythonExe, ["iopaint", "--no-deps"]);
  await installPythonPackages(pythonExe, IOPAINT_DEP_PACKAGES);
  await verifyPythonImports(pythonExe, IOPAINT_IMPORTS);
  await applyUiCustomizations();
  await fs.writeFile(installStamp, new Date().toISOString(), "utf8");
}

function getReadyPhase(): MarkRemoverPhase {
  return detectInstalledSync() ? "idle" : "error";
}

function appendStreamLines(
  chunk: Buffer | string,
  remainder: string,
  handler: (line: string) => void
): string {
  const merged = `${remainder}${chunk.toString()}`;
  const lines = merged.split(/\r?\n/);
  const nextRemainder = lines.pop() ?? "";
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed) {
      handler(trimmed);
    }
  }
  return nextRemainder;
}

function normalizeDetections(input: unknown): MarkRemoverDetection[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input.flatMap((item) => {
    if (!item || typeof item !== "object") {
      return [];
    }

    const source = item as Record<string, unknown>;
    const bbox = Array.isArray(source.bbox) ? source.bbox.slice(0, 4) : [];
    if (bbox.length !== 4 || bbox.some((value) => typeof value !== "number")) {
      return [];
    }

    return [{
      bbox: bbox as [number, number, number, number],
      areaPercent: typeof source.area_percent === "number"
        ? source.area_percent
        : typeof source.areaPercent === "number"
          ? source.areaPercent
          : 0,
      accepted: Boolean(source.accepted)
    }];
  });
}

function extractPreviewPayload(rawOutput: string): MarkRemoverPreviewResult {
  const candidates = rawOutput
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .reverse();

  let parsed: Record<string, unknown> | null = null;
  for (const line of candidates) {
    try {
      const value = JSON.parse(line) as Record<string, unknown>;
      if (value && typeof value === "object") {
        parsed = value;
        break;
      }
    } catch {
      continue;
    }
  }

  if (!parsed) {
    const firstBrace = rawOutput.indexOf("{");
    const lastBrace = rawOutput.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      parsed = JSON.parse(rawOutput.slice(firstBrace, lastBrace + 1)) as Record<string, unknown>;
    }
  }

  if (!parsed) {
    throw new Error("미리보기 결과를 해석하지 못했습니다.");
  }

  if (typeof parsed.error === "string" && parsed.error) {
    throw new Error(parsed.error);
  }

  if (typeof parsed.image !== "string" || !parsed.image) {
    throw new Error("미리보기 이미지가 생성되지 않았습니다.");
  }

  return {
    imageDataUrl: `data:image/png;base64,${parsed.image}`,
    detections: normalizeDetections(parsed.detections),
    source: typeof parsed.source === "string" ? parsed.source : "",
    sourceType: parsed.source_type === "video" ? "video" : "image",
    sourceFrame: typeof parsed.source_frame === "number" ? parsed.source_frame : null,
    promptUsed: typeof parsed.prompt_used === "string" ? parsed.prompt_used : "",
    maxBBoxPercent: typeof parsed.max_bbox_percent === "number" ? parsed.max_bbox_percent : 0
  };
}

function buildRunArgs(options: MarkRemoverRunOptions): string[] {
  const args = ["remwm.py", options.inputPath, options.outputPath];
  if (options.overwrite) {
    args.push("--overwrite");
  }
  if (options.transparent) {
    args.push("--transparent");
  }
  args.push("--max-bbox-percent", String(options.maxBBoxPercent));
  if (options.forceFormat) {
    args.push("--force-format", options.forceFormat);
  }
  args.push("--detection-prompt", options.detectionPrompt);
  args.push("--detection-skip", String(options.detectionSkip));
  args.push("--fade-in", String(options.fadeIn));
  args.push("--fade-out", String(options.fadeOut));
  return args;
}

function isStillImagePath(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return [".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tif", ".tiff"].includes(ext);
}

function isAlphaCapableOutputPath(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return [".png", ".webp", ".tif", ".tiff"].includes(ext);
}

async function preserveOriginalAlpha(inputPath: string, outputPath: string): Promise<void> {
  if (!isStillImagePath(inputPath) || !isStillImagePath(outputPath) || !isAlphaCapableOutputPath(outputPath)) {
    return;
  }

  const inputMeta = await sharp(inputPath).metadata();
  if (!inputMeta.hasAlpha) {
    return;
  }

  const outputMeta = await sharp(outputPath).metadata();
  if (!outputMeta.width || !outputMeta.height) {
    return;
  }

  const inputRaw = await sharp(inputPath)
    .ensureAlpha()
    .resize(outputMeta.width, outputMeta.height, { fit: "fill" })
    .raw()
    .toBuffer();

  const outputRaw = await sharp(outputPath)
    .ensureAlpha()
    .raw()
    .toBuffer();

  if (inputRaw.length !== outputRaw.length) {
    appendLog(`알파 보정 크기가 맞지 않아 건너뜁니다: ${outputPath}`);
    return;
  }

  const merged = Buffer.from(outputRaw);
  for (let index = 3; index < merged.length; index += 4) {
    merged[index] = Math.min(inputRaw[index] ?? 255, outputRaw[index] ?? 255);
  }

  let image = sharp(merged, {
    raw: {
      width: outputMeta.width,
      height: outputMeta.height,
      channels: 4
    }
  });

  const ext = path.extname(outputPath).toLowerCase();
  if (ext === ".webp") {
    image = image.webp();
  } else if (ext === ".tif" || ext === ".tiff") {
    image = image.tiff();
  } else {
    image = image.png();
  }

  await image.toFile(outputPath);
  appendLog(`원본 투명도를 유지하도록 알파를 복원했습니다: ${outputPath}`);
}

async function resolveRunOutputPath(outputPath: string): Promise<{ outputPath: string }> {
  const normalizedOutput = outputPath.trim();
  if (normalizedOutput) {
    return { outputPath: normalizedOutput };
  }

  const tempRoot = path.join(app.getPath("userData"), "markremover-preview-output");
  const tempRunDir = path.join(tempRoot, `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`);
  await fs.ensureDir(tempRunDir);
  appendLog(`임시 결과 폴더를 사용합니다: ${tempRunDir}`);
  return { outputPath: tempRunDir };
}

async function findNewestFile(rootPath: string): Promise<string | null> {
  if (!(await fs.pathExists(rootPath))) {
    return null;
  }

  const stats = await fs.stat(rootPath);
  if (stats.isFile()) {
    return rootPath;
  }

  const entries = await fs.readdir(rootPath);
  let newestPath: string | null = null;
  let newestMtime = 0;

  for (const entry of entries) {
    const candidatePath = path.join(rootPath, entry);
    const candidateStats = await fs.stat(candidatePath);
    if (!candidateStats.isFile()) {
      continue;
    }
    const mtime = candidateStats.mtimeMs;
    if (!newestPath || mtime >= newestMtime) {
      newestPath = candidatePath;
      newestMtime = mtime;
    }
  }

  return newestPath;
}

async function resolveFinalOutputPath(runOutputPath: string, reportedOutputPath: string | null): Promise<string | null> {
  if (reportedOutputPath && await fs.pathExists(reportedOutputPath)) {
    return reportedOutputPath;
  }
  return await findNewestFile(runOutputPath);
}

function ensureNoActiveCliTask(): void {
  if (cliProcess && cliProcess.exitCode === null && !cliProcess.killed) {
    throw new Error("이미 AI 작업이 실행 중입니다.");
  }
}

export async function previewMarkRemover(options: MarkRemoverPreviewOptions): Promise<MarkRemoverPreviewResult> {
  await ensureMarkRemoverInstalled();
  ensureNoActiveCliTask();

  const { repoDir, pythonExe } = getRuntimePaths();
  const args = [
    "remwm.py",
    options.inputPath,
    "--preview",
    "--detection-prompt",
    options.detectionPrompt,
    "--max-bbox-percent",
    String(options.maxBBoxPercent)
  ];

  setStatus({
    phase: getReadyPhase(),
    message: "워터마크 검출 미리보기를 생성하는 중...",
    taskState: "previewing",
    progress: 0,
    currentPath: options.inputPath,
    error: null
  });

  let stdout = "";
  let stderr = "";
  let stdoutRemainder = "";
  let stderrRemainder = "";
  cliStopRequested = false;

  try {
    const result = await new Promise<MarkRemoverPreviewResult>((resolve, reject) => {
      cliProcess = spawn(pythonExe, args, {
        cwd: repoDir,
        shell: false,
        windowsHide: true
      });

      cliProcess.stdout?.on("data", (chunk) => {
        stdout += chunk.toString();
        stdoutRemainder = appendStreamLines(chunk, stdoutRemainder, appendLog);
      });

      cliProcess.stderr?.on("data", (chunk) => {
        stderr += chunk.toString();
        stderrRemainder = appendStreamLines(chunk, stderrRemainder, appendLog);
      });

      cliProcess.on("error", (error) => {
        cliProcess = null;
        reject(error);
      });

      cliProcess.on("close", (code) => {
        if (stdoutRemainder.trim()) {
          appendLog(stdoutRemainder.trim());
          stdout += `\n${stdoutRemainder.trim()}`;
        }
        if (stderrRemainder.trim()) {
          appendLog(stderrRemainder.trim());
          stderr += `\n${stderrRemainder.trim()}`;
        }

        const stopped = cliStopRequested;
        cliProcess = null;
        cliStopRequested = false;

        if (stopped) {
          reject(new Error("사용자가 미리보기를 중지했습니다."));
          return;
        }

        if (code !== 0) {
          reject(new Error((stderr || stdout || `Preview exited with code ${code ?? "unknown"}`).trim()));
          return;
        }

        try {
          resolve(extractPreviewPayload(`${stdout}\n${stderr}`));
        } catch (error) {
          reject(error);
        }
      });
    });

    setStatus({
      phase: getReadyPhase(),
      message: "워터마크 검출 미리보기가 준비되었습니다.",
      taskState: "idle",
      progress: 0,
      currentPath: result.source || options.inputPath,
      error: null
    });

    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setStatus({
      phase: getReadyPhase(),
      message,
      taskState: "idle",
      progress: 0,
      error: message
    });
    throw error;
  }
}

export async function runMarkRemover(options: MarkRemoverRunOptions): Promise<MarkRemoverRunResult> {
  await ensureMarkRemoverInstalled();
  ensureNoActiveCliTask();

  const { repoDir, pythonExe } = getRuntimePaths();
  const { outputPath: resolvedOutputPath } = await resolveRunOutputPath(options.outputPath);
  const args = buildRunArgs({
    ...options,
    outputPath: resolvedOutputPath
  });

  setStatus({
    phase: getReadyPhase(),
    message: "워터마크 제거를 처리하는 중...",
    taskState: "processing",
    progress: 0,
    currentPath: options.inputPath,
    lastOutputPath: null,
    error: null
  });

  let stdoutRemainder = "";
  let stderrRemainder = "";
  let lastOutputPath: string | null = null;
  const processedOutputs = new Map<string, string>();
  cliStopRequested = false;

  let wasStopped = false;

  try {
    await new Promise<void>((resolve, reject) => {
      cliProcess = spawn(pythonExe, args, {
        cwd: repoDir,
        shell: false,
        windowsHide: true
      });

      const handleLine = (line: string): void => {
        appendLog(line);

        const progressMatch = line.match(/overall_progress:(\d+)%/i);
        if (progressMatch) {
          const progress = Number.parseInt(progressMatch[1] ?? "0", 10);
          const detailMatch = line.match(/input_path:(.+?), output_path:(.+?), overall_progress:(\d+)%/i);
          if (detailMatch) {
            const nextInputPath = detailMatch[1]?.trim() ?? currentStatus.currentPath ?? options.inputPath;
            const nextOutputPath = detailMatch[2]?.trim() ?? lastOutputPath;
            lastOutputPath = nextOutputPath || lastOutputPath;
            if (nextInputPath && nextOutputPath) {
              processedOutputs.set(nextInputPath, nextOutputPath);
            }
            setStatus({
              progress,
              currentPath: nextInputPath,
              lastOutputPath
            });
          } else {
            setStatus({ progress });
          }
        }
      };

      cliProcess.stdout?.on("data", (chunk) => {
        stdoutRemainder = appendStreamLines(chunk, stdoutRemainder, handleLine);
      });

      cliProcess.stderr?.on("data", (chunk) => {
        stderrRemainder = appendStreamLines(chunk, stderrRemainder, handleLine);
      });

      cliProcess.on("error", (error) => {
        cliProcess = null;
        reject(error);
      });

      cliProcess.on("close", (code) => {
        if (stdoutRemainder.trim()) {
          handleLine(stdoutRemainder.trim());
        }
        if (stderrRemainder.trim()) {
          handleLine(stderrRemainder.trim());
        }

        wasStopped = cliStopRequested;
        cliProcess = null;
        cliStopRequested = false;

        if (wasStopped) {
          resolve();
          return;
        }

        if (code !== 0) {
          reject(new Error(`MarkRemover exited with code ${code ?? "unknown"}`));
          return;
        }

        resolve();
      });
    });

    for (const [inputPath, outputPath] of processedOutputs.entries()) {
      await preserveOriginalAlpha(inputPath, outputPath).catch((error) => {
        appendLog(`알파 복원 실패: ${outputPath} (${error instanceof Error ? error.message : String(error)})`);
      });
    }

    if (processedOutputs.size === 0) {
      const finalOutputPath = await resolveFinalOutputPath(resolvedOutputPath, lastOutputPath);
      if (finalOutputPath) {
        await preserveOriginalAlpha(options.inputPath, finalOutputPath).catch((error) => {
          appendLog(`알파 복원 실패: ${finalOutputPath} (${error instanceof Error ? error.message : String(error)})`);
        });
      }
    }

    setStatus({
      phase: getReadyPhase(),
      message: wasStopped ? "워터마크 제거가 중지되었습니다." : "워터마크 제거가 완료되었습니다.",
      taskState: "idle",
      progress: wasStopped ? 0 : 100,
      lastOutputPath: await resolveFinalOutputPath(resolvedOutputPath, lastOutputPath),
      error: null
    });

    return {
      status: currentStatus,
      outputPath: currentStatus.lastOutputPath
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setStatus({
      phase: getReadyPhase(),
      message,
      taskState: "idle",
      error: message
    });
    throw error;
  }
}

export async function stopMarkRemoverTask(): Promise<MarkRemoverStatus> {
  if (!cliProcess || cliProcess.exitCode !== null || cliProcess.killed) {
    return currentStatus;
  }

  cliStopRequested = true;
  cliProcess.kill();
  await wait(500);
  cliProcess = null;

  setStatus({
    phase: getReadyPhase(),
    message: "AI 작업을 중지했습니다.",
    taskState: "idle",
    progress: 0,
    error: null
  });

  return currentStatus;
}

async function startMarkRemover(): Promise<void> {
  const { repoDir, pythonExe, pythonwExe, guiScript } = getRuntimePaths();

  if (appProcess && appProcess.exitCode === null && !appProcess.killed) {
    setStatus({
      phase: "ready",
      message: "AI 창이 이미 실행 중입니다.",
      installed: true,
      ready: true,
      running: true,
      managed: true,
      error: null
    });
    return;
  }

  const launcher = (await fs.pathExists(pythonwExe)) ? pythonwExe : pythonExe;
  setStatus({
    phase: "starting",
    message: "AI 창을 여는 중...",
    installed: true,
    ready: true,
    running: false,
    managed: true,
    error: null
  });

  appProcess = spawn(launcher, [guiScript], {
    cwd: repoDir,
    shell: false,
    windowsHide: true,
    stdio: "ignore"
  });

  appProcess.on("error", (error) => {
    setStatus({
      phase: "error",
      message: "AI 창 실행에 실패했습니다.",
      installed: detectInstalledSync(),
      ready: true,
      running: false,
      managed: false,
      error: error.message
    });
  });
  appProcess.on("close", (code) => {
    const wasRunning = currentStatus.running;
    appProcess = null;
    setStatus({
      phase: wasRunning ? "error" : currentStatus.phase,
      message: wasRunning ? "AI 창이 종료되었습니다." : currentStatus.message,
      installed: detectInstalledSync(),
      ready: detectInstalledSync(),
      running: false,
      managed: false,
      error: wasRunning ? `MarkRemover-AI exited with code ${code ?? "unknown"}` : currentStatus.error
    });
  });

  await wait(1800);
  if (!appProcess || appProcess.exitCode !== null || appProcess.killed) {
    throw new Error("AI 창이 실행 직후 종료되었습니다. 설치 로그를 확인해 주세요.");
  }

  setStatus({
    phase: "ready",
    message: "AI 창이 실행되었습니다.",
    installed: true,
    ready: true,
    running: true,
    managed: true,
    error: null
  });
}

export function getMarkRemoverStatus(): MarkRemoverStatus {
  return withRuntimePaths(currentStatus);
}

export async function ensureMarkRemoverInstalled(): Promise<MarkRemoverStatus> {
  if (detectInstalledSync()) {
    const { pythonExe } = getRuntimePaths();
    await repairMarkRemoverRuntime(pythonExe);
    await applyUiCustomizations();
    setStatus({
      phase: currentStatus.running ? currentStatus.phase : "idle",
      message: currentStatus.running ? currentStatus.message : "AI 도구 설치가 완료되었습니다.",
      installed: true,
      ready: true,
      running: currentStatus.running,
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
      message: "AI 도구 설치 상태를 확인하는 중...",
      installed: false,
      ready: false,
      running: false,
      managed: false,
      error: null
    });

    try {
      await ensureRepo();
      await installMarkRemover();
      setStatus({
        phase: "idle",
        message: "AI 도구 설치가 완료되었습니다.",
        installed: true,
        ready: true,
        running: false,
        managed: false,
        error: null
      });
      return currentStatus;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatus({
        phase: "error",
        message: "AI 도구 설치에 실패했습니다.",
        installed: detectInstalledSync(),
        ready: false,
        running: false,
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

export async function ensureMarkRemoverStarted(): Promise<MarkRemoverStatus> {
  if (startPromise) {
    return await startPromise;
  }

  startPromise = (async () => {
    try {
      await ensureMarkRemoverInstalled();
      await startMarkRemover();
      return currentStatus;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatus({
        phase: "error",
        message: "AI 창 실행 준비에 실패했습니다.",
        installed: detectInstalledSync(),
        ready: detectInstalledSync(),
        running: false,
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

export async function restartMarkRemover(): Promise<MarkRemoverStatus> {
  if (appProcess && appProcess.exitCode === null && !appProcess.killed) {
    appProcess.kill();
    await wait(1000);
  }

  appProcess = null;
  setStatus({
    phase: "idle",
    message: "AI 창을 다시 여는 중...",
    installed: detectInstalledSync(),
    ready: detectInstalledSync(),
    running: false,
    managed: false,
    error: null
  });

  return await ensureMarkRemoverStarted();
}

export async function shutdownMarkRemover(): Promise<void> {
  if (cliProcess && cliProcess.exitCode === null && !cliProcess.killed) {
    cliStopRequested = true;
    cliProcess.kill();
    await wait(300);
    cliProcess = null;
  }

  if (!appProcess || appProcess.exitCode !== null || appProcess.killed) {
    return;
  }

  appProcess.kill();
  await wait(500);
  appProcess = null;
}
