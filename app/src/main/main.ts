import { app, BrowserWindow, Menu, WebContents, dialog, ipcMain } from "electron";
import path from "node:path";
import fs from "fs-extra";
import { Worker } from "node:worker_threads";
import os from "node:os";
import sharp from "sharp";
import {
  diagnoseIOPaint,
  ensureIOPaintInstalled,
  ensureIOPaintReady,
  getIOPaintStatus,
  getIOPaintServerConfig,
  getCurrentIOPaintModel,
  reinstallIOPaint,
  restartIOPaint,
  runIOPaintInpaint,
  shutdownIOPaint,
  switchIOPaintModel
} from "./iopaintManager";
import {
  ensureMarkRemoverInstalled,
  getMarkRemoverStatus,
  previewMarkRemover,
  runMarkRemover,
  stopMarkRemoverTask,
  shutdownMarkRemover
} from "./markRemoverManager";

interface WorkerRequest {
  id: string;
  method: string;
  payload: unknown;
}

interface WorkerResponse {
  id: string;
  ok: boolean;
  result?: unknown;
  error?: string;
  progress?: {
    total: number;
    done: number;
    processed: number;
    failed: number;
    currentPath: string;
  };
}

let worker: Worker | null = null;
let mainWindow: BrowserWindow | null = null;
let isQuitting = false;
let shutdownPromise: Promise<void> | null = null;
let hasSingleInstanceLock = app.requestSingleInstanceLock();
const SHUTDOWN_TIMEOUT_MS = 3000;
const SINGLE_INSTANCE_RETRY_MS = 250;
const SINGLE_INSTANCE_TIMEOUT_MS = 10000;
const APP_SETTINGS_FILE = "settings.json";
const APP_ICON_RELATIVE_PATH = path.join("build", "icon.ico");
const pending = new Map<
  string,
  {
    resolve: (value: unknown) => void;
    reject: (reason: unknown) => void;
    sender?: WebContents;
  }
>();

interface AppSettings {
  launchMinimized: boolean;
}

const defaultAppSettings: AppSettings = {
  launchMinimized: false
};

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensureSingleInstanceLock(): Promise<boolean> {
  if (hasSingleInstanceLock) {
    return true;
  }

  const deadline = Date.now() + SINGLE_INSTANCE_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await delay(SINGLE_INSTANCE_RETRY_MS);
    if (app.requestSingleInstanceLock()) {
      hasSingleInstanceLock = true;
      return true;
    }
  }

  return false;
}

function resolveWorkerEntry(): string {
  const unpackedPath = path.join(process.resourcesPath, "app.asar.unpacked", "dist", "main", "processorWorkerBootstrap.js");
  if (app.isPackaged && fs.pathExistsSync(unpackedPath)) {
    return unpackedPath;
  }
  return path.join(__dirname, "processorWorkerBootstrap.js");
}

function resolveAppIconPath(): string | undefined {
  const packagedPath = path.join(process.resourcesPath, APP_ICON_RELATIVE_PATH);
  if (app.isPackaged && fs.pathExistsSync(packagedPath)) {
    return packagedPath;
  }
  const devPath = path.join(app.getAppPath(), APP_ICON_RELATIVE_PATH);
  if (fs.pathExistsSync(devPath)) {
    return devPath;
  }
  return undefined;
}

function getAppSettingsPath(): string {
  return path.join(app.getPath("userData"), APP_SETTINGS_FILE);
}

async function loadAppSettings(): Promise<AppSettings> {
  try {
    const raw = await fs.readJson(getAppSettingsPath());
    return {
      launchMinimized: typeof raw?.launchMinimized === "boolean"
        ? raw.launchMinimized
        : defaultAppSettings.launchMinimized
    };
  } catch {
    return { ...defaultAppSettings };
  }
}

