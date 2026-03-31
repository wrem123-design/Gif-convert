import { PackedRect, PackedSheet } from "../types.js";

interface InputRect {
  id: string;
  w: number;
  h: number;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Placement {
  id: string;
  padded: Rect;
  actual: Rect;
}

function nextPow2(value: number): number {
  let v = 1;
  while (v < value) {
    v <<= 1;
  }
  return v;
}

function area(r: Rect): number {
  return r.w * r.h;
}

function intersects(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function contains(a: Rect, b: Rect): boolean {
  return b.x >= a.x && b.y >= a.y && b.x + b.w <= a.x + a.w && b.y + b.h <= a.y + a.h;
}

function splitFreeRect(freeRect: Rect, usedRect: Rect): Rect[] {
  if (!intersects(freeRect, usedRect)) {
    return [freeRect];
  }

  const out: Rect[] = [];

  if (usedRect.x > freeRect.x) {
    out.push({
      x: freeRect.x,
      y: freeRect.y,
      w: usedRect.x - freeRect.x,
      h: freeRect.h
    });
  }

  if (usedRect.x + usedRect.w < freeRect.x + freeRect.w) {
    out.push({
      x: usedRect.x + usedRect.w,
      y: freeRect.y,
      w: freeRect.x + freeRect.w - (usedRect.x + usedRect.w),
      h: freeRect.h
    });
  }

  const left = Math.max(freeRect.x, usedRect.x);
  const right = Math.min(freeRect.x + freeRect.w, usedRect.x + usedRect.w);

  if (usedRect.y > freeRect.y && right > left) {
    out.push({
      x: left,
      y: freeRect.y,
      w: right - left,
      h: usedRect.y - freeRect.y
    });
  }

  if (usedRect.y + usedRect.h < freeRect.y + freeRect.h && right > left) {
    out.push({
      x: left,
      y: usedRect.y + usedRect.h,
      w: right - left,
      h: freeRect.y + freeRect.h - (usedRect.y + usedRect.h)
    });
  }

  return out.filter((r) => r.w > 0 && r.h > 0);
}

function pruneFreeRects(freeRects: Rect[]): Rect[] {
  const pruned: Rect[] = [];
  for (let i = 0; i < freeRects.length; i += 1) {
    let keep = true;
    for (let j = 0; j < freeRects.length; j += 1) {
      if (i === j) {
        continue;
      }
      if (contains(freeRects[j], freeRects[i])) {
        keep = false;
        break;
      }
    }
    if (keep) {
      pruned.push(freeRects[i]);
    }
  }
  return pruned;
}

function choosePlacement(
  freeRects: Rect[],
  rect: { w: number; h: number },
  allowRotate: boolean
): { node: Rect | null; rotated: boolean } {
  let bestScore = Number.POSITIVE_INFINITY;
  let bestNode: Rect | null = null;
  let rotated = false;

  for (const free of freeRects) {
    const candidates = [{ w: rect.w, h: rect.h, rotated: false }];
    if (allowRotate && rect.w !== rect.h) {
      candidates.push({ w: rect.h, h: rect.w, rotated: true });
    }

    for (const c of candidates) {
      if (c.w <= free.w && c.h <= free.h) {
        const score = area(free) - c.w * c.h;
        if (score < bestScore) {
          bestScore = score;
          bestNode = { x: free.x, y: free.y, w: c.w, h: c.h };
          rotated = c.rotated;
        }
      }
    }
  }

  return { node: bestNode, rotated };
}

function tryPack(
  inputs: InputRect[],
  size: number,
  padding: number,
  allowRotate: boolean
): { placements: Placement[]; width: number; height: number } | null {
  const freeRects: Rect[] = [{ x: 0, y: 0, w: size, h: size }];
  const placements: Placement[] = [];

  for (const input of inputs) {
    const paddedW = input.w + padding * 2;
    const paddedH = input.h + padding * 2;
    const { node, rotated } = choosePlacement(
      freeRects,
      { w: paddedW, h: paddedH },
      allowRotate
    );

    if (!node) {
      return null;
    }

    const usedRect = node;
    const nextFree: Rect[] = [];
    for (const free of freeRects) {
      nextFree.push(...splitFreeRect(free, usedRect));
    }

    freeRects.splice(0, freeRects.length, ...pruneFreeRects(nextFree));

    const actualW = rotated ? input.h : input.w;
    const actualH = rotated ? input.w : input.h;

    placements.push({
      id: input.id,
      padded: usedRect,
      actual: {
        x: usedRect.x + padding,
        y: usedRect.y + padding,
        w: actualW,
        h: actualH
      }
    });
  }

  const usedRight = placements.reduce((m, p) => Math.max(m, p.actual.x + p.actual.w), 0);
  const usedBottom = placements.reduce((m, p) => Math.max(m, p.actual.y + p.actual.h), 0);

  return {
    placements,
    width: nextPow2(Math.max(1, usedRight)),
    height: nextPow2(Math.max(1, usedBottom))
  };
}

export function packMaxRects(
  items: InputRect[],
  maxTextureSize: number,
  padding: number,
  allowRotate: boolean
): PackedSheet {
  if (!items.length) {
    return { width: 1, height: 1, rects: [] };
  }

  const sorted = [...items].sort((a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h));
  const totalArea = sorted.reduce((sum, item) => sum + (item.w + padding * 2) * (item.h + padding * 2), 0);
  const minSide = Math.max(
    ...sorted.map((s) => Math.max(s.w + padding * 2, s.h + padding * 2)),
    Math.ceil(Math.sqrt(totalArea))
  );

  let side = nextPow2(minSide);
  while (side <= maxTextureSize) {
    const packed = tryPack(sorted, side, padding, allowRotate);
    if (packed && packed.width <= maxTextureSize && packed.height <= maxTextureSize) {
      const rectMap = new Map<string, PackedRect>();
      for (const placement of packed.placements) {
        rectMap.set(placement.id, {
          id: placement.id,
          x: placement.actual.x,
          y: placement.actual.y,
          w: placement.actual.w,
          h: placement.actual.h
        });
      }

      return {
        width: packed.width,
        height: packed.height,
        rects: items.map((item) => {
          const rect = rectMap.get(item.id);
          if (!rect) {
            throw new Error(`Missing packed rect for ${item.id}`);
          }
          return rect;
        })
      };
    }
    side <<= 1;
  }

  throw new Error(`Unable to pack sprites within max texture size ${maxTextureSize}`);
}
