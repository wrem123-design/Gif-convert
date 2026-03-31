import { useCallback, useEffect, useRef, useState } from "react";
import { useEditorStore } from "../state/editorStore";
import { useCurrentClip } from "../utils/selectors";
import { useFrameDataUrl } from "../hooks/useFrameDataUrl";
import { useI18n } from "../i18n";

type PixelTool = "move" | "pencil" | "eraser" | "eyedropper" | "fill" | "clone" | "select";

const pixelToolLabel: Record<PixelTool, string> = {
  move: "이동",
  pencil: "펜",
  eraser: "지우개",
  eyedropper: "스포이드",
  fill: "채우기",
  clone: "복제 스탬프",
  select: "선택"
};

type ToolbarIcon = PixelTool | "undo" | "redo";

function ToolbarIconSvg(props: { name: ToolbarIcon }): JSX.Element {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const
  };

  if (props.name === "undo") {
    return (
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
        <path {...common} d="M9 7H4v5" />
        <path {...common} d="M20 17a8 8 0 0 0-8-8H4" />
      </svg>
    );
  }
  if (props.name === "redo") {
    return (
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
        <path {...common} d="M15 7h5v5" />
        <path {...common} d="M4 17a8 8 0 0 1 8-8h8" />
      </svg>
    );
  }
  if (props.name === "pencil") {
    return (
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
        <path {...common} d="M3 21l3.8-1 11-11a2 2 0 0 0-2.8-2.8l-11 11L3 21z" />
      </svg>
    );
  }
  if (props.name === "move") {
    return (
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
        <path {...common} d="M12 2v20M2 12h20" />
        <path {...common} d="M12 2l-3 3M12 2l3 3M22 12l-3-3M22 12l-3 3M12 22l-3-3M12 22l3-3M2 12l3-3M2 12l3 3" />
      </svg>
    );
  }
  if (props.name === "eraser") {
    return (
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
        <path {...common} d="M7 16l7.5-7.5a2.3 2.3 0 0 1 3.2 0l1.8 1.8a2.3 2.3 0 0 1 0 3.2L14 19H7l-3-3 3-3z" />
        <path {...common} d="M14 19h7" />
      </svg>
    );
  }
  if (props.name === "eyedropper") {
    return (
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
        <path {...common} d="M10 14l-6 6" />
        <path {...common} d="M15.5 3.5l5 5-8 8a3.5 3.5 0 0 1-5-5l8-8z" />
      </svg>
    );
  }
  if (props.name === "fill") {
    return (
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
        <path {...common} d="M8 3l8 8-6 6-8-8 6-6z" />
        <path {...common} d="M3 21h18" />
      </svg>
    );
  }
  if (props.name === "clone") {
    return (
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
        <rect {...common} x="8" y="8" width="10" height="10" rx="1.5" />
        <path {...common} d="M6 14H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v1" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <rect {...common} x="4" y="4" width="16" height="16" />
      <path {...common} d="M4 12h16M12 4v16" />
    </svg>
  );
}

interface SelectionRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function clearRegionInImageData(image: ImageData, rect: SelectionRect): void {
  const x0 = Math.max(0, rect.x);
  const y0 = Math.max(0, rect.y);
  const x1 = Math.min(image.width, rect.x + rect.w);
  const y1 = Math.min(image.height, rect.y + rect.h);
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const idx = (y * image.width + x) * 4;
      image.data[idx] = 0;
      image.data[idx + 1] = 0;
      image.data[idx + 2] = 0;
      image.data[idx + 3] = 0;
    }
  }
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function getOverlayShiftRange(
  stageWidth: number,
  leftCanvasWidthPx: number,
  rightCanvasWidthPx: number,
  enabled: boolean
): { baseSeparationPx: number; minShiftPx: number; maxShiftPx: number } {
  if (!enabled) {
    return {
      baseSeparationPx: 0,
      minShiftPx: 0,
      maxShiftPx: 0
    };
  }

  const baseSeparationPx = Math.max(140, Math.min(stageWidth * 0.62, 760));
  const sideTravelPx = Math.max(220, Math.max(leftCanvasWidthPx, rightCanvasWidthPx));

  return {
    baseSeparationPx,
    minShiftPx: -sideTravelPx,
    maxShiftPx: baseSeparationPx + sideTravelPx
  };
}

function normalizeRect(rect: SelectionRect): SelectionRect {
  const x = rect.w < 0 ? rect.x + rect.w : rect.x;
  const y = rect.h < 0 ? rect.y + rect.h : rect.y;
  const w = Math.abs(rect.w);
  const h = Math.abs(rect.h);
  return { x, y, w, h };
}

function getOpaqueBounds(ctx: CanvasRenderingContext2D, width: number, height: number): SelectionRect | null {
  const image = ctx.getImageData(0, 0, width, height);
  const data = image.data;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = data[(y * width + x) * 4 + 3];
      if (alpha === 0) {
        continue;
      }
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }

  if (maxX < minX || maxY < minY) {
    return null;
  }
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

