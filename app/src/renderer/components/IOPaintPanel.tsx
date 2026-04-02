import { type PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "../i18n";
import type { SpriteForgeApi } from "../../main/preload";

type IOPaintStatus = Awaited<ReturnType<SpriteForgeApi["getIOPaintStatus"]>>;
type IOPaintServerConfig = Awaited<ReturnType<SpriteForgeApi["getIOPaintServerConfig"]>>;
type IOPaintModelInfo = Awaited<ReturnType<SpriteForgeApi["getCurrentIOPaintModel"]>>;
type MarkRemoverStatus = Awaited<ReturnType<SpriteForgeApi["getMarkRemoverStatus"]>>;
type MarkRemoverPreview = Awaited<ReturnType<SpriteForgeApi["previewMarkRemover"]>>;
type MarkRemoverRunResult = Awaited<ReturnType<SpriteForgeApi["runMarkRemover"]>>;
type IOPaintDiagnosticResult = Awaited<ReturnType<SpriteForgeApi["diagnoseIOPaint"]>>;
type ToolMode = "iopaint" | "markremover";
type IOPaintViewMode = "native" | "full";
type ForceFormat = "PNG" | "WEBP" | "JPG" | "MP4" | "AVI" | "";
type InputSelectionKind = "" | "file" | "folder";

const TOOL_MODE_KEY = "sprite_forge_ai_editor_mode_v1";
const AI_EDITOR_PREFS_KEY = "sprite_forge_ai_editor_prefs_v1";
const IOPAINT_VIEW_MODE_KEY = "sprite_studio_iopaint_view_mode_v1";
const IOPAINT_EDITOR_PREFS_KEY = "sprite_studio_iopaint_editor_prefs_v1";

interface AiEditorPrefs {
  inputPath: string;
  inputKind: InputSelectionKind;
  outputPath: string;
  detectionPrompt: string;
  maxBBoxPercent: string;
  transparent: boolean;
  overwrite: boolean;
  forceFormat: ForceFormat;
  detectionSkip: string;
  fadeIn: string;
  fadeOut: string;
}

interface NativeIOPaintPrefs {
  brushSize: number;
  prompt: string;
  selectedModel: string;
}

const DEFAULT_IOPAINT_STATUS: IOPaintStatus = {
  phase: "idle",
  message: "대기 중",
  installed: false,
  ready: false,
  managed: false,
  url: "",
  repoDir: "",
  venvDir: "",
  modelDir: "",
  logs: [],
  error: null
};

const DEFAULT_MARKREMOVER_STATUS: MarkRemoverStatus = {
  phase: "idle",
  message: "대기 중",
  installed: false,
  ready: false,
  running: false,
  managed: false,
  taskState: "idle",
  progress: 0,
  currentPath: null,
  lastOutputPath: null,
  repoDir: "",
  pythonExe: "",
  entryHtml: "",
  logs: [],
  error: null
};

function isBusy(phase: string): boolean {
  return phase === "checking" || phase === "cloning" || phase === "creating_venv" || phase === "installing" || phase === "starting";
}

function loadToolMode(): ToolMode {
  if (typeof window === "undefined") {
    return "iopaint";
  }
  try {
    const saved = window.localStorage.getItem(TOOL_MODE_KEY);
    return saved === "markremover" ? "markremover" : "iopaint";
  } catch {
    return "iopaint";
  }
}

function loadIOPaintViewMode(): IOPaintViewMode {
  return "native";
}

function loadNativeIOPaintPrefs(): NativeIOPaintPrefs {
  const defaults: NativeIOPaintPrefs = {
    brushSize: 32,
    prompt: "",
    selectedModel: ""
  };

  if (typeof window === "undefined") {
    return defaults;
  }

  try {
    const raw = window.localStorage.getItem(IOPAINT_EDITOR_PREFS_KEY);
    if (!raw) {
      return defaults;
    }
    const parsed = JSON.parse(raw) as Partial<NativeIOPaintPrefs>;
    return {
      brushSize: typeof parsed.brushSize === "number" && Number.isFinite(parsed.brushSize) ? parsed.brushSize : defaults.brushSize,
      prompt: typeof parsed.prompt === "string" ? parsed.prompt : defaults.prompt,
      selectedModel: typeof parsed.selectedModel === "string" ? parsed.selectedModel : defaults.selectedModel
    };
  } catch {
    return defaults;
  }
}

function sanitizeForceFormat(value: unknown): ForceFormat {
  return value === "PNG" || value === "WEBP" || value === "JPG" || value === "MP4" || value === "AVI" ? value : "";
}

function loadAiEditorPrefs(): AiEditorPrefs {
  const defaults: AiEditorPrefs = {
    inputPath: "",
    inputKind: "",
    outputPath: "",
    detectionPrompt: "watermark",
    maxBBoxPercent: "10",
    transparent: false,
    overwrite: false,
    forceFormat: "",
    detectionSkip: "1",
    fadeIn: "0",
    fadeOut: "0"
  };

  if (typeof window === "undefined") {
    return defaults;
  }

  try {
    const raw = window.localStorage.getItem(AI_EDITOR_PREFS_KEY);
    if (!raw) {
      return defaults;
    }
    const parsed = JSON.parse(raw) as Partial<AiEditorPrefs>;
    const inputKind: InputSelectionKind = parsed.inputKind === "file" || parsed.inputKind === "folder"
      ? parsed.inputKind
      : "";

    return {
      inputPath: inputKind === "folder" && typeof parsed.inputPath === "string" ? parsed.inputPath : "",
      inputKind,
      outputPath: typeof parsed.outputPath === "string" ? parsed.outputPath : defaults.outputPath,
      detectionPrompt: typeof parsed.detectionPrompt === "string" && parsed.detectionPrompt.trim()
        ? parsed.detectionPrompt
        : defaults.detectionPrompt,
      maxBBoxPercent: typeof parsed.maxBBoxPercent === "string" && parsed.maxBBoxPercent.trim()
        ? parsed.maxBBoxPercent
        : defaults.maxBBoxPercent,
      transparent: typeof parsed.transparent === "boolean" ? parsed.transparent : defaults.transparent,
      overwrite: typeof parsed.overwrite === "boolean" ? parsed.overwrite : defaults.overwrite,
      forceFormat: sanitizeForceFormat(parsed.forceFormat),
      detectionSkip: typeof parsed.detectionSkip === "string" && parsed.detectionSkip.trim()
        ? parsed.detectionSkip
        : defaults.detectionSkip,
      fadeIn: typeof parsed.fadeIn === "string" && parsed.fadeIn.trim()
        ? parsed.fadeIn
        : defaults.fadeIn,
      fadeOut: typeof parsed.fadeOut === "string" && parsed.fadeOut.trim()
        ? parsed.fadeOut
        : defaults.fadeOut
    };
  } catch {
    return defaults;
  }
}

function trimPath(value: string): string {
  return value.replace(/[\\/]+$/, "");
}

function getBaseName(value: string): string {
  const normalized = trimPath(value);
  const index = Math.max(normalized.lastIndexOf("/"), normalized.lastIndexOf("\\"));
  return index >= 0 ? normalized.slice(index + 1) : normalized;
}

function getFileExtension(value: string): string {
  const baseName = getBaseName(value);
  const index = baseName.lastIndexOf(".");
  return index > 0 ? baseName.slice(index).toLowerCase() : "";
}

function getFileNameWithoutExtension(value: string): string {
  const baseName = getBaseName(value);
  const index = baseName.lastIndexOf(".");
  return index > 0 ? baseName.slice(0, index) : baseName;
}

function isStillImagePath(value: string): boolean {
  return [".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tif", ".tiff"].includes(getFileExtension(value));
}

function normalizeImageExtension(forceFormat: ForceFormat, sourcePath: string): string {
  if (forceFormat === "PNG") return ".png";
  if (forceFormat === "JPG") return ".jpg";
  if (forceFormat === "WEBP") return ".webp";
  return isStillImagePath(sourcePath) ? getFileExtension(sourcePath) || ".png" : ".png";
}

function buildMarkRemoverSaveName(sourcePath: string, forceFormat: ForceFormat): string {
  return `${getFileNameWithoutExtension(sourcePath) || "cleaned-image"}-clean${normalizeImageExtension(forceFormat, sourcePath)}`;
}

function loadImageElement(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("이미지를 불러오지 못했습니다."));
    image.src = dataUrl;
  });
}

