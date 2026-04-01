import { parentPort } from "node:worker_threads";
import fs from "fs-extra";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import sharp from "sharp";
import {
  Clip,
  ExportOptions,
  Frame,
  Project,
  autoCenterMass,
  createId,
  defaultInspector,
  defaultUnityOptions,
  exportClip,
  importSourceToClip,
  loadProject,
  resolveProjectPaths,
  saveProject,
  smartBottomAlign
} from "@sprite-forge/core";

interface RequestMessage {
  id: string;
  method: string;
  payload: any;
}

interface SpriteMapEntry {
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  ignore: boolean;
}

function assertPort() {
  if (!parentPort) {
    throw new Error("Worker has no parent port");
  }
  return parentPort;
}

async function withProject<T>(projectDir: string, fn: (project: Project) => Promise<T>): Promise<{ project: Project; data: T }> {
  const project = await loadProject(projectDir);
  const data = await fn(project);
  await saveProject(projectDir, project);
  return { project, data };
}

function findClip(project: Project, clipId: string): Clip {
  const clip = project.clips.find((c) => c.id === clipId);
  if (!clip) {
    throw new Error(`Clip ${clipId} not found`);
  }
  return clip;
}

async function handleLoad(payload: { projectDir: string }) {
  const project = await loadProject(payload.projectDir);
  return { project };
}

async function handleSave(payload: { projectDir: string; project: Project }) {
  await saveProject(payload.projectDir, payload.project);
  const project = await loadProject(payload.projectDir);
  return { project };
}

async function handleImport(payload: {
  projectDir: string;
  paths: string[];
  sourceType?: "gif" | "video" | "png_sequence" | "sprite_sheet" | "webp";
  spriteSheet?: { mode: "grid" | "auto"; cols?: number; rows?: number; alphaThreshold?: number; mergeThreshold?: number };
}) {
  const { project } = await withProject(payload.projectDir, async (project) => {
    const clip = await importSourceToClip({
      projectDir: payload.projectDir,
      paths: payload.paths,
      sourceType: payload.sourceType,
      spriteSheet: payload.spriteSheet
    });

    project.clips.push(clip);
  });

  return { project };
}

async function handleReset(payload: { projectDir: string }) {
  const paths = resolveProjectPaths(payload.projectDir);
  await fs.remove(paths.cacheDir);
  await fs.ensureDir(paths.cacheDir);

  const { project } = await withProject(payload.projectDir, async (project) => {
    project.clips = [];
  });

  return { project };
}

async function handleUpdateClip(payload: { projectDir: string; clip: Clip }) {
  const { project } = await withProject(payload.projectDir, async (project) => {
    const index = project.clips.findIndex((c) => c.id === payload.clip.id);
    if (index < 0) {
      throw new Error("Clip not found");
    }
    project.clips[index] = payload.clip;
  });

  return { project };
}

async function handleAlignment(payload: {
  projectDir: string;
  clipId: string;
  mode: "autoCenter" | "smartBottom" | "setBottomCenterPivot";
  frameIds?: string[];
}) {
  const { project } = await withProject(payload.projectDir, async (project) => {
    const clip = findClip(project, payload.clipId);
    const targetIds = new Set(payload.frameIds && payload.frameIds.length ? payload.frameIds : clip.frames.map((f) => f.id));

    if (payload.mode === "setBottomCenterPivot") {
      clip.frames = clip.frames.map((frame) =>
        targetIds.has(frame.id)
          ? {
              ...frame,
              pivotNorm: { x: 0.5, y: 0 }
            }
          : frame
      );
      return;
    }

    if (payload.mode === "autoCenter") {
      const deltas = await autoCenterMass(clip);
      const byId = new Map(deltas.map((d) => [d.frameId, d]));
      clip.frames = clip.frames.map((frame) => {
        if (!targetIds.has(frame.id)) {
          return frame;
        }
        const delta = byId.get(frame.id);
        if (!delta) {
          return frame;
        }
        return {
          ...frame,
          offsetPx: {
            x: frame.offsetPx.x + delta.deltaX,
            y: frame.offsetPx.y + delta.deltaY
          }
        };
      });
      return;
    }

    if (payload.mode === "smartBottom") {
      const deltas = await smartBottomAlign(clip);
      const byId = new Map(deltas.map((d) => [d.frameId, d]));
      clip.frames = clip.frames.map((frame) => {
        if (!targetIds.has(frame.id)) {
          return frame;
        }
        const delta = byId.get(frame.id);
        if (!delta) {
          return frame;
        }
        return {
          ...frame,
          offsetPx: {
            x: frame.offsetPx.x,
            y: frame.offsetPx.y + delta.deltaY
          }
        };
      });
    }
  });

  return { project };
}

function cloneFrame(frame: Frame): Frame {
  return {
    ...frame,
    id: createId("frame"),
    offsetPx: { ...frame.offsetPx },
    pivotNorm: { ...frame.pivotNorm },
    scale: frame.scale ? { ...frame.scale } : undefined,
    crop: frame.crop ? { ...frame.crop } : undefined
  };
}

