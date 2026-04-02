import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from "react";

interface HelperInputImage {
  id: string;
  name: string;
  size: number;
  type: string;
  file?: File;
  sourceUrl?: string;
}

interface PreviewPayload {
  imageData: ImageData;
  width: number;
  height: number;
}

interface LoadedImageMeta {
  name: string;
  width: number;
  height: number;
  size: number;
}

interface HelperResult {
  id: string;
  name: string;
  baseName: string;
  outputWidth: number;
  outputHeight: number;
  pixelWidth?: number;
  pixelHeight?: number;
  url: string;
  sizeText: string;
  imageData: ImageData;
}

type BrushMode = "draw" | "erase";
type PixelHelperPreset = "icon" | "avatar" | "texture" | "grid";

interface PixelPoint {
  x: number;
  y: number;
}

interface BrushBounds {
  startX: number;
  startY: number;
  width: number;
  height: number;
}

const imageAccept = "image/png,image/jpeg,image/jpg,image/webp,image/gif,image/bmp";
const presetPixelSizes = [16, 32, 64, 128, 200];
const presetUpscaleSizes = [200, 512, 1024, 2048];
const editorHistoryLimit = 40;
const pixelHelperLayoutPrefsKey = "sprite_forge_pixel_helper_layout_v1";
const defaultLowerPaneHeight = 328;
const minLowerPaneHeight = 180;
const minPreviewPaneHeight = 220;

interface PixelHelperLayoutPrefs {
  lowerPaneHeight: number;
  lowerPaneCollapsed: boolean;
}

function makeId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.round(Math.random() * 1_000_000)}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clampPixelIndex(index: number, size: number): number {
  return Math.min(size - 1, Math.max(0, index));
}

function readPositiveInt(value: string, fallback: number): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function loadPixelHelperLayoutPrefs(): PixelHelperLayoutPrefs {
  if (typeof window === "undefined") {
    return {
      lowerPaneHeight: defaultLowerPaneHeight,
      lowerPaneCollapsed: false
    };
  }

  try {
    const raw = window.localStorage.getItem(pixelHelperLayoutPrefsKey);
    if (!raw) {
      return {
        lowerPaneHeight: defaultLowerPaneHeight,
        lowerPaneCollapsed: false
      };
    }

    const parsed = JSON.parse(raw) as Partial<PixelHelperLayoutPrefs>;
    return {
      lowerPaneHeight: typeof parsed.lowerPaneHeight === "number"
        ? clamp(Math.round(parsed.lowerPaneHeight), minLowerPaneHeight, 960)
        : defaultLowerPaneHeight,
      lowerPaneCollapsed: typeof parsed.lowerPaneCollapsed === "boolean" ? parsed.lowerPaneCollapsed : false
    };
  } catch {
    return {
      lowerPaneHeight: defaultLowerPaneHeight,
      lowerPaneCollapsed: false
    };
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function cloneImageData(imageData: ImageData): ImageData {
  return new ImageData(new Uint8ClampedArray(imageData.data), imageData.width, imageData.height);
}

function formatBytes(bytes: number): string {
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(size >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function buildDownloadName(fileName: string, extension: string, selectedPixelSize: number, selectedUpscaleSize: number | null): string {
  const baseName = fileName.replace(/\.[^.]+$/, "");
  if (baseName.startsWith("transparent-grid-") || baseName.startsWith("white-grid-")) {
    return `${baseName}.${extension}`;
  }
  return selectedUpscaleSize
    ? `${baseName}-nn-${selectedPixelSize}to${selectedUpscaleSize}.${extension}`
    : `${baseName}-nn-${selectedPixelSize}.${extension}`;
}

function buildEditedDownloadName(fileName: string, selectedPixelSize: number, selectedUpscaleSize: number | null): string {
  const baseName = fileName.replace(/\.[^.]+$/, "");
  return selectedUpscaleSize
    ? `${baseName}-brush-${selectedPixelSize}to${selectedUpscaleSize}.png`
    : `${baseName}-brush-${selectedPixelSize}.png`;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("이미지를 불러오지 못했습니다."));
    image.src = src;
  });
}

async function loadImageFromInput(input: HelperInputImage): Promise<HTMLImageElement> {
  if (input.file) {
    const objectUrl = URL.createObjectURL(input.file);
    try {
      return await loadImage(objectUrl);
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  if (input.sourceUrl) {
    return loadImage(input.sourceUrl);
  }

  throw new Error("이미지 소스를 찾을 수 없습니다.");
}

function getSourceImageData(sourceCanvas: HTMLCanvasElement, image: HTMLImageElement): ImageData {
  sourceCanvas.width = image.naturalWidth;
  sourceCanvas.height = image.naturalHeight;
  const ctx = sourceCanvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    throw new Error("소스 캔버스를 초기화하지 못했습니다.");
  }
  ctx.clearRect(0, 0, sourceCanvas.width, sourceCanvas.height);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(image, 0, 0);
  return ctx.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
}

function resizeNearestNeighbor(sourceImageData: ImageData, targetWidth: number, targetHeight: number): ImageData {
  const sourceWidth = sourceImageData.width;
  const sourceHeight = sourceImageData.height;
  const sourcePixels = sourceImageData.data;
  const outputImageData = new ImageData(targetWidth, targetHeight);
  const outputPixels = outputImageData.data;

  for (let y = 0; y < targetHeight; y += 1) {
    const sourceY = clampPixelIndex(
      Math.round(((y + 0.5) * sourceHeight) / targetHeight - 0.5),
      sourceHeight
    );
    for (let x = 0; x < targetWidth; x += 1) {
      const sourceX = clampPixelIndex(
        Math.round(((x + 0.5) * sourceWidth) / targetWidth - 0.5),
        sourceWidth
      );
      const sourceIndex = (sourceY * sourceWidth + sourceX) * 4;
      const outputIndex = (y * targetWidth + x) * 4;

      outputPixels[outputIndex] = sourcePixels[sourceIndex];
      outputPixels[outputIndex + 1] = sourcePixels[sourceIndex + 1];
      outputPixels[outputIndex + 2] = sourcePixels[sourceIndex + 2];
      outputPixels[outputIndex + 3] = sourcePixels[sourceIndex + 3];
    }
  }

  return outputImageData;
}

function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/png");
  });
}

async function imageDataToPngBlob(outputCanvas: HTMLCanvasElement, imageData: ImageData): Promise<Blob | null> {
  outputCanvas.width = imageData.width;
  outputCanvas.height = imageData.height;
  const ctx = outputCanvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    return null;
  }
  ctx.putImageData(imageData, 0, 0);
  return canvasToPngBlob(outputCanvas);
}

function hexToRgba(hexColor: string): { r: number; g: number; b: number; a: number } {
  const normalized = hexColor.replace("#", "");
  const expanded = normalized.length === 3
    ? normalized.split("").map((char) => char + char).join("")
    : normalized;
  const value = Number.parseInt(expanded, 16);
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
    a: 255
  };
}

function drawGrid(context: CanvasRenderingContext2D, canvasSize: number, gridCount: number, backgroundMode: "transparent" | "white", lineThickness: number): void {
  const step = canvasSize / gridCount;

  context.clearRect(0, 0, canvasSize, canvasSize);
  context.globalCompositeOperation = "source-over";
  if (backgroundMode === "white") {
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvasSize, canvasSize);
  }

  for (let index = 0; index <= gridCount; index += 1) {
    const coordinate = Math.min(canvasSize - 1, Math.round(index * step));

    context.fillStyle = "#000000";
    context.fillRect(coordinate, 0, lineThickness, canvasSize);
    context.fillRect(0, coordinate, canvasSize, lineThickness);
  }
}

