import path from "node:path";
import fs from "fs-extra";
import sharp from "sharp";
import GIFEncoder from "gif-encoder-2";
import { PNG } from "pngjs";
import { Clip, ExportMeta, ExportOptions, Frame, Project } from "../types.js";
import { packMaxRects } from "../packing/maxRects.js";

interface BakedFrame {
  frame: Frame;
  sourceIndex: number;
  name: string;
  width: number;
  height: number;
  rgba: Uint8Array;
}

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace("#", "");
  return {
    r: Number.parseInt(clean.slice(0, 2), 16),
    g: Number.parseInt(clean.slice(2, 4), 16),
    b: Number.parseInt(clean.slice(4, 6), 16)
  };
}

function rgbToHsv(r: number, g: number, b: number): { h: number; s: number; v: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;

  let h = 0;
  if (delta > 0) {
    if (max === rn) {
      h = 60 * (((gn - bn) / delta) % 6);
    } else if (max === gn) {
      h = 60 * ((bn - rn) / delta + 2);
    } else {
      h = 60 * ((rn - gn) / delta + 4);
    }
  }

  if (h < 0) {
    h += 360;
  }

  const s = max === 0 ? 0 : delta / max;
  return { h, s, v: max };
}

function hsvToRgb(h: number, s: number, v: number): { r: number; g: number; b: number } {
  const c = v * s;
  const hh = h / 60;
  const x = c * (1 - Math.abs((hh % 2) - 1));

  let rn = 0;
  let gn = 0;
  let bn = 0;

  if (hh >= 0 && hh < 1) {
    rn = c;
    gn = x;
  } else if (hh < 2) {
    rn = x;
    gn = c;
  } else if (hh < 3) {
    gn = c;
    bn = x;
  } else if (hh < 4) {
    gn = x;
    bn = c;
  } else if (hh < 5) {
    rn = x;
    bn = c;
  } else {
    rn = c;
    bn = x;
  }

  const m = v - c;
  return {
    r: clampByte((rn + m) * 255),
    g: clampByte((gn + m) * 255),
    b: clampByte((bn + m) * 255)
  };
}

function applyChromaAndAdjustments(clip: Clip, rgba: Uint8Array): Uint8Array {
  const out = new Uint8Array(rgba);
  const chroma = clip.inspector.chromaKey;
  const adjust = clip.inspector.adjustments;

  const brightness = adjust?.brightness ?? 1;
  const contrast = adjust?.contrast ?? 1;
  const saturation = adjust?.saturation ?? 1;
  const hueShift = adjust?.hue ?? 0;

  const key = chroma ? hexToRgb(chroma.keyColor) : { r: 0, g: 255, b: 0 };
  const tolerance = Math.max(0, Math.min(1, chroma?.tolerance ?? 0));
  const despill = Math.max(0, Math.min(1, chroma?.despill ?? 0));

  for (let i = 0; i < out.length; i += 4) {
    let r = out[i];
    let g = out[i + 1];
    let b = out[i + 2];
    let a = out[i + 3];

    if (chroma?.enabled && a > 0) {
      const dist = Math.sqrt(
        ((r - key.r) * (r - key.r) + (g - key.g) * (g - key.g) + (b - key.b) * (b - key.b)) / (255 * 255 * 3)
      );

      if (dist < tolerance) {
        const factor = Math.max(0, dist / Math.max(tolerance, 0.0001));
        a = clampByte(a * factor);
      }

      if (despill > 0) {
        const dominantGreen = Math.max(0, g - Math.max(r, b));
        g = clampByte(g - dominantGreen * despill);
      }
    }

    r = clampByte((r - 128) * contrast + 128);
    g = clampByte((g - 128) * contrast + 128);
    b = clampByte((b - 128) * contrast + 128);

    r = clampByte(r * brightness);
    g = clampByte(g * brightness);
    b = clampByte(b * brightness);

    const hsv = rgbToHsv(r, g, b);
    const shifted = hsvToRgb((hsv.h + hueShift + 360) % 360, Math.max(0, Math.min(1, hsv.s * saturation)), hsv.v);

    out[i] = shifted.r;
    out[i + 1] = shifted.g;
    out[i + 2] = shifted.b;
    out[i + 3] = a;
  }

  return out;
}

