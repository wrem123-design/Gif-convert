import type { Clip, Project } from "@sprite-forge/core";

export type EditorTab = "sprite" | "pixel" | "export" | "bg_remove" | "pixel_helper" | "leshy_sprite" | "photo_editor";

export interface ExportSettings {
  exportMode: "sheet" | "sequence" | "gif";
  exportRoot: string;
  padding: number;
  allowRotate: boolean;
  frameScope: "all" | "selected";
}

export interface SpriteSheetSettings {
  mode: "grid" | "auto";
  cols: number;
  rows: number;
  alphaThreshold: number;
  mergeThreshold: number;
}

export interface ViewportSettings {
  zoom: number;
  panX: number;
  panY: number;
  onionPrev: number;
  onionNext: number;
  pivotMode: boolean;
  backgroundColor: string;
  imageAreaColor: string;
}

export interface SpriteAutoGifOptions {
  inputPath: string;
  outputDir?: string;
  delayMs: number;
  alphaThreshold: number;
  mergeThreshold: number;
  removeBackground: boolean;
  backgroundTolerance: number;
  exportGif?: boolean;
}

export interface SpriteAutoGifResult {
  clipId: string;
  clipName: string;
  frameCount: number;
  exportDir: string | null;
  gifPath: string | null;
}

export interface EditorStore {
  projectDir: string;
  project: Project | null;
  selectedClipId: string | null;
  selectedFrameIds: string[];
  activeFrameIndex: number;
  tab: EditorTab;
  playing: boolean;
  busy: boolean;
  status: string;
  undoStack: Project[];
  redoStack: Project[];
  imageCache: Record<string, string>;
  viewport: ViewportSettings;
  exportSettings: ExportSettings;
  spriteSheetSettings: SpriteSheetSettings;
  activeHelpTopic: string | null;
  fitViewToken: number;

  init: () => Promise<void>;
  loadProject: (projectDir: string) => Promise<void>;
  pickAndLoadProject: () => Promise<void>;
  pickAndImport: () => Promise<void>;
  pickAndImportMedia: () => Promise<void>;
  resetCurrentProject: () => Promise<void>;
  importPaths: (paths: string[]) => Promise<void>;
  updateClip: (clip: Clip, action: string, withUndo?: boolean) => Promise<void>;
  selectClip: (clipId: string) => void;
  selectFrame: (frameId: string, additive?: boolean) => void;
  setActiveFrameIndex: (index: number) => void;
  setActiveFrameIndexOnly: (index: number) => void;
  setTab: (tab: EditorTab) => void;
  setPlaying: (playing: boolean) => void;
  requestFitView: () => void;
  stepFrame: (direction: -1 | 1) => void;
  setViewport: (patch: Partial<ViewportSettings>) => void;
  shiftSelectedOffsets: (deltaX: number, deltaY: number) => Promise<void>;
  setPivotBottomCenter: () => Promise<void>;
  autoCenterMass: () => Promise<void>;
  smartBottomAlign: () => Promise<void>;
  reorderFrame: (fromIndex: number, toIndex: number) => Promise<void>;
  duplicateSelectedFrames: () => Promise<void>;
  deleteSelectedFrames: () => Promise<void>;
  setDelayForSelection: (delayMs: number) => Promise<void>;
  setLoopMode: (mode: "loop" | "once" | "pingpong" | "reverse") => Promise<void>;
  cropFramesToActiveFrameSize: () => Promise<void>;
  exportActiveClip: () => Promise<void>;
  exportActiveClipOneClick: () => Promise<void>;
  convertSpriteSheetToAutoGif: (options: SpriteAutoGifOptions) => Promise<SpriteAutoGifResult | null>;
  setExportSettings: (patch: Partial<ExportSettings>) => void;
  setSpriteSheetSettings: (patch: Partial<SpriteSheetSettings>) => void;
  setActiveHelpTopic: (topic: string | null) => void;
  getImageDataUrl: (filePath: string) => Promise<string>;
  writeImageDataUrl: (filePath: string, dataUrl: string) => Promise<void>;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
}