function floodFill(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  startX: number,
  startY: number,
  color: [number, number, number, number]
): void {
  const idx = (startY * width + startX) * 4;
  const target: [number, number, number, number] = [data[idx], data[idx + 1], data[idx + 2], data[idx + 3]];
  if (target[0] === color[0] && target[1] === color[1] && target[2] === color[2] && target[3] === color[3]) {
    return;
  }

  const stack: Array<[number, number]> = [[startX, startY]];
  while (stack.length) {
    const [x, y] = stack.pop()!;
    if (x < 0 || y < 0 || x >= width || y >= height) {
      continue;
    }
    const i = (y * width + x) * 4;
    if (
      data[i] !== target[0]
      || data[i + 1] !== target[1]
      || data[i + 2] !== target[2]
      || data[i + 3] !== target[3]
    ) {
      continue;
    }

    data[i] = color[0];
    data[i + 1] = color[1];
    data[i + 2] = color[2];
    data[i + 3] = color[3];

    stack.push([x + 1, y]);
    stack.push([x - 1, y]);
    stack.push([x, y + 1]);
    stack.push([x, y - 1]);
  }
}

function hexToRgba(hex: string): [number, number, number, number] {
  const clean = hex.replace("#", "");
  return [
    Number.parseInt(clean.slice(0, 2), 16),
    Number.parseInt(clean.slice(2, 4), 16),
    Number.parseInt(clean.slice(4, 6), 16),
    255
  ];
}

async function transformImageByTransform(
  dataUrl: string,
  transform: {
    offsetX: number;
    offsetY: number;
    scaleX: number;
    scaleY: number;
    pivotXNorm: number;
    pivotYNorm: number;
  }
): Promise<string> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("이미지를 불러오지 못했습니다."));
    el.src = dataUrl;
  });

  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("캔버스 컨텍스트를 만들지 못했습니다.");
  }
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = false;
  const scaleX = Math.max(0.05, transform.scaleX);
  const scaleY = Math.max(0.05, transform.scaleY);
  const pivotX = img.width * transform.pivotXNorm;
  const pivotY = img.height * (1 - transform.pivotYNorm);
  const translateX = transform.offsetX + pivotX - pivotX * scaleX;
  const translateY = transform.offsetY + pivotY - pivotY * scaleY;
  ctx.setTransform(scaleX, 0, 0, scaleY, translateX, translateY);
  ctx.drawImage(img, 0, 0);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  return canvas.toDataURL("image/png");
}

interface PixelEditorPanelProps {
  mode?: "asset" | "sprite";
}