function flipHorizontal(rgba: Uint8Array, width: number, height: number): Uint8Array {
  const out = new Uint8Array(rgba.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const src = (y * width + x) * 4;
      const dst = (y * width + (width - 1 - x)) * 4;
      out[dst] = rgba[src];
      out[dst + 1] = rgba[src + 1];
      out[dst + 2] = rgba[src + 2];
      out[dst + 3] = rgba[src + 3];
    }
  }
  return out;
}

function computeOpaqueBounds(rgba: Uint8Array, width: number, height: number, alphaThreshold: number): { x: number; y: number; w: number; h: number } {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const a = rgba[(y * width + x) * 4 + 3];
      if (a >= alphaThreshold) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  if (maxX < minX || maxY < minY) {
    return { x: 0, y: 0, w: width, h: height };
  }

  return {
    x: minX,
    y: minY,
    w: maxX - minX + 1,
    h: maxY - minY + 1
  };
}

function extractRegion(
  rgba: Uint8Array,
  width: number,
  height: number,
  region: { x: number; y: number; w: number; h: number }
): { rgba: Uint8Array; width: number; height: number } {
  const out = new Uint8Array(region.w * region.h * 4);
  for (let y = 0; y < region.h; y += 1) {
    for (let x = 0; x < region.w; x += 1) {
      const srcX = region.x + x;
      const srcY = region.y + y;
      if (srcX < 0 || srcY < 0 || srcX >= width || srcY >= height) {
        continue;
      }
      const srcIdx = (srcY * width + srcX) * 4;
      const dstIdx = (y * region.w + x) * 4;
      out[dstIdx] = rgba[srcIdx];
      out[dstIdx + 1] = rgba[srcIdx + 1];
      out[dstIdx + 2] = rgba[srcIdx + 2];
      out[dstIdx + 3] = rgba[srcIdx + 3];
    }
  }

  return {
    rgba: out,
    width: region.w,
    height: region.h
  };
}

function blit(
  src: Uint8Array,
  srcWidth: number,
  srcHeight: number,
  dst: Uint8Array,
  dstWidth: number,
  dstHeight: number,
  offsetX: number,
  offsetY: number
): void {
  for (let y = 0; y < srcHeight; y += 1) {
    for (let x = 0; x < srcWidth; x += 1) {
      const dx = x + offsetX;
      const dy = y + offsetY;
      if (dx < 0 || dy < 0 || dx >= dstWidth || dy >= dstHeight) {
        continue;
      }
      const srcI = (y * srcWidth + x) * 4;
      const dstI = (dy * dstWidth + dx) * 4;
      const alpha = src[srcI + 3] / 255;
      if (alpha <= 0) {
        continue;
      }

      const inv = 1 - alpha;
      dst[dstI] = clampByte(src[srcI] + dst[dstI] * inv);
      dst[dstI + 1] = clampByte(src[srcI + 1] + dst[dstI + 1] * inv);
      dst[dstI + 2] = clampByte(src[srcI + 2] + dst[dstI + 2] * inv);
      dst[dstI + 3] = clampByte(src[srcI + 3] + dst[dstI + 3] * inv);
    }
  }
}

async function loadFrameRaw(frame: Frame): Promise<{ rgba: Uint8Array; width: number; height: number }> {
  const img = sharp(frame.srcPath).ensureAlpha();
  const metadata = await img.metadata();
  const width = metadata.width ?? 1;
  const height = metadata.height ?? 1;
  const rgba = new Uint8Array(await img.raw().toBuffer());
  return { rgba, width, height };
}

