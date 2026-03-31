export interface Point {
  x: number;
  y: number;
}

export function computeOpaqueCentroid(
  rgba: Uint8Array,
  width: number,
  height: number,
  alphaThreshold = 1
): Point | null {
  let sumX = 0;
  let sumY = 0;
  let count = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = rgba[(y * width + x) * 4 + 3];
      if (alpha >= alphaThreshold) {
        sumX += x;
        sumY += y;
        count += 1;
      }
    }
  }

  if (!count) {
    return null;
  }

  return {
    x: sumX / count,
    y: sumY / count
  };
}

export function computeBottomOpaqueLine(
  rgba: Uint8Array,
  width: number,
  height: number,
  alphaThreshold = 1
): number {
  for (let y = height - 1; y >= 0; y -= 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = rgba[(y * width + x) * 4 + 3];
      if (alpha >= alphaThreshold) {
        return y;
      }
    }
  }
  return -1;
}

export function centroidDeltaToTarget(
  rgba: Uint8Array,
  width: number,
  height: number,
  target: Point,
  alphaThreshold = 1
): Point {
  const centroid = computeOpaqueCentroid(rgba, width, height, alphaThreshold);
  if (!centroid) {
    return { x: 0, y: 0 };
  }
  return {
    x: Math.round(target.x - centroid.x),
    y: Math.round(target.y - centroid.y)
  };
}

export function bottomLineDeltaToTarget(
  rgba: Uint8Array,
  width: number,
  height: number,
  targetBottomY: number,
  alphaThreshold = 1
): number {
  const bottom = computeBottomOpaqueLine(rgba, width, height, alphaThreshold);
  if (bottom < 0) {
    return 0;
  }
  return targetBottomY - bottom;
}

export function computeReferenceBottom(
  frames: Array<{ rgba: Uint8Array; width: number; height: number }>,
  alphaThreshold = 1
): number {
  const bottoms = frames
    .map((f) => computeBottomOpaqueLine(f.rgba, f.width, f.height, alphaThreshold))
    .filter((v) => v >= 0);

  if (!bottoms.length) {
    return 0;
  }
  return Math.max(...bottoms);
}
