export type SourceType = "gif" | "video" | "png_sequence" | "sprite_sheet" | "webp";

export interface SourceRef {
  type: SourceType;
  paths: string[];
}

export interface ChromaKeySettings {
  enabled: boolean;
  keyColor: `#${string}`;
  tolerance: number;
  despill: number;
}

export interface AdjustmentSettings {
  brightness: number;
  contrast: number;
  saturation: number;
  hue: number;
  pixelPerfectScaling: boolean;
  flipH: boolean;
}

export interface TrimPadSettings {
  mode: "none" | "trim" | "pad";
  padTo: "maxBounds" | "canvas";
  alphaThreshold: number;
}

export interface ClipInspector {
  chromaKey?: ChromaKeySettings;
  adjustments?: AdjustmentSettings;
  trimPad?: TrimPadSettings;
}

export interface FrameCrop {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Frame {
  id: string;
  srcPath: string;
  delayMs: number;
  offsetPx: { x: number; y: number };
  pivotNorm: { x: number; y: number };
  scale?: { x: number; y: number };
  crop?: FrameCrop;
}

export interface UnityOptions {
  ppu: number;
  filterMode: "Point" | "Bilinear";
  maxTextureSize: 2048 | 4096;
  spriteModeDefault: "Single" | "Sheet" | "Sequence";
  createPrefab: boolean;
  prefabRenderer: "SpriteRenderer" | "UI";
}

export interface Preset {
  id: string;
  name: string;
  unity: UnityOptions;
  inspector: ClipInspector;
  packing: { padding: number; allowRotate: boolean };
}

export interface Clip {
  id: string;
  name: string;
  source: SourceRef;
  canvas: { width: number; height: number; background: "transparent" };
  loopMode: "loop" | "once" | "pingpong" | "reverse";
  frames: Frame[];
  inspector: ClipInspector;
  unity: UnityOptions;
}

export interface Project {
  version: "1.0";
  createdAt: string;
  updatedAt: string;
  presets: Preset[];
  clips: Clip[];
}

export interface ProjectPaths {
  projectDir: string;
  rootDir: string;
  cacheDir: string;
  projectFile: string;
}

export interface SpriteSheetSliceOptions {
  mode: "grid" | "auto";
  cols?: number;
  rows?: number;
  alphaThreshold?: number;
  mergeThreshold?: number;
}

export interface ImportOptions {
  projectDir: string;
  paths: string[];
  sourceType?: SourceType;
  spriteSheet?: SpriteSheetSliceOptions;
}

export interface ExportOptions {
  projectDir: string;
  exportRoot: string;
  clipId: string;
  exportMode: "sheet" | "sequence" | "gif";
  padding: number;
  allowRotate: boolean;
  frameIds?: string[];
}

export interface PackedRect {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PackedSheet {
  width: number;
  height: number;
  rects: PackedRect[];
}

export interface SheetFrameMeta {
  index: number;
  name: string;
  delayMs: number;
  pivotNorm: { x: number; y: number };
  offsetPx: { x: number; y: number };
  rect?: { x: number; y: number; w: number; h: number };
}

export interface ExportMeta {
  toolVersion: string;
  clipName: string;
  exportMode: "sheet" | "sequence";
  sheet?: { width: number; height: number; maxTextureSize: number; padding: number };
  frames: SheetFrameMeta[];
  unity: {
    ppu: number;
    filterMode: "Point" | "Bilinear";
    spriteModeDefault: "Single" | "Sheet" | "Sequence";
    loopMode: Clip["loopMode"];
    createPrefab: boolean;
    prefabRenderer: "SpriteRenderer" | "UI";
  };
}

export const defaultUnityOptions: UnityOptions = {
  ppu: 2728,
  filterMode: "Bilinear",
  maxTextureSize: 2048,
  spriteModeDefault: "Single",
  createPrefab: false,
  prefabRenderer: "SpriteRenderer"
};

export const defaultInspector: ClipInspector = {
  chromaKey: {
    enabled: false,
    keyColor: "#00ff00",
    tolerance: 0.18,
    despill: 0.3
  },
  adjustments: {
    brightness: 1,
    contrast: 1,
    saturation: 1,
    hue: 0,
    pixelPerfectScaling: true,
    flipH: false
  },
  trimPad: {
    mode: "none",
    padTo: "maxBounds",
    alphaThreshold: 0.03
  }
};
