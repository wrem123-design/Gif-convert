import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "../i18n";
import type { SpriteForgeApi } from "../../main/preload";

type IOPaintStatus = Awaited<ReturnType<SpriteForgeApi["getIOPaintStatus"]>>;
type MarkRemoverStatus = Awaited<ReturnType<SpriteForgeApi["getMarkRemoverStatus"]>>;
type MarkRemoverPreview = Awaited<ReturnType<SpriteForgeApi["previewMarkRemover"]>>;
type ToolMode = "iopaint" | "markremover";
type ForceFormat = "PNG" | "WEBP" | "JPG" | "MP4" | "AVI" | "";
type InputSelectionKind = "" | "file" | "folder";

const TOOL_MODE_KEY = "sprite_forge_ai_editor_mode_v1";
const AI_EDITOR_PREFS_KEY = "sprite_forge_ai_editor_prefs_v1";

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

export function IOPaintPanel(): JSX.Element {
  const { t } = useI18n();
  const initialPrefs = useMemo(() => loadAiEditorPrefs(), []);
  const [mode, setMode] = useState<ToolMode>(loadToolMode);
  const [status, setStatus] = useState<IOPaintStatus>(DEFAULT_IOPAINT_STATUS);
  const [aiStatus, setAiStatus] = useState<MarkRemoverStatus>(DEFAULT_MARKREMOVER_STATUS);
  const [frameKey, setFrameKey] = useState(0);
  const [frameLoaded, setFrameLoaded] = useState(false);
  const [inputPath, setInputPath] = useState(initialPrefs.inputPath);
  const [inputKind, setInputKind] = useState<InputSelectionKind>(initialPrefs.inputKind);
  const [outputPath, setOutputPath] = useState(initialPrefs.outputPath);
  const [detectionPrompt, setDetectionPrompt] = useState(initialPrefs.detectionPrompt);
  const [maxBBoxPercent, setMaxBBoxPercent] = useState(initialPrefs.maxBBoxPercent);
  const [transparent, setTransparent] = useState(initialPrefs.transparent);
  const [overwrite, setOverwrite] = useState(initialPrefs.overwrite);
  const [forceFormat, setForceFormat] = useState<ForceFormat>(initialPrefs.forceFormat);
  const [detectionSkip, setDetectionSkip] = useState(initialPrefs.detectionSkip);
  const [fadeIn, setFadeIn] = useState(initialPrefs.fadeIn);
  const [fadeOut, setFadeOut] = useState(initialPrefs.fadeOut);
  const [preview, setPreview] = useState<MarkRemoverPreview | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const wasReadyRef = useRef(false);

  useEffect(() => {
    try {
      window.localStorage.setItem(TOOL_MODE_KEY, mode);
    } catch {
      // Ignore storage write failures.
    }
  }, [mode]);

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
    let mounted = true;

    void window.spriteForge.getIOPaintStatus().then((next) => {
      if (mounted) {
        setStatus(next);
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
    if (status.ready && !wasReadyRef.current) {
      setFrameLoaded(false);
      setFrameKey((value) => value + 1);
    }
    wasReadyRef.current = status.ready;
  }, [status.ready]);

  useEffect(() => {
    if (!status.installed || status.ready || status.phase !== "idle") {
      return;
    }
    void window.spriteForge.ensureIOPaintStarted().catch(() => {
      // Shared status stream already carries the failure details.
    });
  }, [status.installed, status.ready, status.phase]);

  useEffect(() => {
    setPreview(null);
    setActionError(null);
  }, [inputPath, detectionPrompt, maxBBoxPercent]);

  const installIOPaint = (): void => {
    void window.spriteForge.ensureIOPaintInstalled().catch(() => {
      // Shared status stream already carries the failure details.
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
    setInputKind("file");
    setInputPath(nextInput);
  };

  const pickInputFolder = async (): Promise<void> => {
    const folders = await window.spriteForge.pickBgRemoveFolders();
    const nextInput = folders[0];
    if (!nextInput) {
      return;
    }
    setInputKind("folder");
    setInputPath(nextInput);
  };

  const pickOutputFolder = async (): Promise<void> => {
    const nextOutput = await window.spriteForge.pickBgRemoveOutputDir();
    if (nextOutput) {
      setOutputPath(nextOutput);
    }
  };

  const runPreview = (): void => {
    const normalizedInput = inputPath.trim();
    if (!normalizedInput) {
      setActionError(t("markremover_select_input_first"));
      return;
    }

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

  const runRemoval = (): void => {
    const normalizedInput = inputPath.trim();
    const normalizedOutput = outputPath.trim();
    if (!normalizedInput) {
      setActionError(t("markremover_select_input_first"));
      return;
    }
    if (!normalizedOutput) {
      setActionError(t("markremover_select_output_first"));
      return;
    }

    setActionError(null);
    void window.spriteForge.runMarkRemover({
      inputPath: normalizedInput,
      outputPath: normalizedOutput,
      overwrite,
      transparent,
      maxBBoxPercent: Number.parseFloat(maxBBoxPercent) || 10,
      forceFormat: forceFormat || null,
      detectionPrompt: detectionPrompt.trim() || "watermark",
      detectionSkip: Math.max(1, Math.min(10, Number.parseInt(detectionSkip, 10) || 1)),
      fadeIn: Math.max(0, Number.parseFloat(fadeIn) || 0),
      fadeOut: Math.max(0, Number.parseFloat(fadeOut) || 0)
    }).then(() => {
      setActionError(null);
    }).catch((error) => {
      setActionError(error instanceof Error ? error.message : String(error));
    });
  };

  const stopRemoval = (): void => {
    void window.spriteForge.stopMarkRemover().catch((error) => {
      setActionError(error instanceof Error ? error.message : String(error));
    });
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

  const isInstallingAnything = isBusy(status.phase) || isBusy(aiStatus.phase);
  const setupNeeded = !status.installed || !aiStatus.installed;
  const aiWorking = isBusy(aiStatus.phase) || aiStatus.taskState !== "idle";
  const acceptedDetections = useMemo(
    () => preview?.detections.filter((item) => item.accepted).length ?? 0,
    [preview]
  );

  return (
    <section className="panel iopaint-page">
      <div className="iopaint-header">
        <div>
          <h2>{t("tab_iopaint")}</h2>
          {t("iopaint_desc") ? <p className="muted">{t("iopaint_desc")}</p> : null}
        </div>
        <div className="row-buttons iopaint-mode-toggle">
          <button type="button" className={mode === "iopaint" ? "active" : ""} onClick={() => setMode("iopaint")}>
            {t("iopaint_mode_builtin")}
          </button>
          <button type="button" className={mode === "markremover" ? "active" : ""} onClick={() => setMode("markremover")}>
            {t("iopaint_mode_ai")}
          </button>
        </div>
      </div>

      {setupNeeded ? (
        <div className="iopaint-setup-card">
          <div className="iopaint-setup-copy">
            <span className="iopaint-status-badge">{t("tool_first_run_badge")}</span>
            <strong>{t("tool_first_run_title")}</strong>
            <p className="muted">{t("tool_first_run_desc")}</p>
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
              {!status.installed ? (
                <button type="button" onClick={installIOPaint} disabled={isInstallingAnything}>
                  {t("tool_install_iopaint")}
                </button>
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

          {isInstallingAnything || status.error || aiStatus.error ? (
            <div className="iopaint-log-card">
              <div className="iopaint-log-header">
                <strong>{t("iopaint_log_title")}</strong>
                {t("iopaint_log_desc") ? <span className="muted">{t("iopaint_log_desc")}</span> : null}
              </div>
              <pre className="iopaint-log-output">
                {[...status.logs, ...aiStatus.logs].length ? [...status.logs, ...aiStatus.logs].join("\n") : t("iopaint_log_empty")}
              </pre>
            </div>
          ) : null}
        </div>
      ) : null}

      {mode === "iopaint" ? (
        <>
          <div className="iopaint-status-card compact">
            <div className="iopaint-status-copy">
              <span className={`iopaint-status-badge ${status.ready ? "phase-ready" : ""}`}>
                {status.ready ? t("iopaint_status_ready") : t("iopaint_status_setting")}
              </span>
              <strong>{status.message}</strong>
              <p className={`muted ${status.error ? "iopaint-status-error" : ""}`}>
                {status.error ?? (status.installed ? t("iopaint_status_desc") : t("iopaint_waiting_setup_desc"))}
              </p>
            </div>
          </div>

          <div className="iopaint-shell">
            {!status.installed ? (
              <div className="iopaint-empty-state">
                <strong>{t("iopaint_waiting_setup")}</strong>
                <p className="muted">{t("iopaint_waiting_setup_desc")}</p>
              </div>
            ) : (
              <>
                {!status.ready || !frameLoaded ? (
                  <div className="iopaint-frame-status">
                    <strong>{status.ready ? t("iopaint_loading_frame") : t("iopaint_connecting")}</strong>
                  </div>
                ) : null}
                {status.ready ? (
                  <iframe
                    ref={frameRef}
                    key={frameKey}
                    className="iopaint-frame"
                    src={status.url}
                    title={t("iopaint_mode_builtin")}
                    allow="clipboard-read; clipboard-write"
                    onLoad={() => {
                      installFrameTweaks();
                      setFrameLoaded(true);
                    }}
                  />
                ) : null}
              </>
            )}
          </div>
        </>
      ) : (
        <div className="markremover-shell">
          {!aiStatus.installed ? (
            <div className="iopaint-empty-state">
              <strong>{t("markremover_waiting_setup")}</strong>
              <p className="muted">{t("markremover_waiting_setup_desc")}</p>
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
                    <button type="button" onClick={() => void pickOutputFolder()} disabled={aiWorking}>
                      {t("markremover_pick_output")}
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
                  <label>
                    <span>{t("markremover_output")}</span>
                    <input type="text" value={outputPath} onChange={(event) => setOutputPath(event.target.value)} placeholder="C:\\" />
                  </label>
                </div>

                <div className="markremover-card">
                  <div className="markremover-card-header">
                    <strong>{t("markremover_options")}</strong>
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
                  <label className="inline-check">
                    <input type="checkbox" checked={overwrite} onChange={(event) => setOverwrite(event.target.checked)} />
                    <span>{t("markremover_overwrite")}</span>
                  </label>

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
                    <strong>{t("markremover_preview")}</strong>
                    {preview ? <span>{t("markremover_preview_ready")}</span> : null}
                  </div>

                  {preview ? (
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