function getBrushBounds(centerX: number, centerY: number, brushSize: number): BrushBounds {
  const half = Math.floor(brushSize / 2);
  return {
    startX: centerX - half,
    startY: centerY - half,
    width: brushSize,
    height: brushSize
  };
}

function buildSelectedSizeStatus(pixelSize: number, upscaleSize: number | null, hasImage: boolean): string {
  if (hasImage) {
    return upscaleSize
      ? `이미지를 불러왔습니다. ${pixelSize}x${pixelSize}로 축소한 뒤 ${upscaleSize}x${upscaleSize}로 재확대합니다.`
      : `이미지를 불러왔습니다. ${pixelSize}x${pixelSize}로만 축소해서 저장합니다.`;
  }

  return upscaleSize
    ? `현재 설정은 ${pixelSize}x${pixelSize} 축소 후 ${upscaleSize}x${upscaleSize} 재확대입니다. 이미지를 불러오면 바로 처리할 수 있습니다.`
    : `현재 설정은 ${pixelSize}x${pixelSize} 축소만 적용입니다. 이미지를 불러오면 바로 처리할 수 있습니다.`;
}

async function createBuiltInSample(): Promise<HelperInputImage> {
  const canvas = document.createElement("canvas");
  canvas.width = 96;
  canvas.height = 96;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("샘플 캔버스를 준비하지 못했습니다.");
  }

  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, 96, 96);

  const px = (x: number, y: number, size: number, color: string) => {
    ctx.fillStyle = color;
    ctx.fillRect(x * size, y * size, size, size);
  };

  for (let y = 0; y < 32; y += 1) {
    for (let x = 0; x < 32; x += 1) {
      px(x, y, 3, (x + y) % 2 === 0 ? "#101820" : "#17283a");
    }
  }

  for (let y = 7; y < 26; y += 1) {
    for (let x = 8; x < 24; x += 1) {
      px(x, y, 3, "#4bb4ff");
    }
  }

  for (let y = 10; y < 23; y += 1) {
    for (let x = 11; x < 21; x += 1) {
      px(x, y, 3, "#dff4ff");
    }
  }

  for (let x = 12; x < 20; x += 1) {
    px(x, 13, 3, "#1d2a38");
    px(x, 19, 3, "#1d2a38");
  }

  for (let y = 13; y < 20; y += 1) {
    px(12, y, 3, "#1d2a38");
    px(19, y, 3, "#1d2a38");
  }

  const blob = await canvasToPngBlob(canvas);
  if (!blob) {
    throw new Error("샘플 이미지를 만들지 못했습니다.");
  }

  return {
    id: makeId("sample"),
    name: "sprite-forge-sample.png",
    size: blob.size,
    type: "image/png",
    sourceUrl: canvas.toDataURL("image/png")
  };
}

