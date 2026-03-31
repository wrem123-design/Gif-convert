import { contextBridge, ipcRenderer } from "electron";

const api = {
  pickProjectDir: (): Promise<string> => ipcRenderer.invoke("dialog:pickProjectDir"),
  pickImportPaths: (): Promise<string[]> => ipcRenderer.invoke("dialog:pickImportPaths"),
  pickMediaPaths: (): Promise<string[]> => ipcRenderer.invoke("dialog:pickMediaPaths"),
  pickSpriteSheetImagePath: (): Promise<string | null> => ipcRenderer.invoke("dialog:pickSpriteSheetImagePath"),
  pickExportRoot: (): Promise<string | null> => ipcRenderer.invoke("dialog:pickExportRoot"),
  pickBgRemoveImagePaths: (): Promise<string[]> => ipcRenderer.invoke("dialog:pickBgRemoveImagePaths"),
  pickBgRemoveFolders: (): Promise<string[]> => ipcRenderer.invoke("dialog:pickBgRemoveFolders"),
  pickBgRemoveOutputDir: (): Promise<string | null> => ipcRenderer.invoke("dialog:pickBgRemoveOutputDir"),
  pickSpriteMapSavePath: (defaultName: string): Promise<string | null> => ipcRenderer.invoke("dialog:pickSpriteMapSavePath", defaultName),
  pickLeshyAnimationSavePath: (defaultName: string): Promise<string | null> =>
    ipcRenderer.invoke("dialog:pickLeshyAnimationSavePath", defaultName),
  getDefaultProjectDir: (): Promise<string> => ipcRenderer.invoke("app:getDefaultProjectDir"),

  loadProject: (payload: { projectDir: string }) => ipcRenderer.invoke("project:load", payload),
  saveProject: (payload: { projectDir: string; project: unknown }) => ipcRenderer.invoke("project:save", payload),
  importSources: (payload: unknown) => ipcRenderer.invoke("project:import", payload),
  resetProject: (payload: { projectDir: string }) => ipcRenderer.invoke("project:reset", payload),
  updateClip: (payload: unknown) => ipcRenderer.invoke("project:updateClip", payload),
  applyAlignment: (payload: unknown) => ipcRenderer.invoke("project:align", payload),
  timelineAction: (payload: unknown) => ipcRenderer.invoke("project:timeline", payload),
  exportClip: (payload: unknown) => ipcRenderer.invoke("project:export", payload),
  pixelEdit: (payload: unknown) => ipcRenderer.invoke("project:pixelEdit", payload),
  collectBackgroundRemoveFiles: (payload: unknown) => ipcRenderer.invoke("tool:bgCollectFiles", payload),
  previewBackgroundRemoval: (payload: unknown) => ipcRenderer.invoke("tool:bgPreview", payload),
  runBackgroundRemoval: (payload: unknown) => ipcRenderer.invoke("tool:bgRemoveBatch", payload),
  convertSpriteSheetAutoGif: (payload: unknown) => ipcRenderer.invoke("tool:spriteSheetAutoGif", payload),
  extractSpriteMap: (payload: unknown) => ipcRenderer.invoke("tool:extractSpriteMap", payload),
  exportLeshyAnimation: (payload: unknown) => ipcRenderer.invoke("tool:exportLeshyAnimation", payload),
  onBgRemoveProgress: (
    callback: (progress: { total: number; done: number; processed: number; failed: number; currentPath: string }) => void
  ): (() => void) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      progress: { total: number; done: number; processed: number; failed: number; currentPath: string }
    ) => callback(progress);
    ipcRenderer.on("tool:bgRemoveProgress", listener);
    return () => ipcRenderer.removeListener("tool:bgRemoveProgress", listener);
  },

  readImageDataUrl: (filePath: string): Promise<string> => ipcRenderer.invoke("file:readImageDataUrl", filePath),
  writeImageDataUrl: (payload: { filePath: string; dataUrl: string }): Promise<boolean> =>
    ipcRenderer.invoke("file:writeImageDataUrl", payload),
  writeTextFile: (payload: { filePath: string; content: string }): Promise<boolean> =>
    ipcRenderer.invoke("file:writeTextFile", payload),

  onMenuOpenProjectDir: (callback: (projectDir: string) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, projectDir: string) => callback(projectDir);
    ipcRenderer.on("menu:openProjectDir", listener);
    return () => ipcRenderer.removeListener("menu:openProjectDir", listener);
  },

  onMenuImportPaths: (callback: (paths: string[]) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, paths: string[]) => callback(paths);
    ipcRenderer.on("menu:importPaths", listener);
    return () => ipcRenderer.removeListener("menu:importPaths", listener);
  },

  onMenuSetExportRoot: (callback: (exportRoot: string) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, exportRoot: string) => callback(exportRoot);
    ipcRenderer.on("menu:setExportRoot", listener);
    return () => ipcRenderer.removeListener("menu:setExportRoot", listener);
  }
};

contextBridge.exposeInMainWorld("spriteForge", api);

export type SpriteForgeApi = typeof api;