async function fitFrameToTargetSize(framePath: string, targetWidth: number, targetHeight: number): Promise<void> {
  const img = sharp(framePath).ensureAlpha();
  const metadata = await img.metadata();
  const srcWidth = metadata.width ?? 1;
  const srcHeight = metadata.height ?? 1;

  if (srcWidth === targetWidth && srcHeight === targetHeight) {
    return;
  }

  const src = new Uint8Array(await img.raw().toBuffer());
  const out = new Uint8Array(targetWidth * targetHeight * 4);

  const srcStartX = Math.max(0, Math.floor((srcWidth - targetWidth) / 2));
  const srcStartY = Math.max(0, Math.floor((srcHeight - targetHeight) / 2));
  const dstStartX = Math.max(0, Math.floor((targetWidth - srcWidth) / 2));
  const dstStartY = Math.max(0, Math.floor((targetHeight - srcHeight) / 2));
  const copyWidth = Math.min(srcWidth, targetWidth);
  const copyHeight = Math.min(srcHeight, targetHeight);

  for (let y = 0; y < copyHeight; y += 1) {
    for (let x = 0; x < copyWidth; x += 1) {
      const sx = srcStartX + x;
      const sy = srcStartY + y;
      const dx = dstStartX + x;
      const dy = dstStartY + y;
      const srcI = (sy * srcWidth + sx) * 4;
      const dstI = (dy * targetWidth + dx) * 4;
      out[dstI] = src[srcI];
      out[dstI + 1] = src[srcI + 1];
      out[dstI + 2] = src[srcI + 2];
      out[dstI + 3] = src[srcI + 3];
    }
  }

  await sharp(Buffer.from(out), {
    raw: {
      width: targetWidth,
      height: targetHeight,
      channels: 4
    }
  }).png().toFile(framePath);
}

async function handleTimeline(payload: {
  projectDir: string;
  clipId: string;
  action:
    | { type: "reorder"; fromIndex: number; toIndex: number }
    | { type: "duplicate"; frameIds: string[] }
    | { type: "delete"; frameIds: string[] }
    | { type: "setDelay"; frameIds: string[]; delayMs: number }
    | { type: "setLoopMode"; loopMode: "loop" | "once" | "pingpong" | "reverse" }
    | { type: "matchSizeToFrame"; baseFrameId: string };
}) {
  const action = payload.action;
  const { project } = await withProject(payload.projectDir, async (project) => {
    const clip = findClip(project, payload.clipId);

    if (action.type === "reorder") {
      const frames = [...clip.frames];
      const [moved] = frames.splice(action.fromIndex, 1);
      if (moved) {
        frames.splice(action.toIndex, 0, moved);
      }
      clip.frames = frames;
      return;
    }

    if (action.type === "duplicate") {
      const selected = new Set(action.frameIds);
      const frames: Frame[] = [];
      for (const frame of clip.frames) {
        frames.push(frame);
        if (selected.has(frame.id)) {
          frames.push(cloneFrame(frame));
        }
      }
      clip.frames = frames;
      return;
    }

    if (action.type === "delete") {
      const selected = new Set(action.frameIds);
      clip.frames = clip.frames.filter((f) => !selected.has(f.id));
      return;
    }

    if (action.type === "setDelay") {
      const selected = new Set(action.frameIds);
      const delayMs = Math.max(10, Math.round(action.delayMs));
      clip.frames = clip.frames.map((frame) =>
        selected.has(frame.id)
          ? {
              ...frame,
              delayMs
            }
          : frame
      );
      return;
    }

    if (action.type === "setLoopMode") {
      clip.loopMode = action.loopMode;
      return;
    }

    if (action.type === "matchSizeToFrame") {
      const base = clip.frames.find((f) => f.id === action.baseFrameId);
      if (!base) {
        throw new Error("기준 프레임을 찾지 못했습니다.");
      }
      const baseMeta = await sharp(base.srcPath).metadata();
      const targetWidth = Math.max(1, baseMeta.width ?? 1);
      const targetHeight = Math.max(1, baseMeta.height ?? 1);

      for (const frame of clip.frames) {
        if (frame.id === base.id) {
          continue;
        }
        await fitFrameToTargetSize(frame.srcPath, targetWidth, targetHeight);
      }
    }
  });

  return { project };
}

async function handleExport(payload: ExportOptions) {
  const project = await loadProject(payload.projectDir);
  const result = await exportClip(project, payload);
  return result;
}

async function handlePixelEdit(payload: {
  projectDir: string;
  clipId: string;
  frameId: string;
  operation: "fillAlpha";
  alpha: number;
}) {
  const { project } = await withProject(payload.projectDir, async (project) => {
    const clip = findClip(project, payload.clipId);
    const frame = clip.frames.find((f) => f.id === payload.frameId);
    if (!frame) {
      throw new Error("Frame not found");
    }

    if (payload.operation === "fillAlpha") {
      const img = sharp(frame.srcPath).ensureAlpha();
      const metadata = await img.metadata();
      const width = metadata.width ?? 1;
      const height = metadata.height ?? 1;
      const raw = new Uint8Array(await img.raw().toBuffer());
      const a = Math.max(0, Math.min(255, payload.alpha));
      for (let i = 0; i < raw.length; i += 4) {
        raw[i + 3] = a;
      }
      await sharp(Buffer.from(raw), { raw: { width, height, channels: 4 } }).png().toFile(frame.srcPath);
    }
  });

  return { project };
}

interface BgRemoveResizeOptions {
  enabled: boolean;
  width?: number;
  height?: number;
  keepAspect?: boolean;
}