async function saveAppSettings(nextSettings: AppSettings): Promise<AppSettings> {
  const sanitized: AppSettings = {
    launchMinimized: Boolean(nextSettings.launchMinimized)
  };
  await fs.ensureDir(path.dirname(getAppSettingsPath()));
  await fs.writeJson(getAppSettingsPath(), sanitized, { spaces: 2 });
  return sanitized;
}

function ensureWorker(): Worker {
  if (worker) {
    return worker;
  }

  worker = new Worker(resolveWorkerEntry(), {
    workerData: {
      appRoot: app.getAppPath()
    }
  });

  worker.on("message", (msg: WorkerResponse) => {
    const entry = pending.get(msg.id);
    if (!entry) {
      return;
    }
    if (msg.progress) {
      entry.sender?.send("tool:bgRemoveProgress", msg.progress);
      return;
    }
    pending.delete(msg.id);
    if (msg.ok) {
      entry.resolve(msg.result);
    } else {
      entry.reject(new Error(msg.error ?? "Worker error"));
    }
  });

  worker.on("error", (err) => {
    for (const request of pending.values()) {
      request.reject(err);
    }
    pending.clear();
    worker = null;
  });

  worker.on("exit", () => {
    worker = null;
  });

  return worker;
}

function callWorker<T = unknown>(
  method: string,
  payload: unknown,
  options?: { sender?: WebContents }
): Promise<T> {
  const instance = ensureWorker();
  const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (value: unknown) => void, reject, sender: options?.sender });
    const req: WorkerRequest = { id, method, payload };
    instance.postMessage(req);
  });
}

function enrichBgRemovePayload<T extends Record<string, unknown>>(payload: T): T & { managedRembgPythonCandidates: string[] } {
  const userDataPath = app.getPath("userData");
  return {
    ...payload,
    managedRembgPythonCandidates: [
      path.join(userDataPath, "iopaint", "python", "python.exe"),
      path.join(userDataPath, "MarkRemover-AI", "python", "python.exe")
    ]
  };
}

function createWindow(options?: { startMinimized?: boolean }): BrowserWindow {
  const startMinimized = options?.startMinimized ?? false;
  const win = new BrowserWindow({
    width: 1600,
    height: 980,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: "#1E1E1E",
    autoHideMenuBar: true,
    icon: resolveAppIconPath(),
    show: !startMinimized,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });
  mainWindow = win;

  const devServer = process.env.VITE_DEV_SERVER_URL;
  if (devServer) {
    void win.loadURL(devServer);
  } else {
    void win.loadFile(path.join(__dirname, "../renderer/index.html"));
  }

  if (startMinimized) {
    win.once("ready-to-show", () => {
      win.showInactive();
      win.minimize();
    });
  }

  win.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
    console.error("Renderer load failed:", { errorCode, errorDescription, validatedURL });
  });

  win.webContents.on("render-process-gone", (_event, details) => {
    console.error("Renderer process gone:", details);
  });

  win.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    if (level >= 2) {
      console.error("Renderer console:", { level, message, line, sourceId });
    }
  });

  win.setMenuBarVisibility(false);
  win.webContents.on("before-input-event", (_event, input) => {
    // Keep Ctrl/Cmd shortcuts working, but let Alt pass through to embedded editors.
    win.webContents.setIgnoreMenuShortcuts(!input.control && !input.meta);
  });

  win.on("close", (event) => {
    if (isQuitting) {
      return;
    }
    event.preventDefault();
    void requestAppExit(0);
  });

  win.on("closed", () => {
    if (mainWindow === win) {
      mainWindow = null;
    }
  });

  return win;
}

async function shutdownAppServices(): Promise<void> {
  if (shutdownPromise) {
    await shutdownPromise;
    return;
  }

  shutdownPromise = (async () => {
    const tasks: Promise<unknown>[] = [shutdownIOPaint(), shutdownMarkRemover()];

    if (worker) {
      const currentWorker = worker;
      worker = null;
      tasks.push(currentWorker.terminate().catch(() => undefined));
    }

    await Promise.race([
      Promise.allSettled(tasks),
      delay(SHUTDOWN_TIMEOUT_MS)
    ]);
  })();

  await shutdownPromise;
}

