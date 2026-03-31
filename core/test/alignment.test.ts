import { describe, expect, it } from "vitest";
import {
  bottomLineDeltaToTarget,
  computeBottomOpaqueLine,
  computeOpaqueCentroid
} from "../src/alignment/index.js";

function makeFrame(width: number, height: number, opaquePixels: Array<[number, number]>): Uint8Array {
  const rgba = new Uint8Array(width * height * 4);
  for (const [x, y] of opaquePixels) {
    const idx = (y * width + x) * 4;
    rgba[idx] = 255;
    rgba[idx + 1] = 255;
    rgba[idx + 2] = 255;
    rgba[idx + 3] = 255;
  }
  return rgba;
}

describe("alignment math", () => {
  it("computes centroid of opaque mass", () => {
    const rgba = makeFrame(4, 4, [
      [1, 1],
      [2, 1],
      [1, 2],
      [2, 2]
    ]);

    const centroid = computeOpaqueCentroid(rgba, 4, 4);
    expect(centroid).toEqual({ x: 1.5, y: 1.5 });
  });

  it("computes bottom line and delta", () => {
    const rgba = makeFrame(5, 5, [
      [1, 2],
      [2, 4]
    ]);

    const bottom = computeBottomOpaqueLine(rgba, 5, 5);
    expect(bottom).toBe(4);

    const delta = bottomLineDeltaToTarget(rgba, 5, 5, 6);
    expect(delta).toBe(2);
  });
});
