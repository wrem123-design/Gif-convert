import sharp from "sharp";
import { Clip } from "../types.js";
import { bottomLineDeltaToTarget, centroidDeltaToTarget, computeReferenceBottom } from "./index.js";

async function loadRaw(path: string): Promise<{ rgba: Uint8Array; width: number; height: number }> {
  const img = sharp(path).ensureAlpha();
  const metadata = await img.metadata();
  return {
    rgba: new Uint8Array(await img.raw().toBuffer()),
    width: metadata.width ?? 1,
    height: metadata.height ?? 1
  };
}

export async function autoCenterMass(clip: Clip): Promise<Array<{ frameId: string; deltaX: number; deltaY: number }>> {
  const updates: Array<{ frameId: string; deltaX: number; deltaY: number }> = [];
  const threshold = Math.max(0, Math.min(255, Math.round((clip.inspector.trimPad?.alphaThreshold ?? 0.03) * 255)));

  for (const frame of clip.frames) {
    const raw = await loadRaw(frame.srcPath);
    const target = { x: raw.width / 2, y: raw.height / 2 };
    const delta = centroidDeltaToTarget(raw.rgba, raw.width, raw.height, target, threshold);
    updates.push({
      frameId: frame.id,
      deltaX: delta.x,
      deltaY: delta.y
    });
  }

  return updates;
}

export async function smartBottomAlign(clip: Clip): Promise<Array<{ frameId: string; deltaY: number }>> {
  const raws = await Promise.all(clip.frames.map((f) => loadRaw(f.srcPath)));
  const threshold = Math.max(0, Math.min(255, Math.round((clip.inspector.trimPad?.alphaThreshold ?? 0.03) * 255)));
  const refBottom = computeReferenceBottom(raws, threshold);

  return raws.map((raw, idx) => ({
    frameId: clip.frames[idx].id,
    deltaY: bottomLineDeltaToTarget(raw.rgba, raw.width, raw.height, refBottom, threshold)
  }));
}
