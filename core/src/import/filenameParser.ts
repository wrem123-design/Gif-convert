import path from "node:path";

export interface ParsedFileName {
  baseName: string;
  index: number | null;
  ext: string;
}

const suffixPattern = /^(.*?)(?:[_\-\s]?)(\d+)$/;

export function parseFilename(filePath: string): ParsedFileName {
  const ext = path.extname(filePath).toLowerCase();
  const stem = path.basename(filePath, ext);
  const match = stem.match(suffixPattern);
  if (!match) {
    return {
      baseName: stem,
      index: null,
      ext
    };
  }

  return {
    baseName: match[1] || stem,
    index: Number.parseInt(match[2], 10),
    ext
  };
}

export function deriveClipName(paths: string[]): string {
  if (!paths.length) {
    return "Clip";
  }
  const parsed = parseFilename(paths[0]);
  return parsed.baseName.trim() || "Clip";
}

export function sortSequencePaths(paths: string[]): string[] {
  return [...paths].sort((a, b) => {
    const pa = parseFilename(a);
    const pb = parseFilename(b);

    const baseCmp = pa.baseName.localeCompare(pb.baseName, undefined, { sensitivity: "base" });
    if (baseCmp !== 0) {
      return baseCmp;
    }

    if (pa.index !== null && pb.index !== null) {
      if (pa.index !== pb.index) {
        return pa.index - pb.index;
      }
    } else if (pa.index !== null) {
      return -1;
    } else if (pb.index !== null) {
      return 1;
    }

    return a.localeCompare(b, undefined, { sensitivity: "base" });
  });
}

export function groupPngSequence(paths: string[]): { clipName: string; ordered: string[] } {
  const ordered = sortSequencePaths(paths);
  return {
    clipName: deriveClipName(ordered),
    ordered
  };
}