export function PixelHelperPanel(): JSX.Element {
  const initialLayoutPrefsRef = useRef<PixelHelperLayoutPrefs | null>(null);
  if (!initialLayoutPrefsRef.current) {
    initialLayoutPrefsRef.current = loadPixelHelperLayoutPrefs();
  }
  const initialLayoutPrefs = initialLayoutPrefsRef.current;
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const editorCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const previewLayoutRef = useRef<HTMLDivElement | null>(null);
  const sourceCanvasRef = useRef<HTMLCanvasElement>(document.createElement("canvas"));
  const outputCanvasRef = useRef<HTMLCanvasElement>(document.createElement("canvas"));
  const gridCanvasRef = useRef<HTMLCanvasElement>(document.createElement("canvas"));
  const isPaintingRef = useRef(false);
  const resultsRef = useRef<HelperResult[]>([]);
  const lowerPaneDragRef = useRef<{ startY: number; startHeight: number } | null>(null);
  const lastExpandedLowerPaneHeightRef = useRef(initialLayoutPrefs.lowerPaneHeight);

  const [currentInputs, setCurrentInputs] = useState<HelperInputImage[]>([]);
  const [currentLoadedInput, setCurrentLoadedInput] = useState<HelperInputImage | null>(null);
  const [loadedMeta, setLoadedMeta] = useState<LoadedImageMeta | null>(null);
  const [sourceImageData, setSourceImageData] = useState<ImageData | null>(null);
  const [previewPayload, setPreviewPayload] = useState<PreviewPayload | null>(null);
  const [downloadResults, setDownloadResults] = useState<HelperResult[]>([]);
  const [selectedPixelSize, setSelectedPixelSize] = useState(64);
  const [selectedUpscaleSize, setSelectedUpscaleSize] = useState<number | null>(1024);
  const [customShrinkActive, setCustomShrinkActive] = useState(false);
  const [customUpscaleActive, setCustomUpscaleActive] = useState(false);
  const [customGridActive, setCustomGridActive] = useState(false);
  const [customBrushActive, setCustomBrushActive] = useState(false);
  const [customZoomActive, setCustomZoomActive] = useState(false);
  const [customShrinkSize, setCustomShrinkSize] = useState("64");
  const [customUpscaleSize, setCustomUpscaleSize] = useState("1024");
  const [customGridCount, setCustomGridCount] = useState("64");
  const [customGridExportSize, setCustomGridExportSize] = useState("2048");
  const [customGridThickness, setCustomGridThickness] = useState("2");
  const [brushColor, setBrushColor] = useState("#000000");
  const [brushMode, setBrushMode] = useState<BrushMode>("draw");
  const [brushSize, setBrushSize] = useState(1);
  const [customBrushSize, setCustomBrushSize] = useState("1");
  const [editorZoom, setEditorZoom] = useState(10);
  const [customEditorZoom, setCustomEditorZoom] = useState("10");
  const [editorImageData, setEditorImageData] = useState<ImageData | null>(null);
  const [originalReducedImageData, setOriginalReducedImageData] = useState<ImageData | null>(null);
  const [editorUndoStack, setEditorUndoStack] = useState<ImageData[]>([]);
  const [editorRedoStack, setEditorRedoStack] = useState<ImageData[]>([]);
  const [currentHoverPixel, setCurrentHoverPixel] = useState<PixelPoint | null>(null);
  const [dropzoneActive, setDropzoneActive] = useState(false);
  const [statusText, setStatusText] = useState(buildSelectedSizeStatus(64, 1024, false));
  const [batchSummary, setBatchSummary] = useState("이미지 미리보기가 이 영역에 표시됩니다.");
  const [resultInfo, setResultInfo] = useState("선택한 파일을 모두 처리하면 결과 목록이 여기에 표시됩니다.");
  const [lowerPaneHeight, setLowerPaneHeight] = useState(initialLayoutPrefs.lowerPaneHeight);
  const [lowerPaneCollapsed, setLowerPaneCollapsed] = useState(initialLayoutPrefs.lowerPaneCollapsed);

  const getMaxLowerPaneHeight = () => {
    const totalHeight = previewLayoutRef.current?.clientHeight ?? 0;
    return Math.max(minLowerPaneHeight, totalHeight - minPreviewPaneHeight - 14);
  };

  useEffect(() => {
    resultsRef.current = downloadResults;
  }, [downloadResults]);

  useEffect(() => {
    if (!lowerPaneCollapsed) {
      lastExpandedLowerPaneHeightRef.current = lowerPaneHeight;
    }
  }, [lowerPaneCollapsed, lowerPaneHeight]);

  useEffect(() => {
    try {
      window.localStorage.setItem(pixelHelperLayoutPrefsKey, JSON.stringify({
        lowerPaneHeight: Math.round(lowerPaneHeight),
        lowerPaneCollapsed
      }));
    } catch {
      // Ignore storage write failures.
    }
  }, [lowerPaneCollapsed, lowerPaneHeight]);

  useEffect(() => {
    const root = previewLayoutRef.current;
    if (!root) {
      return;
    }

    const clampHeightToViewport = () => {
      const maxHeight = getMaxLowerPaneHeight();
      setLowerPaneHeight((prev) => clamp(prev, minLowerPaneHeight, maxHeight));
    };

    clampHeightToViewport();
    const observer = new ResizeObserver(clampHeightToViewport);
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      const drag = lowerPaneDragRef.current;
      if (!drag) {
        return;
      }
      const nextHeight = clamp(
        drag.startHeight - (event.clientY - drag.startY),
        minLowerPaneHeight,
        getMaxLowerPaneHeight()
      );
      setLowerPaneCollapsed(false);
      setLowerPaneHeight(Math.round(nextHeight));
    };

    const onPointerUp = () => {
      lowerPaneDragRef.current = null;
      document.body.classList.remove("pixel-helper-resizing");
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      document.body.classList.remove("pixel-helper-resizing");
    };
  }, []);

  useEffect(() => () => {
    for (const result of resultsRef.current) {
      URL.revokeObjectURL(result.url);
    }
  }, []);

  useEffect(() => {
    if (!previewPayload || !previewCanvasRef.current) {
      return;
    }
    const canvas = previewCanvasRef.current;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) {
      return;
    }
    canvas.width = previewPayload.width;
    canvas.height = previewPayload.height;
    ctx.putImageData(previewPayload.imageData, 0, 0);
  }, [previewPayload]);

  useEffect(() => {
    if (!sourceImageData) {
      setEditorImageData(null);
      setOriginalReducedImageData(null);
      setEditorUndoStack([]);
      setEditorRedoStack([]);
      setCurrentHoverPixel(null);
      return;
    }

    const reducedImageData = resizeNearestNeighbor(sourceImageData, selectedPixelSize, selectedPixelSize);
    setOriginalReducedImageData(cloneImageData(reducedImageData));
    setEditorImageData(cloneImageData(reducedImageData));
    setEditorUndoStack([]);
    setEditorRedoStack([]);
    setCurrentHoverPixel(null);
  }, [selectedPixelSize, sourceImageData]);

  useEffect(() => {
    if (!editorImageData) {
      return;
    }
    const nextPreview = selectedUpscaleSize
      ? resizeNearestNeighbor(editorImageData, selectedUpscaleSize, selectedUpscaleSize)
      : cloneImageData(editorImageData);
    setPreviewPayload({
      imageData: nextPreview,
      width: nextPreview.width,
      height: nextPreview.height
    });
  }, [editorImageData, selectedUpscaleSize]);

  useEffect(() => {
    if (!editorCanvasRef.current) {
      return;
    }

    const canvas = editorCanvasRef.current;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx || !editorImageData) {
      return;
    }

    const width = editorImageData.width;
    const height = editorImageData.height;
    const pixelSize = Math.max(4, editorZoom);
    canvas.width = width * pixelSize;
    canvas.height = height * pixelSize;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const left = x * pixelSize;
        const top = y * pixelSize;
        ctx.fillStyle = (x + y) % 2 === 0 ? "#1b1f26" : "#202734";
        ctx.fillRect(left, top, pixelSize, pixelSize);

        const index = (y * width + x) * 4;
        const alpha = editorImageData.data[index + 3];
        if (alpha > 0) {
          ctx.fillStyle = `rgba(${editorImageData.data[index]}, ${editorImageData.data[index + 1]}, ${editorImageData.data[index + 2]}, ${alpha / 255})`;
          ctx.fillRect(left, top, pixelSize, pixelSize);
        }
      }
    }

    ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
    ctx.lineWidth = 1;
    for (let x = 0; x <= width; x += 1) {
      const lineX = x * pixelSize + 0.5;
      ctx.beginPath();
      ctx.moveTo(lineX, 0);
      ctx.lineTo(lineX, canvas.height);
      ctx.stroke();
    }
    for (let y = 0; y <= height; y += 1) {
      const lineY = y * pixelSize + 0.5;
      ctx.beginPath();
      ctx.moveTo(0, lineY);
      ctx.lineTo(canvas.width, lineY);
      ctx.stroke();
    }

    if (currentHoverPixel) {
      const bounds = getBrushBounds(currentHoverPixel.x, currentHoverPixel.y, brushSize);
      const left = bounds.startX * pixelSize + 0.5;
      const top = bounds.startY * pixelSize + 0.5;
      const hoverWidth = bounds.width * pixelSize - 1;
      const hoverHeight = bounds.height * pixelSize - 1;

      ctx.save();
      ctx.strokeStyle = brushMode === "erase" ? "rgba(74, 163, 255, 0.95)" : "rgba(46, 163, 255, 0.95)";
      ctx.lineWidth = 2;
      ctx.strokeRect(left, top, hoverWidth, hoverHeight);
      ctx.setLineDash([4, 3]);
      ctx.strokeStyle = "rgba(255, 255, 255, 0.92)";
      ctx.lineWidth = 1;
      ctx.strokeRect(left, top, hoverWidth, hoverHeight);
      ctx.restore();
    }
  }, [brushMode, brushSize, currentHoverPixel, editorImageData, editorZoom]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) {
        return;
      }

      const target = event.target;
      if (target instanceof HTMLElement) {
        const tag = target.tagName.toLowerCase();
        if (target.isContentEditable || tag === "input" || tag === "textarea" || tag === "select") {
          return;
        }
      }

      const key = event.key.toLowerCase();
      if (key === "z" && !event.shiftKey) {
        event.preventDefault();
        if (!editorImageData || !editorUndoStack.length) {
          setStatusText("되돌릴 편집 단계가 없습니다.");
          return;
        }
        const nextUndo = [...editorUndoStack];
        const snapshot = nextUndo.pop();
        if (!snapshot) {
          return;
        }
        setEditorRedoStack((prev) => [...prev, cloneImageData(editorImageData)].slice(-editorHistoryLimit));
        setEditorUndoStack(nextUndo);
        setEditorImageData(snapshot);
        setStatusText("마지막 편집을 되돌렸습니다. Ctrl+Shift+Z 또는 Ctrl+Y로 다시 적용할 수 있습니다.");
        return;
      }

      if ((key === "z" && event.shiftKey) || key === "y") {
        event.preventDefault();
        if (!editorImageData || !editorRedoStack.length) {
          setStatusText("다시 적용할 편집 단계가 없습니다.");
          return;
        }
        const nextRedo = [...editorRedoStack];
        const snapshot = nextRedo.pop();
        if (!snapshot) {
          return;
        }
        setEditorUndoStack((prev) => [...prev, cloneImageData(editorImageData)].slice(-editorHistoryLimit));
        setEditorRedoStack(nextRedo);
        setEditorImageData(snapshot);
        setStatusText("되돌린 편집을 다시 적용했습니다.");
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [editorImageData, editorRedoStack, editorUndoStack]);

  const replaceResults = (nextResults: HelperResult[]) => {
    for (const result of resultsRef.current) {
      URL.revokeObjectURL(result.url);
    }
    setDownloadResults(nextResults);
  };

  const appendResult = (result: HelperResult) => {
    setDownloadResults((prev) => [...prev, result]);
  };

  const removeResult = (resultId: string) => {
    setDownloadResults((prev) => {
      const target = prev.find((entry) => entry.id === resultId);
      if (target) {
        URL.revokeObjectURL(target.url);
      }
      return prev.filter((entry) => entry.id !== resultId);
    });
  };

  const clearResults = () => {
    replaceResults([]);
    setResultInfo("결과 목록을 비웠습니다.");
    setBatchSummary("새 작업을 기다리는 중입니다.");
    setStatusText("결과 목록을 정리했습니다.");
  };

  const applyWorkflowPreset = (preset: PixelHelperPreset) => {
    if (preset === "grid") {
      setCustomGridCount("64");
      setCustomGridExportSize("2048");
      setCustomGridThickness("2");
      setCustomGridActive(true);
      setBatchSummary("그리드 기본 프리셋을 불러왔습니다.");
      setStatusText("그리드 생성 설정을 준비했습니다.");
      return;
    }

    const next = preset === "icon"
      ? { pixel: 64, upscale: 512, summary: "아이콘 작업용 프리셋을 적용했습니다." }
      : preset === "avatar"
        ? { pixel: 128, upscale: 1024, summary: "아바타 작업용 프리셋을 적용했습니다." }
        : { pixel: 200, upscale: 2048, summary: "텍스처 작업용 프리셋을 적용했습니다." };

    setSelectedPixelSize(next.pixel);
    setSelectedUpscaleSize(next.upscale);
    setCustomShrinkSize(String(next.pixel));
    setCustomUpscaleSize(String(next.upscale));
    setCustomShrinkActive(false);
    setCustomUpscaleActive(false);
    setBatchSummary(next.summary);
    setStatusText(buildSelectedSizeStatus(next.pixel, next.upscale, Boolean(currentLoadedInput)));
  };

  const setLoadedImage = (image: HTMLImageElement, input: HelperInputImage) => {
    const nextSourceImageData = getSourceImageData(sourceCanvasRef.current, image);
    setCurrentLoadedInput(input);
    setLoadedMeta({
      name: input.name,
      width: image.naturalWidth,
      height: image.naturalHeight,
      size: input.size
    });
    setSourceImageData(nextSourceImageData);
    setStatusText(buildSelectedSizeStatus(selectedPixelSize, selectedUpscaleSize, true));
  };

  const loadInputs = async (inputs: HelperInputImage[]) => {
    const imageInputs = inputs.filter((entry) => entry.type.startsWith("image/"));
    if (!imageInputs.length) {
      setStatusText("이미지 파일만 사용할 수 있습니다.");
      return;
    }

    replaceResults([]);
    setCurrentInputs(imageInputs);
    setBatchSummary(`${imageInputs.length}개 파일이 선택되었습니다.`);
    setResultInfo("선택한 파일을 모두 처리하면 결과 목록이 여기에 표시됩니다.");
    setStatusText("첫 번째 이미지를 미리보기로 불러오는 중입니다...");

    const firstInput = imageInputs[0];
    const image = await loadImageFromInput(firstInput);
    setLoadedImage(image, firstInput);
  };

  const processSingleInput = async (
    input: HelperInputImage,
    targetWidth: number,
    targetHeight: number,
    exportWidth: number,
    exportHeight: number
  ): Promise<HelperResult> => {
    const image = await loadImageFromInput(input);
    const sourceData = getSourceImageData(sourceCanvasRef.current, image);
    const pixelWidth = Math.max(1, Math.round(targetWidth));
    const pixelHeight = Math.max(1, Math.round(targetHeight));
    const outputWidth = Math.max(1, Math.round(exportWidth));
    const outputHeight = Math.max(1, Math.round(exportHeight));
    const reducedImageData = input.id === currentLoadedInput?.id && editorImageData
      && editorImageData.width === pixelWidth
      && editorImageData.height === pixelHeight
      ? cloneImageData(editorImageData)
      : resizeNearestNeighbor(sourceData, pixelWidth, pixelHeight);
    const outputImageData = resizeNearestNeighbor(reducedImageData, outputWidth, outputHeight);
    const blob = await imageDataToPngBlob(outputCanvasRef.current, outputImageData);

    if (!blob) {
      throw new Error("PNG blob 생성 실패");
    }

    return {
      id: makeId("result"),
      name: input.name,
      baseName: input.name.replace(/\.[^.]+$/, ""),
      pixelWidth,
      pixelHeight,
      outputWidth,
      outputHeight,
      url: URL.createObjectURL(blob),
      imageData: outputImageData,
      sizeText: formatBytes(blob.size)
    };
  };

  const createGridResult = async (
    gridCount: number,
    canvasSize: number,
    backgroundMode: "transparent" | "white",
    lineThickness: number
  ): Promise<HelperResult> => {
    const gridCanvas = gridCanvasRef.current;
    gridCanvas.width = canvasSize;
    gridCanvas.height = canvasSize;
    const gridCtx = gridCanvas.getContext("2d");
    if (!gridCtx) {
      throw new Error("그리드 캔버스를 초기화하지 못했습니다.");
    }

    drawGrid(gridCtx, canvasSize, gridCount, backgroundMode, lineThickness);
    const imageData = gridCtx.getImageData(0, 0, canvasSize, canvasSize);
    const blob = await canvasToPngBlob(gridCanvas);
    if (!blob) {
      throw new Error("그리드 PNG 생성 실패");
    }

    const basePrefix = backgroundMode === "white" ? "white-grid" : "transparent-grid";
    return {
      id: makeId("grid"),
      name: `${basePrefix}-${gridCount}x${gridCount}.png`,
      baseName: `${basePrefix}-${gridCount}x${gridCount}-${canvasSize}`,
      outputWidth: canvasSize,
      outputHeight: canvasSize,
      url: URL.createObjectURL(blob),
      imageData,
      sizeText: formatBytes(blob.size)
    };
  };

  const pushEditorUndoState = () => {
    if (!editorImageData) {
      return;
    }
    setEditorUndoStack((prev) => [...prev, cloneImageData(editorImageData)].slice(-editorHistoryLimit));
    setEditorRedoStack([]);
  };

  const paintPixelBlock = (centerX: number, centerY: number) => {
    setEditorImageData((prev) => {
      if (!prev) {
        return prev;
      }

      const next = cloneImageData(prev);
      const bounds = getBrushBounds(centerX, centerY, brushSize);
      const color = brushMode === "erase"
        ? { r: 0, g: 0, b: 0, a: 0 }
        : hexToRgba(brushColor);

      for (let y = bounds.startY; y < bounds.startY + bounds.height; y += 1) {
        if (y < 0 || y >= next.height) {
          continue;
        }
        for (let x = bounds.startX; x < bounds.startX + bounds.width; x += 1) {
          if (x < 0 || x >= next.width) {
            continue;
          }
          const index = (y * next.width + x) * 4;
          next.data[index] = color.r;
          next.data[index + 1] = color.g;
          next.data[index + 2] = color.b;
          next.data[index + 3] = color.a;
        }
      }

      return next;
    });
  };

  const getEditorPixelFromPointer = (event: ReactPointerEvent<HTMLCanvasElement> | PointerEvent): PixelPoint | null => {
    const canvas = editorCanvasRef.current;
    if (!canvas || !editorImageData) {
      return null;
    }

    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      return null;
    }

    const x = Math.floor(((event.clientX - rect.left) / rect.width) * editorImageData.width);
    const y = Math.floor(((event.clientY - rect.top) / rect.height) * editorImageData.height);
    if (x < 0 || y < 0 || x >= editorImageData.width || y >= editorImageData.height) {
      return null;
    }

    return { x, y };
  };

  const updateEditorHover = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const pixel = getEditorPixelFromPointer(event);
    const nextHover = pixel ? { x: pixel.x, y: pixel.y } : null;
    if (
      (currentHoverPixel && nextHover && currentHoverPixel.x === nextHover.x && currentHoverPixel.y === nextHover.y)
      || (!currentHoverPixel && !nextHover)
    ) {
      return;
    }
    setCurrentHoverPixel(nextHover);
  };

  const paintEditorAtPointer = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const pixel = getEditorPixelFromPointer(event);
    if (!pixel) {
      return;
    }
    setCurrentHoverPixel(pixel);
    paintPixelBlock(pixel.x, pixel.y);
  };

  const stopPainting = () => {
    isPaintingRef.current = false;
  };

  const handleDownloadEdited = async () => {
    if (!editorImageData || !currentLoadedInput) {
      setStatusText("편집할 이미지가 아직 없습니다.");
      return;
    }

    const exportImageData = selectedUpscaleSize
      ? resizeNearestNeighbor(editorImageData, selectedUpscaleSize, selectedUpscaleSize)
      : cloneImageData(editorImageData);
    const blob = await imageDataToPngBlob(outputCanvasRef.current, exportImageData);
    if (!blob) {
      setStatusText("편집본 PNG 생성에 실패했습니다.");
      return;
    }

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = buildEditedDownloadName(currentLoadedInput.name, selectedPixelSize, selectedUpscaleSize);
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 2000);
    setStatusText("현재 편집본 PNG 다운로드를 시작했습니다.");
  };

  const handleProcessAll = async () => {
    if (!currentInputs.length) {
      setStatusText("먼저 이미지를 하나 이상 선택해 주세요.");
      return;
    }

    const targetWidth = selectedPixelSize;
    const targetHeight = selectedPixelSize;
    const exportWidth = selectedUpscaleSize ?? selectedPixelSize;
    const exportHeight = selectedUpscaleSize ?? selectedPixelSize;

    replaceResults([]);
    setStatusText(
      selectedUpscaleSize
        ? `이미지 ${currentInputs.length}개를 ${selectedPixelSize}px로 축소 후 ${selectedUpscaleSize}px로 재확대하는 중입니다...`
        : `이미지 ${currentInputs.length}개를 ${selectedPixelSize}px로 축소하는 중입니다...`
    );
    setBatchSummary("처리 중...");
    setResultInfo("각 파일별 결과를 생성하는 중입니다.");

    const nextResults: HelperResult[] = [];
    let failCount = 0;

    for (let index = 0; index < currentInputs.length; index += 1) {
      const input = currentInputs[index];
      setStatusText(`처리 중 ${index + 1} / ${currentInputs.length}: ${input.name}`);

      try {
        const result = await processSingleInput(input, targetWidth, targetHeight, exportWidth, exportHeight);
        nextResults.push(result);
        if (nextResults.length === 1) {
          setPreviewPayload({
            imageData: result.imageData,
            width: result.outputWidth,
            height: result.outputHeight
          });
        }
      } catch {
        failCount += 1;
      }
    }

    setDownloadResults(nextResults);

    const successCount = nextResults.length;
    setResultInfo(
      `축소 픽셀: ${selectedPixelSize} x ${selectedPixelSize}\n`
      + `재확대 픽셀: ${selectedUpscaleSize ? `${selectedUpscaleSize} x ${selectedUpscaleSize}` : "재확대 안 함"}\n`
      + `처리 성공: ${successCount}개\n`
      + `처리 실패: ${failCount}개\n`
      + "리샘플링: 최근접 이웃 (Nearest Neighbor)"
    );
    setBatchSummary(`${successCount}개 파일이 처리되었습니다. 아래 링크로 각각 저장할 수 있습니다.`);
    setStatusText(
      failCount > 0
        ? `완료. ${successCount}개 성공, ${failCount}개 실패했습니다.`
        : `완료. ${successCount}개 모두 처리했습니다.`
    );
  };

  const handleGridCreate = async (gridCount: number, backgroundMode: "transparent" | "white", canvasSize = 2048, lineThickness = 2) => {
    setStatusText(
      backgroundMode === "white"
        ? `${gridCount}x${gridCount} 흰색 배경 그리드를 생성하는 중입니다...`
        : `${gridCount}x${gridCount} 투명 그리드를 생성하는 중입니다...`
    );

    try {
      const result = await createGridResult(gridCount, canvasSize, backgroundMode, lineThickness);
      appendResult(result);
      setPreviewPayload({
        imageData: result.imageData,
        width: result.outputWidth,
        height: result.outputHeight
      });
      setResultInfo(
        `생성 타입: ${backgroundMode === "white" ? "흰색 배경 그리드 PNG" : "투명 그리드 PNG"}\n`
        + `그리드: ${gridCount} x ${gridCount}\n`
        + `출력 크기: ${result.outputWidth} x ${result.outputHeight}\n`
        + `배경: ${backgroundMode === "white" ? "흰색" : "투명"}\n`
        + `선 두께: ${lineThickness}px\n`
        + `파일 크기: ${result.sizeText}`
      );
      setBatchSummary(
        backgroundMode === "white"
          ? `${gridCount}x${gridCount} 흰색 배경 그리드 PNG를 생성했습니다. 아래 링크로 바로 내려받을 수 있습니다.`
          : `${gridCount}x${gridCount} 투명 그리드 PNG를 생성했습니다. 아래 링크로 바로 내려받을 수 있습니다.`
      );
      setStatusText(
        backgroundMode === "white"
          ? `${gridCount}x${gridCount} 흰색 배경 그리드 PNG 생성이 완료되었습니다.`
          : `${gridCount}x${gridCount} 투명 그리드 PNG 생성이 완료되었습니다.`
      );
    } catch (error) {
      setStatusText(error instanceof Error ? error.message : "그리드 생성에 실패했습니다.");
    }
  };

  const handleCustomGrid = async (backgroundMode: "transparent" | "white") => {
    const gridCount = Math.max(2, readPositiveInt(customGridCount, 64));
    const exportSize = Math.max(16, readPositiveInt(customGridExportSize, 2048));
    const thickness = Math.max(1, readPositiveInt(customGridThickness, 2));

    setCustomGridCount(String(gridCount));
    setCustomGridExportSize(String(exportSize));
    setCustomGridThickness(String(thickness));
    setCustomGridActive(true);
    await handleGridCreate(gridCount, backgroundMode, exportSize, thickness);
  };

  const handleDownloadAll = async () => {
    if (!downloadResults.length) {
      setStatusText("다운로드할 결과가 아직 없습니다.");
      return;
    }

    setStatusText(`${downloadResults.length}개 파일을 순차적으로 다운로드하는 중입니다...`);
    for (const result of downloadResults) {
      const link = document.createElement("a");
      link.href = result.url;
      link.download = buildDownloadName(result.baseName, "png", selectedPixelSize, selectedUpscaleSize);
      link.click();
      await wait(180);
    }
    setStatusText(`${downloadResults.length}개 파일 다운로드 요청이 완료되었습니다.`);
  };

  const handleApplyCustomShrink = () => {
    const value = readPositiveInt(customShrinkSize, selectedPixelSize);
    setSelectedPixelSize(value);
    setCustomShrinkSize(String(value));
    setCustomShrinkActive(true);
    setStatusText(buildSelectedSizeStatus(value, selectedUpscaleSize, Boolean(currentLoadedInput)));
  };

  const handleApplyCustomUpscale = () => {
    const value = readPositiveInt(customUpscaleSize, selectedUpscaleSize ?? 1024);
    setSelectedUpscaleSize(value);
    setCustomUpscaleSize(String(value));
    setCustomUpscaleActive(true);
    setStatusText(buildSelectedSizeStatus(selectedPixelSize, value, Boolean(currentLoadedInput)));
  };

  const handleApplyCustomBrush = () => {
    const value = readPositiveInt(customBrushSize, brushSize);
    setBrushSize(value);
    setCustomBrushSize(String(value));
    setCustomBrushActive(true);
  };

  const handleApplyCustomZoom = () => {
    const value = Math.max(2, readPositiveInt(customEditorZoom, editorZoom));
    setEditorZoom(value);
    setCustomEditorZoom(String(value));
    setCustomZoomActive(true);
  };

  const handleResetEditor = () => {
    if (!originalReducedImageData) {
      setStatusText("되돌릴 편집본이 아직 없습니다.");
      return;
    }

    pushEditorUndoState();
    setEditorImageData(cloneImageData(originalReducedImageData));
    setEditorRedoStack([]);
    setStatusText("축소 원본 기준으로 편집 캔버스를 되돌렸습니다.");
  };

  const handleUseSample = async () => {
    try {
      setStatusText("샘플 이미지를 불러오는 중입니다...");
      const sampleInput = await createBuiltInSample();
      await loadInputs([sampleInput]);
      setBatchSummary("샘플 이미지 1개가 준비되었습니다.");
    } catch (error) {
      setStatusText(error instanceof Error ? error.message : "샘플 이미지를 자동으로 불러오지 못했습니다.");
    }
  };

  const handleFileInputChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (!files.length) {
      return;
    }

    const inputs = files.map((file) => ({
      id: makeId("file"),
      name: file.name,
      size: file.size,
      type: file.type || "image/png",
      file
    }));

    await loadInputs(inputs);
    event.target.value = "";
  };

  const originalInfoText = loadedMeta
    ? `파일명: ${loadedMeta.name}\n크기: ${loadedMeta.width} x ${loadedMeta.height}\n파일 용량: ${loadedMeta.size ? formatBytes(loadedMeta.size) : "알 수 없음"}\n짧은 변: ${Math.min(loadedMeta.width, loadedMeta.height)}px`
    : "아직 이미지가 선택되지 않았습니다.";

  const editorStatusText = editorImageData
    ? `${editorImageData.width} x ${editorImageData.height} 픽셀 편집 중, 보기 확대 ${editorZoom}배, 도구: ${brushMode === "erase" ? "지우개" : "브러시"}, 브러시 크기: ${brushSize}px, 되돌리기 ${editorUndoStack.length}단계`
    : "현재 편집 캔버스가 비어 있습니다.";

  const lowerPaneVisibleHeight = lowerPaneCollapsed ? 0 : clamp(lowerPaneHeight, minLowerPaneHeight, getMaxLowerPaneHeight());
  const activePresetLabel = selectedUpscaleSize ? `${selectedPixelSize}px -> ${selectedUpscaleSize}px` : `${selectedPixelSize}px`;

  const handleLowerPanePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (lowerPaneCollapsed) {
      return;
    }
    event.preventDefault();
    lowerPaneDragRef.current = {
      startY: event.clientY,
      startHeight: lowerPaneVisibleHeight
    };
    document.body.classList.add("pixel-helper-resizing");
  };

  const toggleLowerPaneCollapsed = () => {
    if (lowerPaneCollapsed) {
      setLowerPaneCollapsed(false);
      setLowerPaneHeight(clamp(lastExpandedLowerPaneHeightRef.current, minLowerPaneHeight, getMaxLowerPaneHeight()));
      return;
    }
    lastExpandedLowerPaneHeightRef.current = lowerPaneVisibleHeight;
    setLowerPaneCollapsed(true);
  };

  return (
    <section className="panel pixel-helper-page">
      <div className="pixel-helper-shell">
        <section className="pixel-helper-hero">
          <div>
            <h2>픽셀 에디터</h2>
            <p className="muted">
              최근접 이웃 축소/재확대, 그리드 PNG 생성, 픽셀 브러시 편집을 한 화면에서 처리합니다.
            </p>
          </div>
          <div className="pixel-helper-status-chip">{statusText}</div>
        </section>

        <section className="pixel-helper-workflow panel">
          <div className="pixel-helper-summary-cards">
            <div className="pixel-helper-summary-card">
              <span className="muted">입력</span>
              <strong>{currentInputs.length}개</strong>
            </div>
            <div className="pixel-helper-summary-card">
              <span className="muted">결과</span>
              <strong>{downloadResults.length}개</strong>
            </div>
            <div className="pixel-helper-summary-card">
              <span className="muted">현재 프리셋</span>
              <strong>{activePresetLabel}</strong>
            </div>
          </div>
          <div className="pixel-helper-workflow-row">
            <div className="pixel-helper-workflow-presets">
              <button type="button" onClick={() => applyWorkflowPreset("icon")}>아이콘 64→512</button>
              <button type="button" onClick={() => applyWorkflowPreset("avatar")}>아바타 128→1024</button>
              <button type="button" onClick={() => applyWorkflowPreset("texture")}>텍스처 200→2048</button>
              <button type="button" onClick={() => applyWorkflowPreset("grid")}>그리드 기본값</button>
            </div>
            <div className="pixel-helper-workflow-actions">
              <button type="button" onClick={clearResults} disabled={!downloadResults.length}>결과 비우기</button>
              <button
                type="button"
                onClick={() => {
                  setCurrentInputs([]);
                  setCurrentLoadedInput(null);
                  setLoadedMeta(null);
                  setSourceImageData(null);
                  setPreviewPayload(null);
                  setBatchSummary("입력 목록을 비웠습니다.");
                  setStatusText("새 이미지를 기다리는 중입니다.");
                }}
                disabled={!currentInputs.length}
              >
                입력 목록 비우기
              </button>
            </div>
          </div>
        </section>

        <section className="pixel-helper-grid">
          <div className="pixel-helper-side panel">
            <div
              className={`pixel-helper-dropzone ${dropzoneActive ? "active" : ""}`}
              onClick={() => fileInputRef.current?.click()}
              onDragEnter={(event) => {
                event.preventDefault();
                setDropzoneActive(true);
              }}
              onDragOver={(event) => {
                event.preventDefault();
                setDropzoneActive(true);
              }}
              onDragLeave={(event) => {
                event.preventDefault();
                setDropzoneActive(false);
              }}
              onDrop={(event) => {
                event.preventDefault();
                setDropzoneActive(false);
                const files = Array.from(event.dataTransfer.files ?? []);
                if (!files.length) {
                  return;
                }
                const inputs = files.map((file) => ({
                  id: makeId("drop"),
                  name: file.name,
                  size: file.size,
                  type: file.type || "image/png",
                  file
                }));
                void loadInputs(inputs);
              }}
            >
              <strong>이미지를 여기로 끌어오거나 클릭하세요</strong>
              <span>PNG, JPG, WebP, GIF, BMP 파일 지원, 여러 장 선택 가능</span>
              <input
                ref={fileInputRef}
                type="file"
                accept={imageAccept}
                multiple
                hidden
                onChange={handleFileInputChange}
              />
            </div>

            <div className="pixel-helper-controls">
              <div className="pixel-helper-group">
                <div className="pixel-helper-label">축소 픽셀 선택</div>
                <div className="pixel-helper-button-stack">
                  {presetPixelSizes.map((size) => (
                    <button
                      key={size}
                      className={`pixel-helper-preset-button ${!customShrinkActive && selectedPixelSize === size ? "active" : ""}`}
                      type="button"
                      onClick={() => {
                        setSelectedPixelSize(size);
                        setCustomShrinkSize(String(size));
                        setCustomShrinkActive(false);
                        setStatusText(buildSelectedSizeStatus(size, selectedUpscaleSize, Boolean(currentLoadedInput)));
                      }}
                    >
                      {size}x{size}
                    </button>
                  ))}
                </div>
                <details className={`pixel-helper-details ${customShrinkActive ? "custom-active" : ""}`}>
                  <summary onClick={() => setCustomShrinkActive(true)}>수치 지정</summary>
                  <div className="pixel-helper-custom-panel">
                    <h3>축소 픽셀 직접 지정</h3>
                    <div className="pixel-helper-custom-fields">
                      <label>
                        축소 픽셀(px)
                        <input
                          type="number"
                          min={1}
                          step={1}
                          value={customShrinkSize}
                          onChange={(event) => setCustomShrinkSize(event.target.value)}
                          onKeyDown={(event: ReactKeyboardEvent<HTMLInputElement>) => {
                            if (event.key === "Enter") {
                              handleApplyCustomShrink();
                            }
                          }}
                        />
                      </label>
                      <button type="button" onClick={handleApplyCustomShrink}>축소 픽셀 적용</button>
                    </div>
                    <div className="muted">현재 축소 픽셀: {selectedPixelSize}px</div>
                  </div>
                </details>
              </div>

              <div className="pixel-helper-group">
                <div className="pixel-helper-label">재확대 픽셀 선택</div>
                <div className="pixel-helper-button-stack">
                  <button
                    className={`pixel-helper-preset-button ${!customUpscaleActive && selectedUpscaleSize === null ? "active" : ""}`}
                    type="button"
                    onClick={() => {
                      setSelectedUpscaleSize(null);
                      setCustomUpscaleActive(false);
                      setStatusText(buildSelectedSizeStatus(selectedPixelSize, null, Boolean(currentLoadedInput)));
                    }}
                  >
                    재확대 안 함
                  </button>
                  {presetUpscaleSizes.map((size) => (
                    <button
                      key={size}
                      className={`pixel-helper-preset-button ${!customUpscaleActive && selectedUpscaleSize === size ? "active" : ""}`}
                      type="button"
                      onClick={() => {
                        setSelectedUpscaleSize(size);
                        setCustomUpscaleSize(String(size));
                        setCustomUpscaleActive(false);
                        setStatusText(buildSelectedSizeStatus(selectedPixelSize, size, Boolean(currentLoadedInput)));
                      }}
                    >
                      {size}x{size}
                    </button>
                  ))}
                </div>
                <details className={`pixel-helper-details ${customUpscaleActive ? "custom-active" : ""}`}>
                  <summary onClick={() => setCustomUpscaleActive(true)}>수치 지정</summary>
                  <div className="pixel-helper-custom-panel">
                    <h3>재확대 픽셀 직접 지정</h3>
                    <div className="pixel-helper-custom-fields">
                      <label>
                        재확대 픽셀(px)
                        <input
                          type="number"
                          min={1}
                          step={1}
                          value={customUpscaleSize}
                          onChange={(event) => setCustomUpscaleSize(event.target.value)}
                          onKeyDown={(event: ReactKeyboardEvent<HTMLInputElement>) => {
                            if (event.key === "Enter") {
                              handleApplyCustomUpscale();
                            }
                          }}
                        />
                      </label>
                      <button type="button" onClick={handleApplyCustomUpscale}>재확대 픽셀 적용</button>
                    </div>
                    <div className="muted">
                      현재 재확대 픽셀: {selectedUpscaleSize ? `${selectedUpscaleSize}px` : "재확대 안 함"}
                    </div>
                  </div>
                </details>
              </div>

              <div className="pixel-helper-note">
                보간 없음과 최근접 이웃 리샘플링으로 픽셀을 유지하면서 먼저 축소하고, 필요하면 같은 픽셀 상태로 다시 확대합니다.
                첫 번째 이미지는 아래 편집 캔버스에서 픽셀 단위로 직접 수정할 수 있습니다.
              </div>

              <details className={`pixel-helper-grid-tools ${customGridActive ? "custom-active" : ""}`}>
                <summary onClick={() => setCustomGridActive(true)}>그리드 PNG 생성 도구</summary>
                <div className="pixel-helper-grid-tools-body">
                  <div className="pixel-helper-group">
                    <div className="pixel-helper-label">투명 그리드 PNG 생성</div>
                    <div className="pixel-helper-grid-buttons">
                      {presetPixelSizes.map((size) => (
                        <button key={`transparent-${size}`} type="button" onClick={() => void handleGridCreate(size, "transparent")}>
                          {size}x{size} Grid
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="pixel-helper-group">
                    <div className="pixel-helper-label">흰색 배경 그리드 PNG 생성</div>
                    <div className="pixel-helper-grid-buttons">
                      {presetPixelSizes.map((size) => (
                        <button key={`white-${size}`} type="button" onClick={() => void handleGridCreate(size, "white")}>
                          {size}x{size} White
                        </button>
                      ))}
                    </div>
                  </div>

                  <details className={`pixel-helper-details ${customGridActive ? "custom-active" : ""}`}>
                    <summary onClick={() => setCustomGridActive(true)}>수치 지정</summary>
                    <div className="pixel-helper-custom-panel">
                      <h3>그리드 세부 수치 직접 입력</h3>
                      <div className="pixel-helper-custom-fields three">
                        <label>
                          그리드 칸 수
                          <input
                            type="number"
                            min={2}
                            step={1}
                            value={customGridCount}
                            onChange={(event) => setCustomGridCount(event.target.value)}
                          />
                        </label>
                        <label>
                          출력 크기(px)
                          <input
                            type="number"
                            min={16}
                            step={1}
                            value={customGridExportSize}
                            onChange={(event) => setCustomGridExportSize(event.target.value)}
                          />
                        </label>
                        <label>
                          선 두께(px)
                          <input
                            type="number"
                            min={1}
                            step={1}
                            value={customGridThickness}
                            onChange={(event) => setCustomGridThickness(event.target.value)}
                          />
                        </label>
                      </div>
                      <div className="muted">
                        현재 그리드: {readPositiveInt(customGridCount, 64)} x {readPositiveInt(customGridCount, 64)}, 출력: {readPositiveInt(customGridExportSize, 2048)}px, 선 두께: {readPositiveInt(customGridThickness, 2)}px
                      </div>
                      <div className="pixel-helper-custom-actions">
                        <button type="button" onClick={() => void handleCustomGrid("transparent")}>투명 그리드 생성</button>
                        <button type="button" onClick={() => void handleCustomGrid("white")}>흰색 그리드 생성</button>
                      </div>
                    </div>
                  </details>
                </div>
              </details>

              <div className="pixel-helper-actions">
                <button className="accent" type="button" onClick={() => void handleProcessAll()}>선택한 이미지 모두 처리</button>
                <button type="button" onClick={() => void handleUseSample()}>샘플 이미지 불러오기</button>
              </div>
            </div>
          </div>

          <div className="pixel-helper-preview" ref={previewLayoutRef}>
            <div className="panel pixel-helper-preview-card">
              <div className="pixel-helper-preview-canvas">
                {previewPayload ? (
                  <canvas ref={previewCanvasRef} />
                ) : (
                  <div className="pixel-helper-placeholder">
                    이미지 미리보기가 이 영역에 표시됩니다.
                    <br />
                    내장 픽셀 에디터 페이지라 인터넷 없이도 바로 사용할 수 있습니다.
                  </div>
                )}
              </div>
              <div className="pixel-helper-summary">{batchSummary}</div>
            </div>

            <div className={`pixel-helper-preview-splitter ${lowerPaneCollapsed ? "collapsed" : ""}`}>
              <div
                className={`pixel-helper-preview-grab ${lowerPaneCollapsed ? "collapsed" : ""}`}
                onPointerDown={handleLowerPanePointerDown}
                role="separator"
                aria-orientation="horizontal"
                aria-label="아래 편집 패널 높이 조절"
              >
                <span />
              </div>
              <button
                type="button"
                className="pixel-helper-preview-toggle"
                onClick={toggleLowerPaneCollapsed}
                aria-label={lowerPaneCollapsed ? "아래 편집 패널 펼치기" : "아래 편집 패널 접기"}
                title={lowerPaneCollapsed ? "아래 편집 패널 펼치기" : "아래 편집 패널 접기"}
              >
                <span aria-hidden="true">{lowerPaneCollapsed ? "▴" : "▾"}</span>
              </button>
            </div>

            <div
              className={`pixel-helper-lower-stack ${lowerPaneCollapsed ? "collapsed" : ""}`}
              style={{ height: `${lowerPaneVisibleHeight}px` }}
              aria-hidden={lowerPaneCollapsed}
            >
              <div className="panel pixel-helper-editor-card">
                <div className="pixel-helper-panel-header">
                  <h2>픽셀 편집</h2>
                  <div className="muted">{editorStatusText}</div>
                </div>

                <div className="pixel-helper-toolbar">
                  <label>
                    브러시 색상
                    <input type="color" value={brushColor} onChange={(event) => setBrushColor(event.target.value)} />
                  </label>
                  <button type="button" onClick={() => void handleDownloadEdited()}>현재 편집본 다운로드</button>
                </div>

                <div className="pixel-helper-group">
                  <div className="pixel-helper-label">브러시 모드</div>
                  <div className="pixel-helper-grid-buttons brush">
                    <button
                      className={brushMode === "draw" ? "active" : ""}
                      type="button"
                      onClick={() => setBrushMode("draw")}
                    >
                      브러시
                    </button>
                    <button
                      className={brushMode === "erase" ? "active" : ""}
                      type="button"
                      onClick={() => setBrushMode("erase")}
                    >
                      지우개
                    </button>
                    <button type="button" onClick={handleResetEditor}>원본 다시 불러오기</button>
                  </div>
                </div>

                <div className="pixel-helper-edit-grid">
                  <div className="pixel-helper-group">
                    <div className="pixel-helper-label">브러시 크기</div>
                    <div className="pixel-helper-grid-buttons brush">
                      {[1, 2, 4].map((size) => (
                        <button
                          key={size}
                          className={!customBrushActive && brushSize === size ? "active" : ""}
                          type="button"
                          onClick={() => {
                            setBrushSize(size);
                            setCustomBrushSize(String(size));
                            setCustomBrushActive(false);
                          }}
                        >
                          {size}px
                        </button>
                      ))}
                    </div>
                    <details className={`pixel-helper-details ${customBrushActive ? "custom-active" : ""}`}>
                      <summary onClick={() => setCustomBrushActive(true)}>수치 지정</summary>
                      <div className="pixel-helper-custom-panel">
                        <h3>브러시 크기 직접 지정</h3>
                        <div className="pixel-helper-custom-fields">
                          <label>
                            브러시 크기(px)
                            <input
                              type="number"
                              min={1}
                              step={1}
                              value={customBrushSize}
                              onChange={(event) => setCustomBrushSize(event.target.value)}
                              onKeyDown={(event: ReactKeyboardEvent<HTMLInputElement>) => {
                                if (event.key === "Enter") {
                                  handleApplyCustomBrush();
                                }
                              }}
                            />
                          </label>
                          <button type="button" onClick={handleApplyCustomBrush}>브러시 크기 적용</button>
                        </div>
                        <div className="muted">현재 브러시 크기: {brushSize}px</div>
                      </div>
                    </details>
                  </div>

                  <div className="pixel-helper-group">
                    <div className="pixel-helper-label">보기 확대</div>
                    <div className="pixel-helper-grid-buttons brush">
                      {[8, 10, 16].map((zoom) => (
                        <button
                          key={zoom}
                          className={!customZoomActive && editorZoom === zoom ? "active" : ""}
                          type="button"
                          onClick={() => {
                            setEditorZoom(zoom);
                            setCustomEditorZoom(String(zoom));
                            setCustomZoomActive(false);
                          }}
                        >
                          {zoom}x
                        </button>
                      ))}
                    </div>
                    <details className={`pixel-helper-details ${customZoomActive ? "custom-active" : ""}`}>
                      <summary onClick={() => setCustomZoomActive(true)}>수치 지정</summary>
                      <div className="pixel-helper-custom-panel">
                        <h3>보기 확대 직접 지정</h3>
                        <div className="pixel-helper-custom-fields">
                          <label>
                            보기 확대(배)
                            <input
                              type="number"
                              min={2}
                              step={1}
                              value={customEditorZoom}
                              onChange={(event) => setCustomEditorZoom(event.target.value)}
                              onKeyDown={(event: ReactKeyboardEvent<HTMLInputElement>) => {
                                if (event.key === "Enter") {
                                  handleApplyCustomZoom();
                                }
                              }}
                            />
                          </label>
                          <button type="button" onClick={handleApplyCustomZoom}>보기 확대 적용</button>
                        </div>
                        <div className="muted">현재 보기 확대: {editorZoom}배</div>
                      </div>
                    </details>
                  </div>
                </div>

                <div className="pixel-helper-editor-box">
                  {editorImageData ? (
                    <canvas
                      ref={editorCanvasRef}
                      onPointerDown={(event) => {
                        if (!editorImageData) {
                          return;
                        }
                        pushEditorUndoState();
                        isPaintingRef.current = true;
                        event.currentTarget.setPointerCapture(event.pointerId);
                        paintEditorAtPointer(event);
                      }}
                      onPointerMove={(event) => {
                        updateEditorHover(event);
                        if (!isPaintingRef.current) {
                          return;
                        }
                        paintEditorAtPointer(event);
                      }}
                      onPointerUp={() => stopPainting()}
                      onPointerLeave={() => {
                        stopPainting();
                        setCurrentHoverPixel(null);
                      }}
                      onPointerCancel={() => stopPainting()}
                    />
                  ) : (
                    <div className="pixel-helper-placeholder">현재 편집 캔버스가 비어 있습니다.</div>
                  )}
                </div>
              </div>

              <div className="pixel-helper-stats">
                <div className="panel pixel-helper-info-card">
                  <h3>원본 정보</h3>
                  <div className="pixel-helper-preline">{originalInfoText}</div>
                </div>
                <div className="panel pixel-helper-info-card">
                  <h3>축소 결과</h3>
                  <div className="pixel-helper-preline">{resultInfo}</div>
                </div>
              </div>

              <div className="panel pixel-helper-download-card">
                <div className="pixel-helper-panel-header">
                  <h2>일괄 다운로드</h2>
                  <div className="pixel-helper-download-actions">
                    <button type="button" onClick={() => void handleDownloadAll()} disabled={!downloadResults.length}>모두 다운로드</button>
                    <button type="button" onClick={clearResults} disabled={!downloadResults.length}>비우기</button>
                  </div>
                </div>

                <div className="pixel-helper-download-list">
                  {downloadResults.length ? downloadResults.map((result) => (
                    <div className="pixel-helper-result-row" key={result.id}>
                      <div>
                        <strong>{result.name}</strong>
                        <span>
                          {result.pixelWidth && result.pixelHeight
                            ? result.pixelWidth === result.outputWidth
                              ? `${result.pixelWidth}px 유지, ${result.sizeText}`
                              : `${result.pixelWidth}px -> ${result.outputWidth}px, ${result.sizeText}`
                            : `${result.outputWidth} x ${result.outputHeight}, ${result.sizeText}`}
                        </span>
                      </div>
                      <a
                        href={result.url}
                        download={buildDownloadName(result.baseName, "png", selectedPixelSize, selectedUpscaleSize)}
                      >
                        PNG 다운로드
                      </a>
                      <button type="button" onClick={() => removeResult(result.id)}>제거</button>
                    </div>
                  )) : (
                    <div className="pixel-helper-placeholder small">아직 처리된 결과가 없습니다.</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </section>
  );
}