type BgRemoveMode = "auto" | "ai" | "solid";

interface BgRemovePayload {
  inputPaths: string[];
  outputDir: string;
  flipHorizontal?: boolean;
  resize?: BgRemoveResizeOptions;
  enhanceEdges?: boolean;
  mode?: BgRemoveMode;
  backgroundTolerance?: number;
  managedRembgPythonCandidates?: string[];
}

interface BgRemoveFailure {
  inputPath: string;
  error: string;
}

interface BgRemoveProgressPayload {
  total: number;
  done: number;
  processed: number;
  failed: number;
  currentPath: string;
}

interface SolidBackgroundAnalysis {
  key: { r: number; g: number; b: number };
  matchedRatio: number;
  avgDistance: number;
  tolerance: number;
}

const supportedImageExtensions = new Set([".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tif", ".tiff"]);

function isImagePath(filePath: string): boolean {
  return supportedImageExtensions.has(path.extname(filePath).toLowerCase());
}

async function collectImageFiles(inputPath: string): Promise<string[]> {
  const stat = await fs.stat(inputPath).catch(() => null);
  if (!stat) {
    return [];
  }

  if (stat.isDirectory()) {
    const entries = await fs.readdir(inputPath);
    const result: string[] = [];
    for (const entry of entries) {
      const childPath = path.join(inputPath, entry);
      result.push(...await collectImageFiles(childPath));
    }
    return result;
  }

  if (stat.isFile() && isImagePath(inputPath)) {
    return [inputPath];
  }

  return [];
}

async function runCommand(command: string, args: string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      shell: false,
      windowsHide: true
    });

    let stderr = "";
    child.stderr.on("data", (data: Buffer | string) => {
      stderr += data.toString();
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

function dilateMask(mask: Uint8Array, width: number, height: number, radius: number): Uint8Array {
  if (radius <= 0) {
    return mask;
  }
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let filled = false;
      for (let dy = -radius; dy <= radius && !filled; dy += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
            continue;
          }
          if (mask[ny * width + nx]) {
            filled = true;
            break;
          }
        }
      }
      out[y * width + x] = filled ? 1 : 0;
    }
  }
  return out;
}

function connectedComponents(mask: Uint8Array, width: number, height: number): Array<{ x: number; y: number; w: number; h: number }> {
  const visited = new Uint8Array(mask.length);
  const regions: Array<{ x: number; y: number; w: number; h: number }> = [];
  const queueX = new Int32Array(mask.length);
  const queueY = new Int32Array(mask.length);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = y * width + x;
      if (!mask[idx] || visited[idx]) {
        continue;
      }

      let head = 0;
      let tail = 0;
      queueX[tail] = x;
      queueY[tail] = y;
      tail += 1;
      visited[idx] = 1;

      let minX = x;
      let minY = y;
      let maxX = x;
      let maxY = y;

      while (head < tail) {
        const cx = queueX[head];
        const cy = queueY[head];
        head += 1;

        const neighbors = [
          [cx - 1, cy],
          [cx + 1, cy],
          [cx, cy - 1],
          [cx, cy + 1],
          [cx - 1, cy - 1],
          [cx + 1, cy - 1],
          [cx - 1, cy + 1],
          [cx + 1, cy + 1]
        ] as const;

        for (const [nx, ny] of neighbors) {
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
            continue;
          }
          const neighborIndex = ny * width + nx;
          if (!mask[neighborIndex] || visited[neighborIndex]) {
            continue;
          }
          visited[neighborIndex] = 1;
          queueX[tail] = nx;
          queueY[tail] = ny;
          tail += 1;

          minX = Math.min(minX, nx);
          minY = Math.min(minY, ny);
          maxX = Math.max(maxX, nx);
          maxY = Math.max(maxY, ny);
        }
      }

      regions.push({ x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 });
    }
  }

  return regions;
}

function getManagedRembgPythonCandidates(payloadCandidates?: string[]): string[] {
  const envAppDataRoot = process.env.APPDATA ? path.join(process.env.APPDATA, "sprite-forge-app") : "";
  const envCandidates = envAppDataRoot
    ? [
        path.join(envAppDataRoot, "iopaint", "python", "python.exe"),
        path.join(envAppDataRoot, "MarkRemover-AI", "python", "python.exe")
      ]
    : [];

  return [...new Set([...(payloadCandidates ?? []), ...envCandidates].filter(Boolean))];
}

function buildManagedPythonRembgArgs(inputPath: string, outputPath: string, enhanceEdges: boolean): string[] {
  const script = [
    "from pathlib import Path",
    "import sys",
    "from rembg import remove",
    "src = Path(sys.argv[1])",
    "dst = Path(sys.argv[2])",
    "data = src.read_bytes()",
    enhanceEdges
      ? "result = remove(data, alpha_matting=True, alpha_matting_erode_size=15)"
      : "result = remove(data)",
    "dst.write_bytes(result)"
  ].join("; ");

  return ["-c", script, inputPath, outputPath];
}