async function bakeFrames(
  clip: Clip,
  frameSources: Array<{ frame: Frame; sourceIndex: number }>
): Promise<BakedFrame[]> {
  const loaded: Array<{ frame: Frame; sourceIndex: number; rgba: Uint8Array; width: number; height: number }> = [];

  for (const source of frameSources) {
    const frame = source.frame;
    const raw = await loadFrameRaw(frame);
    let rgba = applyChromaAndAdjustments(clip, raw.rgba);
    if (clip.inspector.adjustments?.flipH) {
      rgba = flipHorizontal(rgba, raw.width, raw.height);
    }
    let width = raw.width;
    let height = raw.height;

    if (frame.crop) {
      const region = extractRegion(rgba, width, height, frame.crop);
      rgba = region.rgba;
      width = region.width;
      height = region.height;
    }

    if (clip.inspector.trimPad?.mode === "trim") {
      const alphaThreshold = Math.max(0, Math.min(255, Math.round((clip.inspector.trimPad.alphaThreshold ?? 0.03) * 255)));
      const bounds = computeOpaqueBounds(rgba, width, height, alphaThreshold);
      const trimmed = extractRegion(rgba, width, height, bounds);
      rgba = trimmed.rgba;
      width = trimmed.width;
      height = trimmed.height;
    }

    loaded.push({ frame, sourceIndex: source.sourceIndex, rgba, width, height });
  }

  let padWidth = clip.canvas.width;
  let padHeight = clip.canvas.height;

  if (clip.inspector.trimPad?.mode === "pad" && clip.inspector.trimPad.padTo === "maxBounds") {
    padWidth = Math.max(...loaded.map((f) => f.width));
    padHeight = Math.max(...loaded.map((f) => f.height));
  }

  const baked: BakedFrame[] = loaded.map((loadedFrame, index) => {
    const targetW = clip.inspector.trimPad?.mode === "pad" ? padWidth : clip.canvas.width;
    const targetH = clip.inspector.trimPad?.mode === "pad" ? padHeight : clip.canvas.height;

    const target = new Uint8Array(targetW * targetH * 4);
    const drawX = Math.round((targetW - loadedFrame.width) / 2 + loadedFrame.frame.offsetPx.x);
    const drawY = Math.round((targetH - loadedFrame.height) / 2 + loadedFrame.frame.offsetPx.y);

    blit(loadedFrame.rgba, loadedFrame.width, loadedFrame.height, target, targetW, targetH, drawX, drawY);

    return {
      frame: loadedFrame.frame,
      sourceIndex: loadedFrame.sourceIndex,
      name: `frame_${String(index).padStart(3, "0")}`,
      width: targetW,
      height: targetH,
      rgba: target
    };
  });

  return baked;
}

async function writeRgbaPng(rgba: Uint8Array, width: number, height: number, outPath: string): Promise<void> {
  await sharp(Buffer.from(rgba), {
    raw: {
      width,
      height,
      channels: 4
    }
  })
    .png()
    .toFile(outPath);
}

async function exportSequence(exportDir: string, baked: BakedFrame[]): Promise<void> {
  const framesDir = path.join(exportDir, "frames");
  await fs.ensureDir(framesDir);
  await Promise.all(
    baked.map((frame, idx) =>
      writeRgbaPng(frame.rgba, frame.width, frame.height, path.join(framesDir, `frame_${String(idx).padStart(3, "0")}.png`))
    )
  );
}

async function exportSheet(
  exportDir: string,
  clip: Clip,
  baked: BakedFrame[],
  padding: number,
  allowRotate: boolean
): Promise<{ width: number; height: number; rects: Array<{ x: number; y: number; w: number; h: number }> }> {
  const packed = packMaxRects(
    baked.map((b, idx) => ({ id: String(idx), w: b.width, h: b.height })),
    clip.unity.maxTextureSize,
    padding,
    allowRotate
  );

  const sheet = new Uint8Array(packed.width * packed.height * 4);

  for (let i = 0; i < baked.length; i += 1) {
    const frame = baked[i];
    const rect = packed.rects.find((r) => r.id === String(i));
    if (!rect) {
      throw new Error(`Missing packed rect for frame ${i}`);
    }
    blit(frame.rgba, frame.width, frame.height, sheet, packed.width, packed.height, rect.x, rect.y);
  }

  await writeRgbaPng(sheet, packed.width, packed.height, path.join(exportDir, "sheet.png"));

  return {
    width: packed.width,
    height: packed.height,
    rects: baked.map((_, idx) => {
      const rect = packed.rects.find((r) => r.id === String(idx));
      if (!rect) {
        throw new Error(`Missing packed rect for frame ${idx}`);
      }
      return { x: rect.x, y: rect.y, w: rect.w, h: rect.h };
    })
  };
}

