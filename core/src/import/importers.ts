import path from "node:path";
import fs from "fs-extra";
import fg from "fast-glob";
import sharp from "sharp";
import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "ffmpeg-static";
import { decompressFrames, parseGIF } from "gifuct-js";
import {
  Clip,
  ImportOptions,
  SourceType,
  SpriteSheetSliceOptions,
  defaultInspector,
  defaultUnityOptions
} from "../types.js";
import { createId } from "../utils/id.js";
import { groupPngSequence } from "./filenameParser.js";
import { resolveProjectPaths } from "../project/store.js";

function resolveFfmpegBinaryPath(rawPath: string | null): string | null {
  if (!rawPath) {
    return null;
  }

  // In Electron packaged builds, binaries must be read from app.asar.unpacked.
  const unpackedPath = rawPath.replace("app.asar", "app.asar.unpacked");
  if (fs.pathExistsSync(unpackedPath)) {
    return unpackedPath;
  }
  if (fs.pathExistsSync(rawPath)) {
    return rawPath;
  }
  return unpackedPath;
}

const resolvedFfmpegPath = resolveFfmpegBinaryPath(ffmpegPath as string | null);
if (resolvedFfmpegPath) {
  ffmpeg.setFfmpegPath(resolvedFfmpegPath);
}

const videoExtensions = new Set([
  ".mp4",
  ".webm",
  ".mov",
  ".avi",
  ".mkv",
  ".wmv",
  ".m4v",
  ".flv",
  ".mpg",
  ".mpeg",
  ".ts",
  ".m2ts",
  ".3gp",
  ".3g2"
]);

function normalizePath(p: string): string {
  return path.normalize(p);
}

function isDirectory(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

async function expandInputPaths(paths: string[]): Promise<string[]> {
  const files: string[] = [];
  for (const p of paths) {
    const normalized = normalizePath(p);
    if (isDirectory(normalized)) {
      const found = await fg(["**/*.*"], {
        cwd: normalized,
        absolute: true,
        onlyFiles: true,
        suppressErrors: true
      });
      files.push(...found);
    } else {
      files.push(normalized);
    }
  }
  return [...new Set(files)];
}

export function detectSourceType(paths: string[]): SourceType {
  if (!paths.length) {
    throw new Error("No input paths provided");
  }

  const ext = path.extname(paths[0]).toLowerCase();
  if (ext === ".gif") {
    return "gif";
  }
  if (videoExtensions.has(ext)) {
    return "video";
  }
  if (ext === ".webp") {
    return "webp";
  }
  if (ext === ".png") {
    return paths.length > 1 ? "png_sequence" : "sprite_sheet";
  }

  throw new Error(`Unsupported input type: ${ext}`);
}

async function writeRawRgbaToPng(
  rgba: Uint8Array,
  width: number,
  height: number,
  outputPath: string
): Promise<void> {
  await sharp(Buffer.from(rgba), {
    raw: {
      width,
      height,
      channels: 4
    }
  })
    .png()
    .toFile(outputPath);
}

async function importGifToFrames(
  sourcePath: string,
  outDir: string
): Promise<{ frames: Array<{ path: string; delayMs: number }>; width: number; height: number }> {
  const bytes = await fs.readFile(sourcePath);
  const gif = parseGIF(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  const frames = decompressFrames(gif, true);

  const width = gif.lsd.width;
  const height = gif.lsd.height;
  let canvas = new Uint8Array(width * height * 4);

  const imported: Array<{ path: string; delayMs: number }> = [];

  for (let i = 0; i < frames.length; i += 1) {
    const frame = frames[i] as {
      delay?: number;
      patch: Uint8Array;
      dims: { left: number; top: number; width: number; height: number };
    };
    const { left, top, width: fw, height: fh } = frame.dims;
    const patch = frame.patch;

    for (let y = 0; y < fh; y += 1) {
      for (let x = 0; x < fw; x += 1) {
        const srcI = (y * fw + x) * 4;
        const dstX = left + x;
        const dstY = top + y;
        if (dstX < 0 || dstY < 0 || dstX >= width || dstY >= height) {
          continue;
        }
        const dstI = (dstY * width + dstX) * 4;
        canvas[dstI] = patch[srcI];
        canvas[dstI + 1] = patch[srcI + 1];
        canvas[dstI + 2] = patch[srcI + 2];
        canvas[dstI + 3] = patch[srcI + 3];
      }
    }

    const outPath = path.join(outDir, `frame_${String(i).padStart(4, "0")}.png`);
    await writeRawRgbaToPng(canvas, width, height, outPath);
    imported.push({ path: outPath, delayMs: Math.max(10, (frame.delay ?? 10) * 10) });
  }

  return { frames: imported, width, height };
}

function parseFps(rate: string | undefined): number | null {
  if (!rate) {
    return null;
  }
  const [numStr, denStr] = rate.split("/");
  const num = Number.parseFloat(numStr);
  const den = denStr ? Number.parseFloat(denStr) : 1;
  if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) {
    return null;
  }
  return num / den;
}

async function probeVideoFps(sourcePath: string): Promise<number> {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(sourcePath, (err, data) => {
      if (err) {
        resolve(10);
        return;
      }
      const stream = data.streams.find((s) => s.codec_type === "video");
      const fps = parseFps((stream as { avg_frame_rate?: string; r_frame_rate?: string } | undefined)?.avg_frame_rate)
        ?? parseFps((stream as { avg_frame_rate?: string; r_frame_rate?: string } | undefined)?.r_frame_rate)
        ?? 10;
      resolve(Math.max(1, fps));
    });
  });
}