async function runRembg(
  inputPath: string,
  outputPath: string,
  enhanceEdges: boolean,
  managedPythonCandidates?: string[]
): Promise<void> {
  const rembgArgs = enhanceEdges
    ? ["i", "-a", "-ae", "15", inputPath, outputPath]
    : ["i", inputPath, outputPath];

  const rembgFallbackArgs = ["i", inputPath, outputPath];
  const candidates: Array<{ command: string; args: string[] }> = [];
  const resolvedManagedPythonCandidates = getManagedRembgPythonCandidates(managedPythonCandidates);

  const directCandidates = process.platform === "win32"
    ? [
      path.join(process.env.LOCALAPPDATA ?? "", "Programs", "Python", "Python311", "Scripts", "rembg.exe"),
      path.join(process.env.LOCALAPPDATA ?? "", "Programs", "Python", "Python312", "Scripts", "rembg.exe"),
      path.join(process.env.LOCALAPPDATA ?? "", "Programs", "Python", "Python310", "Scripts", "rembg.exe"),
      path.join(process.env.APPDATA ?? "", "Python", "Python311", "Scripts", "rembg.exe"),
      path.join(process.env.APPDATA ?? "", "Python", "Python312", "Scripts", "rembg.exe"),
      path.join(process.env.APPDATA ?? "", "Python", "Python310", "Scripts", "rembg.exe")
    ]
    : [];

  for (const command of directCandidates) {
    if (command && await fs.pathExists(command)) {
      candidates.push({ command, args: rembgArgs });
      if (enhanceEdges) {
      candidates.push({ command, args: rembgFallbackArgs });
      }
    }
  }

  for (const pythonExe of resolvedManagedPythonCandidates) {
    if (pythonExe && await fs.pathExists(pythonExe)) {
      candidates.push({ command: pythonExe, args: buildManagedPythonRembgArgs(inputPath, outputPath, enhanceEdges) });
    }
  }

  candidates.push({ command: "rembg", args: rembgArgs });
  if (enhanceEdges) {
    candidates.push({ command: "rembg", args: rembgFallbackArgs });
  }

  let lastError: unknown = null;
  for (const candidate of candidates) {
    try {
      await runCommand(candidate.command, candidate.args);
      return;
    } catch (error) {
      lastError = error;
    }
  }

  const message = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(
    `rembg 실행 실패. Python/rembg 설치를 확인하세요. 권장: pip install rembg[cpu]. 상세: ${message}`
  );
}

async function normalizeImageForRembg(sourcePath: string, outputPath: string): Promise<void> {
  await sharp(sourcePath)
    .rotate()
    .ensureAlpha()
    .png()
    .toFile(outputPath);
}

function analyzeSolidBackground(
  rgba: Uint8Array,
  width: number,
  height: number,
  tolerance: number
): SolidBackgroundAnalysis {
  const key = estimateBorderColor(rgba, width, height);
  let samples = 0;
  let matched = 0;
  let distanceSum = 0;

  const sample = (x: number, y: number) => {
    const idx = (y * width + x) * 4;
    const alpha = rgba[idx + 3];
    if (alpha <= 0) {
      return;
    }
    const dist = colorDistance01(rgba[idx], rgba[idx + 1], rgba[idx + 2], key);
    samples += 1;
    distanceSum += dist;
    if (dist <= tolerance) {
      matched += 1;
    }
  };

  for (let x = 0; x < width; x += 1) {
    sample(x, 0);
    if (height > 1) {
      sample(x, height - 1);
    }
  }
  for (let y = 1; y < height - 1; y += 1) {
    sample(0, y);
    if (width > 1) {
      sample(width - 1, y);
    }
  }

  return {
    key,
    matchedRatio: samples > 0 ? matched / samples : 0,
    avgDistance: samples > 0 ? distanceSum / samples : 1,
    tolerance
  };
}

function shouldUseSolidBackgroundRemoval(analysis: SolidBackgroundAnalysis): boolean {
  if (analysis.matchedRatio >= 0.82) {
    return true;
  }
  return analysis.matchedRatio >= 0.68 && analysis.avgDistance <= Math.max(0.08, analysis.tolerance * 0.9);
}

async function detectBackgroundRemovalMode(inputPath: string, tolerance: number): Promise<BgRemoveMode> {
  const image = sharp(inputPath).ensureAlpha();
  const metadata = await image.metadata();
  const width = metadata.width ?? 1;
  const height = metadata.height ?? 1;
  const raw = new Uint8Array(await image.raw().toBuffer());
  const analysis = analyzeSolidBackground(raw, width, height, clamp01(tolerance));
  return shouldUseSolidBackgroundRemoval(analysis) ? "solid" : "ai";
}

async function removeSolidBackground(
  inputPath: string,
  outputPath: string,
  toleranceInput: number
): Promise<SolidBackgroundAnalysis> {
  const image = sharp(inputPath).ensureAlpha();
  const metadata = await image.metadata();
  const width = metadata.width ?? 1;
  const height = metadata.height ?? 1;
  const raw = new Uint8Array(await image.raw().toBuffer());
  const tolerance = clamp01(toleranceInput);
  const analysis = analyzeSolidBackground(raw, width, height, tolerance);
  const featherEnd = Math.min(1, tolerance + 0.08);
  const out = new Uint8Array(raw);

  for (let i = 0; i < width * height; i += 1) {
    const idx = i * 4;
    const alpha = out[idx + 3];
    if (alpha <= 0) {
      continue;
    }
    const dist = colorDistance01(out[idx], out[idx + 1], out[idx + 2], analysis.key);
    if (dist <= tolerance) {
      out[idx + 3] = 0;
      continue;
    }
    if (dist < featherEnd) {
      const keep = (dist - tolerance) / Math.max(0.0001, featherEnd - tolerance);
      out[idx + 3] = Math.round(alpha * clamp01(keep));
    }
  }

  await sharp(Buffer.from(out), {
    raw: {
      width,
      height,
      channels: 4
    }
  }).png().toFile(outputPath);

  return analysis;
}

