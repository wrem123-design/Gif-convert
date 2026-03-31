import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useEditorStore } from "../state/editorStore";
import { useI18n } from "../i18n";
import { useFrameDataUrl } from "../hooks/useFrameDataUrl";
import { ZoomableImagePreview } from "./ZoomableImagePreview";

const bgRemovePrefsKey = "sprite_forge_bg_remove_panel_prefs_v2";

type BgRemoveMode = "auto" | "ai" | "solid";
type BgRemoveViewMode = "split" | "original" | "result";

interface BgRemoveResult {
  total: number;
  processed: number;
  failed: number;
  outputDir: string;
  outputs: string[];
  failedFiles: Array<{ inputPath: string; error: string }>;
}

interface BgRemoveProgress {
  total: number;
  done: number;
  processed: number;
  failed: number;
  currentPath: string;
}

interface BgRemovePanelPrefs {
  outputDir: string;
  flipH: boolean;
  keepOriginalSize: boolean;
  resizeEnabled: boolean;
  width: string;
  height: string;
  keepAspect: boolean;
  enhanceEdges: boolean;
  previewBgColor: string;
  mode: BgRemoveMode;
  backgroundTolerance: number;
}

interface BgPreviewResponse {
  outputDataUrl: string;
  appliedMode: BgRemoveMode;
}

const defaultBgRemovePanelPrefs: BgRemovePanelPrefs = {
  outputDir: "",
  flipH: false,
  keepOriginalSize: true,
  resizeEnabled: false,
  width: "512",
  height: "",
  keepAspect: true,
  enhanceEdges: true,
  previewBgColor: "#101010",
  mode: "auto",
  backgroundTolerance: 0.16
};

function isHexColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
}