async function exportGif(exportDir: string, baked: BakedFrame[], clip: Clip): Promise<void> {
  if (!baked.length) {
    return;
  }

  const width = baked[0].width;
  const height = baked[0].height;

  const encoder = new GIFEncoder(width, height, "neuquant", true);
  const output = fs.createWriteStream(path.join(exportDir, `${clip.name}.gif`));
  encoder.createReadStream().pipe(output);

  encoder.start();
  encoder.setRepeat(clip.loopMode === "loop" ? 0 : -1);
  encoder.setQuality(10);

  for (let i = 0; i < baked.length; i += 1) {
    const frame = baked[i];
    const png = new PNG({ width: frame.width, height: frame.height });
    png.data = Buffer.from(frame.rgba);
    encoder.setDelay(Math.max(10, frame.frame.delayMs ?? 100));
    encoder.addFrame(png.data);
  }

  encoder.finish();

  await new Promise<void>((resolve) => {
    output.on("finish", () => resolve());
  });
}

export async function exportClip(project: Project, options: ExportOptions): Promise<{ exportDir: string; metaPath: string }> {
  const clip = project.clips.find((c) => c.id === options.clipId);
  if (!clip) {
    throw new Error(`Clip ${options.clipId} not found`);
  }

  const frameFilter = options.frameIds?.length ? new Set(options.frameIds) : null;
  const frameSources = clip.frames
    .map((frame, sourceIndex) => ({ frame, sourceIndex }))
    .filter((entry) => (frameFilter ? frameFilter.has(entry.frame.id) : true));

  if (!frameSources.length) {
    throw new Error("No frames selected for export");
  }

  const exportDir = path.join(options.exportRoot, clip.name);
  await fs.emptyDir(exportDir);

  const baked = await bakeFrames(clip, frameSources);
  let rects: Array<{ x: number; y: number; w: number; h: number }> | undefined;
  let sheetInfo: { width: number; height: number; maxTextureSize: number; padding: number } | undefined;

  if (options.exportMode === "sequence") {
    await exportSequence(exportDir, baked);
  }

  if (options.exportMode === "sheet") {
    const packed = await exportSheet(exportDir, clip, baked, options.padding, options.allowRotate);
    rects = packed.rects;
    sheetInfo = {
      width: packed.width,
      height: packed.height,
      maxTextureSize: clip.unity.maxTextureSize,
      padding: options.padding
    };
  }

  if (options.exportMode === "gif") {
    await exportGif(exportDir, baked, clip);
  }

  const modeForMeta: "sheet" | "sequence" = options.exportMode === "sheet" ? "sheet" : "sequence";
  const meta: ExportMeta = {
    toolVersion: "1.0.0",
    clipName: clip.name,
    exportMode: modeForMeta,
    sheet: sheetInfo,
    frames: baked.map((bakedFrame, idx) => ({
      index: bakedFrame.sourceIndex,
      name: `${clip.name}_${String(bakedFrame.sourceIndex).padStart(3, "0")}`,
      delayMs: bakedFrame.frame.delayMs,
      pivotNorm: bakedFrame.frame.pivotNorm,
      offsetPx: bakedFrame.frame.offsetPx,
      rect: rects ? rects[idx] : undefined
    })),
    unity: {
      ppu: clip.unity.ppu,
      filterMode: clip.unity.filterMode,
      spriteModeDefault: clip.unity.spriteModeDefault,
      loopMode: clip.loopMode,
      createPrefab: clip.unity.createPrefab,
      prefabRenderer: clip.unity.prefabRenderer
    }
  };

  const metaPath = path.join(exportDir, "meta.json");
  await fs.writeJson(metaPath, meta, { spaces: 2 });

  return {
    exportDir,
    metaPath
  };
}