async function handleExtractSpriteMap(payload: {
  inputPath: string;
  mode: "grid" | "auto";
  cols?: number;
  rows?: number;
  alphaThreshold?: number;
  mergeThreshold?: number;
}) {
  const image = sharp(payload.inputPath);
  const metadata = await image.metadata();
  const width = metadata.width ?? 1;
  const height = metadata.height ?? 1;
  const baseName = path.basename(payload.inputPath, path.extname(payload.inputPath));
  const sprites: SpriteMapEntry[] = [];

  if (payload.mode === "grid") {
    const cols = Math.max(1, payload.cols ?? 1);
    const rows = Math.max(1, payload.rows ?? 1);
    const cellW = Math.floor(width / cols);
    const cellH = Math.floor(height / rows);

    let index = 0;
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        sprites.push({
          name: `${baseName}_${String(index).padStart(4, "0")}`,
          x: col * cellW,
          y: row * cellH,
          w: cellW,
          h: cellH,
          ignore: false
        });
        index += 1;
      }
    }

    return { imageWidth: width, imageHeight: height, sprites };
  }

  const alphaThreshold = Math.max(0, Math.min(255, Math.round((payload.alphaThreshold ?? 0.04) * 255)));
  const mergeThreshold = Math.max(0, Math.round(payload.mergeThreshold ?? 1));
  const raw = await image.ensureAlpha().raw().toBuffer();
  const mask = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i += 1) {
    mask[i] = raw[i * 4 + 3] > alphaThreshold ? 1 : 0;
  }

  const mergedMask = dilateMask(mask, width, height, mergeThreshold);
  const regions = connectedComponents(mergedMask, width, height)
    .filter((region) => region.w > 1 && region.h > 1)
    .sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y));

  if (!regions.length) {
    throw new Error("자동 리맵에서 불투명 스프라이트를 찾지 못했습니다.");
  }

  for (let i = 0; i < regions.length; i += 1) {
    const region = regions[i];
    sprites.push({
      name: `${baseName}_${String(i).padStart(4, "0")}`,
      x: region.x,
      y: region.y,
      w: region.w,
      h: region.h,
      ignore: false
    });
  }

  return { imageWidth: width, imageHeight: height, sprites };
}

async function handleExportLeshyAnimation(payload: {
  inputPath: string;
  sprites: SpriteMapEntry[];
  delayMs?: number;
  outputPath: string;
  format?: "gif";
}) {
  if (!payload.inputPath) {
    throw new Error("스프라이트 시트 경로가 없습니다.");
  }
  if (!payload.outputPath) {
    throw new Error("애니메이션 저장 경로가 없습니다.");
  }

  const validSprites = (payload.sprites ?? []).filter((sprite) => !sprite.ignore && sprite.w > 0 && sprite.h > 0);
  if (!validSprites.length) {
    throw new Error("애니메이션으로 만들 스프라이트가 없습니다.");
  }

  const sourceImage = sharp(payload.inputPath).ensureAlpha();
  const metadata = await sourceImage.metadata();
  const sourceWidth = metadata.width ?? 1;
  const sourceHeight = metadata.height ?? 1;
  const baseName = path.basename(payload.inputPath, path.extname(payload.inputPath));
  const delayMs = Math.max(20, Math.round(payload.delayMs ?? 120));
  const clipId = createId("clip");
  const clipName = `${baseName}_anim`;
  const frameDir = path.join(os.tmpdir(), `spriteforge-leshy-animation-${Date.now()}`);
  const exportRoot = path.join(frameDir, "export");

  await fs.ensureDir(frameDir);
  await fs.ensureDir(exportRoot);

  try {
    const frames: Frame[] = [];
    let maxWidth = 1;
    let maxHeight = 1;

    for (let i = 0; i < validSprites.length; i += 1) {
      const sprite = validSprites[i];
      const left = Math.max(0, Math.min(sourceWidth - 1, Math.round(sprite.x)));
      const top = Math.max(0, Math.min(sourceHeight - 1, Math.round(sprite.y)));
      const width = Math.max(1, Math.min(sourceWidth - left, Math.round(sprite.w)));
      const height = Math.max(1, Math.min(sourceHeight - top, Math.round(sprite.h)));
      const framePath = path.join(frameDir, `frame_${String(i).padStart(4, "0")}.png`);

      await sourceImage
        .clone()
        .extract({ left, top, width, height })
        .png()
        .toFile(framePath);

      frames.push({
        id: createId("frame"),
        srcPath: framePath,
        delayMs,
        offsetPx: { x: 0, y: 0 },
        pivotNorm: { x: 0.5, y: 0 },
        scale: { x: 1, y: 1 }
      });

      maxWidth = Math.max(maxWidth, width);
      maxHeight = Math.max(maxHeight, height);
    }

    const project: Project = {
      version: "1.0",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      presets: [],
      clips: [
        {
          id: clipId,
          name: clipName,
          source: {
            type: "sprite_sheet",
            paths: [payload.inputPath]
          },
          canvas: {
            width: maxWidth,
            height: maxHeight,
            background: "transparent"
          },
          loopMode: "loop",
          frames,
          inspector: { ...defaultInspector },
          unity: { ...defaultUnityOptions }
        }
      ]
    };

    const exportMode = payload.format === "gif" || !payload.format ? "gif" : "gif";
    const exported = await exportClip(project, {
      projectDir: frameDir,
      clipId,
      exportRoot,
      exportMode,
      padding: 0,
      allowRotate: false
    });

    const builtPath = path.join(exported.exportDir, `${clipName}.gif`);
    await fs.ensureDir(path.dirname(payload.outputPath));
    await fs.copy(builtPath, payload.outputPath, { overwrite: true });

    return {
      outputPath: payload.outputPath,
      frameCount: frames.length,
      width: maxWidth,
      height: maxHeight
    };
  } finally {
    await fs.remove(frameDir).catch(() => undefined);
  }
}