async function requestAppExit(exitCode = 0): Promise<void> {
  if (isQuitting) {
    return;
  }

  isQuitting = true;
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.destroy();
    }
  }
  await shutdownAppServices();
  app.exit(exitCode);
}

async function ensureDefaultProjectDir(): Promise<string> {
  const base = path.join(os.homedir(), "Documents", "SpriteForgeProject");
  await fs.ensureDir(base);
  return base;
}

async function pickProjectDirDialog(win: BrowserWindow): Promise<string | null> {
  const result = await dialog.showOpenDialog(win, {
    title: "Select Project Folder",
    properties: ["openDirectory", "createDirectory"]
  });

  if (result.canceled || !result.filePaths[0]) {
    return null;
  }

  return result.filePaths[0];
}

async function pickImportPathsDialog(win: BrowserWindow): Promise<string[]> {
  const result = await dialog.showOpenDialog(win, {
    title: "Import Source Files or Folder",
    properties: ["openFile", "openDirectory", "multiSelections"],
    filters: [
      { name: "Sprite Sources", extensions: ["gif", "mp4", "webm", "mov", "avi", "mkv", "wmv", "m4v", "flv", "mpg", "mpeg", "ts", "m2ts", "3gp", "3g2", "png", "webp"] },
      { name: "All Files", extensions: ["*"] }
    ]
  });

  return result.canceled ? [] : result.filePaths;
}

async function pickMediaPathsDialog(_win: BrowserWindow): Promise<string[]> {
  const result = await dialog.showOpenDialog({
    title: "Open GIF, Video, or Image Files",
    properties: ["openFile", "multiSelections"],
    filters: [
      { name: "Media Files", extensions: ["gif", "png", "jpg", "jpeg", "webp", "bmp", "tif", "tiff", "mp4", "webm", "mov", "avi", "mkv", "wmv", "m4v", "flv", "mpg", "mpeg", "ts", "m2ts", "3gp", "3g2"] },
      { name: "All Files", extensions: ["*"] }
    ]
  });

  return result.canceled ? [] : result.filePaths;
}

async function pickPhotoEditorPathsDialog(_win: BrowserWindow, multiple = true): Promise<string[]> {
  const result = await dialog.showOpenDialog({
    title: "Open Image or Document Files",
    properties: multiple ? ["openFile", "multiSelections"] : ["openFile"],
    filters: [
      { name: "Photo Editor Files", extensions: ["png", "jpg", "jpeg", "gif", "webp", "bmp", "tif", "tiff", "psd", "pdf", "bpy", "bpp"] },
      { name: "All Files", extensions: ["*"] }
    ]
  });

  return result.canceled ? [] : result.filePaths;
}

async function pickSpriteSheetImagePathDialog(win: BrowserWindow): Promise<string | null> {
  const result = await dialog.showOpenDialog(win, {
    title: "Open Sprite Sheet Image",
    properties: ["openFile"],
    filters: [
      { name: "Images", extensions: ["png", "webp", "jpg", "jpeg", "bmp", "tif", "tiff"] },
      { name: "All Files", extensions: ["*"] }
    ]
  });

  return result.canceled ? null : result.filePaths[0] ?? null;
}

async function pickExportRootDialog(win: BrowserWindow): Promise<string | null> {
  const result = await dialog.showOpenDialog(win, {
    title: "Select Export Root",
    properties: ["openDirectory", "createDirectory"]
  });

  return result.canceled ? null : result.filePaths[0];
}

async function pickBgRemoveImagePathsDialog(win: BrowserWindow): Promise<string[]> {
  const result = await dialog.showOpenDialog(win, {
    title: "Select Image Files for Background Removal",
    properties: ["openFile", "multiSelections"],
    filters: [
      { name: "Images", extensions: ["png", "jpg", "jpeg", "webp", "bmp", "tif", "tiff"] },
      { name: "All Files", extensions: ["*"] }
    ]
  });
  return result.canceled ? [] : result.filePaths;
}