async function extractVideoFrames(
  sourcePath: string,
  outDir: string
): Promise<{ frames: Array<{ path: string; delayMs: number }>; width: number; height: number }> {
  await fs.ensureDir(outDir);
  const pattern = path.join(outDir, "frame_%05d.png");

  try {
    await new Promise<void>((resolve, reject) => {
      ffmpeg(sourcePath)
        .outputOptions(["-vsync 0"])
        .output(pattern)
        .on("end", () => resolve())
        .on("error", (err) => reject(err))
        .run();
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Video decode failed: ${reason}${resolvedFfmpegPath ? ` (ffmpeg: ${resolvedFfmpegPath})` : ""}`);
  }

  const extracted = (await fg(["frame_*.png"], { cwd: outDir, absolute: true })).sort();
  if (!extracted.length) {
    throw new Error("No frames extracted from video");
  }

  const fps = await probeVideoFps(sourcePath);
  const delayMs = Math.max(10, Math.round(1000 / fps));

  const metadata = await sharp(extracted[0]).metadata();
  return {
    frames: extracted.map((file) => ({ path: file, delayMs })),
    width: metadata.width ?? 1,
    height: metadata.height ?? 1
  };
}

async function importPngSequence(
  sourcePaths: string[]
): Promise<{ frames: Array<{ path: string; delayMs: number }>; width: number; height: number; clipName: string }> {
  const onlyPng = sourcePaths.filter((p) => path.extname(p).toLowerCase() === ".png");
  if (!onlyPng.length) {
    throw new Error("PNG sequence import requires PNG files");
  }

  const grouped = groupPngSequence(onlyPng);
  const metadata = await sharp(grouped.ordered[0]).metadata();

  return {
    frames: grouped.ordered.map((file) => ({ path: file, delayMs: 100 })),
    width: metadata.width ?? 1,
    height: metadata.height ?? 1,
    clipName: grouped.clipName
  };
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
          const nIdx = ny * width + nx;
          if (!mask[nIdx] || visited[nIdx]) {
            continue;
          }
          visited[nIdx] = 1;
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

async function sliceSpriteSheet(
  sourcePath: string,
  outDir: string,
  options: SpriteSheetSliceOptions
): Promise<{ frames: Array<{ path: string; delayMs: number }>; width: number; height: number; clipName: string }> {
  const image = sharp(sourcePath);
  const metadata = await image.metadata();
  const width = metadata.width ?? 1;
  const height = metadata.height ?? 1;

  const clipName = path.basename(sourcePath, path.extname(sourcePath));

  const frames: Array<{ path: string; delayMs: number }> = [];

  if (options.mode === "grid") {
    const cols = Math.max(1, options.cols ?? 1);
    const rows = Math.max(1, options.rows ?? 1);
    const cellW = Math.floor(width / cols);
    const cellH = Math.floor(height / rows);

    let idx = 0;
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const left = c * cellW;
        const top = r * cellH;
        const outPath = path.join(outDir, `frame_${String(idx).padStart(4, "0")}.png`);
        await image.clone().extract({ left, top, width: cellW, height: cellH }).png().toFile(outPath);
        frames.push({ path: outPath, delayMs: 100 });
        idx += 1;
      }
    }

    return { frames, width: cellW, height: cellH, clipName };
  }

  const alphaThreshold = Math.max(0, Math.min(255, Math.round((options.alphaThreshold ?? 0.04) * 255)));
  const mergeThreshold = Math.max(0, Math.round(options.mergeThreshold ?? 1));

  const raw = await image.ensureAlpha().raw().toBuffer();
  const mask = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i += 1) {
    mask[i] = raw[i * 4 + 3] > alphaThreshold ? 1 : 0;
  }

  const mergedMask = dilateMask(mask, width, height, mergeThreshold);
  const regions = connectedComponents(mergedMask, width, height)
    .filter((r) => r.w > 1 && r.h > 1)
    .sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y));

  if (!regions.length) {
    throw new Error("Automatic slicing did not find any opaque regions");
  }

  for (let i = 0; i < regions.length; i += 1) {
    const region = regions[i];
    const outPath = path.join(outDir, `frame_${String(i).padStart(4, "0")}.png`);
    await image
      .clone()
      .extract({ left: region.x, top: region.y, width: region.w, height: region.h })
      .png()
      .toFile(outPath);
    frames.push({ path: outPath, delayMs: 100 });
  }

  const maxW = Math.max(...regions.map((r) => r.w));
  const maxH = Math.max(...regions.map((r) => r.h));

  return {
    frames,
    width: maxW,
    height: maxH,
    clipName
  };
}

async function importWebp(
  sourcePath: string,
  outDir: string
): Promise<{ frames: Array<{ path: string; delayMs: number }>; width: number; height: number; clipName: string }> {
  const metadata = await sharp(sourcePath).metadata();
  const outPath = path.join(outDir, "frame_0000.png");
  await sharp(sourcePath).png().toFile(outPath);

  return {
    frames: [{ path: outPath, delayMs: 100 }],
    width: metadata.width ?? 1,
    height: metadata.height ?? 1,
    clipName: path.basename(sourcePath, path.extname(sourcePath))
  };
}

export async function importSourceToClip(options: ImportOptions): Promise<Clip> {
  const projectPaths = resolveProjectPaths(options.projectDir);
  await fs.ensureDir(projectPaths.cacheDir);

  const expanded = await expandInputPaths(options.paths);
  if (!expanded.length) {
    throw new Error("No files found in import paths");
  }

  const sourceType = options.sourceType ?? detectSourceType(expanded);
  const clipId = createId("clip");
  const clipCache = path.join(projectPaths.cacheDir, clipId);
  await fs.ensureDir(clipCache);

  let importedFrames: Array<{ path: string; delayMs: number }> = [];
  let canvasWidth = 1;
  let canvasHeight = 1;
  let clipName = "Clip";

  switch (sourceType) {
    case "gif": {
      const result = await importGifToFrames(expanded[0], clipCache);
      importedFrames = result.frames;
      canvasWidth = result.width;
      canvasHeight = result.height;
      clipName = path.basename(expanded[0], path.extname(expanded[0]));
      break;
    }
    case "video": {
      const result = await extractVideoFrames(expanded[0], clipCache);
      importedFrames = result.frames;
      canvasWidth = result.width;
      canvasHeight = result.height;
      clipName = path.basename(expanded[0], path.extname(expanded[0]));
      break;
    }
    case "png_sequence": {
      const result = await importPngSequence(expanded);
      importedFrames = result.frames;
      canvasWidth = result.width;
      canvasHeight = result.height;
      clipName = result.clipName;
      break;
    }
    case "sprite_sheet": {
      const result = await sliceSpriteSheet(expanded[0], clipCache, options.spriteSheet ?? { mode: "grid", cols: 1, rows: 1 });
      importedFrames = result.frames;
      canvasWidth = result.width;
      canvasHeight = result.height;
      clipName = result.clipName;
      break;
    }
    case "webp": {
      const result = await importWebp(expanded[0], clipCache);
      importedFrames = result.frames;
      canvasWidth = result.width;
      canvasHeight = result.height;
      clipName = result.clipName;
      break;
    }
    default:
      throw new Error(`Unsupported source type ${sourceType}`);
  }

  const frames = importedFrames.map((frame, idx) => ({
    id: createId("frame"),
    srcPath: frame.path,
    delayMs: frame.delayMs,
    offsetPx: { x: 0, y: 0 },
    pivotNorm: { x: 0.5, y: 0 },
    scale: { x: 1, y: 1 },
    crop: undefined
  }));

  return {
    id: clipId,
    name: clipName,
    source: { type: sourceType, paths: expanded },
    canvas: { width: canvasWidth, height: canvasHeight, background: "transparent" },
    loopMode: "loop",
    frames,
    inspector: { ...defaultInspector },
    unity: { ...defaultUnityOptions }
  };
}