function pickOutputName(inputPath: string, usedNames: Set<string>): string {
  const base = path.parse(inputPath).name;
  let name = `${base}.png`;
  let i = 2;
  while (usedNames.has(name.toLowerCase())) {
    name = `${base}_${i}.png`;
    i += 1;
  }
  usedNames.add(name.toLowerCase());
  return name;
}

function buildProcessedImage(
  sourcePath: string,
  options: {
    flipHorizontal?: boolean;
    resize?: BgRemoveResizeOptions;
  }
): sharp.Sharp {
  let image = sharp(sourcePath).ensureAlpha();

  if (options.flipHorizontal) {
    image = image.flop();
  }

  const resize = options.resize;
  const resizeEnabled = Boolean(resize?.enabled);
  const resizeWidth = resize?.width && resize.width > 0 ? Math.round(resize.width) : undefined;
  const resizeHeight = resize?.height && resize.height > 0 ? Math.round(resize.height) : undefined;
  if (resizeEnabled && (resizeWidth || resizeHeight)) {
    image = image.resize({
      width: resizeWidth,
      height: resizeHeight,
      fit: resize?.keepAspect === false ? "fill" : "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    });
  }

  return image.png();
}

async function collectImagesFromInputs(inputPaths: string[]): Promise<string[]> {
  const allInputs: string[] = [];
  for (const inputPath of inputPaths) {
    allInputs.push(...await collectImageFiles(inputPath));
  }

  return [...new Set(allInputs.map((p) => path.resolve(p)))];
}

async function handleBgCollectFiles(payload: { inputPaths: string[] }) {
  const inputPaths = payload.inputPaths ?? [];
  const files = await collectImagesFromInputs(inputPaths);
  return { files };
}

async function handleBgPreview(payload: {
  inputPath: string;
  flipHorizontal?: boolean;
  resize?: BgRemoveResizeOptions;
  enhanceEdges?: boolean;
  mode?: BgRemoveMode;
  backgroundTolerance?: number;
  managedRembgPythonCandidates?: string[];
}) {
  if (!payload.inputPath) {
    throw new Error("미리보기 대상 이미지가 없습니다.");
  }
  if (!isImagePath(payload.inputPath)) {
    throw new Error("지원되지 않는 이미지 형식입니다.");
  }

  const tempDir = path.join(os.tmpdir(), `spriteforge-rembg-preview-${Date.now()}`);
  await fs.ensureDir(tempDir);
  const tempInputPath = path.join(tempDir, "normalized_input.png");
  const tempOutputPath = path.join(tempDir, "preview.png");

  try {
    await normalizeImageForRembg(payload.inputPath, tempInputPath);
    const tolerance = clamp01(payload.backgroundTolerance ?? 0.16);
    const requestedMode = payload.mode ?? "auto";
    const appliedMode = requestedMode === "auto"
      ? await detectBackgroundRemovalMode(tempInputPath, tolerance)
      : requestedMode;

    if (appliedMode === "solid") {
      await removeSolidBackground(tempInputPath, tempOutputPath, tolerance);
    } else {
      await runRembg(
        tempInputPath,
        tempOutputPath,
        Boolean(payload.enhanceEdges),
        payload.managedRembgPythonCandidates
      );
    }

    const outputBuffer = await buildProcessedImage(tempOutputPath, {
      flipHorizontal: payload.flipHorizontal,
      resize: payload.resize
    }).toBuffer();

    return {
      outputDataUrl: `data:image/png;base64,${outputBuffer.toString("base64")}`,
      appliedMode
    };
  } finally {
    await fs.remove(tempDir).catch(() => undefined);
  }
}

function emitBgRemoveProgress(requestId: string, progress: BgRemoveProgressPayload): void {
  assertPort().postMessage({
    id: requestId,
    progress
  });
}

async function handleBgRemoveBatch(requestId: string, payload: BgRemovePayload) {
  if (!payload.inputPaths?.length) {
    throw new Error("입력 경로가 비어 있습니다.");
  }
  if (!payload.outputDir) {
    throw new Error("출력 폴더가 비어 있습니다.");
  }

  await fs.ensureDir(payload.outputDir);

  const uniqueInputs = await collectImagesFromInputs(payload.inputPaths);
  if (!uniqueInputs.length) {
    throw new Error("처리 가능한 이미지 파일을 찾지 못했습니다. PNG/JPG/WEBP/BMP/TIFF만 지원합니다.");
  }

  const tempDir = path.join(os.tmpdir(), `spriteforge-rembg-${Date.now()}`);
  await fs.ensureDir(tempDir);

  const outputs: string[] = [];
  const failedFiles: BgRemoveFailure[] = [];
  const usedNames = new Set<string>();
  let processedCount = 0;
  let failedCount = 0;

  emitBgRemoveProgress(requestId, {
    total: uniqueInputs.length,
    done: 0,
    processed: 0,
    failed: 0,
    currentPath: ""
  });

  try {
    for (let i = 0; i < uniqueInputs.length; i += 1) {
      const inputPath = uniqueInputs[i];
      const tempInputPath = path.join(tempDir, `normalized_${i}.png`);
      const tempOutputPath = path.join(tempDir, `rembg_${i}.png`);
      try {
        await normalizeImageForRembg(inputPath, tempInputPath);
        const tolerance = clamp01(payload.backgroundTolerance ?? 0.16);
        const requestedMode = payload.mode ?? "auto";
        const appliedMode = requestedMode === "auto"
          ? await detectBackgroundRemovalMode(tempInputPath, tolerance)
          : requestedMode;

        if (appliedMode === "solid") {
          await removeSolidBackground(tempInputPath, tempOutputPath, tolerance);
        } else {
          await runRembg(
            tempInputPath,
            tempOutputPath,
            Boolean(payload.enhanceEdges),
            payload.managedRembgPythonCandidates
          );
        }

        const outputName = pickOutputName(inputPath, usedNames);
        const outputPath = path.join(payload.outputDir, outputName);

        await buildProcessedImage(tempOutputPath, payload).toFile(outputPath);
        outputs.push(outputPath);
        processedCount += 1;
      } catch (error) {
        failedFiles.push({
          inputPath,
          error: error instanceof Error ? error.message : String(error)
        });
        failedCount += 1;
      }

      emitBgRemoveProgress(requestId, {
        total: uniqueInputs.length,
        done: i + 1,
        processed: processedCount,
        failed: failedCount,
        currentPath: inputPath
      });
    }
  } finally {
    await fs.remove(tempDir).catch(() => undefined);
  }

  return {
    total: uniqueInputs.length,
    processed: outputs.length,
    failed: failedFiles.length,
    outputDir: payload.outputDir,
    outputs,
    failedFiles
  };
}

interface SpriteSheetAutoGifPayload {
  projectDir: string;
  inputPath: string;
  outputDir?: string;
  delayMs?: number;
  alphaThreshold?: number;
  mergeThreshold?: number;
  removeBackground?: boolean;
  backgroundTolerance?: number;
  exportGif?: boolean;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function colorDistance01(r: number, g: number, b: number, key: { r: number; g: number; b: number }): number {
  const dr = r - key.r;
  const dg = g - key.g;
  const db = b - key.b;
  return Math.sqrt((dr * dr + dg * dg + db * db) / (255 * 255 * 3));
}

function estimateBorderColor(rgba: Uint8Array, width: number, height: number): { r: number; g: number; b: number } {
  const buckets = new Map<string, { count: number; rSum: number; gSum: number; bSum: number }>();
  const addPixel = (x: number, y: number) => {
    const idx = (y * width + x) * 4;
    const alpha = rgba[idx + 3];
    if (alpha <= 0) {
      return;
    }
    const r = rgba[idx];
    const g = rgba[idx + 1];
    const b = rgba[idx + 2];
    const key = `${Math.floor(r / 16)}_${Math.floor(g / 16)}_${Math.floor(b / 16)}`;
    const prev = buckets.get(key);
    if (prev) {
      prev.count += 1;
      prev.rSum += r;
      prev.gSum += g;
      prev.bSum += b;
      return;
    }
    buckets.set(key, { count: 1, rSum: r, gSum: g, bSum: b });
  };

  for (let x = 0; x < width; x += 1) {
    addPixel(x, 0);
    if (height > 1) {
      addPixel(x, height - 1);
    }
  }
  for (let y = 1; y < height - 1; y += 1) {
    addPixel(0, y);
    if (width > 1) {
      addPixel(width - 1, y);
    }
  }

  let picked: { count: number; rSum: number; gSum: number; bSum: number } | null = null;
  for (const candidate of buckets.values()) {
    if (!picked || candidate.count > picked.count) {
      picked = candidate;
    }
  }

  if (!picked || picked.count <= 0) {
    return { r: rgba[0] ?? 0, g: rgba[1] ?? 0, b: rgba[2] ?? 0 };
  }

  return {
    r: Math.round(picked.rSum / picked.count),
    g: Math.round(picked.gSum / picked.count),
    b: Math.round(picked.bSum / picked.count)
  };
}

async function prepareTransparentSpriteSheet(
  inputPath: string,
  outputPath: string,
  options: { removeBackground: boolean; tolerance: number }
): Promise<void> {
  if (!options.removeBackground) {
    await sharp(inputPath).ensureAlpha().png().toFile(outputPath);
    return;
  }

  const image = sharp(inputPath).ensureAlpha();
  const metadata = await image.metadata();
  const width = metadata.width ?? 1;
  const height = metadata.height ?? 1;
  const raw = new Uint8Array(await image.raw().toBuffer());
  const key = estimateBorderColor(raw, width, height);

  const tolerance = clamp01(options.tolerance);
  const featherEnd = Math.min(1, tolerance + 0.08);
  const out = new Uint8Array(raw);

  for (let i = 0; i < width * height; i += 1) {
    const idx = i * 4;
    const alpha = out[idx + 3];
    if (alpha <= 0) {
      continue;
    }
    const dist = colorDistance01(out[idx], out[idx + 1], out[idx + 2], key);
    if (dist <= tolerance) {
      out[idx + 3] = 0;
      continue;
    }
    if (dist < featherEnd) {
      const keep = (dist - tolerance) / Math.max(0.0001, featherEnd - tolerance);
      out[idx + 3] = Math.round(alpha * clamp01(keep));
    }
  }

  await sharp(Buffer.from(out), {
    raw: {
      width,
      height,
      channels: 4
    }
  }).png().toFile(outputPath);
}

async function handleSpriteSheetAutoGif(payload: SpriteSheetAutoGifPayload) {
  if (!payload.projectDir) {
    throw new Error("프로젝트 폴더가 비어 있습니다.");
  }
  if (!payload.inputPath) {
    throw new Error("스프라이트 시트 경로가 비어 있습니다.");
  }

  const stat = await fs.stat(payload.inputPath).catch(() => null);
  if (!stat || !stat.isFile()) {
    throw new Error("스프라이트 시트 파일을 찾지 못했습니다.");
  }
  if (!isImagePath(payload.inputPath)) {
    throw new Error("지원되지 않는 스프라이트 시트 형식입니다.");
  }

  const tempDir = path.join(os.tmpdir(), `spriteforge-sheet-auto-gif-${Date.now()}`);
  await fs.ensureDir(tempDir);
  const preparedPath = path.join(tempDir, "prepared_sheet.png");

  try {
    await prepareTransparentSpriteSheet(payload.inputPath, preparedPath, {
      removeBackground: payload.removeBackground !== false,
      tolerance: payload.backgroundTolerance ?? 0.12
    });

    const delayMs = Math.max(10, Math.round(payload.delayMs ?? 100));
    const alphaThreshold = clamp01(payload.alphaThreshold ?? 0.04);
    const mergeThreshold = Math.max(0, Math.round(payload.mergeThreshold ?? 1));

    const imported = await withProject(payload.projectDir, async (project) => {
      const clip = await importSourceToClip({
        projectDir: payload.projectDir,
        paths: [preparedPath],
        sourceType: "sprite_sheet",
        spriteSheet: {
          mode: "auto",
          alphaThreshold,
          mergeThreshold
        }
      });

      const baseName = path.basename(payload.inputPath, path.extname(payload.inputPath));
      clip.name = `${baseName}_auto_gif`;
      clip.frames = clip.frames.map((frame) => ({
        ...frame,
        delayMs
      }));
      project.clips.push(clip);

      return {
        clipId: clip.id,
        clipName: clip.name,
        frameCount: clip.frames.length
      };
    });

    const shouldExportGif = payload.exportGif === true;
    let exportDir: string | null = null;
    let gifPath: string | null = null;
    if (shouldExportGif) {
      const exportRoot = payload.outputDir && payload.outputDir.trim()
        ? payload.outputDir
        : path.join(payload.projectDir, "exports");
      await fs.ensureDir(exportRoot);

      const exported = await exportClip(imported.project, {
        projectDir: payload.projectDir,
        clipId: imported.data.clipId,
        exportRoot,
        exportMode: "gif",
        padding: 0,
        allowRotate: false
      });
      exportDir = exported.exportDir;
      gifPath = path.join(exported.exportDir, `${imported.data.clipName}.gif`);
    }

    return {
      project: imported.project,
      clipId: imported.data.clipId,
      clipName: imported.data.clipName,
      frameCount: imported.data.frameCount,
      exportDir,
      gifPath
    };
  } finally {
    await fs.remove(tempDir).catch(() => undefined);
  }
}

async function route(request: RequestMessage): Promise<unknown> {
  switch (request.method) {
    case "project:load":
      return handleLoad(request.payload);
    case "project:save":
      return handleSave(request.payload);
    case "project:import":
      return handleImport(request.payload);
    case "project:reset":
      return handleReset(request.payload);
    case "project:updateClip":
      return handleUpdateClip(request.payload);
    case "project:align":
      return handleAlignment(request.payload);
    case "project:timeline":
      return handleTimeline(request.payload);
    case "project:export":
      return handleExport(request.payload);
    case "project:pixelEdit":
      return handlePixelEdit(request.payload);
    case "tool:bgCollectFiles":
      return handleBgCollectFiles(request.payload);
    case "tool:bgPreview":
      return handleBgPreview(request.payload);
    case "tool:bgRemoveBatch":
      return handleBgRemoveBatch(request.id, request.payload);
    case "tool:spriteSheetAutoGif":
      return handleSpriteSheetAutoGif(request.payload);
    case "tool:extractSpriteMap":
      return handleExtractSpriteMap(request.payload);
    case "tool:exportLeshyAnimation":
      return handleExportLeshyAnimation(request.payload);
    default:
      throw new Error(`Unknown worker method ${request.method}`);
  }
}

assertPort().on("message", async (request: RequestMessage) => {
  try {
    const result = await route(request);
    assertPort().postMessage({ id: request.id, ok: true, result });
  } catch (error) {
    assertPort().postMessage({
      id: request.id,
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
});