async function pickBgRemoveFoldersDialog(win: BrowserWindow): Promise<string[]> {
  const result = await dialog.showOpenDialog(win, {
    title: "Select Folders for Background Removal",
    properties: ["openDirectory", "multiSelections"]
  });
  return result.canceled ? [] : result.filePaths;
}

async function pickBgRemoveOutputDirDialog(win: BrowserWindow): Promise<string | null> {
  const result = await dialog.showOpenDialog(win, {
    title: "Select Output Folder for Background Removal",
    properties: ["openDirectory", "createDirectory"]
  });
  return result.canceled ? null : result.filePaths[0];
}

async function pickSpriteMapSavePathDialog(win: BrowserWindow, defaultName: string): Promise<string | null> {
  const result = await dialog.showSaveDialog(win, {
    title: "Save Sprite Map",
    defaultPath: defaultName,
    filters: [
      { name: "Text Files", extensions: ["txt", "json"] },
      { name: "All Files", extensions: ["*"] }
    ]
  });
  return result.canceled ? null : result.filePath ?? null;
}

async function pickLeshyAnimationSavePathDialog(win: BrowserWindow, defaultName: string): Promise<string | null> {
  const result = await dialog.showSaveDialog(win, {
    title: "Export Leshy Animation",
    defaultPath: defaultName,
    filters: [
      { name: "GIF Animation", extensions: ["gif"] },
      { name: "All Files", extensions: ["*"] }
    ]
  });
  return result.canceled ? null : result.filePath ?? null;
}

async function pickMarkRemoverSavePathDialog(win: BrowserWindow, defaultName: string): Promise<string | null> {
  const result = await dialog.showSaveDialog(win, {
    title: "Save Cleaned Image",
    defaultPath: defaultName,
    filters: [
      { name: "PNG Image", extensions: ["png"] },
      { name: "JPEG Image", extensions: ["jpg", "jpeg"] },
      { name: "WEBP Image", extensions: ["webp"] },
      { name: "Bitmap Image", extensions: ["bmp"] },
      { name: "TIFF Image", extensions: ["tif", "tiff"] },
      { name: "All Files", extensions: ["*"] }
    ]
  });
  return result.canceled ? null : result.filePath ?? null;
}

function inferImageMime(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".bmp") return "image/bmp";
  if (ext === ".gif") return "image/gif";
  if (ext === ".tif" || ext === ".tiff") return "image/tiff";
  return "image/png";
}

function inferFileMime(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".pdf") return "application/pdf";
  if (ext === ".psd") return "image/vnd.adobe.photoshop";
  if (ext === ".bpy") return "application/octet-stream";
  if (isStillImagePath(filePath) || ext === ".gif") {
    return inferImageMime(filePath);
  }
  return "application/octet-stream";
}

function isStillImagePath(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return [".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tif", ".tiff"].includes(ext);
}

function createAppMenu(win: BrowserWindow): void {
  const menu = Menu.buildFromTemplate([
    {
      label: "File",
      submenu: [
        {
          label: "Open Project Folder...",
          accelerator: "Ctrl+O",
          click: async () => {
            const selected = await pickProjectDirDialog(win);
            if (selected) {
              win.webContents.send("menu:openProjectDir", selected);
            }
          }
        },
        {
          label: "Import Files or Folder...",
          accelerator: "Ctrl+I",
          click: async () => {
            const paths = await pickImportPathsDialog(win);
            if (paths.length) {
              win.webContents.send("menu:importPaths", paths);
            }
          }
        },
        {
          label: "Set Export Root...",
          accelerator: "Ctrl+E",
          click: async () => {
            const exportRoot = await pickExportRootDialog(win);
            if (exportRoot) {
              win.webContents.send("menu:setExportRoot", exportRoot);
            }
          }
        },
        { type: "separator" },
        { role: "quit", label: "Exit" }
      ]
    },
    { role: "editMenu" },
    { role: "viewMenu" },
    { role: "windowMenu" },
    { role: "help" }
  ]);

  Menu.setApplicationMenu(menu);
}