export function PixelEditorPanel(props: PixelEditorPanelProps): JSX.Element {
  const mode = props.mode ?? "asset";
  const allowReference = mode === "asset";
  const pixelPanelPrefsKey = allowReference
    ? "sprite_forge_pixel_panel_prefs_asset_v1"
    : "sprite_forge_pixel_panel_prefs_sprite_v1";
  const { t } = useI18n();
  const clip = useCurrentClip();
  const activeFrameIndex = useEditorStore((s) => s.activeFrameIndex);
  const viewport = useEditorStore((s) => s.viewport);
  const getImageDataUrl = useEditorStore((s) => s.getImageDataUrl);
  const writeImageDataUrl = useEditorStore((s) => s.writeImageDataUrl);
  const updateClip = useEditorStore((s) => s.updateClip);
  const setActiveHelpTopic = useEditorStore((s) => s.setActiveHelpTopic);
  const fitViewToken = useEditorStore((s) => s.fitViewToken);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  const canUndo = useEditorStore((s) => s.undoStack.length > 0);
  const canRedo = useEditorStore((s) => s.redoStack.length > 0);

  const frame = clip?.frames[activeFrameIndex] ?? null;
  const prevFrame = clip && clip.frames.length ? clip.frames[(activeFrameIndex - 1 + clip.frames.length) % clip.frames.length] : null;

  const currentDataUrl = useFrameDataUrl(frame?.srcPath);
  const prevDataUrl = useFrameDataUrl(prevFrame?.srcPath);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const stageRootRef = useRef<HTMLDivElement | null>(null);
  const referenceInputRef = useRef<HTMLInputElement | null>(null);
  const [tool, setTool] = useState<PixelTool>("pencil");
  const [color, setColor] = useState("#2EA3FF");
  const [scale, setScale] = useState(8);
  const [viewPan, setViewPan] = useState({ x: 0, y: 0 });
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [overlayOpacity, setOverlayOpacity] = useState(0.2);
  const [showGrid, setShowGrid] = useState(true);
  const [selection, setSelection] = useState<SelectionRect | null>(null);
  const [cloneSource, setCloneSource] = useState<{ x: number; y: number } | null>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 1, height: 1 });
  const [referenceDataUrl, setReferenceDataUrl] = useState<string | null>(null);
  const [referenceName, setReferenceName] = useState("");
  const [referenceImageSize, setReferenceImageSize] = useState({ width: 1, height: 1 });
  const [overlayShiftPx, setOverlayShiftPx] = useState(0);
  const [stageMetrics, setStageMetrics] = useState({ width: 1, height: 1 });
  const [savingAllFrames, setSavingAllFrames] = useState(false);
  const [saveAllProgress, setSaveAllProgress] = useState<{
    done: number;
    total: number;
    failed: number;
    running: boolean;
  }>({
    done: 0,
    total: 0,
    failed: 0,
    running: false
  });
  const [saveAllResultMessage, setSaveAllResultMessage] = useState("");

  const clipboard = useRef<ImageData | null>(null);
  const drag = useRef<
    | {
        mode: "draw" | "select" | "move" | "moveCanvas" | "clone";
        startX: number;
        startY: number;
        sourceSelection?: SelectionRect;
        sourcePixels?: ImageData;
        baseLayerWithoutSelection?: ImageData;
        baseImage?: ImageData;
        cloneSnapshot?: ImageData;
        cloneOffsetX?: number;
        cloneOffsetY?: number;
      }
    | null
  >(null);
  const panDragRef = useRef<{ startX: number; startY: number; baseX: number; baseY: number } | null>(null);
  const splitDragRef = useRef<{
    startX: number;
    startShiftPx: number;
    minShiftPx: number;
    maxShiftPx: number;
  } | null>(null);
  const handledFitTokenRef = useRef(0);
  const autoFittedClipIdRef = useRef<string | null>(null);

  const fitToStage = useCallback((width: number, height: number) => {
    const stage = stageRef.current;
    if (!stage || width <= 0 || height <= 0) {
      return;
    }

    const availableW = Math.max(1, stage.clientWidth - 24);
    const availableH = Math.max(1, stage.clientHeight - 24);
    const fitted = Math.min(availableW / width, availableH / height);
    const nextScale = Math.max(0.1, Math.min(32, fitted));
    setScale(Number(nextScale.toFixed(3)));
    setViewPan({ x: 0, y: 0 });
  }, []);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(pixelPanelPrefsKey);
      if (!raw) {
        return;
      }
      const prefs = JSON.parse(raw) as {
        showGrid?: boolean;
        overlayOpacity?: number;
        overlayShiftPx?: number;
      };
      if (typeof prefs.showGrid === "boolean") {
        setShowGrid(prefs.showGrid);
      }
      if (typeof prefs.overlayOpacity === "number") {
        setOverlayOpacity(clamp(prefs.overlayOpacity, 0, 0.8));
      }
      if (typeof prefs.overlayShiftPx === "number") {
        setOverlayShiftPx(prefs.overlayShiftPx);
      }
    } catch {
      // Ignore malformed local preference data.
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(pixelPanelPrefsKey, JSON.stringify({
        showGrid,
        overlayOpacity,
        overlayShiftPx
      }));
    } catch {
      // Ignore storage write failures.
    }
  }, [overlayOpacity, overlayShiftPx, showGrid]);

  useEffect(() => {
    if (!allowReference) {
      setOverlayShiftPx(0);
      return;
    }
    const frameScaleX = Math.max(0.05, frame?.scale?.x ?? 1);
    const leftCanvasWidthPx = Math.max(1, canvasSize.width * scale * frameScaleX);
    const rightCanvasWidthPx = Math.max(1, referenceImageSize.width * scale);
    const range = getOverlayShiftRange(stageMetrics.width, leftCanvasWidthPx, rightCanvasWidthPx, Boolean(referenceDataUrl));
    setOverlayShiftPx((prev) => clamp(prev, range.minShiftPx, range.maxShiftPx));
  }, [allowReference, canvasSize.width, frame?.scale?.x, referenceDataUrl, referenceImageSize.width, scale, stageMetrics.width]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !currentDataUrl) {
      setCanvasSize({ width: 1, height: 1 });
      return;
    }

    const img = new Image();
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      setCanvasSize({ width: img.width, height: img.height });
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        return;
      }
      ctx.clearRect(0, 0, img.width, img.height);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, 0, 0);
      setSelection(null);
      const clipId = clip?.id ?? null;
      if (clipId && autoFittedClipIdRef.current !== clipId) {
        autoFittedClipIdRef.current = clipId;
        window.requestAnimationFrame(() => fitToStage(img.width, img.height));
      }
    };
    img.src = currentDataUrl;
  }, [clip?.id, currentDataUrl, fitToStage]);

  useEffect(() => {
    setCloneSource(null);
  }, [frame?.id]);

  useEffect(() => {
    if (fitViewToken === handledFitTokenRef.current) {
      return;
    }
    fitToStage(canvasSize.width, canvasSize.height);
    handledFitTokenRef.current = fitViewToken;
  }, [canvasSize.height, canvasSize.width, fitToStage, fitViewToken]);

  useEffect(() => {
    setActiveHelpTopic("pixel_tools");
  }, [setActiveHelpTopic, tool]);

  useEffect(() => {
    const onDown = (event: KeyboardEvent) => {
      if (event.code === "Space") {
        setSpaceHeld(true);
      }
    };
    const onUp = (event: KeyboardEvent) => {
      if (event.code === "Space") {
        setSpaceHeld(false);
      }
    };

    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!canvasRef.current || !selection) {
        return;
      }

      const ctx = canvasRef.current.getContext("2d");
      if (!ctx) {
        return;
      }

      if (event.ctrlKey && event.key.toLowerCase() === "c") {
        event.preventDefault();
        const rect = normalizeRect(selection);
        clipboard.current = ctx.getImageData(rect.x, rect.y, rect.w, rect.h);
      }

      if (event.ctrlKey && event.key.toLowerCase() === "v") {
        event.preventDefault();
        if (!clipboard.current) {
          return;
        }
        ctx.putImageData(clipboard.current, selection.x, selection.y);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selection]);

  useEffect(() => {
    const root = stageRootRef.current;
    if (!root) {
      return;
    }

    const updateMetrics = () => {
      const rect = root.getBoundingClientRect();
      setStageMetrics({
        width: Math.max(1, rect.width),
        height: Math.max(1, rect.height)
      });
    };

    updateMetrics();
    const observer = new ResizeObserver(updateMetrics);
    observer.observe(root);
    window.addEventListener("resize", updateMetrics);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateMetrics);
    };
  }, []);

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      if (!splitDragRef.current) {
        return;
      }
      const drag = splitDragRef.current;
      const delta = drag.startX - event.clientX;
      setOverlayShiftPx(clamp(drag.startShiftPx + delta, drag.minShiftPx, drag.maxShiftPx));
    };
    const onPointerUp = () => {
      splitDragRef.current = null;
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, []);

  const getPos = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return { x: 0, y: 0 };
    }
    const rect = canvas.getBoundingClientRect();
    const scaleX = Math.max(0.05, frame?.scale?.x ?? 1);
    const scaleY = Math.max(0.05, frame?.scale?.y ?? 1);
    const x = clamp(Math.floor((event.clientX - rect.left) / (scale * scaleX)), 0, canvas.width - 1);
    const y = clamp(Math.floor((event.clientY - rect.top) / (scale * scaleY)), 0, canvas.height - 1);
    return { x, y };
  };

  const paintPixel = (x: number, y: number, rgba: [number, number, number, number]) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const image = ctx.getImageData(x, y, 1, 1);
    image.data[0] = rgba[0];
    image.data[1] = rgba[1];
    image.data[2] = rgba[2];
    image.data[3] = rgba[3];
    ctx.putImageData(image, x, y);
  };

  const paintClonePixel = (
    destX: number,
    destY: number,
    snapshot: ImageData,
    offsetX: number,
    offsetY: number
  ) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const srcX = destX + offsetX;
    const srcY = destY + offsetY;
    if (srcX < 0 || srcY < 0 || srcX >= canvas.width || srcY >= canvas.height) {
      return;
    }
    const srcIndex = (srcY * canvas.width + srcX) * 4;
    const image = ctx.getImageData(destX, destY, 1, 1);
    image.data[0] = snapshot.data[srcIndex];
    image.data[1] = snapshot.data[srcIndex + 1];
    image.data[2] = snapshot.data[srcIndex + 2];
    image.data[3] = snapshot.data[srcIndex + 3];
    ctx.putImageData(image, destX, destY);
  };

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) {
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);

    const isPan = event.button === 1 || (event.button === 0 && spaceHeld);
    if (isPan) {
      panDragRef.current = {
        startX: event.clientX,
        startY: event.clientY,
        baseX: viewPan.x,
        baseY: viewPan.y
      };
      return;
    }

    const { x, y } = getPos(event);
    const ctx = canvasRef.current.getContext("2d");
    if (!ctx) {
      return;
    }

    if (tool === "eyedropper") {
      const sample = ctx.getImageData(x, y, 1, 1).data;
      setColor(`#${sample[0].toString(16).padStart(2, "0")}${sample[1].toString(16).padStart(2, "0")}${sample[2].toString(16).padStart(2, "0")}`);
      return;
    }

    if (tool === "fill") {
      const image = ctx.getImageData(0, 0, canvasRef.current.width, canvasRef.current.height);
      floodFill(image.data, image.width, image.height, x, y, hexToRgba(color));
      ctx.putImageData(image, 0, 0);
      return;
    }

    if (tool === "select") {
      const rect = selection ? normalizeRect(selection) : null;
      const inSelection = rect
        ? x >= rect.x && y >= rect.y && x < rect.x + rect.w && y < rect.y + rect.h
        : false;

      if (inSelection && rect) {
        const sourcePixels = ctx.getImageData(rect.x, rect.y, rect.w, rect.h);
        const baseLayerWithoutSelection = ctx.getImageData(0, 0, canvasRef.current.width, canvasRef.current.height);
        clearRegionInImageData(baseLayerWithoutSelection, rect);
        ctx.putImageData(baseLayerWithoutSelection, 0, 0);
        drag.current = {
          mode: "move",
          startX: x,
          startY: y,
          sourceSelection: rect,
          sourcePixels,
          baseLayerWithoutSelection
        };
      } else {
        setSelection({ x, y, w: 1, h: 1 });
        drag.current = {
          mode: "select",
          startX: x,
          startY: y
        };
      }
      return;
    }

    if (tool === "move") {
      setSelection(null);
      drag.current = {
        mode: "moveCanvas",
        startX: x,
        startY: y,
        baseImage: ctx.getImageData(0, 0, canvasRef.current.width, canvasRef.current.height)
      };
      return;
    }

    if (tool === "clone") {
      if (event.altKey) {
        setCloneSource({ x, y });
        return;
      }
      if (!cloneSource) {
        return;
      }
      const snapshot = ctx.getImageData(0, 0, canvasRef.current.width, canvasRef.current.height);
      const offsetX = cloneSource.x - x;
      const offsetY = cloneSource.y - y;
      paintClonePixel(x, y, snapshot, offsetX, offsetY);
      drag.current = {
        mode: "clone",
        startX: x,
        startY: y,
        cloneSnapshot: snapshot,
        cloneOffsetX: offsetX,
        cloneOffsetY: offsetY
      };
      return;
    }

    if (tool === "pencil") {
      paintPixel(x, y, hexToRgba(color));
    }

    if (tool === "eraser") {
      paintPixel(x, y, [0, 0, 0, 0]);
    }

    drag.current = {
      mode: "draw",
      startX: x,
      startY: y
    };
  };

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (panDragRef.current) {
      const dx = event.clientX - panDragRef.current.startX;
      const dy = event.clientY - panDragRef.current.startY;
      setViewPan({
        x: panDragRef.current.baseX + dx,
        y: panDragRef.current.baseY + dy
      });
      return;
    }

    if (!canvasRef.current || !drag.current) {
      return;
    }

    const { x, y } = getPos(event);
    const ctx = canvasRef.current.getContext("2d");
    if (!ctx) {
      return;
    }

    if (drag.current.mode === "draw") {
      if (tool === "pencil") {
        paintPixel(x, y, hexToRgba(color));
      }
      if (tool === "eraser") {
        paintPixel(x, y, [0, 0, 0, 0]);
      }
      return;
    }

    if (drag.current.mode === "clone" && drag.current.cloneSnapshot) {
      const offsetX = drag.current.cloneOffsetX ?? 0;
      const offsetY = drag.current.cloneOffsetY ?? 0;
      paintClonePixel(x, y, drag.current.cloneSnapshot, offsetX, offsetY);
      drag.current.startX = x;
      drag.current.startY = y;
      return;
    }

    if (drag.current.mode === "select") {
      setSelection({ x: drag.current.startX, y: drag.current.startY, w: x - drag.current.startX, h: y - drag.current.startY });
      return;
    }

    if (drag.current.mode === "moveCanvas" && drag.current.baseImage) {
      const dx = x - drag.current.startX;
      const dy = y - drag.current.startY;
      ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      ctx.putImageData(drag.current.baseImage, dx, dy);
      return;
    }

    if (drag.current.mode === "move" && drag.current.sourceSelection && drag.current.sourcePixels && drag.current.baseLayerWithoutSelection) {
      const dx = x - drag.current.startX;
      const dy = y - drag.current.startY;
      const targetX = clamp(drag.current.sourceSelection.x + dx, 0, canvasRef.current.width - drag.current.sourceSelection.w);
      const targetY = clamp(drag.current.sourceSelection.y + dy, 0, canvasRef.current.height - drag.current.sourceSelection.h);

      const source = drag.current.sourceSelection;
      ctx.putImageData(drag.current.baseLayerWithoutSelection, 0, 0);
      ctx.putImageData(drag.current.sourcePixels, targetX, targetY);
      setSelection({ x: targetX, y: targetY, w: source.w, h: source.h });
    }
  };

  const onPointerUp = () => {
    panDragRef.current = null;
    drag.current = null;
    if (selection) {
      setSelection(normalizeRect(selection));
    }
  };

  const onStageWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const stage = stageRef.current;
    if (!stage) {
      return;
    }

    if (event.shiftKey) {
      setViewPan((prev) => ({ x: prev.x - event.deltaY, y: prev.y }));
      return;
    }

    if (event.altKey || event.ctrlKey || event.metaKey) {
      setViewPan((prev) => ({
        x: prev.x - event.deltaX,
        y: prev.y - event.deltaY
      }));
      return;
    }

    const rect = stage.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const pointerX = event.clientX - rect.left - centerX - viewPan.x;
    const pointerY = event.clientY - rect.top - centerY - viewPan.y;
    const worldX = pointerX / scale;
    const worldY = pointerY / scale;

    const nextScale = Math.max(0.1, Math.min(32, scale * (event.deltaY > 0 ? 0.9 : 1.1)));
    const nextPanX = event.clientX - rect.left - centerX - worldX * nextScale;
    const nextPanY = event.clientY - rect.top - centerY - worldY * nextScale;

    setScale(Number(nextScale.toFixed(3)));
    setViewPan({ x: nextPanX, y: nextPanY });
  };

  const save = async () => {
    if (!canvasRef.current || !frame) {
      return;
    }
    const dataUrl = canvasRef.current.toDataURL("image/png");
    await writeImageDataUrl(frame.srcPath, dataUrl);
  };

  const saveAllFramesWithOffsets = async () => {
    if (!clip || savingAllFrames) {
      return;
    }

    setSaveAllResultMessage("");
    setSavingAllFrames(true);
    setSaveAllProgress({
      done: 0,
      total: clip.frames.length,
      failed: 0,
      running: true
    });

    const successFrameIds = new Set<string>();
    let failed = 0;

    try {
      for (let i = 0; i < clip.frames.length; i += 1) {
        const targetFrame = clip.frames[i];
        try {
          const scaleX = targetFrame.scale?.x ?? 1;
          const scaleY = targetFrame.scale?.y ?? 1;
          const hasOffset = Math.abs(targetFrame.offsetPx.x) > 0.0001 || Math.abs(targetFrame.offsetPx.y) > 0.0001;
          const hasScale = Math.abs(scaleX - 1) > 0.0001 || Math.abs(scaleY - 1) > 0.0001;
          if (hasOffset || hasScale) {
            const sourceDataUrl = await getImageDataUrl(targetFrame.srcPath);
            const transformed = await transformImageByTransform(sourceDataUrl, {
              offsetX: targetFrame.offsetPx.x,
              offsetY: targetFrame.offsetPx.y,
              scaleX,
              scaleY,
              pivotXNorm: targetFrame.pivotNorm.x,
              pivotYNorm: targetFrame.pivotNorm.y
            });
            await writeImageDataUrl(targetFrame.srcPath, transformed);
            successFrameIds.add(targetFrame.id);
          }
        } catch {
          failed += 1;
        } finally {
          setSaveAllProgress({
            done: i + 1,
            total: clip.frames.length,
            failed,
            running: true
          });
        }
      }

      if (successFrameIds.size > 0) {
        const nextClip = {
          ...clip,
          frames: clip.frames.map((entry) => (
            successFrameIds.has(entry.id)
              ? {
                  ...entry,
                  offsetPx: { x: 0, y: 0 },
                  scale: { x: 1, y: 1 }
                }
              : entry
          ))
        };
        await updateClip(nextClip, "전체 프레임 오프셋 저장", true);
      }
    } finally {
      const succeeded = Math.max(0, clip.frames.length - failed);
      setSaveAllResultMessage(
        failed > 0
          ? `전체 프레임 저장 완료: ${succeeded}/${clip.frames.length} (실패 ${failed})`
          : `전체 프레임 저장 완료: ${succeeded}/${clip.frames.length}`
      );
      setSavingAllFrames(false);
      setSaveAllProgress((prev) => ({
        ...prev,
        failed,
        running: false
      }));
    }
  };

  const selectWholeDrawing = () => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }
    const bounds = getOpaqueBounds(ctx, canvas.width, canvas.height);
    if (!bounds) {
      return;
    }
    setTool("select");
    setSelection(bounds);
    setActiveHelpTopic("pixel_tools");
  };

  const openReferencePicker = () => {
    if (!allowReference) {
      return;
    }
    referenceInputRef.current?.click();
  };

  const onSplitPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!allowReference || !referenceDataUrl) {
      return;
    }
    const stage = stageRootRef.current;
    if (!stage) {
      return;
    }
    event.preventDefault();
    const rect = stage.getBoundingClientRect();
    const leftCanvasWidthPx = Math.max(1, canvasSize.width * scale * Math.max(0.05, frame?.scale?.x ?? 1));
    const rightCanvasWidthPx = Math.max(1, referenceImageSize.width * scale);
    const range = getOverlayShiftRange(rect.width, leftCanvasWidthPx, rightCanvasWidthPx, true);
    splitDragRef.current = {
      startX: event.clientX,
      startShiftPx: overlayShiftPx,
      minShiftPx: range.minShiftPx,
      maxShiftPx: range.maxShiftPx
    };
  };

  const onReferenceFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!allowReference) {
      return;
    }
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    if (!file.type.startsWith("image/")) {
      event.target.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        return;
      }
      const img = new Image();
      img.onload = () => {
        setReferenceDataUrl(reader.result as string);
        setReferenceName(file.name);
        setReferenceImageSize({
          width: Math.max(1, img.width),
          height: Math.max(1, img.height)
        });
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
    event.target.value = "";
  };

  const stageBackgroundColor = allowReference
    ? (/^#[0-9a-f]{6}$/i.test(viewport.backgroundColor) ? viewport.backgroundColor : "#151515")
    : "#0f141d";
  const imageAreaBackgroundColor = allowReference
    ? (/^#[0-9a-f]{6}$/i.test(viewport.imageAreaColor) ? viewport.imageAreaColor : "#242424")
    : "#243246";
  const referenceAreaBackgroundColor = "#173323";
  const gridSize = Math.max(12, Math.round(scale * 2));
  const sharedGridStyle = {
    backgroundSize: `${gridSize}px ${gridSize}px`,
    backgroundPosition: "0px 0px"
  };
  const hasReference = allowReference && Boolean(referenceDataUrl);
  const frameScaleX = Math.max(0.05, frame?.scale?.x ?? 1);
  const frameScaleY = Math.max(0.05, frame?.scale?.y ?? 1);
  const baseCanvasWidthPx = Math.max(1, canvasSize.width * scale);
  const baseCanvasHeightPx = Math.max(1, canvasSize.height * scale);
  const currentCanvasWidthPx = Math.max(1, baseCanvasWidthPx * frameScaleX);
  const currentCanvasHeightPx = Math.max(1, baseCanvasHeightPx * frameScaleY);
  const referenceCanvasWidthPx = Math.max(1, referenceImageSize.width * scale);
  const referenceCanvasHeightPx = Math.max(1, referenceImageSize.height * scale);
  const overlayShiftRange = getOverlayShiftRange(
    stageMetrics.width,
    currentCanvasWidthPx,
    referenceCanvasWidthPx,
    hasReference
  );
  const layerSeparationPx = hasReference ? overlayShiftRange.baseSeparationPx : 0;
  const clampedOverlayShiftPx = hasReference
    ? clamp(overlayShiftPx, overlayShiftRange.minShiftPx, overlayShiftRange.maxShiftPx)
    : 0;
  const leftLayerBaseX = hasReference ? -layerSeparationPx / 2 : 0;
  const rightLayerBaseX = hasReference ? layerSeparationPx / 2 - clampedOverlayShiftPx : 0;
  const splitterOffsetX = (leftLayerBaseX + rightLayerBaseX) / 2;
  const pivotPxX = (frame?.pivotNorm.x ?? 0.5) * baseCanvasWidthPx;
  const pivotPxY = (1 - (frame?.pivotNorm.y ?? 0)) * baseCanvasHeightPx;
  const baseTopLeftX = leftLayerBaseX + viewPan.x + (frame?.offsetPx.x ?? 0) * scale;
  const baseTopLeftY = viewPan.y - baseCanvasHeightPx + (frame?.offsetPx.y ?? 0) * scale;
  const currentCanvasX = baseTopLeftX + pivotPxX - pivotPxX * frameScaleX;
  const currentCanvasY = baseTopLeftY + pivotPxY - pivotPxY * frameScaleY;
  const referenceCanvasX = rightLayerBaseX + viewPan.x;
  const referenceCanvasY = viewPan.y - referenceCanvasHeightPx;
  const currentCanvasTransform = `translate(${currentCanvasX}px, ${currentCanvasY}px)`;
  const referenceCanvasTransform = `translate(${referenceCanvasX}px, ${referenceCanvasY}px)`;
  const overlapWidth = hasReference
    ? Math.max(
      0,
      Math.min(currentCanvasX + currentCanvasWidthPx, referenceCanvasX + referenceCanvasWidthPx)
      - Math.max(currentCanvasX, referenceCanvasX)
    )
    : 0;
  const overlapHeight = hasReference
    ? Math.max(
      0,
      Math.min(currentCanvasY + currentCanvasHeightPx, referenceCanvasY + referenceCanvasHeightPx)
      - Math.max(currentCanvasY, referenceCanvasY)
    )
    : 0;
  const hasCanvasOverlap = overlapWidth > 0.5 && overlapHeight > 0.5;
  const overlapArea = overlapWidth * overlapHeight;
  const minCanvasArea = Math.max(1, Math.min(
    currentCanvasWidthPx * currentCanvasHeightPx,
    referenceCanvasWidthPx * referenceCanvasHeightPx
  ));
  const overlapCoverage = hasCanvasOverlap ? overlapArea / minCanvasArea : 0;
  const topLayerCanvasOpacity = hasCanvasOverlap
    ? clamp(0.82 - overlapCoverage * 0.32, 0.52, 0.82)
    : 1;
  const isSameImageSize = hasReference
    && referenceImageSize.width === canvasSize.width
    && referenceImageSize.height === canvasSize.height;

  if (!frame) {
    return (
      <section className="panel viewport-panel pixel-panel">
        <div className="muted">{t("pixel_no_frame")}</div>
      </section>
    );
  }

  return (
    <section className={`panel viewport-panel pixel-panel ${allowReference ? "asset-pixel-panel" : "sprite-pixel-panel"}`}>
      <div className="pixel-toolbar">
        <button
          className="icon-tool-btn"
          title="실행 취소"
          aria-label="실행 취소"
          disabled={!canUndo}
          onClick={() => void undo()}
        >
          <ToolbarIconSvg name="undo" />
        </button>
        <button
          className="icon-tool-btn"
          title="다시 실행"
          aria-label="다시 실행"
          disabled={!canRedo}
          onClick={() => void redo()}
        >
          <ToolbarIconSvg name="redo" />
        </button>
        {(["move", "pencil", "eraser", "eyedropper", "fill", "clone", "select"] as const).map((id) => (
          <button
            key={id}
            className={`icon-tool-btn ${tool === id ? "active" : ""}`}
            title={pixelToolLabel[id]}
            aria-label={pixelToolLabel[id]}
            onClick={() => {
              setTool(id);
              setActiveHelpTopic("pixel_tools");
            }}
          >
            <ToolbarIconSvg name={id} />
          </button>
        ))}
        {tool === "clone" ? (
          <span className="muted">
            {cloneSource ? `복제 원본: (${cloneSource.x}, ${cloneSource.y})` : "Alt+클릭으로 복제 원본 지정"}
          </span>
        ) : null}
        <span className="tool-divider" aria-hidden="true" />
        <label className="inline-tool">
          <span>{t("color")}</span>
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
        </label>
        <label className="inline-tool">
          <span>{t("prev_overlay")}</span>
          <input type="range" min={0} max={0.8} step={0.05} value={overlayOpacity} onChange={(e) => setOverlayOpacity(Number(e.target.value))} />
        </label>
        <button onClick={selectWholeDrawing}>{t("pixel_select_opaque_bounds")}</button>
        <button className={showGrid ? "active" : ""} onClick={() => setShowGrid((prev) => !prev)}>{t("pixel_grid_toggle")}</button>
        <span className="tool-divider" aria-hidden="true" />
        <button className="accent" onClick={() => void save()}>{t("save_frame")}</button>
        <button
          className="accent"
          onClick={() => void saveAllFramesWithOffsets()}
          disabled={savingAllFrames || !clip?.frames.length}
        >
          {savingAllFrames ? t("save_all_frames_running") : t("save_all_frames_with_offsets")}
        </button>
        <span className="muted">
          {t("playhead")} {activeFrameIndex + 1}/{clip?.frames.length ?? 0}
        </span>
        {saveAllProgress.total > 0 ? (
          <span className="muted">
            {t("save_all_frames_progress")}: {saveAllProgress.done}/{saveAllProgress.total}
            {saveAllProgress.failed > 0 ? ` (${t("bg_remove_failed")}: ${saveAllProgress.failed})` : ""}
          </span>
        ) : null}
        {saveAllResultMessage ? <span className="muted">{saveAllResultMessage}</span> : null}
      </div>

      <div className="pixel-stage" ref={stageRootRef} style={{ background: stageBackgroundColor }}>
        {showGrid ? <div className="pixel-stage-grid-overlay" style={sharedGridStyle} /> : null}

        <div className="pixel-stage-content">
          <div className="pixel-compare-stage" ref={stageRef} onWheel={onStageWheel}>
            <div
              className="pixel-canvas-wrap pixel-main-canvas-wrap"
              style={{
                width: `${currentCanvasWidthPx}px`,
                height: `${currentCanvasHeightPx}px`,
                transform: currentCanvasTransform,
                backgroundColor: imageAreaBackgroundColor,
                opacity: topLayerCanvasOpacity
              }}
            >
              {prevDataUrl ? (
                <img
                  className="pixel-prev-overlay"
                  src={prevDataUrl}
                  alt="이전 프레임"
                  style={{
                    opacity: overlayOpacity,
                    width: `${currentCanvasWidthPx}px`,
                    height: `${currentCanvasHeightPx}px`
                  }}
                />
              ) : null}

              <canvas
                ref={canvasRef}
                className="pixel-canvas"
                style={{
                  width: `${currentCanvasWidthPx}px`,
                  height: `${currentCanvasHeightPx}px`
                }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerLeave={onPointerUp}
              />

              {selection ? (
                <div
                  className="selection-box"
                  style={{
                    left: `${normalizeRect(selection).x * scale * frameScaleX}px`,
                    top: `${normalizeRect(selection).y * scale * frameScaleY}px`,
                    width: `${normalizeRect(selection).w * scale * frameScaleX}px`,
                    height: `${normalizeRect(selection).h * scale * frameScaleY}px`
                  }}
                />
              ) : null}
            </div>

            {allowReference && hasReference ? (
              <div
                className="pixel-reference-canvas-wrap pixel-reference-overlay-wrap"
                style={{
                  width: `${referenceCanvasWidthPx}px`,
                  height: `${referenceCanvasHeightPx}px`,
                  transform: referenceCanvasTransform,
                  backgroundColor: referenceAreaBackgroundColor
                }}
              >
                <img src={referenceDataUrl ?? ""} alt={referenceName || "reference"} />
              </div>
            ) : allowReference ? (
              <div
                className="pixel-reference-canvas-wrap pixel-reference-overlay-wrap pixel-reference-empty-wrap"
                style={{
                  width: `${currentCanvasWidthPx}px`,
                  height: `${currentCanvasHeightPx}px`,
                  transform: referenceCanvasTransform,
                  backgroundColor: referenceAreaBackgroundColor
                }}
              >
                <span className="muted">{t("pixel_reference_empty")}</span>
              </div>
            ) : null}

            {allowReference ? (
              <>
                <div
                  className={`pixel-splitter ${hasReference ? "" : "disabled"}`}
                  onPointerDown={onSplitPointerDown}
                  style={{ left: `calc(50% + ${splitterOffsetX}px)` }}
                />

                <div className="pixel-reference-floating">
                  <h3>{t("pixel_reference_title")}</h3>
                  <div className="pixel-reference-actions">
                    <input
                      ref={referenceInputRef}
                      type="file"
                      accept="image/png,image/webp,image/jpeg,image/jpg,image/bmp,image/gif"
                      style={{ display: "none" }}
                      onChange={onReferenceFileChange}
                    />
                    <button onClick={openReferencePicker}>{t("pixel_reference_load_single")}</button>
                    <button
                      onClick={() => {
                        setReferenceDataUrl(null);
                        setReferenceName("");
                        setReferenceImageSize({ width: 1, height: 1 });
                      }}
                      disabled={!referenceDataUrl}
                    >
                      {t("pixel_reference_clear")}
                    </button>
                  </div>
                  {referenceName ? <div className="muted">{referenceName}</div> : null}
                </div>
              </>
            ) : null}

            <div className="pixel-size-readouts">
              <span className="muted">{t("pixel_size_current")}: {canvasSize.width}x{canvasSize.height}px</span>
              {allowReference ? (
                <>
                  <span className="muted">
                    {t("pixel_size_reference")}: {hasReference ? `${referenceImageSize.width}x${referenceImageSize.height}px` : "-"}
                  </span>
                  {hasReference ? (
                    <span className="muted">
                      {isSameImageSize ? t("pixel_size_same_canvas") : t("pixel_size_diff_canvas")}
                    </span>
                  ) : null}
                </>
              ) : (
                <span className="muted">캔버스 경계: 강조 표시됨</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