function getCanvasPoint(canvas: HTMLCanvasElement, clientX: number, clientY: number): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / Math.max(rect.width, 1);
  const scaleY = canvas.height / Math.max(rect.height, 1);
  return {
    x: (clientX - rect.left) * scaleX,
    y: (clientY - rect.top) * scaleY
  };
}

interface IOPaintPanelProps {
  runtimeSettingsOnly?: boolean;
  onOpenSettings?: () => void;
}

export function IOPaintPanel({ runtimeSettingsOnly = false, onOpenSettings }: IOPaintPanelProps): JSX.Element {
  const { t } = useI18n();
  const initialPrefs = useMemo(() => loadAiEditorPrefs(), []);
  const initialNativePrefs = useMemo(() => loadNativeIOPaintPrefs(), []);
  const [mode, setMode] = useState<ToolMode>(loadToolMode);
  const [iopaintViewMode, setIopaintViewMode] = useState<IOPaintViewMode>(loadIOPaintViewMode);
  const [status, setStatus] = useState<IOPaintStatus>(DEFAULT_IOPAINT_STATUS);
  const [serverConfig, setServerConfig] = useState<IOPaintServerConfig | null>(null);
  const [currentModel, setCurrentModel] = useState<IOPaintModelInfo | null>(null);
  const [aiStatus, setAiStatus] = useState<MarkRemoverStatus>(DEFAULT_MARKREMOVER_STATUS);
  const [frameUrl, setFrameUrl] = useState("");
  const [frameLoaded, setFrameLoaded] = useState(false);
  const [nativeImagePath, setNativeImagePath] = useState("");
  const [nativeOriginalDataUrl, setNativeOriginalDataUrl] = useState("");
  const [nativeWorkingDataUrl, setNativeWorkingDataUrl] = useState("");
  const [nativeBrushSize, setNativeBrushSize] = useState(initialNativePrefs.brushSize);
  const [nativePrompt, setNativePrompt] = useState(initialNativePrefs.prompt);
  const [selectedModel, setSelectedModel] = useState(initialNativePrefs.selectedModel);
  const [nativeBusy, setNativeBusy] = useState(false);
  const [nativeError, setNativeError] = useState<string | null>(null);
  const [nativeSeed, setNativeSeed] = useState<string | null>(null);
  const [iopaintDiagSummary, setIopaintDiagSummary] = useState("");
  const [iopaintDiagDetails, setIopaintDiagDetails] = useState<string[]>([]);
  const [nativeMaskDirty, setNativeMaskDirty] = useState(false);
  const [nativeEraseMode, setNativeEraseMode] = useState(false);
  const [inputPath, setInputPath] = useState(initialPrefs.inputPath);
  const [inputKind, setInputKind] = useState<InputSelectionKind>(initialPrefs.inputKind);
  const [outputPath, setOutputPath] = useState(initialPrefs.outputPath);
  const [detectionPrompt, setDetectionPrompt] = useState(initialPrefs.detectionPrompt);
  const [maxBBoxPercent, setMaxBBoxPercent] = useState(initialPrefs.maxBBoxPercent);
  const [transparent, setTransparent] = useState(initialPrefs.transparent);
  const [overwrite] = useState(initialPrefs.overwrite);
  const [forceFormat, setForceFormat] = useState<ForceFormat>(initialPrefs.forceFormat);
  const [detectionSkip, setDetectionSkip] = useState(initialPrefs.detectionSkip);
  const [fadeIn, setFadeIn] = useState(initialPrefs.fadeIn);
  const [fadeOut, setFadeOut] = useState(initialPrefs.fadeOut);
  const [preview, setPreview] = useState<MarkRemoverPreview | null>(null);
  const [resultPreviewDataUrl, setResultPreviewDataUrl] = useState("");
  const [resultOutputPath, setResultOutputPath] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const frameShellRef = useRef<HTMLDivElement | null>(null);
  const nativeCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const nativeMaskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const nativeImageRef = useRef<HTMLImageElement | null>(null);
  const nativeMaskDirtyRef = useRef(false);
  const nativeDrawingRef = useRef(false);
  const nativeLastPointRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    try {
      window.localStorage.setItem(TOOL_MODE_KEY, mode);
    } catch {
      // Ignore storage write failures.
    }
  }, [mode]);

  useEffect(() => {
    try {
      window.localStorage.setItem(IOPAINT_VIEW_MODE_KEY, iopaintViewMode);
    } catch {
      // Ignore storage write failures.
    }
  }, [iopaintViewMode]);

  useEffect(() => {
    try {
      window.localStorage.setItem(IOPAINT_EDITOR_PREFS_KEY, JSON.stringify({
        brushSize: nativeBrushSize,
        prompt: nativePrompt,
        selectedModel
      } satisfies NativeIOPaintPrefs));
    } catch {
      // Ignore storage write failures.
    }
  }, [nativeBrushSize, nativePrompt, selectedModel]);

  useEffect(() => {
    try {
      window.localStorage.setItem(AI_EDITOR_PREFS_KEY, JSON.stringify({
        inputPath: inputKind === "folder" ? inputPath : "",
        inputKind,
        outputPath,
        detectionPrompt,
        maxBBoxPercent,
        transparent,
        overwrite,
        forceFormat,
        detectionSkip,
        fadeIn,
        fadeOut
      } satisfies AiEditorPrefs));
    } catch {
      // Ignore storage write failures.
    }
  }, [
    detectionPrompt,
    detectionSkip,
    fadeIn,
    fadeOut,
    forceFormat,
    inputKind,
    inputPath,
    maxBBoxPercent,
    outputPath,
    overwrite,
    transparent
  ]);

  useEffect(() => {
    if (inputKind === "folder" && inputPath.trim()) {
      setOutputPath(inputPath.trim());
    }
  }, [inputKind, inputPath]);

  useEffect(() => {
    let mounted = true;

    void window.spriteForge.getIOPaintStatus().then((next) => {
      if (mounted) {
        setStatus(next);
        if (!next.error && next.ready) {
          setNativeError(null);
        }
      }
    });

    void window.spriteForge.getMarkRemoverStatus().then((next) => {
      if (mounted) {
        setAiStatus(next);
      }
    });

    const offIOPaint = window.spriteForge.onIOPaintStatus((next) => {
      if (mounted) {
        setStatus(next);
      }
    });

    const offMarkRemover = window.spriteForge.onMarkRemoverStatus((next) => {
      if (mounted) {
        setAiStatus(next);
      }
    });

    return () => {
      mounted = false;
      offIOPaint();
      offMarkRemover();
    };
  }, []);

  useEffect(() => {
    if (status.ready && status.url) {
      setFrameUrl((current) => {
        if (current === status.url) {
          return current;
        }
        setFrameLoaded(false);
        return status.url;
      });
    }
  }, [status.ready, status.url]);

  useEffect(() => {
    if (!status.installed || status.ready || status.phase !== "idle") {
      return;
    }
    void window.spriteForge.ensureIOPaintStarted().catch(() => {
      // Shared status stream already carries the failure details.
    });
  }, [status.installed, status.ready, status.phase]);

  useEffect(() => {
    if (!status.ready) {
      return;
    }
    void (async () => {
      try {
        const [nextConfig, nextModel] = await Promise.all([
          window.spriteForge.getIOPaintServerConfig() as Promise<IOPaintServerConfig>,
          window.spriteForge.getCurrentIOPaintModel() as Promise<IOPaintModelInfo>
        ]);
        setServerConfig(nextConfig);
        setCurrentModel(nextModel);
        setSelectedModel((current) => current || nextModel.name);
      } catch (error) {
        setNativeError(error instanceof Error ? error.message : String(error));
      }
    })();
  }, [status.ready]);

  useEffect(() => {
    setPreview(null);
    setResultPreviewDataUrl("");
    setResultOutputPath("");
    setActionError(null);
  }, [inputPath, detectionPrompt, maxBBoxPercent]);

  const redrawNativeCanvas = (): void => {
    const canvas = nativeCanvasRef.current;
    const image = nativeImageRef.current;
    if (!canvas || !image) {
      return;
    }

    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0);

    const maskCanvas = nativeMaskCanvasRef.current;
    if (maskCanvas && nativeMaskDirtyRef.current) {
      context.save();
      context.drawImage(maskCanvas, 0, 0);
      context.globalCompositeOperation = "source-atop";
      context.fillStyle = "rgba(230, 74, 25, 0.32)";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.restore();
    }
  };

  const clearNativeMask = (): void => {
    const maskCanvas = nativeMaskCanvasRef.current;
    if (!maskCanvas) {
      return;
    }
    const context = maskCanvas.getContext("2d");
    if (!context) {
      return;
    }
    context.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
    nativeMaskDirtyRef.current = false;
    setNativeMaskDirty(false);
    redrawNativeCanvas();
  };

  const loadNativeEditorImage = async (filePath: string): Promise<void> => {
    const dataUrl = await window.spriteForge.readImageDataUrl(filePath);
    const image = await loadImageElement(dataUrl);
    nativeImageRef.current = image;
    setNativeImagePath(filePath);
    setNativeOriginalDataUrl(dataUrl);
    setNativeWorkingDataUrl(dataUrl);
    setNativeSeed(null);
    setNativeError(null);

    const maskCanvas = document.createElement("canvas");
    maskCanvas.width = image.naturalWidth;
    maskCanvas.height = image.naturalHeight;
    nativeMaskCanvasRef.current = maskCanvas;
    nativeMaskDirtyRef.current = false;
    setNativeMaskDirty(false);
    setTimeout(() => redrawNativeCanvas(), 0);
  };

  const syncNativeWorkingImage = async (dataUrl: string, resetMask: boolean): Promise<void> => {
    if (!dataUrl) {
      return;
    }
    const image = await loadImageElement(dataUrl);
    nativeImageRef.current = image;
    if (!nativeMaskCanvasRef.current || resetMask) {
      const maskCanvas = document.createElement("canvas");
      maskCanvas.width = image.naturalWidth;
      maskCanvas.height = image.naturalHeight;
      nativeMaskCanvasRef.current = maskCanvas;
    } else if (
      nativeMaskCanvasRef.current.width !== image.naturalWidth
      || nativeMaskCanvasRef.current.height !== image.naturalHeight
    ) {
      nativeMaskCanvasRef.current.width = image.naturalWidth;
      nativeMaskCanvasRef.current.height = image.naturalHeight;
    }
    if (resetMask) {
      nativeMaskDirtyRef.current = false;
      setNativeMaskDirty(false);
    }
    setTimeout(() => redrawNativeCanvas(), 0);
  };

  useEffect(() => {
    if (!nativeWorkingDataUrl) {
      return;
    }
    void syncNativeWorkingImage(nativeWorkingDataUrl, false);
  }, [nativeWorkingDataUrl]);

  const paintNativeMask = (from: { x: number; y: number }, to: { x: number; y: number }): void => {
    const maskCanvas = nativeMaskCanvasRef.current;
    if (!maskCanvas) {
      return;
    }
    const context = maskCanvas.getContext("2d");
    if (!context) {
      return;
    }

    context.save();
    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = nativeBrushSize;
    if (nativeEraseMode) {
      context.globalCompositeOperation = "destination-out";
      context.strokeStyle = "rgba(0,0,0,1)";
    } else {
      context.globalCompositeOperation = "source-over";
      context.strokeStyle = "rgba(255,255,255,1)";
    }
    context.beginPath();
    context.moveTo(from.x, from.y);
    context.lineTo(to.x, to.y);
    context.stroke();
    context.restore();

    nativeMaskDirtyRef.current = true;
    setNativeMaskDirty(true);
    redrawNativeCanvas();
  };

  const handleNativeCanvasPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>): void => {
    if (!nativeImageRef.current || nativeBusy) {
      return;
    }
    const canvas = event.currentTarget;
    const point = getCanvasPoint(canvas, event.clientX, event.clientY);
    nativeDrawingRef.current = true;
    nativeLastPointRef.current = point;
    canvas.setPointerCapture(event.pointerId);
    paintNativeMask(point, point);
  };

  const handleNativeCanvasPointerMove = (event: ReactPointerEvent<HTMLCanvasElement>): void => {
    if (!nativeDrawingRef.current) {
      return;
    }
    const canvas = event.currentTarget;
    const point = getCanvasPoint(canvas, event.clientX, event.clientY);
    const lastPoint = nativeLastPointRef.current ?? point;
    paintNativeMask(lastPoint, point);
    nativeLastPointRef.current = point;
  };

  const finishNativeStroke = (event: ReactPointerEvent<HTMLCanvasElement>): void => {
    if (!nativeDrawingRef.current) {
      return;
    }
    nativeDrawingRef.current = false;
    nativeLastPointRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const pickNativeImage = async (): Promise<void> => {
    const paths = await window.spriteForge.pickMediaPaths();
    const nextInput = paths[0];
    if (!nextInput) {
      return;
    }
    await loadNativeEditorImage(nextInput);
  };

  const runNativeInpaint = (): void => {
    if (!nativeWorkingDataUrl) {
      setNativeError(t("iopaint_native_pick_image"));
      return;
    }
    if (!nativeMaskDirty || !nativeMaskCanvasRef.current) {
      setNativeError(t("iopaint_native_mask_required"));
      return;
    }

    setNativeBusy(true);
    setNativeError(null);
    void window.spriteForge.runIOPaintInpaint({
      imageDataUrl: nativeWorkingDataUrl,
      maskDataUrl: nativeMaskCanvasRef.current.toDataURL("image/png"),
      model: selectedModel || currentModel?.name || null,
      prompt: nativePrompt.trim()
    }).then((result) => {
      setNativeWorkingDataUrl(result.imageDataUrl);
      setNativeSeed(result.seed);
      setCurrentModel((current) => current ? { ...current, name: selectedModel || current.name } : current);
      clearNativeMask();
    }).catch((error) => {
      setNativeError(error instanceof Error ? error.message : String(error));
    }).finally(() => {
      setNativeBusy(false);
    });
  };

  const saveNativeResult = (): void => {
    if (!nativeImagePath || !nativeWorkingDataUrl) {
      setNativeError(t("iopaint_native_pick_image"));
      return;
    }
    setNativeBusy(true);
    setNativeError(null);
    void window.spriteForge.writeImageDataUrl({
      filePath: nativeImagePath,
      dataUrl: nativeWorkingDataUrl
    }).catch((error) => {
      setNativeError(error instanceof Error ? error.message : String(error));
    }).finally(() => {
      setNativeBusy(false);
    });
  };

  const resetNativeResult = (): void => {
    if (!nativeOriginalDataUrl) {
      return;
    }
    setNativeWorkingDataUrl(nativeOriginalDataUrl);
    clearNativeMask();
    setNativeSeed(null);
  };

  const installIOPaint = (): void => {
    void window.spriteForge.ensureIOPaintInstalled().catch(() => {
      // Shared status stream already carries the failure details.
    });
  };

  const diagnoseIOPaint = (): void => {
    setNativeError(null);
    void window.spriteForge.diagnoseIOPaint().then((result: IOPaintDiagnosticResult) => {
      setIopaintDiagSummary(result.summary);
      setIopaintDiagDetails(result.details);
      if (!result.ok) {
        setNativeError(result.summary);
      }
    }).catch((error) => {
      setNativeError(error instanceof Error ? error.message : String(error));
    });
  };

  const restartIOPaintServer = (): void => {
    setNativeError(null);
    setIopaintDiagSummary("");
    setIopaintDiagDetails([]);
    void window.spriteForge.restartIOPaint().catch((error) => {
      setNativeError(error instanceof Error ? error.message : String(error));
    });
  };

  const reinstallIOPaintRuntime = (): void => {
    setNativeError(null);
    setIopaintDiagSummary("");
    setIopaintDiagDetails([]);
    void window.spriteForge.reinstallIOPaint().catch((error) => {
      setNativeError(error instanceof Error ? error.message : String(error));
    });
  };

  const installAI = (): void => {
    void window.spriteForge.ensureMarkRemoverInstalled().catch(() => {
      // Shared status stream already carries the failure details.
    });
  };

  const installBoth = (): void => {
    void (async () => {
      await window.spriteForge.ensureIOPaintInstalled();
      await window.spriteForge.ensureMarkRemoverInstalled();
    })().catch(() => {
      // Shared status stream already carries the failure details.
    });
  };

  const pickInputFile = async (): Promise<void> => {
    const paths = await window.spriteForge.pickMediaPaths();
    const nextInput = paths[0];
    if (!nextInput) {
      return;
    }
    setPreview(null);
    setResultPreviewDataUrl("");
    setResultOutputPath("");
    setActionError(null);
    setInputKind("file");
    setInputPath(nextInput);
  };

  const pickInputFolder = async (): Promise<void> => {
    const folders = await window.spriteForge.pickBgRemoveFolders();
    const nextInput = folders[0];
    if (!nextInput) {
      return;
    }
    setPreview(null);
    setResultPreviewDataUrl("");
    setResultOutputPath("");
    setActionError(null);
    setInputKind("folder");
    setInputPath(nextInput);
    setOutputPath(nextInput);
  };

  const pickOutputFolder = async (): Promise<void> => {
    const nextOutput = await window.spriteForge.pickBgRemoveOutputDir();
    if (!nextOutput) {
      return;
    }
    setOutputPath(nextOutput);
  };

  const applyMarkRemoverPreset = (preset: "watermark" | "subtitle" | "logo") => {
    if (preset === "watermark") {
      setDetectionPrompt("watermark");
      setMaxBBoxPercent("10");
      setDetectionSkip("1");
      setTransparent(false);
      return;
    }
    if (preset === "subtitle") {
      setDetectionPrompt("subtitle text");
      setMaxBBoxPercent("22");
      setDetectionSkip("1");
      setTransparent(false);
      return;
    }
    setDetectionPrompt("logo watermark");
    setMaxBBoxPercent("14");
    setDetectionSkip("1");
    setTransparent(false);
  };

  const runPreview = (): void => {
    const normalizedInput = inputPath.trim();
    if (!normalizedInput) {
      setActionError(t("markremover_select_input_first"));
      return;
    }

    setResultPreviewDataUrl("");
    setResultOutputPath("");
    setActionError(null);
    void window.spriteForge.previewMarkRemover({
      inputPath: normalizedInput,
      detectionPrompt: detectionPrompt.trim() || "watermark",
      maxBBoxPercent: Number.parseFloat(maxBBoxPercent) || 10
    }).then((result) => {
      setPreview(result);
      setActionError(null);
    }).catch((error) => {
      setActionError(error instanceof Error ? error.message : String(error));
    });
  };

  const loadRemovalPreview = async (runResult: MarkRemoverRunResult): Promise<void> => {
    const finalOutputPath = runResult.outputPath?.trim() ?? "";
    setResultOutputPath(finalOutputPath);
    if (!finalOutputPath || !isStillImagePath(finalOutputPath)) {
      return;
    }

    const dataUrl = await window.spriteForge.readImageDataUrl(finalOutputPath);
    setPreview(null);
    setResultPreviewDataUrl(dataUrl);
  };

  const runRemoval = (): void => {
    const normalizedInput = inputPath.trim();
    if (!normalizedInput) {
      setActionError(t("markremover_select_input_first"));
      return;
    }
    const isBatchMode = inputKind === "folder";
    const normalizedOutput = outputPath.trim();
    if (isBatchMode && !normalizedOutput) {
      setActionError(t("markremover_select_output_first"));
      return;
    }

    setActionError(null);
    setResultPreviewDataUrl("");
    setResultOutputPath("");
    void window.spriteForge.runMarkRemover({
      inputPath: normalizedInput,
      outputPath: isBatchMode ? normalizedOutput : "",
      overwrite: false,
      transparent,
      maxBBoxPercent: Number.parseFloat(maxBBoxPercent) || 10,
      forceFormat: forceFormat || null,
      detectionPrompt: detectionPrompt.trim() || "watermark",
      detectionSkip: Math.max(1, Math.min(10, Number.parseInt(detectionSkip, 10) || 1)),
      fadeIn: Math.max(0, Number.parseFloat(fadeIn) || 0),
      fadeOut: Math.max(0, Number.parseFloat(fadeOut) || 0)
    }).then(async (result) => {
      if (!isBatchMode) {
        await loadRemovalPreview(result);
      } else {
        setResultOutputPath(result.outputPath ?? "");
      }
      setActionError(null);
    }).catch((error) => {
      setActionError(error instanceof Error ? error.message : String(error));
    });
  };

  const saveRemovalResult = async (): Promise<void> => {
    if (!resultPreviewDataUrl) {
      return;
    }

    const sourcePath = resultOutputPath || inputPath.trim();
    const savePath = await window.spriteForge.pickMarkRemoverSavePath(buildMarkRemoverSaveName(sourcePath, forceFormat));
    if (!savePath) {
      return;
    }

    await window.spriteForge.writeImageDataUrl({
      filePath: savePath,
      dataUrl: resultPreviewDataUrl
    });
    setResultOutputPath(savePath);
    setActionError(null);
  };

  const stopRemoval = (): void => {
    void window.spriteForge.stopMarkRemover().catch((error) => {
      setActionError(error instanceof Error ? error.message : String(error));
    });
  };

  const resetMarkRemoverState = (): void => {
    setPreview(null);
    setResultPreviewDataUrl("");
    setResultOutputPath("");
    setActionError(null);
  };

  const reuseLastOutputAsInput = (): void => {
    const nextInput = resultOutputPath.trim() || aiStatus.lastOutputPath?.trim() || "";
    if (!nextInput) {
      return;
    }
    setInputKind("file");
    setInputPath(nextInput);
    setPreview(null);
    setResultPreviewDataUrl("");
    setActionError(null);
  };

  const installFrameTweaks = (): void => {
    const frame = frameRef.current;
    const doc = frame?.contentDocument;
    const win = frame?.contentWindow as (Window & { __spriteForgeIOPaintTweaksInstalled?: boolean }) | null;
    if (!frame || !doc || !win) {
      return;
    }

    const hideSupportLinks = (): void => {
      const candidates = doc.querySelectorAll(
        'a[href*="buymeacoffee"], a[href*="buymeacoffee.com"], a[href*="ko-fi"], a[href*="kofi"], a[href*="patreon"], a[href*="sponsor"], a[href*="github.com/sponsors"], img[src*="kofi_button"], img[src*="buymeacoffee"]'
      );
      candidates.forEach((node) => {
        const target = node.closest("a, button, div, footer, aside") ?? node;
        if (target instanceof HTMLElement) {
          target.style.display = "none";
        }
      });
    };

    if (!doc.getElementById("sprite-forge-iopaint-style")) {
      const style = doc.createElement("style");
      style.id = "sprite-forge-iopaint-style";
      style.textContent = `
        a[href*="buymeacoffee"],
        a[href*="buymeacoffee.com"],
        a[href*="ko-fi"],
        a[href*="kofi"],
        a[href*="patreon"],
        a[href*="sponsor"],
        a[href*="github.com/sponsors"],
        img[src*="kofi_button"],
        img[src*="buymeacoffee"] {
          display: none !important;
        }
      `;
      doc.head.appendChild(style);
    }

    hideSupportLinks();

    if (!win.__spriteForgeIOPaintTweaksInstalled) {
      const observer = new win.MutationObserver(() => {
        hideSupportLinks();
      });
      observer.observe(doc.body, { childList: true, subtree: true });
      win.__spriteForgeIOPaintTweaksInstalled = true;
    }
  };

  const forceFrameRelayout = (): void => {
    const frame = frameRef.current;
    const doc = frame?.contentDocument;
    const win = frame?.contentWindow;
    if (!frame || !doc || !win) {
      return;
    }

    const root = doc.documentElement;
    const body = doc.body;
    root.style.width = "100%";
    root.style.height = "100%";
    body.style.width = "100%";
    body.style.height = "100%";
    body.style.minHeight = "100%";

    win.dispatchEvent(new Event("resize"));
  };

  useEffect(() => {
    if (!frameLoaded || iopaintViewMode !== "full") {
      return;
    }

    const timers = [
      window.setTimeout(() => forceFrameRelayout(), 0),
      window.setTimeout(() => forceFrameRelayout(), 120),
      window.setTimeout(() => forceFrameRelayout(), 320)
    ];

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [frameLoaded, iopaintViewMode]);

  useEffect(() => {
    const shell = frameShellRef.current;
    if (!shell || typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver(() => {
      if (iopaintViewMode === "full" && frameLoaded) {
        forceFrameRelayout();
      }
    });
    observer.observe(shell);
    return () => observer.disconnect();
  }, [frameLoaded, iopaintViewMode]);

  const isInstallingAnything = isBusy(status.phase) || isBusy(aiStatus.phase);
  const setupNeeded = !status.installed || !aiStatus.installed;
  const aiWorking = isBusy(aiStatus.phase) || aiStatus.taskState !== "idle";
  const hasRemovalResult = Boolean(resultPreviewDataUrl);
  const acceptedDetections = useMemo(
    () => preview?.detections.filter((item) => item.accepted).length ?? 0,
    [preview]
  );
  const markRemoverSummary = useMemo(() => {
    if (hasRemovalResult) {
      return "제거 결과가 준비되었습니다.";
    }
    if (preview) {
      return `검출 ${preview.detections.length}건 · 적용 ${acceptedDetections}건`;
    }
    if (inputPath.trim()) {
      return inputKind === "folder" ? "폴더 배치 준비 완료" : "파일 단건 처리 준비 완료";
    }
    return "입력 대상을 선택하면 바로 미리보기와 실행을 진행할 수 있습니다.";
  }, [acceptedDetections, hasRemovalResult, inputKind, inputPath, preview]);
  const renderSetupButton = () => onOpenSettings ? (
    <button type="button" className="accent" onClick={onOpenSettings}>
      {t("ai_tools_open_settings")}
    </button>
  ) : null;
  const runtimeLogText = [...status.logs, ...aiStatus.logs].length
    ? [...status.logs, ...aiStatus.logs].join("\n")
    : (status.error || aiStatus.error || t("iopaint_log_empty"));
  const renderRuntimeManagement = () => (
    <>
      <div className="iopaint-setup-card">
        <div className="iopaint-setup-copy">
          <span className="iopaint-status-badge">{setupNeeded ? t("tool_first_run_badge") : t("settings")}</span>
          <strong>{runtimeSettingsOnly ? t("ai_tools_settings_title") : t("tool_first_run_title")}</strong>
          <p className="muted">{runtimeSettingsOnly ? t("ai_tools_settings_desc") : t("tool_first_run_desc")}</p>
        </div>

        <div className="iopaint-setup-grid">
          <div className="iopaint-setup-item">
            <div className="iopaint-setup-item-head">
              <strong>{t("iopaint_mode_builtin")}</strong>
              <span className={`iopaint-chip ${status.installed ? "done" : ""}`}>
                {status.installed ? t("tool_install_done") : t("tool_install_pending")}
              </span>
            </div>
            <p className="muted">{status.error ?? status.message}</p>
            <div className="row-buttons">
              {!status.installed ? (
                <button type="button" onClick={installIOPaint} disabled={isInstallingAnything}>
                  {t("tool_install_iopaint")}
                </button>
              ) : null}
              <button type="button" onClick={diagnoseIOPaint} disabled={isBusy(status.phase)}>
                {t("iopaint_diagnose")}
              </button>
              <button type="button" onClick={restartIOPaintServer} disabled={isBusy(status.phase) || !status.installed}>
                {t("iopaint_restart_server")}
              </button>
              <button type="button" onClick={reinstallIOPaintRuntime} disabled={isBusy(status.phase)}>
                {t("iopaint_reinstall")}
              </button>
            </div>
            {iopaintDiagSummary ? <p className="muted">{iopaintDiagSummary}</p> : null}
            {iopaintDiagDetails.length ? (
              <pre className="iopaint-log-output iopaint-inline-diagnostics">{iopaintDiagDetails.join("\n")}</pre>
            ) : null}
          </div>

          <div className="iopaint-setup-item">
            <div className="iopaint-setup-item-head">
              <strong>{t("iopaint_mode_ai")}</strong>
              <span className={`iopaint-chip ${aiStatus.installed ? "done" : ""}`}>
                {aiStatus.installed ? t("tool_install_done") : t("tool_install_pending")}
              </span>
            </div>
            <p className="muted">{aiStatus.error ?? aiStatus.message}</p>
            {!aiStatus.installed ? (
              <button type="button" onClick={installAI} disabled={isInstallingAnything}>
                {t("tool_install_ai")}
              </button>
            ) : null}
          </div>
        </div>

        {!status.installed && !aiStatus.installed ? (
          <div className="row-buttons">
            <button type="button" className="accent" onClick={installBoth} disabled={isInstallingAnything}>
              {t("tool_install_all")}
            </button>
          </div>
        ) : null}

        {isInstallingAnything || status.error || aiStatus.error || status.logs.length || aiStatus.logs.length ? (
          <div className="iopaint-log-card">
            <div className="iopaint-log-header">
              <strong>{t("iopaint_log_title")}</strong>
              {t("iopaint_log_desc") ? <span className="muted">{t("iopaint_log_desc")}</span> : null}
            </div>
            <pre className="iopaint-log-output">
              {runtimeLogText}
            </pre>
          </div>
        ) : null}
      </div>
    </>
  );

  if (runtimeSettingsOnly) {
    return (
      <div className="settings-ai-runtime">
        {renderRuntimeManagement()}
      </div>
    );
  }

  return (
    <section className="panel iopaint-page">
      <div className="iopaint-header">
        <div>
          <h2>{t("tab_iopaint")}</h2>
          {t("iopaint_desc") ? <p className="muted">{t("iopaint_desc")}</p> : null}
        </div>
        <div className="row-buttons iopaint-mode-toggle">
          {setupNeeded || status.error || aiStatus.error ? renderSetupButton() : null}
          <button type="button" className={mode === "iopaint" ? "active" : ""} onClick={() => setMode("iopaint")}>
            {t("iopaint_mode_builtin")}
          </button>
          <button type="button" className={mode === "markremover" ? "active" : ""} onClick={() => setMode("markremover")}>
            {t("iopaint_mode_ai")}
          </button>
        </div>
      </div>

      <div className="iopaint-status-summary">
        <div className="iopaint-status-summary-card">
          <span className="muted">IOPaint</span>
          <strong>{status.ready ? t("iopaint_status_ready") : (status.message || t("tool_install_pending"))}</strong>
        </div>
        <div className="iopaint-status-summary-card">
          <span className="muted">MarkRemover</span>
          <strong>{aiWorking ? t("markremover_running") : (aiStatus.ready ? t("tool_install_done") : t("tool_install_pending"))}</strong>
        </div>
        <div className="iopaint-status-summary-card">
          <span className="muted">{t("iopaint_mode_builtin")}</span>
          <strong>{mode === "iopaint" ? t("iopaint_native_mode") : t("iopaint_mode_ai")}</strong>
        </div>
      </div>

      {mode === "iopaint" ? (
        <>
          <div className="row-buttons iopaint-view-toggle">
            <button type="button" className={iopaintViewMode === "native" ? "active" : ""} onClick={() => setIopaintViewMode("native")}>
              {t("iopaint_native_mode")}
            </button>
            <button type="button" className={iopaintViewMode === "full" ? "active" : ""} onClick={() => setIopaintViewMode("full")}>
              {t("iopaint_full_mode")}
            </button>
          </div>

          {iopaintViewMode === "native" ? (
            <div className="iopaint-native-shell">
              {!status.installed ? (
                <div className="iopaint-empty-state">
                  <strong>{t("iopaint_waiting_setup")}</strong>
                  <p className="muted">{t("iopaint_waiting_setup_desc")}</p>
                  <p className="muted">{t("ai_tools_go_settings_hint")}</p>
                  {onOpenSettings ? <div className="row-buttons">{renderSetupButton()}</div> : null}
                </div>
              ) : status.error ? (
                <div className="iopaint-empty-state">
                  <strong>{t("iopaint_status_failed")}</strong>
                  <p className="muted">{status.error}</p>
                  <p className="muted">{t("ai_tools_go_settings_hint")}</p>
                  {onOpenSettings ? <div className="row-buttons">{renderSetupButton()}</div> : null}
                </div>
              ) : !status.ready ? (
                <div className="iopaint-frame-status">
                  <strong>{status.message || t("iopaint_connecting")}</strong>
                </div>
              ) : (
                <>
                  <div className="iopaint-native-toolbar">
                    <div className="iopaint-native-card">
                      <div className="iopaint-native-card-header">
                        <strong>{t("iopaint_native_editor_title")}</strong>
                        <span className="muted">{currentModel?.name ?? "-"}</span>
                      </div>
                      <p className="muted">{t("iopaint_native_quick_steps")}</p>
                      <div className="row-buttons">
                        <button type="button" onClick={() => void pickNativeImage()} disabled={nativeBusy}>
                          {t("iopaint_native_pick_image")}
                        </button>
                        <button type="button" onClick={clearNativeMask} disabled={!nativeMaskDirty || nativeBusy}>
                          {t("iopaint_native_clear_mask")}
                        </button>
                        <button type="button" onClick={resetNativeResult} disabled={!nativeOriginalDataUrl || nativeBusy}>
                          {t("iopaint_native_reset")}
                        </button>
                        <button type="button" className="accent" onClick={runNativeInpaint} disabled={nativeBusy || !nativeWorkingDataUrl}>
                          {nativeBusy ? t("iopaint_native_running") : t("iopaint_native_run")}
                        </button>
                        <button type="button" onClick={saveNativeResult} disabled={nativeBusy || !nativeWorkingDataUrl}>
                          {t("iopaint_native_save")}
                        </button>
                      </div>
                    </div>

                      <div className="iopaint-native-card">
                        <div className="iopaint-native-field-grid">
                        <label>
                          <span>{t("iopaint_native_model")}</span>
                          <select
                            value={selectedModel}
                            disabled={nativeBusy || !!serverConfig?.disableModelSwitch}
                            onChange={(event) => setSelectedModel(event.target.value)}
                          >
                            {(serverConfig?.modelInfos ?? []).map((model) => (
                              <option key={model.name} value={model.name}>{model.name}</option>
                            ))}
                          </select>
                        </label>
                        <label>
                          <span>{t("iopaint_native_brush")}</span>
                          <input
                            type="range"
                            min="4"
                            max="160"
                            step="1"
                            value={nativeBrushSize}
                            onChange={(event) => setNativeBrushSize(Number(event.target.value))}
                          />
                        </label>
                        <label>
                          <span>{t("iopaint_native_prompt")}</span>
                          <input
                            type="text"
                            value={nativePrompt}
                            onChange={(event) => setNativePrompt(event.target.value)}
                            placeholder={t("iopaint_native_prompt_placeholder")}
                          />
                        </label>
                      </div>
                      <label className="inline-check">
                        <input type="checkbox" checked={nativeEraseMode} onChange={(event) => setNativeEraseMode(event.target.checked)} />
                        <span>{t("iopaint_native_erase_mode")}</span>
                        </label>
                        <div className="row-buttons">
                          <button type="button" onClick={() => setNativeBrushSize(24)}>24px</button>
                          <button type="button" onClick={() => setNativeBrushSize(48)}>48px</button>
                          <button type="button" onClick={() => setNativeBrushSize(96)}>96px</button>
                        </div>
                      <p className="muted">
                        {nativeError
                          ?? (nativeImagePath
                            ? `${t("iopaint_native_current_file")}: ${getBaseName(nativeImagePath)}`
                            : t("iopaint_native_hint"))}
                      </p>
                      {nativeSeed ? <code className="markremover-code">seed: {nativeSeed}</code> : null}
                    </div>
                  </div>

                  <div className="iopaint-native-stage">
                    {nativeWorkingDataUrl ? (
                      <canvas
                        ref={nativeCanvasRef}
                        className="iopaint-native-canvas"
                        onPointerDown={handleNativeCanvasPointerDown}
                        onPointerMove={handleNativeCanvasPointerMove}
                        onPointerUp={finishNativeStroke}
                        onPointerLeave={finishNativeStroke}
                      />
                    ) : (
                      <div className="iopaint-empty-state">
                        <strong>{t("iopaint_native_stage_title")}</strong>
                        <p className="muted">{t("iopaint_native_stage_desc")}</p>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          ) : (
            <div ref={frameShellRef} className="iopaint-shell">
              {!status.installed ? (
                <div className="iopaint-empty-state">
                  <strong>{t("iopaint_waiting_setup")}</strong>
                  <p className="muted">{t("iopaint_waiting_setup_desc")}</p>
                  <p className="muted">{t("ai_tools_go_settings_hint")}</p>
                  {onOpenSettings ? <div className="row-buttons">{renderSetupButton()}</div> : null}
                </div>
              ) : (
                <>
                  {status.error ? (
                    <div className="iopaint-frame-status">
                      <strong>{t("iopaint_status_failed")}</strong>
                      <p className="muted">{status.error}</p>
                      <p className="muted">{t("ai_tools_go_settings_hint")}</p>
                      {onOpenSettings ? <div className="row-buttons">{renderSetupButton()}</div> : null}
                    </div>
                  ) : !status.ready || !frameLoaded ? (
                    <div className="iopaint-frame-status">
                      <strong>{status.ready ? t("iopaint_loading_frame") : (status.message || t("iopaint_connecting"))}</strong>
                    </div>
                  ) : null}
                  {frameUrl ? (
                    <iframe
                      ref={frameRef}
                      className="iopaint-frame"
                      src={frameUrl}
                      title={t("iopaint_mode_builtin")}
                      allow="clipboard-read; clipboard-write"
                      onLoad={() => {
                        installFrameTweaks();
                        setFrameLoaded(true);
                        forceFrameRelayout();
                      }}
                    />
                  ) : null}
                </>
              )}
            </div>
          )}
        </>
      ) : (
        <div className="markremover-shell">
          {!aiStatus.installed ? (
            <div className="iopaint-empty-state">
              <strong>{t("markremover_waiting_setup")}</strong>
              <p className="muted">{t("markremover_waiting_setup_desc")}</p>
              <p className="muted">{t("ai_tools_go_settings_hint")}</p>
              {onOpenSettings ? <div className="row-buttons">{renderSetupButton()}</div> : null}
            </div>
          ) : (
            <div className="markremover-layout">
              <div className="markremover-sidebar">
                <div className="markremover-card">
                  <div className="markremover-card-header">
                    <strong>{t("markremover_input")}</strong>
                    <span className={`iopaint-status-badge ${aiWorking ? "" : "phase-ready"}`}>
                      {aiWorking ? t("markremover_running") : t("markremover_idle")}
                    </span>
                  </div>

                  <div className="row-buttons markremover-picker-row">
                    <button type="button" onClick={() => void pickInputFile()} disabled={aiWorking}>
                      {t("markremover_pick_file")}
                    </button>
                    <button type="button" onClick={() => void pickInputFolder()} disabled={aiWorking}>
                      {t("markremover_pick_folder")}
                    </button>
                  </div>

                  <label>
                    <span>{t("markremover_input")}</span>
                    <input
                      type="text"
                      value={inputPath}
                      onChange={(event) => setInputPath(event.target.value)}
                      placeholder="C:\\"
                    />
                  </label>
                  <div className="markremover-quick-summary">
                    <span>{inputKind === "folder" ? "배치 처리" : "단건 처리"}</span>
                    <span>{markRemoverSummary}</span>
                  </div>
                </div>

                <div className="markremover-card">
                  <div className="markremover-card-header">
                    <strong>{t("markremover_options")}</strong>
                  </div>

                  <div className="row-buttons markremover-preset-row">
                    <button type="button" onClick={() => applyMarkRemoverPreset("watermark")}>{t("markremover_preset_watermark")}</button>
                    <button type="button" onClick={() => applyMarkRemoverPreset("subtitle")}>{t("markremover_preset_subtitle")}</button>
                    <button type="button" onClick={() => applyMarkRemoverPreset("logo")}>{t("markremover_preset_logo")}</button>
                  </div>

                  <div className="markremover-field-grid">
                    <label>
                      <span>{t("markremover_detection_prompt")}</span>
                      <input type="text" value={detectionPrompt} onChange={(event) => setDetectionPrompt(event.target.value)} />
                    </label>
                    <label>
                      <span>{t("markremover_max_bbox")}</span>
                      <input type="number" min="1" max="100" step="0.5" value={maxBBoxPercent} onChange={(event) => setMaxBBoxPercent(event.target.value)} />
                    </label>
                    <label>
                      <span>{t("markremover_force_format")}</span>
                      <select value={forceFormat} onChange={(event) => setForceFormat(event.target.value as ForceFormat)}>
                        <option value="">{t("markremover_force_auto")}</option>
                        <option value="PNG">PNG</option>
                        <option value="WEBP">WEBP</option>
                        <option value="JPG">JPG</option>
                        <option value="MP4">MP4</option>
                        <option value="AVI">AVI</option>
                      </select>
                    </label>
                    <label>
                      <span>{t("markremover_detection_skip")}</span>
                      <input type="number" min="1" max="10" step="1" value={detectionSkip} onChange={(event) => setDetectionSkip(event.target.value)} />
                    </label>
                    <label>
                      <span>{t("markremover_fade_in")}</span>
                      <input type="number" min="0" step="0.1" value={fadeIn} onChange={(event) => setFadeIn(event.target.value)} />
                    </label>
                    <label>
                      <span>{t("markremover_fade_out")}</span>
                      <input type="number" min="0" step="0.1" value={fadeOut} onChange={(event) => setFadeOut(event.target.value)} />
                    </label>
                  </div>

                  <label className="inline-check">
                    <input type="checkbox" checked={transparent} onChange={(event) => setTransparent(event.target.checked)} />
                    <span>{t("markremover_transparent")}</span>
                  </label>

                  {inputKind === "folder" ? (
                    <>
                      <label>
                        <span>{t("markremover_output")}</span>
                        <input
                          type="text"
                          value={outputPath}
                          onChange={(event) => setOutputPath(event.target.value)}
                          placeholder="C:\\"
                        />
                      </label>
                      <div className="row-buttons">
                        <button type="button" onClick={() => void pickOutputFolder()} disabled={aiWorking}>
                          {t("markremover_pick_output")}
                        </button>
                      </div>
                    </>
                  ) : null}

                  <div className="row-buttons markremover-action-row">
                    <button type="button" onClick={runPreview} disabled={aiWorking}>
                      {t("markremover_preview")}
                    </button>
                    <button type="button" className="accent" onClick={runRemoval} disabled={aiWorking}>
                      {t("markremover_run")}
                    </button>
                    <button type="button" className="danger" onClick={stopRemoval} disabled={!aiWorking}>
                      {t("markremover_stop")}
                    </button>
                  </div>
                </div>

                <div className="markremover-card markremover-progress-card">
                  <div className="markremover-card-header">
                    <strong>{t("markremover_progress")}</strong>
                    <span>{aiStatus.progress}%</span>
                  </div>
                  <div className="markremover-progress-track">
                    <div className="markremover-progress-fill" style={{ width: `${aiStatus.progress}%` }} />
                  </div>
                  <p className="muted">{actionError ?? aiStatus.error ?? aiStatus.message}</p>
                  {aiStatus.currentPath ? (
                    <code className="markremover-code">{aiStatus.currentPath}</code>
                  ) : null}
                  {aiStatus.lastOutputPath ? (
                    <>
                      <span className="muted">{t("markremover_last_output")}</span>
                      <code className="markremover-code">{aiStatus.lastOutputPath}</code>
                    </>
                  ) : null}
                </div>
              </div>

              <div className="markremover-preview-pane">
                <div className="markremover-card markremover-preview-card">
                  <div className="markremover-card-header">
                    <strong>{hasRemovalResult ? t("markremover_result_preview") : t("markremover_preview")}</strong>
                    {hasRemovalResult || preview ? <span>{t("markremover_preview_ready")}</span> : null}
                  </div>

                  {hasRemovalResult ? (
                    <div className="markremover-preview-body">
                      <div className="markremover-preview-image-wrap">
                        <img className="markremover-preview-image" src={resultPreviewDataUrl} alt={t("markremover_result_preview")} />
                      </div>
                      <div className="markremover-preview-meta">
                        <div className="markremover-stat-grid">
                          <div className="markremover-stat-card">
                            <span>{t("markremover_source")}</span>
                            <strong title={inputPath}>{getBaseName(inputPath)}</strong>
                          </div>
                          <div className="markremover-stat-card">
                            <span>{t("markremover_last_output")}</span>
                            <strong title={resultOutputPath}>{getBaseName(resultOutputPath || inputPath)}</strong>
                          </div>
                        </div>
                        <p className="muted">{t("markremover_result_hint")}</p>
                        <div className="row-buttons">
                          <button type="button" className="accent" onClick={() => void saveRemovalResult()} disabled={aiWorking || !resultPreviewDataUrl}>
                            {t("markremover_save_result")}
                          </button>
                          <button type="button" onClick={reuseLastOutputAsInput} disabled={aiWorking || !(resultOutputPath || aiStatus.lastOutputPath)}>
                            결과로 다시 작업
                          </button>
                          <button type="button" onClick={resetMarkRemoverState} disabled={aiWorking}>
                            결과 지우기
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : preview ? (
                    <div className="markremover-preview-body">
                      <div className="markremover-preview-image-wrap">
                        <img className="markremover-preview-image" src={preview.imageDataUrl} alt={t("markremover_preview")} />
                      </div>
                      <div className="markremover-preview-meta">
                        <div className="markremover-stat-grid">
                          <div className="markremover-stat-card">
                            <span>{t("markremover_detected")}</span>
                            <strong>{preview.detections.length}</strong>
                          </div>
                          <div className="markremover-stat-card">
                            <span>{t("markremover_accepted")}</span>
                            <strong>{acceptedDetections}</strong>
                          </div>
                          <div className="markremover-stat-card">
                            <span>{t("markremover_source")}</span>
                            <strong title={preview.source}>{getBaseName(preview.source)}</strong>
                          </div>
                        </div>
                        <p className="muted">{t("markremover_preview_hint")}</p>
                        <div className="row-buttons">
                          <button type="button" onClick={runPreview} disabled={aiWorking}>
                            미리보기 갱신
                          </button>
                          <button type="button" className="accent" onClick={runRemoval} disabled={aiWorking}>
                            {t("markremover_run")}
                          </button>
                          <button type="button" onClick={resetMarkRemoverState} disabled={aiWorking}>
                            초기화
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="iopaint-empty-state">
                      <strong>{t("markremover_preview")}</strong>
                      <p className="muted">{t("markremover_preview_empty")}</p>
                    </div>
                  )}
                </div>

                <div className="iopaint-log-card markremover-log-card">
                  <div className="iopaint-log-header">
                    <strong>{t("markremover_logs")}</strong>
                    {t("markremover_external_note") ? <span className="muted">{t("markremover_external_note")}</span> : null}
                  </div>
                  <pre className="iopaint-log-output">
                    {aiStatus.logs.length ? aiStatus.logs.join("\n") : t("iopaint_log_empty")}
                  </pre>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
