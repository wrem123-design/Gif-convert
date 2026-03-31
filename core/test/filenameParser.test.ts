import { describe, expect, it } from "vitest";
import { deriveClipName, sortSequencePaths } from "../src/import/filenameParser.js";

describe("filename parser", () => {
  it("sorts numeric suffix correctly", () => {
    const sorted = sortSequencePaths([
      "C:/a/Run_010.png",
      "C:/a/Run_002.png",
      "C:/a/Run_001.png",
      "C:/a/Run_100.png"
    ]);

    expect(sorted.map((s) => s.split("/").pop())).toEqual([
      "Run_001.png",
      "Run_002.png",
      "Run_010.png",
      "Run_100.png"
    ]);
  });

  it("derives clip name from first file", () => {
    expect(deriveClipName(["D:/sprites/Idle_001.png"]))
      .toBe("Idle");
  });
});