function sanitizeSizeInput(value: unknown, fallback: string): string {
  if (typeof value !== "string") {
    return fallback;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return String(parsed);
}

function sanitizeTolerance(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(0.01, Math.min(0.45, value));
}

function sanitizeMode(value: unknown): BgRemoveMode {
  return value === "ai" || value === "solid" || value === "auto" ? value : "auto";
}

function loadBgRemovePanelPrefs(): BgRemovePanelPrefs {
  if (typeof window === "undefined") {
    return { ...defaultBgRemovePanelPrefs };
  }
  try {
    const raw = window.localStorage.getItem(bgRemovePrefsKey);
    if (!raw) {
      return { ...defaultBgRemovePanelPrefs };
    }
    const parsed = JSON.parse(raw) as Partial<BgRemovePanelPrefs>;
    return {
      outputDir: typeof parsed.outputDir === "string" ? parsed.outputDir : defaultBgRemovePanelPrefs.outputDir,
      flipH: typeof parsed.flipH === "boolean" ? parsed.flipH : defaultBgRemovePanelPrefs.flipH,
      keepOriginalSize: typeof parsed.keepOriginalSize === "boolean" ? parsed.keepOriginalSize : defaultBgRemovePanelPrefs.keepOriginalSize,
      resizeEnabled: typeof parsed.resizeEnabled === "boolean" ? parsed.resizeEnabled : defaultBgRemovePanelPrefs.resizeEnabled,
      width: sanitizeSizeInput(parsed.width, defaultBgRemovePanelPrefs.width),
      height: sanitizeSizeInput(parsed.height, defaultBgRemovePanelPrefs.height),
      keepAspect: typeof parsed.keepAspect === "boolean" ? parsed.keepAspect : defaultBgRemovePanelPrefs.keepAspect,
      enhanceEdges: typeof parsed.enhanceEdges === "boolean" ? parsed.enhanceEdges : defaultBgRemovePanelPrefs.enhanceEdges,
      previewBgColor: isHexColor(parsed.previewBgColor) ? parsed.previewBgColor : defaultBgRemovePanelPrefs.previewBgColor,
      mode: sanitizeMode(parsed.mode),
      backgroundTolerance: sanitizeTolerance(parsed.backgroundTolerance, defaultBgRemovePanelPrefs.backgroundTolerance)
    };
  } catch {
    return { ...defaultBgRemovePanelPrefs };
  }
}

function mergeUniquePaths(current: string[], next: string[]): string[] {
  const existing = new Set(current.map((p) => p.toLowerCase()));
  const merged = [...current];
  for (const item of next) {
    const key = item.toLowerCase();
    if (!existing.has(key)) {
      existing.add(key);
      merged.push(item);
    }
  }
  return merged;
}

function fileNameOnly(filePath: string): string {
  const parts = filePath.split(/[\\/]/);
  return parts[parts.length - 1] || filePath;
}

function BgFileThumb(props: {
  filePath: string;
  index: number;
  selected: boolean;
  onSelect: (index: number) => void;
}): JSX.Element {
  const dataUrl = useFrameDataUrl(props.filePath);

  return (
    <button
      type="button"
      className={`timeline-frame ${props.selected ? "selected" : ""}`}
      onClick={() => props.onSelect(props.index)}
      title={props.filePath}
    >
      <div className="thumb-shell">{dataUrl ? <img src={dataUrl} alt={fileNameOnly(props.filePath)} /> : null}</div>
      <span>{String(props.index + 1).padStart(3, "0")}</span>
      <span className="muted bg-thumb-name">{fileNameOnly(props.filePath)}</span>
    </button>
  );
}

export function BackgroundRemovalPanel(): JSX.Element {
  const { t } = useI18n();
  const setActiveHelpTopic = useEditorStore((s) => s.setActiveHelpTopic);
  const initialPrefs = useMemo(() => loadBgRemovePanelPrefs(), []);

  const [files, setFiles] = useState<string[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [outputDir, setOutputDir] = useState(initialPrefs.outputDir);
  const [flipH, setFlipH] = useState(initialPrefs.flipH);
  const [keepOriginalSize, setKeepOriginalSize] = useState(initialPrefs.keepOriginalSize);
  const [resizeEnabled, setResizeEnabled] = useState(initialPrefs.resizeEnabled);
  const [width, setWidth] = useState(initialPrefs.width);
  const [height, setHeight] = useState(initialPrefs.height);
  const [keepAspect, setKeepAspect] = useState(initialPrefs.keepAspect);
  const [enhanceEdges, setEnhanceEdges] = useState(initialPrefs.enhanceEdges);
  const [previewBgColor, setPreviewBgColor] = useState(initialPrefs.previewBgColor);
  const [mode, setMode] = useState<BgRemoveMode>(initialPrefs.mode);
  const [backgroundTolerance, setBackgroundTolerance] = useState(initialPrefs.backgroundTolerance);
  const [viewMode, setViewMode] = useState<BgRemoveViewMode>("split");

  const [collecting, setCollecting] = useState(false);
  const [running, setRunning] = useState(false);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);
  const [previewAppliedMode, setPreviewAppliedMode] = useState<BgRemoveMode | null>(null);
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<BgRemoveResult | null>(null);
  const [progress, setProgress] = useState<BgRemoveProgress | null>(null);

  const selectedFile = files[selectedIndex] ?? null;
  const originalDataUrl = useFrameDataUrl(selectedFile ?? undefined);
  const previewTokenRef = useRef(0);
  const bgColorInputRef = useRef<HTMLInputElement | null>(null);

  const trimmedWidth = useMemo(() => {
    const n = Number.parseInt(width, 10);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  }, [width]);

  const trimmedHeight = useMemo(() => {
    const n = Number.parseInt(height, 10);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  }, [height]);

  const tolerancePercent = Math.round(backgroundTolerance * 100);
  const selectedFileName = selectedFile ? fileNameOnly(selectedFile) : null;

  const modeLabelKey: Record<BgRemoveMode, string> = {
    auto: "bg_remove_mode_auto",
    ai: "bg_remove_mode_ai",
    solid: "bg_remove_mode_solid"
  };

  const previewCanvasStyle = useMemo(
    () => ({
      background:
        `linear-gradient(45deg, rgba(255, 255, 255, 0.035) 25%, transparent 25%) 0 0 / 18px 18px, ` +
        `linear-gradient(-45deg, rgba(255, 255, 255, 0.035) 25%, transparent 25%) 0 0 / 18px 18px, ` +
        previewBgColor
    }),
    [previewBgColor]
  );

  const refreshPreview = useCallback(async () => {
    if (!selectedFile) {
      setPreviewDataUrl(null);
      setPreviewError("");
      setPreviewAppliedMode(null);
      return;
    }

    const token = ++previewTokenRef.current;
    setPreviewBusy(true);
    setPreviewError("");

    try {
      const data = await window.spriteForge.previewBackgroundRemoval({
        inputPath: selectedFile,
        flipHorizontal: flipH,
        resize: {
          enabled: !keepOriginalSize && resizeEnabled,
          width: trimmedWidth,
          height: trimmedHeight,
          keepAspect
        },
        enhanceEdges,
        mode,
        backgroundTolerance
      }) as BgPreviewResponse;

      if (token !== previewTokenRef.current) {
        return;
      }
      setPreviewDataUrl(data.outputDataUrl);
      setPreviewAppliedMode(data.appliedMode);
    } catch (error) {
      if (token !== previewTokenRef.current) {
        return;
      }
      setPreviewDataUrl(null);
      setPreviewAppliedMode(null);
      setPreviewError(error instanceof Error ? error.message : String(error));
    } finally {
      if (token === previewTokenRef.current) {
        setPreviewBusy(false);
      }
    }
  }, [backgroundTolerance, enhanceEdges, flipH, keepAspect, keepOriginalSize, mode, resizeEnabled, selectedFile, trimmedHeight, trimmedWidth]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refreshPreview();
    }, 180);
    return () => window.clearTimeout(timer);
  }, [refreshPreview]);

  useEffect(() => {
    setSelectedIndex((idx) => {
      if (!files.length) {
        return 0;
      }
      return Math.min(idx, files.length - 1);
    });
  }, [files.length]);

  useEffect(() => {
    const off = window.spriteForge.onBgRemoveProgress((next) => {
      setProgress(next as BgRemoveProgress);
    });
    return () => off();
  }, []);

  useEffect(() => {
    try {
      const payload: BgRemovePanelPrefs = {
        outputDir,
        flipH,
        keepOriginalSize,
        resizeEnabled,
        width,
        height,
        keepAspect,
        enhanceEdges,
        previewBgColor,
        mode,
        backgroundTolerance
      };
      window.localStorage.setItem(bgRemovePrefsKey, JSON.stringify(payload));
    } catch {
      // Ignore storage write failures.
    }
  }, [backgroundTolerance, enhanceEdges, flipH, height, keepAspect, keepOriginalSize, mode, outputDir, previewBgColor, resizeEnabled, width]);

  const addImageFiles = async () => {
    const paths = await window.spriteForge.pickBgRemoveImagePaths();
    if (!paths.length) return;
    setFiles((prev) => mergeUniquePaths(prev, paths));
    setMessage("");
  };

  const addFolders = async () => {
    const paths = await window.spriteForge.pickBgRemoveFolders();
    if (!paths.length) return;

    setCollecting(true);
    setMessage(t("bg_remove_collecting"));
    try {
      const data = await window.spriteForge.collectBackgroundRemoveFiles({
        inputPaths: paths
      }) as { files: string[] };
      setFiles((prev) => mergeUniquePaths(prev, data.files ?? []));
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setCollecting(false);
    }
  };

  const clearList = () => {
    setFiles([]);
    setSelectedIndex(0);
    setPreviewDataUrl(null);
    setPreviewError("");
    setPreviewAppliedMode(null);
    setResult(null);
    setMessage("");
    setProgress(null);
  };

  const chooseOutputDir = async () => {
    const selected = await window.spriteForge.pickBgRemoveOutputDir();
    if (selected) {
      setOutputDir(selected);
    }
  };

  const runBatch = async () => {
    setActiveHelpTopic("bg_remove");
    setResult(null);
    setMessage("");
    setProgress(null);

    if (!files.length) {
      setMessage(t("bg_remove_no_inputs"));
      return;
    }

    let finalOutputDir = outputDir;
    if (!finalOutputDir) {
      const selected = await window.spriteForge.pickBgRemoveOutputDir();
      if (!selected) {
        setMessage(t("bg_remove_no_output"));
        return;
      }
      finalOutputDir = selected;
      setOutputDir(selected);
    }

    setRunning(true);
    try {
      const data = await window.spriteForge.runBackgroundRemoval({
        inputPaths: files,
        outputDir: finalOutputDir,
        flipHorizontal: flipH,
        resize: {
          enabled: !keepOriginalSize && resizeEnabled,
          width: trimmedWidth,
          height: trimmedHeight,
          keepAspect
        },
        enhanceEdges,
        mode,
        backgroundTolerance
      }) as BgRemoveResult;
      setResult(data);
      setMessage(
        `${t("bg_remove_result")}: ${data.processed}/${data.total} (${t("bg_remove_failed")}: ${data.failed})`
      );
    } catch (error) {
      setMessage(`${error instanceof Error ? error.message : String(error)} | ${t("bg_remove_recommend_install")}`);
    } finally {
      setRunning(false);
    }
  };

  const previewStatusText = (() => {
    if (!selectedFile) {
      return t("bg_remove_stage_empty_desc");
    }
    if (previewBusy) {
      return t("bg_remove_preview_loading");
    }
    if (previewError) {
      return previewError;
    }
    if (!previewDataUrl) {
      return t("bg_remove_preview_loading");
    }
    return `${t("bg_remove_applied_mode")}: ${t(modeLabelKey[previewAppliedMode ?? mode])}`;
  })();

  const renderPreviewPane = (
    src: string | null | undefined,
    alt: string,
    title: string,
    empty: JSX.Element
  ) => (
    <div className="bg-remove-preview-pane">
      <div className="bg-remove-pane-header">
        <h3>{title}</h3>
      </div>
      <div className="bg-remove-preview-canvas">
        <ZoomableImagePreview
          src={src}
          alt={alt}
          empty={empty}
          stageStyle={previewCanvasStyle}
        />
      </div>
    </div>
  );

  return (
    <section className="panel bg-remove-panel">
      <div className="bg-remove-hero">
        <div className="bg-remove-hero-copy">
          <span className="bg-remove-eyebrow">{t("bg_remove_badge")}</span>
          <h2>{t("bg_remove_title")}</h2>
          <p className="muted">{t("bg_remove_desc")}</p>
        </div>
        <div className="bg-remove-hero-actions">
          <button type="button" onClick={() => void addImageFiles()} disabled={collecting || running}>{t("bg_remove_add_files")}</button>
          <button type="button" onClick={() => void addFolders()} disabled={collecting || running}>{t("bg_remove_add_folders")}</button>
          <button type="button" onClick={clearList} disabled={collecting || running}>{t("bg_remove_clear_list")}</button>
          <span className="bg-remove-count-chip">{t("bg_remove_input_count")}: {files.length}</span>
        </div>
      </div>

      <div className="bg-remove-layout">
        <div className="bg-remove-stage-card">
          <div className="bg-remove-stage-toolbar">
            <div className="bg-remove-segment">
              <button type="button" className={viewMode === "split" ? "active" : ""} onClick={() => setViewMode("split")}>{t("bg_remove_view_split")}</button>
              <button type="button" className={viewMode === "original" ? "active" : ""} onClick={() => setViewMode("original")}>{t("bg_remove_view_original")}</button>
              <button type="button" className={viewMode === "result" ? "active" : ""} onClick={() => setViewMode("result")}>{t("bg_remove_view_result")}</button>
            </div>

            <div className="bg-remove-segment">
              <button type="button" className={mode === "auto" ? "active" : ""} onClick={() => setMode("auto")}>{t("bg_remove_mode_auto")}</button>
              <button type="button" className={mode === "ai" ? "active" : ""} onClick={() => setMode("ai")}>{t("bg_remove_mode_ai")}</button>
              <button type="button" className={mode === "solid" ? "active" : ""} onClick={() => setMode("solid")}>{t("bg_remove_mode_solid")}</button>
            </div>

            <div className="bg-remove-toolbar-actions">
              <button type="button" onClick={() => void refreshPreview()} disabled={!selectedFile || collecting || running}>{t("bg_remove_preview_refresh")}</button>
              <button type="button" onClick={() => bgColorInputRef.current?.click()}>{t("bg_remove_canvas_bg_button")}</button>
              <input
                ref={bgColorInputRef}
                type="color"
                value={previewBgColor}
                onChange={(e) => setPreviewBgColor(e.target.value)}
                className="bg-preview-bg-color-input"
                aria-label={t("bg_remove_canvas_bg_button")}
              />
            </div>
          </div>

          <div className={`bg-remove-stage-body bg-remove-stage-body--${viewMode}`}>
            {!selectedFile ? (
              <div className="bg-remove-empty-state">
                <div className="bg-remove-empty-card">
                  <span className="bg-remove-empty-badge">{t("bg_remove_mode_auto")}</span>
                  <h3>{t("bg_remove_stage_empty_title")}</h3>
                  <p className="muted">{t("bg_remove_stage_empty_desc")}</p>
                  <div className="bg-remove-empty-actions">
                    <button type="button" className="accent" onClick={() => void addImageFiles()} disabled={collecting || running}>{t("bg_remove_add_files")}</button>
                    <button type="button" onClick={() => void addFolders()} disabled={collecting || running}>{t("bg_remove_add_folders")}</button>
                  </div>
                </div>
              </div>
            ) : viewMode === "split" ? (
              <div className="bg-remove-preview-split">
                {renderPreviewPane(
                  originalDataUrl,
                  t("bg_remove_preview_left"),
                  t("bg_remove_preview_left"),
                  <div className="muted">...</div>
                )}
                {renderPreviewPane(
                  selectedFile && !previewBusy ? previewDataUrl : null,
                  t("bg_remove_preview_right"),
                  t("bg_remove_preview_right"),
                  <div className="muted">{previewBusy ? t("bg_remove_preview_loading") : previewError || t("bg_remove_preview_loading")}</div>
                )}
              </div>
            ) : viewMode === "original" ? (
              renderPreviewPane(
                originalDataUrl,
                t("bg_remove_preview_left"),
                t("bg_remove_preview_left"),
                <div className="muted">...</div>
              )
            ) : (
              renderPreviewPane(
                selectedFile && !previewBusy ? previewDataUrl : null,
                t("bg_remove_preview_right"),
                t("bg_remove_preview_right"),
                <div className="muted">{previewBusy ? t("bg_remove_preview_loading") : previewError || t("bg_remove_preview_loading")}</div>
              )
            )}
          </div>

          <div className="bg-remove-stage-footer">
            <div className="bg-remove-stage-meta">
              <strong>{selectedFileName ?? t("bg_remove_stage_empty_title")}</strong>
              <span className="muted">{previewStatusText}</span>
            </div>
            <div className="bg-remove-stage-pills">
              <span className="bg-remove-pill">{t("bg_remove_mode")}: {t(modeLabelKey[mode])}</span>
              <span className="bg-remove-pill">{t("bg_remove_tolerance")}: {tolerancePercent}%</span>
            </div>
          </div>
        </div>

        <aside className="bg-remove-side">
          <div className="bg-remove-card">
            <div className="bg-remove-card-head">
              <h3>{t("bg_remove_output_dir")}</h3>
            </div>
            <label className="bg-remove-field">
              <span>{t("bg_remove_output_dir")}</span>
              <input value={outputDir} onChange={(e) => setOutputDir(e.target.value)} placeholder="C:\\output" />
            </label>
            <div className="bg-remove-inline-actions">
              <button type="button" onClick={() => void chooseOutputDir()}>{t("bg_remove_pick_output")}</button>
              <button type="button" className="accent" disabled={running || collecting} onClick={() => void runBatch()}>
                {running ? t("bg_remove_running") : t("bg_remove_run")}
              </button>
            </div>
            {running && progress ? (
              <div className="bg-remove-progress-box">
                <strong>{t("bg_remove_progress")}: {progress.done}/{progress.total}</strong>
                <span className="muted">{t("bg_remove_processed")}: {progress.processed} · {t("bg_remove_failed")}: {progress.failed}</span>
                <span className="muted bg-remove-progress-path">{progress.currentPath}</span>
              </div>
            ) : null}
          </div>

          <div className="bg-remove-card">
            <div className="bg-remove-card-head">
              <h3>{t("bg_remove_mode")}</h3>
            </div>
            <div className="bg-remove-mode-grid">
              <button type="button" className={`bg-remove-mode-card ${mode === "auto" ? "active" : ""}`} onClick={() => setMode("auto")}>
                <strong>{t("bg_remove_mode_auto")}</strong>
                <span className="muted">{t("bg_remove_mode_auto_desc")}</span>
              </button>
              <button type="button" className={`bg-remove-mode-card ${mode === "ai" ? "active" : ""}`} onClick={() => setMode("ai")}>
                <strong>{t("bg_remove_mode_ai")}</strong>
                <span className="muted">{t("bg_remove_mode_ai_desc")}</span>
              </button>
              <button type="button" className={`bg-remove-mode-card ${mode === "solid" ? "active" : ""}`} onClick={() => setMode("solid")}>
                <strong>{t("bg_remove_mode_solid")}</strong>
                <span className="muted">{t("bg_remove_mode_solid_desc")}</span>
              </button>
            </div>
            <label className="bg-remove-field">
              <span>{t("bg_remove_tolerance")}: {tolerancePercent}%</span>
              <input
                type="range"
                min={1}
                max={45}
                value={tolerancePercent}
                onChange={(e) => setBackgroundTolerance(Math.max(0.01, Math.min(0.45, Number(e.target.value) / 100)))}
              />
              <span className="muted">{t("bg_remove_tolerance_hint")}</span>
            </label>
          </div>

          <div className="bg-remove-card">
            <div className="bg-remove-card-head">
              <h3>{t("bg_remove_options_title")}</h3>
            </div>
            <label className="inline-check">
              <input type="checkbox" checked={flipH} onChange={(e) => setFlipH(e.target.checked)} />
              {t("bg_remove_flip_h")}
            </label>
            <label className="inline-check">
              <input
                type="checkbox"
                checked={keepOriginalSize}
                onChange={(e) => {
                  const next = e.target.checked;
                  setKeepOriginalSize(next);
                  if (next) {
                    setResizeEnabled(false);
                  }
                }}
              />
              {t("bg_remove_keep_original_size")}
            </label>
            <label className="inline-check">
              <input
                type="checkbox"
                checked={!keepOriginalSize && resizeEnabled}
                disabled={keepOriginalSize}
                onChange={(e) => setResizeEnabled(e.target.checked)}
              />
              {t("bg_remove_resize")}
            </label>
            <div className="bg-remove-dimension-grid">
              <label className="bg-remove-field">
                <span>{t("bg_remove_width")}</span>
                <input
                  type="number"
                  min={1}
                  value={width}
                  disabled={keepOriginalSize || !resizeEnabled}
                  onChange={(e) => setWidth(e.target.value)}
                />
              </label>
              <label className="bg-remove-field">
                <span>{t("bg_remove_height")}</span>
                <input
                  type="number"
                  min={1}
                  value={height}
                  disabled={keepOriginalSize || !resizeEnabled}
                  onChange={(e) => setHeight(e.target.value)}
                />
              </label>
            </div>
            <label className="inline-check">
              <input
                type="checkbox"
                checked={keepAspect}
                disabled={keepOriginalSize || !resizeEnabled}
                onChange={(e) => setKeepAspect(e.target.checked)}
              />
              {t("bg_remove_keep_aspect")}
            </label>
            <label className="inline-check">
              <input
                type="checkbox"
                checked={enhanceEdges}
                disabled={mode === "solid"}
                onChange={(e) => setEnhanceEdges(e.target.checked)}
              />
              {t("bg_remove_enhance_edges")}
            </label>
          </div>

          {result ? (
            <div className="bg-remove-card bg-remove-result">
              <div className="bg-remove-card-head">
                <h3>{t("bg_remove_result")}</h3>
              </div>
              <strong>{result.processed}/{result.total}</strong>
              <div className="muted">{result.outputDir}</div>
              {result.failedFiles.length ? (
                <div className="bg-remove-failed-list">
                  {result.failedFiles.map((item) => (
                    <div key={`${item.inputPath}:${item.error}`} className="muted">
                      {item.inputPath} - {item.error}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </aside>
      </div>

      <div className="bg-remove-frame-strip timeline-scroll">
        {files.map((filePath, index) => (
          <BgFileThumb
            key={filePath}
            filePath={filePath}
            index={index}
            selected={index === selectedIndex}
            onSelect={setSelectedIndex}
          />
        ))}
      </div>

      {message ? <div className="bg-remove-banner muted">{message}</div> : null}
    </section>
  );
}