app.on("second-instance", () => {
  const win = mainWindow ?? BrowserWindow.getAllWindows()[0] ?? null;
  if (win && !win.isDestroyed()) {
    if (win.isMinimized()) {
      win.restore();
    }
    win.focus();
  }

  if (!isQuitting) {
    void requestAppExit(0);
  }
});

app.whenReady().then(async () => {
  const lockAcquired = await ensureSingleInstanceLock();
  if (!lockAcquired) {
    app.exit(0);
    return;
  }

  const appSettings = await loadAppSettings();
  const win = createWindow({ startMinimized: appSettings.launchMinimized });
  createAppMenu(win);

  ipcMain.handle("dialog:pickProjectDir", async () => {
    const selected = await pickProjectDirDialog(win);
    if (!selected) {
      return await ensureDefaultProjectDir();
    }
    return selected;
  });

  ipcMain.handle("dialog:pickImportPaths", async () => {
    return await pickImportPathsDialog(win);
  });

  ipcMain.handle("dialog:pickMediaPaths", async () => {
    return await pickMediaPathsDialog(win);
  });

  ipcMain.handle("dialog:pickPhotoEditorPaths", async (_event, multiple?: boolean) => {
    return await pickPhotoEditorPathsDialog(win, multiple !== false);
  });

  ipcMain.handle("dialog:pickSpriteSheetImagePath", async () => {
    return await pickSpriteSheetImagePathDialog(win);
  });

  ipcMain.handle("dialog:pickExportRoot", async () => {
    return await pickExportRootDialog(win);
  });

  ipcMain.handle("dialog:pickBgRemoveImagePaths", async () => {
    return await pickBgRemoveImagePathsDialog(win);
  });

  ipcMain.handle("dialog:pickBgRemoveFolders", async () => {
    return await pickBgRemoveFoldersDialog(win);
  });

  ipcMain.handle("dialog:pickBgRemoveOutputDir", async () => {
    return await pickBgRemoveOutputDirDialog(win);
  });

  ipcMain.handle("dialog:pickSpriteMapSavePath", async (_event, defaultName: string) => {
    return await pickSpriteMapSavePathDialog(win, defaultName);
  });

  ipcMain.handle("dialog:pickLeshyAnimationSavePath", async (_event, defaultName: string) => {
    return await pickLeshyAnimationSavePathDialog(win, defaultName);
  });

  ipcMain.handle("dialog:pickMarkRemoverSavePath", async (_event, defaultName: string) => {
    return await pickMarkRemoverSavePathDialog(win, defaultName);
  });

  ipcMain.handle("project:load", async (_event, payload) => callWorker("project:load", payload));
  ipcMain.handle("project:save", async (_event, payload) => callWorker("project:save", payload));
  ipcMain.handle("project:import", async (_event, payload) => callWorker("project:import", payload));
  ipcMain.handle("project:reset", async (_event, payload) => callWorker("project:reset", payload));
  ipcMain.handle("project:updateClip", async (_event, payload) => callWorker("project:updateClip", payload));
  ipcMain.handle("project:align", async (_event, payload) => callWorker("project:align", payload));
  ipcMain.handle("project:timeline", async (_event, payload) => callWorker("project:timeline", payload));
  ipcMain.handle("project:export", async (_event, payload) => callWorker("project:export", payload));
  ipcMain.handle("project:pixelEdit", async (_event, payload) => callWorker("project:pixelEdit", payload));
  ipcMain.handle("tool:bgCollectFiles", async (_event, payload) => callWorker("tool:bgCollectFiles", payload));
  ipcMain.handle("tool:bgPreview", async (_event, payload) =>
    callWorker("tool:bgPreview", enrichBgRemovePayload(payload as Record<string, unknown>))
  );
  ipcMain.handle("tool:bgRemoveBatch", async (event, payload) =>
    callWorker("tool:bgRemoveBatch", enrichBgRemovePayload(payload as Record<string, unknown>), { sender: event.sender })
  );
  ipcMain.handle("tool:spriteSheetAutoGif", async (_event, payload) => callWorker("tool:spriteSheetAutoGif", payload));
  ipcMain.handle("tool:extractSpriteMap", async (_event, payload) => callWorker("tool:extractSpriteMap", payload));
  ipcMain.handle("tool:exportLeshyAnimation", async (_event, payload) => callWorker("tool:exportLeshyAnimation", payload));

  ipcMain.handle("file:readImageDataUrl", async (_event, filePath: string) => {
    if (isStillImagePath(filePath)) {
      const normalized = await sharp(filePath)
        .rotate()
        .ensureAlpha()
        .png()
        .toBuffer();
      return `data:image/png;base64,${normalized.toString("base64")}`;
    }

    const data = await fs.readFile(filePath);
    return `data:${inferImageMime(filePath)};base64,${data.toString("base64")}`;
  });

  ipcMain.handle("file:readBinaryFile", async (_event, filePath: string) => {
    const data = await fs.readFile(filePath);
    return {
      name: path.basename(filePath),
      mimeType: inferFileMime(filePath),
      dataBase64: data.toString("base64")
    };
  });

  ipcMain.handle("file:writeImageDataUrl", async (_event, payload: { filePath: string; dataUrl: string }) => {
    const base64 = payload.dataUrl.split(",")[1];
    if (!base64) {
      throw new Error("Invalid data URL");
    }
    await fs.writeFile(payload.filePath, Buffer.from(base64, "base64"));
    return true;
  });

  ipcMain.handle("file:writeTextFile", async (_event, payload: { filePath: string; content: string }) => {
    await fs.writeFile(payload.filePath, payload.content, "utf8");
    return true;
  });

  ipcMain.handle("app:getDefaultProjectDir", async () => ensureDefaultProjectDir());
  ipcMain.handle("app:getSettings", async () => await loadAppSettings());
  ipcMain.handle("app:updateSettings", async (_event, payload: Partial<AppSettings>) => {
    const current = await loadAppSettings();
    return await saveAppSettings({
      ...current,
      ...payload
    });
  });
  ipcMain.handle("iopaint:getStatus", async () => getIOPaintStatus());
  ipcMain.handle("iopaint:ensureInstalled", async () => await ensureIOPaintInstalled());
  ipcMain.handle("iopaint:ensureStarted", async () => await ensureIOPaintReady());
  ipcMain.handle("iopaint:restart", async () => await restartIOPaint());
  ipcMain.handle("iopaint:diagnose", async () => await diagnoseIOPaint());
  ipcMain.handle("iopaint:reinstall", async () => await reinstallIOPaint());
  ipcMain.handle("iopaint:getServerConfig", async () => await getIOPaintServerConfig());
  ipcMain.handle("iopaint:getCurrentModel", async () => await getCurrentIOPaintModel());
  ipcMain.handle("iopaint:switchModel", async (_event, name: string) => await switchIOPaintModel(name));
  ipcMain.handle("iopaint:inpaint", async (_event, payload) => await runIOPaintInpaint(payload));
  ipcMain.handle("markremover:getStatus", async () => getMarkRemoverStatus());
  ipcMain.handle("markremover:ensureInstalled", async () => await ensureMarkRemoverInstalled());
  ipcMain.handle("markremover:preview", async (_event, payload) => await previewMarkRemover(payload));
  ipcMain.handle("markremover:run", async (_event, payload) => await runMarkRemover(payload));
  ipcMain.handle("markremover:stop", async () => await stopMarkRemoverTask());

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      const nextWin = createWindow();
      createAppMenu(nextWin);
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin" && !isQuitting) {
    void requestAppExit(0);
  }
});

app.on("before-quit", (event) => {
  if (isQuitting) {
    return;
  }
  event.preventDefault();
  void requestAppExit(0);
});
