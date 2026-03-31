import { describe, expect, it } from "vitest";
import { packMaxRects } from "../src/packing/maxRects.js";

function overlap(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

describe("maxrect packing", () => {
  it("packs sprites without overlap and within bounds", () => {
    const packed = packMaxRects(
      [
        { id: "a", w: 32, h: 16 },
        { id: "b", w: 12, h: 12 },
        { id: "c", w: 20, h: 24 },
        { id: "d", w: 8, h: 8 }
      ],
      256,
      2,
      false
    );

    expect(packed.width).toBeLessThanOrEqual(256);
    expect(packed.height).toBeLessThanOrEqual(256);

    for (const rect of packed.rects) {
      expect(rect.x + rect.w).toBeLessThanOrEqual(packed.width);
      expect(rect.y + rect.h).toBeLessThanOrEqual(packed.height);
    }

    for (let i = 0; i < packed.rects.length; i += 1) {
      for (let j = i + 1; j < packed.rects.length; j += 1) {
        expect(overlap(packed.rects[i], packed.rects[j])).toBe(false);
      }
    }
  });
});
