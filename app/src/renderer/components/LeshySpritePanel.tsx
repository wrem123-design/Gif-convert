import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "../i18n";

interface SpriteMapEntry {
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  ignore: boolean;
}

interface ExtractSpriteMapResult {
  imageWidth: number;
  imageHeight: number;
  sprites: SpriteMapEntry[];
}

interface LeshySpritePrefs {
  mode: "auto" | "grid";
  cols: number;
  rows: number;
  alphaThreshold: number;
  mergeThreshold: number;
  showLabels: boolean;
  showOutline: boolean;
  outputFormat: "text" | "json";
  animationPlaying: boolean;
  animationDelayMs: number;
  animationFormat: "gif";
}

const leshySpritePrefsKey = "sprite_forge_leshy_sprite_prefs_v1";

const defaultLeshySpritePrefs: LeshySpritePrefs = {
  mode: "auto",
  cols: 4,
  rows: 4,
  alphaThreshold: 0.04,
  mergeThreshold: 1,
  showLabels: true,
  showOutline: true,
  outputFormat: "text",
  animationPlaying: true,
  animationDelayMs: 120,
  animationFormat: "gif"
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function fileNameOnly(filePath: string): string {
  const parts = filePath.split(/[\\/]/);
  return parts[parts.length - 1] || filePath;
}

function baseNameOnly(filePath: string): string {
  return fileNameOnly(filePath).replace(/\.[^.]+$/, "");
}

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, value));
}

function loadLeshySpritePrefs(): LeshySpritePrefs {
  if (typeof window === "undefined") {
    return { ...defaultLeshySpritePrefs };
  }

  try {
    const raw = window.localStorage.getItem(leshySpritePrefsKey);
    if (!raw) {
      return { ...defaultLeshySpritePrefs };
    }
    const parsed = JSON.parse(raw) as Partial<LeshySpritePrefs>;
    return {
      mode: parsed.mode === "grid" ? "grid" : "auto",
      cols: Math.round(clampNumber(parsed.cols, defaultLeshySpritePrefs.cols, 1, 128)),
      rows: Math.round(clampNumber(parsed.rows, defaultLeshySpritePrefs.rows, 1, 128)),
      alphaThreshold: clampNumber(parsed.alphaThreshold, defaultLeshySpritePrefs.alphaThreshold, 0, 1),
      mergeThreshold: Math.round(clampNumber(parsed.mergeThreshold, defaultLeshySpritePrefs.mergeThreshold, 0, 4096)),
      showLabels: typeof parsed.showLabels === "boolean" ? parsed.showLabels : defaultLeshySpritePrefs.showLabels,
      showOutline: typeof parsed.showOutline === "boolean" ? parsed.showOutline : defaultLeshySpritePrefs.showOutline,
      outputFormat: parsed.outputFormat === "json" ? "json" : "text",
      animationPlaying: typeof parsed.animationPlaying === "boolean" ? parsed.animationPlaying : defaultLeshySpritePrefs.animationPlaying,
      animationDelayMs: Math.round(clampNumber(parsed.animationDelayMs, defaultLeshySpritePrefs.animationDelayMs, 20, 5000)),
      animationFormat: "gif"
    };
  } catch {
    return { ...defaultLeshySpritePrefs };
  }
}

