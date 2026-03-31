import { app, BrowserWindow, Menu, WebContents, dialog, ipcMain } from "electron";
import path from "node:path";
import fs from "fs-extra";
import { Worker } from "node:worker_threads";
import os from "node:os";
import sharp from "sharp";
import {
  ensureIOPaintReady,
  getIOPaintStatus,
  restartIOPaint,
  shutdownIOPaint
} from "./iopaintManager";

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
const pending = new Map<
  string,
  {
    resolve: (value: unknown) => void;
    reject: (reason: unknown) => void;
    sender?: WebContents;
  }
>();

function ensureWorker(): Worker {
  if (worker) {
    return worker;
  }

  const workerPath = path.join(__dirname, "processorWorker.js");
  worker = new Worker(workerPath);

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

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1600,
    height: 980,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: "#1E1E1E",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  const devServer = process.env.VITE_DEV_SERVER_URL;
  if (devServer) {
    void win.loadURL(devServer);
  } else {
    void win.loadFile(path.join(__dirname, "../renderer/index.html"));
  }

  return win;
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

async function pickMediaPathsDialog(win: BrowserWindow): Promise<string[]> {
  const result = await dialog.showOpenDialog(win, {
    title: "Open GIF, Video, or Image Files",
    properties: ["openFile", "multiSelections"]
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

function inferImageMime(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".bmp") return "image/bmp";
  if (ext === ".gif") return "image/gif";
  if (ext === ".tif" || ext === ".tiff") return "image/tiff";
  return "image/png";
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

app.whenReady().then(async () => {
  const win = createWindow();
  createAppMenu(win);
  void ensureIOPaintReady().catch(() => {
    // Renderer reads the shared status stream and can surface the error.
  });

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
  ipcMain.handle("tool:bgPreview", async (_event, payload) => callWorker("tool:bgPreview", payload));
  ipcMain.handle("tool:bgRemoveBatch", async (event, payload) => callWorker("tool:bgRemoveBatch", payload, { sender: event.sender }));
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
  ipcMain.handle("iopaint:getStatus", async () => getIOPaintStatus());
  ipcMain.handle("iopaint:ensureStarted", async () => await ensureIOPaintReady());
  ipcMain.handle("iopaint:restart", async () => await restartIOPaint());

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      const nextWin = createWindow();
      createAppMenu(nextWin);
      void ensureIOPaintReady().catch(() => {
        // Renderer reads the shared status stream and can surface the error.
      });
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  void shutdownIOPaint();
});