export function LeshySpritePanel(): JSX.Element {
  const { t } = useI18n();
  const initialPrefs = useMemo(() => loadLeshySpritePrefs(), []);
  const [inputPath, setInputPath] = useState("");
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);
  const [imageSize, setImageSize] = useState({ width: 1, height: 1 });
  const [viewportSize, setViewportSize] = useState({ width: 1, height: 1 });
  const [mode, setMode] = useState<"auto" | "grid">(initialPrefs.mode);
  const [cols, setCols] = useState(initialPrefs.cols);
  const [rows, setRows] = useState(initialPrefs.rows);
  const [alphaThreshold, setAlphaThreshold] = useState(initialPrefs.alphaThreshold);
  const [mergeThreshold, setMergeThreshold] = useState(initialPrefs.mergeThreshold);
  const [sprites, setSprites] = useState<SpriteMapEntry[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [showLabels, setShowLabels] = useState(initialPrefs.showLabels);
  const [showOutline, setShowOutline] = useState(initialPrefs.showOutline);
  const [zoom, setZoom] = useState(1);
  const [userZoomed, setUserZoomed] = useState(false);
  const [outputFormat, setOutputFormat] = useState<"text" | "json">(initialPrefs.outputFormat);
  const [animationPlaying, setAnimationPlaying] = useState(initialPrefs.animationPlaying);
  const [animationIndex, setAnimationIndex] = useState(0);
  const [animationDelayMs, setAnimationDelayMs] = useState(initialPrefs.animationDelayMs);
  const [animationFormat, setAnimationFormat] = useState<"gif">(initialPrefs.animationFormat);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; index: number } | null>(null);
  const previewScrollerRef = useRef<HTMLDivElement | null>(null);
  const previewPanRef = useRef<{ pointerId: number; startX: number; startY: number; scrollLeft: number; scrollTop: number } | null>(null);
  const animationCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const spriteSheetImageRef = useRef<HTMLImageElement | null>(null);
  const [previewMiddlePanning, setPreviewMiddlePanning] = useState(false);

  useEffect(() => {
    try {
      window.localStorage.setItem(leshySpritePrefsKey, JSON.stringify({
        mode,
        cols,
        rows,
        alphaThreshold,
        mergeThreshold,
        showLabels,
        showOutline,
        outputFormat,
        animationPlaying,
        animationDelayMs,
        animationFormat
      } satisfies LeshySpritePrefs));
    } catch {
      // Ignore storage write failures.
    }
  }, [
    alphaThreshold,
    animationDelayMs,
    animationFormat,
    animationPlaying,
    cols,
    mergeThreshold,
    mode,
    outputFormat,
    rows,
    showLabels,
    showOutline
  ]);

  useEffect(() => {
    if (!inputPath) {
      setPreviewDataUrl(null);
      setSprites([]);
      setMessage("");
      return;
    }

    let cancelled = false;
    void window.spriteForge.readImageDataUrl(inputPath)
      .then((dataUrl) => {
        if (!cancelled) {
          setPreviewDataUrl(dataUrl);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setPreviewDataUrl(null);
          setMessage(error instanceof Error ? error.message : String(error));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [inputPath]);

  useEffect(() => {
    if (!previewDataUrl) {
      setImageSize({ width: 1, height: 1 });
      spriteSheetImageRef.current = null;
      return;
    }

    let cancelled = false;
    const image = new Image();
    image.onload = () => {
      if (!cancelled) {
        spriteSheetImageRef.current = image;
        setImageSize({
          width: Math.max(1, image.naturalWidth || image.width),
          height: Math.max(1, image.naturalHeight || image.height)
        });
        setUserZoomed(false);
      }
    };
    image.src = previewDataUrl;
    return () => {
      cancelled = true;
    };
  }, [previewDataUrl]);

  useEffect(() => {
    const scroller = previewScrollerRef.current;
    if (!scroller) {
      return;
    }

    const updateSize = () => {
      setViewportSize({
        width: Math.max(1, scroller.clientWidth),
        height: Math.max(1, scroller.clientHeight)
      });
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(scroller);
    return () => observer.disconnect();
  }, []);

  const fitZoom = useMemo(() => clamp(
    Math.min(viewportSize.width / imageSize.width, viewportSize.height / imageSize.height),
    0.1,
    8
  ), [imageSize.height, imageSize.width, viewportSize.height, viewportSize.width]);

  useEffect(() => {
    if (!contextMenu) {
      return;
    }

    const close = () => setContextMenu(null);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        close();
      }
    };

    window.addEventListener("pointerdown", close);
    window.addEventListener("scroll", close, true);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [contextMenu]);

  useEffect(() => {
    if (!userZoomed) {
      setZoom(Number(fitZoom.toFixed(3)));
    }
  }, [fitZoom, userZoomed]);

  const selectedSprite = selectedIndex === null ? null : (sprites[selectedIndex] ?? null);
  const animationSprites = useMemo(
    () => sprites.filter((entry) => !entry.ignore),
    [sprites]
  );
  const previewGridCells = useMemo(() => {
    if (mode !== "grid" || cols < 1 || rows < 1) {
      return [];
    }

    const cellW = imageSize.width / cols;
    const cellH = imageSize.height / rows;
    const cells: Array<{ index: number; x: number; y: number; w: number; h: number }> = [];
    let index = 0;

    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        cells.push({
          index,
          x: col * cellW,
          y: row * cellH,
          w: cellW,
          h: cellH
        });
        index += 1;
      }
    }

    return cells;
  }, [cols, imageSize.height, imageSize.width, mode, rows]);
  const animationSprite = selectedSprite ?? animationSprites[animationIndex] ?? null;
  const animationCanvasSize = useMemo(() => {
    if (selectedSprite) {
      return {
        width: Math.max(1, selectedSprite.w),
        height: Math.max(1, selectedSprite.h)
      };
    }
    if (!animationSprites.length) {
      return { width: 1, height: 1 };
    }
    return {
      width: Math.max(1, ...animationSprites.map((entry) => entry.w)),
      height: Math.max(1, ...animationSprites.map((entry) => entry.h))
    };
  }, [animationSprites, selectedSprite]);

  useEffect(() => {
    if (!animationSprites.length) {
      setAnimationIndex(0);
      return;
    }
    setAnimationIndex((current) => Math.min(current, animationSprites.length - 1));
  }, [animationSprites.length]);

  useEffect(() => {
    if (selectedSprite || !animationPlaying || animationSprites.length <= 1) {
      return;
    }
    const timer = window.setTimeout(() => {
      setAnimationIndex((current) => (current + 1) % animationSprites.length);
    }, Math.max(20, animationDelayMs));
    return () => window.clearTimeout(timer);
  }, [animationDelayMs, animationIndex, animationPlaying, animationSprites.length, selectedSprite]);

  useEffect(() => {
    const canvas = animationCanvasRef.current;
    const image = spriteSheetImageRef.current;
    if (!canvas) {
      return;
    }

    canvas.width = animationCanvasSize.width;
    canvas.height = animationCanvasSize.height;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = false;

    if (!image || !animationSprite) {
      return;
    }

    const offsetX = Math.floor((animationCanvasSize.width - animationSprite.w) / 2);
    const offsetY = Math.floor((animationCanvasSize.height - animationSprite.h) / 2);
    ctx.drawImage(
      image,
      animationSprite.x,
      animationSprite.y,
      animationSprite.w,
      animationSprite.h,
      offsetX,
      offsetY,
      animationSprite.w,
      animationSprite.h
    );
  }, [animationCanvasSize.height, animationCanvasSize.width, animationSprite]);

  const pickInput = async () => {
    const selected = await window.spriteForge.pickSpriteSheetImagePath();
    if (!selected) {
      return;
    }
    setInputPath(selected);
    setSprites([]);
    setSelectedIndex(null);
    setAnimationIndex(0);
    setMessage("");
  };

  const runExtract = async () => {
    if (!inputPath) {
      setMessage(t("leshy_sprite_none"));
      return;
    }

    setBusy(true);
    setMessage("");
    try {
      const result = await window.spriteForge.extractSpriteMap({
        inputPath,
        mode,
        cols,
        rows,
        alphaThreshold,
        mergeThreshold
      }) as ExtractSpriteMapResult;
      setSprites(result.sprites);
      setSelectedIndex(null);
      setAnimationIndex(0);
      const activeCount = result.sprites.filter((entry) => !entry.ignore).length;
      setMessage(`${t("leshy_sprite_sprite_count")}: ${activeCount}`);
    } catch (error) {
      setMessage(`${t("leshy_sprite_extract_failed")} ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(false);
    }
  };

  const updateSprite = (index: number, patch: Partial<SpriteMapEntry>) => {
    setSprites((current) => current.map((entry, entryIndex) => (
      entryIndex === index ? { ...entry, ...patch } : entry
    )));
  };

  const toggleSelection = (index: number) => {
    setSelectedIndex((current) => (current === index ? null : index));
  };

  const toggleIgnore = (index: number) => {
    setSprites((current) => current.map((entry, entryIndex) => (
      entryIndex === index ? { ...entry, ignore: !entry.ignore } : entry
    )));
  };

  const openContextMenu = (event: React.MouseEvent, index: number) => {
    event.preventDefault();
    event.stopPropagation();
    setSelectedIndex(index);
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      index
    });
  };

  const outputText = useMemo(() => {
    const activeSprites = sprites.filter((entry) => !entry.ignore);
    if (outputFormat === "json") {
      return JSON.stringify(activeSprites.map((entry) => ({
        name: entry.name,
        x: entry.x,
        y: entry.y,
        width: entry.w,
        height: entry.h
      })), null, 2);
    }
    return activeSprites.map((entry) => `${entry.name},${entry.x},${entry.y},${entry.w},${entry.h}`).join("\n");
  }, [outputFormat, sprites]);

  const saveOutput = async () => {
    if (!sprites.length) {
      setMessage(t("leshy_sprite_none"));
      return;
    }

    const extension = outputFormat === "json" ? "json" : "txt";
    const savePath = await window.spriteForge.pickSpriteMapSavePath(`${baseNameOnly(inputPath) || "sprites"}.${extension}`);
    if (!savePath) {
      return;
    }

    await window.spriteForge.writeTextFile({ filePath: savePath, content: outputText });
    setMessage(t("leshy_sprite_save_done"));
  };

  const stepAnimation = (direction: -1 | 1) => {
    if (!animationSprites.length || selectedSprite) {
      return;
    }
    setAnimationPlaying(false);
    setAnimationIndex((current) => {
      const next = current + direction;
      if (next < 0) {
        return animationSprites.length - 1;
      }
      if (next >= animationSprites.length) {
        return 0;
      }
      return next;
    });
  };

  const exportAnimation = async () => {
    if (!inputPath || !animationSprites.length) {
      setMessage(t("leshy_sprite_animation_empty"));
      return;
    }

    const defaultName = `${baseNameOnly(inputPath) || "sprites"}_anim.${animationFormat}`;
    const outputPath = await window.spriteForge.pickLeshyAnimationSavePath(defaultName);
    if (!outputPath) {
      return;
    }

    setBusy(true);
    setMessage("");
    try {
      const result = await window.spriteForge.exportLeshyAnimation({
        inputPath,
        sprites: animationSprites,
        delayMs: animationDelayMs,
        format: animationFormat,
        outputPath
      }) as { outputPath: string; frameCount: number };
      setMessage(`${t("leshy_sprite_animation_saved")}: ${result.frameCount}`);
    } catch (error) {
      setMessage(`${t("leshy_sprite_animation_export_failed")} ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(false);
    }
  };

  const handlePreviewWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    const scroller = previewScrollerRef.current;
    if (!scroller || !previewDataUrl) {
      return;
    }

    event.preventDefault();

    const rect = scroller.getBoundingClientRect();
    const localX = event.clientX - rect.left;
    const localY = event.clientY - rect.top;
    const currentContentWidth = imageSize.width * zoom;
    const currentContentHeight = imageSize.height * zoom;
    const anchorX = clamp((scroller.scrollLeft + localX) / Math.max(1, currentContentWidth), 0, 1);
    const anchorY = clamp((scroller.scrollTop + localY) / Math.max(1, currentContentHeight), 0, 1);
    const nextZoom = clamp(Number((zoom * (event.deltaY > 0 ? 0.9 : 1.1)).toFixed(3)), 0.1, 8);

    setUserZoomed(true);
    setZoom(nextZoom);

    window.requestAnimationFrame(() => {
      const activeScroller = previewScrollerRef.current;
      if (!activeScroller) {
        return;
      }
      const nextContentWidth = imageSize.width * nextZoom;
      const nextContentHeight = imageSize.height * nextZoom;
      activeScroller.scrollLeft = anchorX * nextContentWidth - localX;
      activeScroller.scrollTop = anchorY * nextContentHeight - localY;
    });
  };

  const handlePreviewPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 1) {
      return;
    }
    const scroller = previewScrollerRef.current;
    if (!scroller) {
      return;
    }
    event.preventDefault();
    previewPanRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      scrollLeft: scroller.scrollLeft,
      scrollTop: scroller.scrollTop
    };
    setPreviewMiddlePanning(true);
    scroller.setPointerCapture(event.pointerId);
  };

  const handlePreviewPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const scroller = previewScrollerRef.current;
    const panState = previewPanRef.current;
    if (!scroller || !panState || panState.pointerId !== event.pointerId) {
      return;
    }
    event.preventDefault();
    scroller.scrollLeft = panState.scrollLeft - (event.clientX - panState.startX);
    scroller.scrollTop = panState.scrollTop - (event.clientY - panState.startY);
  };

  const endPreviewPointerPan = (event: React.PointerEvent<HTMLDivElement>) => {
    const scroller = previewScrollerRef.current;
    const panState = previewPanRef.current;
    if (!panState || panState.pointerId !== event.pointerId) {
      return;
    }
    if (scroller?.hasPointerCapture(event.pointerId)) {
      scroller.releasePointerCapture(event.pointerId);
    }
    previewPanRef.current = null;
    setPreviewMiddlePanning(false);
  };

  return (
    <section className="panel leshy-sprite-page">
      <div className="leshy-sprite-header">
        <div>
          <h2>{t("leshy_sprite_title")}</h2>
          <p className="muted">{t("leshy_sprite_desc")}</p>
        </div>
        <div className="row-buttons">
          <button onClick={() => void pickInput()}>{t("leshy_sprite_pick_input")}</button>
          <button className="accent" onClick={() => void runExtract()} disabled={busy || !inputPath}>{t("leshy_sprite_run")}</button>
          <button onClick={() => void saveOutput()} disabled={!sprites.length}>{t("leshy_sprite_save")}</button>
        </div>
      </div>

      <div className="leshy-sprite-shell">
        <aside className="leshy-sprite-sidebar">
          <label>
            {t("leshy_sprite_input")}
            <input value={inputPath} onChange={(event) => setInputPath(event.target.value)} placeholder="C:\\sheet.png" />
          </label>

          <label>
            {t("leshy_sprite_mode")}
            <select value={mode} onChange={(event) => setMode(event.target.value as "auto" | "grid")}>
              <option value="auto">{t("leshy_sprite_mode_auto")}</option>
              <option value="grid">{t("leshy_sprite_mode_grid")}</option>
            </select>
          </label>

          {mode === "grid" ? (
            <div className="leshy-sprite-field-grid">
              <label>
                {t("leshy_sprite_cols")}
                <input type="number" min={1} value={cols} onChange={(event) => setCols(Math.max(1, Number(event.target.value) || 1))} />
              </label>
              <label>
                {t("leshy_sprite_rows")}
                <input type="number" min={1} value={rows} onChange={(event) => setRows(Math.max(1, Number(event.target.value) || 1))} />
              </label>
            </div>
          ) : (
            <div className="leshy-sprite-field-grid">
              <label>
                {t("leshy_sprite_alpha_threshold")}
                <input
                  type="number"
                  min={0}
                  max={1}
                  step={0.01}
                  value={alphaThreshold}
                  onChange={(event) => setAlphaThreshold(clamp(Number(event.target.value) || 0, 0, 1))}
                />
              </label>
              <label>
                {t("leshy_sprite_merge_threshold")}
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={mergeThreshold}
                  onChange={(event) => setMergeThreshold(Math.max(0, Number(event.target.value) || 0))}
                />
              </label>
            </div>
          )}

          <div className="leshy-sprite-toggles">
            <label className="inline-check">
              <input type="checkbox" checked={showOutline} onChange={(event) => setShowOutline(event.target.checked)} />
              {t("leshy_sprite_show_outline")}
            </label>
            <label className="inline-check">
              <input type="checkbox" checked={showLabels} onChange={(event) => setShowLabels(event.target.checked)} />
              {t("leshy_sprite_show_labels")}
            </label>
          </div>

          <div className="leshy-sprite-map-list">
            <div className="leshy-sprite-section-title">
              <strong>{t("leshy_sprite_map")}</strong>
              <span className="muted">{sprites.filter((entry) => !entry.ignore).length}/{sprites.length}</span>
            </div>
            <div className="leshy-sprite-map-scroll">
              {sprites.map((sprite, index) => (
                <div
                  key={`${sprite.name}:${index}`}
                  className={`leshy-sprite-map-item ${index === selectedIndex ? "active" : ""} ${sprite.ignore ? "ignored" : ""}`}
                  onContextMenu={(event) => openContextMenu(event, index)}
                >
                  <button
                    type="button"
                    className="leshy-sprite-map-item-main"
                    onClick={() => toggleSelection(index)}
                  >
                    <span>{sprite.name}</span>
                    <span className="muted">{sprite.x},{sprite.y},{sprite.w},{sprite.h}</span>
                  </button>
                  <label className="leshy-sprite-map-toggle">
                    <input
                      type="checkbox"
                      checked={!sprite.ignore}
                      onChange={() => toggleIgnore(index)}
                    />
                    <span>{sprite.ignore ? t("leshy_sprite_excluded") : t("leshy_sprite_included")}</span>
                  </label>
                </div>
              ))}
            </div>
          </div>
        </aside>

        <div className="leshy-sprite-main">
          <div className="leshy-sprite-preview-card">
            <div className="leshy-sprite-preview-header">
              <strong>{t("leshy_sprite_preview")}</strong>
              <div className="row-buttons">
                <span className="muted">{t("leshy_sprite_zoom")} {Math.round(zoom * 100)}%</span>
                <button onClick={() => { setUserZoomed(false); setZoom(Number(fitZoom.toFixed(3))); }}>{t("leshy_sprite_fit")}</button>
              </div>
            </div>
            <div
              ref={previewScrollerRef}
              className={`leshy-sprite-preview-scroller ${previewMiddlePanning ? "middle-panning" : ""}`}
              onWheel={handlePreviewWheel}
              onPointerDown={handlePreviewPointerDown}
              onPointerMove={handlePreviewPointerMove}
              onPointerUp={endPreviewPointerPan}
              onPointerCancel={endPreviewPointerPan}
            >
              {previewDataUrl ? (
                <div
                  className="leshy-sprite-preview-stage"
                  style={{
                    width: `${Math.max(imageSize.width * zoom, viewportSize.width)}px`,
                    height: `${Math.max(imageSize.height * zoom, viewportSize.height)}px`
                  }}
                >
                  <div
                    className="leshy-sprite-preview-canvas"
                    style={{
                      width: `${imageSize.width * zoom}px`,
                      height: `${imageSize.height * zoom}px`
                    }}
                  >
                    <img src={previewDataUrl} alt={fileNameOnly(inputPath)} />
                    {mode === "grid" ? previewGridCells.map((cell) => (
                      <button
                        key={`grid:${cell.index}`}
                        type="button"
                        className={`leshy-sprite-grid-overlay ${cell.index === selectedIndex ? "active" : ""}`}
                        style={{
                          left: `${cell.x * zoom}px`,
                          top: `${cell.y * zoom}px`,
                          width: `${cell.w * zoom}px`,
                          height: `${cell.h * zoom}px`
                        }}
                        onClick={() => toggleSelection(cell.index)}
                      >
                        <span>{cell.index + 1}</span>
                      </button>
                    )) : null}
                    {sprites.map((sprite, index) => (
                      <button
                        key={`${sprite.name}:${index}`}
                        type="button"
                        className={`leshy-sprite-overlay ${index === selectedIndex ? "active" : ""} ${sprite.ignore ? "ignored" : ""}`}
                        style={{
                          left: `${sprite.x * zoom}px`,
                          top: `${sprite.y * zoom}px`,
                          width: `${sprite.w * zoom}px`,
                          height: `${sprite.h * zoom}px`,
                          borderWidth: showOutline ? "1px" : "0"
                        }}
                        onClick={() => toggleSelection(index)}
                        onContextMenu={(event) => openContextMenu(event, index)}
                      >
                        {showLabels ? <span>{sprite.name}</span> : null}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="leshy-sprite-empty muted">{t("leshy_sprite_none")}</div>
              )}
            </div>
          </div>

          <div className="leshy-sprite-animation-card">
            <div className="leshy-sprite-preview-header">
              <strong>{t("leshy_sprite_animation_preview")}</strong>
              <div className="row-buttons leshy-sprite-animation-controls">
                <button onClick={() => stepAnimation(-1)} disabled={!animationSprites.length}>{t("prev")}</button>
                <button onClick={() => setAnimationPlaying((current) => !current)} disabled={animationSprites.length <= 1 || selectedSprite !== null}>
                  {animationPlaying ? t("pause") : t("play")}
                </button>
                <button onClick={() => stepAnimation(1)} disabled={!animationSprites.length || selectedSprite !== null}>{t("next")}</button>
              </div>
            </div>
            <div className="leshy-sprite-animation-stage-wrap">
              {animationSprite ? (
                <div className="leshy-sprite-animation-stage">
                  <canvas ref={animationCanvasRef} className="leshy-sprite-animation-canvas" />
                </div>
              ) : (
                <div className="leshy-sprite-empty muted">{t("leshy_sprite_animation_empty")}</div>
              )}
            </div>
            <div className="leshy-sprite-animation-footer">
              <div className="leshy-sprite-speed-group">
                <span className="muted">{t("leshy_sprite_animation_speed")}</span>
                <div className="row-buttons leshy-sprite-speed-controls">
                  <button onClick={() => setAnimationDelayMs((current) => Math.min(1000, current + 20))}>+</button>
                  <input
                    type="number"
                    min={20}
                    max={1000}
                    step={10}
                    value={animationDelayMs}
                    onChange={(event) => setAnimationDelayMs(Math.max(20, Math.min(1000, Number(event.target.value) || 120)))}
                  />
                  <button onClick={() => setAnimationDelayMs((current) => Math.max(20, current - 20))}>-</button>
                </div>
              </div>

              <div className="row-buttons leshy-sprite-animation-export">
                <label className="leshy-sprite-format">
                  {t("leshy_sprite_animation_format")}
                  <select value={animationFormat} onChange={(event) => setAnimationFormat(event.target.value as "gif")}>
                    <option value="gif">{t("leshy_sprite_animation_format_gif")}</option>
                  </select>
                </label>
                <button className="accent" onClick={() => void exportAnimation()} disabled={busy || !animationSprites.length}>
                  {t("leshy_sprite_animation_export")}
                </button>
              </div>
            </div>
          </div>
        </div>

        <aside className="leshy-sprite-inspector">
          <div className="leshy-sprite-settings">
            <div className="leshy-sprite-section-title">
              <strong>{t("leshy_sprite_settings")}</strong>
              {selectedSprite && selectedIndex !== null ? <span className="muted">{selectedIndex + 1}</span> : null}
            </div>
            {selectedSprite ? (
              <>
                <label>
                  {t("leshy_sprite_name")}
                  <input value={selectedSprite.name} onChange={(event) => {
                    if (selectedIndex !== null) {
                      updateSprite(selectedIndex, { name: event.target.value });
                    }
                  }} />
                </label>
                <div className="leshy-sprite-field-grid">
                  <label>
                    {t("leshy_sprite_topx")}
                    <input type="number" value={selectedSprite.x} onChange={(event) => {
                      if (selectedIndex !== null) {
                        updateSprite(selectedIndex, { x: Number(event.target.value) || 0 });
                      }
                    }} />
                  </label>
                  <label>
                    {t("leshy_sprite_topy")}
                    <input type="number" value={selectedSprite.y} onChange={(event) => {
                      if (selectedIndex !== null) {
                        updateSprite(selectedIndex, { y: Number(event.target.value) || 0 });
                      }
                    }} />
                  </label>
                  <label>
                    {t("leshy_sprite_width")}
                    <input type="number" min={1} value={selectedSprite.w} onChange={(event) => {
                      if (selectedIndex !== null) {
                        updateSprite(selectedIndex, { w: Math.max(1, Number(event.target.value) || 1) });
                      }
                    }} />
                  </label>
                  <label>
                    {t("leshy_sprite_height")}
                    <input type="number" min={1} value={selectedSprite.h} onChange={(event) => {
                      if (selectedIndex !== null) {
                        updateSprite(selectedIndex, { h: Math.max(1, Number(event.target.value) || 1) });
                      }
                    }} />
                  </label>
                </div>
                <label className="inline-check">
                  <input type="checkbox" checked={selectedSprite.ignore} onChange={(event) => {
                    if (selectedIndex !== null) {
                      updateSprite(selectedIndex, { ignore: event.target.checked });
                    }
                  }} />
                  {t("leshy_sprite_ignore")}
                </label>
              </>
            ) : (
              <div className="muted leshy-sprite-settings-empty">{t("leshy_sprite_none")}</div>
            )}
          </div>

          <div className="leshy-sprite-output-card">
            <div className="leshy-sprite-preview-header">
              <strong>{t("leshy_sprite_output")}</strong>
              <label className="leshy-sprite-format">
                {t("leshy_sprite_format")}
                <select value={outputFormat} onChange={(event) => setOutputFormat(event.target.value as "text" | "json")}>
                  <option value="text">{t("leshy_sprite_format_text")}</option>
                  <option value="json">{t("leshy_sprite_format_json")}</option>
                </select>
              </label>
            </div>
            <textarea className="leshy-sprite-output-text" value={outputText} readOnly spellCheck={false} />
          </div>
        </aside>
      </div>

      {contextMenu ? (
        <div
          className="leshy-sprite-context-menu"
          style={{
            left: `${contextMenu.x}px`,
            top: `${contextMenu.y}px`
          }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => {
              toggleIgnore(contextMenu.index);
              setContextMenu(null);
            }}
          >
            {sprites[contextMenu.index]?.ignore ? t("leshy_sprite_include_action") : t("leshy_sprite_exclude_action")}
          </button>
        </div>
      ) : null}

      {message ? <div className="muted leshy-sprite-message">{message}</div> : null}
    </section>
  );
}
