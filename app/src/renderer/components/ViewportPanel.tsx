import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Clip, Frame } from "@sprite-forge/core";
import { useEditorStore } from "../state/editorStore";
import { useCurrentClip } from "../utils/selectors";
import { useFrameDataUrl } from "../hooks/useFrameDataUrl";
import { useI18n } from "../i18n";

type ToolMode = "offset" | "pivot" | "crop" | "select";

interface LoadedImage {
  image: HTMLImageElement;
  width: number;
  height: number;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

async function loadImage(dataUrl: string | null): Promise<LoadedImage | null> {
  if (!dataUrl) {
    return null;
  }
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ image: img, width: img.width, height: img.height });
    img.onerror = () => reject(new Error("이미지를 불러오지 못했습니다."));
    img.src = dataUrl;
  });
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function normalizeRect(rect: Rect): Rect {
  const x = rect.w < 0 ? rect.x + rect.w : rect.x;
  const y = rect.h < 0 ? rect.y + rect.h : rect.y;
  const w = Math.abs(rect.w);
  const h = Math.abs(rect.h);
  return { x, y, w, h };
}

function scrollInspectorTo(id: string): void {
  const target = document.getElementById(id);
  if (target) {
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

export function ViewportPanel(): JSX.Element {
  const { t } = useI18n();
  const clip = useCurrentClip();
  const activeFrameIndex = useEditorStore((s) => s.activeFrameIndex);
  const viewport = useEditorStore((s) => s.viewport);
  const setViewport = useEditorStore((s) => s.setViewport);
  const fitViewToken = useEditorStore((s) => s.fitViewToken);
  const shiftSelectedOffsets = useEditorStore((s) => s.shiftSelectedOffsets);
  const updateClip = useEditorStore((s) => s.updateClip);
  const autoCenterMass = useEditorStore((s) => s.autoCenterMass);
  const smartBottomAlign = useEditorStore((s) => s.smartBottomAlign);
  const selectedFrameIds = useEditorStore((s) => s.selectedFrameIds);
  const setActiveHelpTopic = useEditorStore((s) => s.setActiveHelpTopic);

  const frame = clip?.frames[activeFrameIndex] ?? null;
  const prevFrame = clip && clip.frames.length ? clip.frames[(activeFrameIndex - 1 + clip.frames.length) % clip.frames.length] : null;
  const nextFrame = clip && clip.frames.length ? clip.frames[(activeFrameIndex + 1) % clip.frames.length] : null;

  const currentDataUrl = useFrameDataUrl(frame?.srcPath);
  const prevDataUrl = useFrameDataUrl(prevFrame?.srcPath);
  const nextDataUrl = useFrameDataUrl(nextFrame?.srcPath);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [tool, setTool] = useState<ToolMode>("offset");
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [offsetPreview, setOffsetPreview] = useState({ x: 0, y: 0 });
  const [cropDraft, setCropDraft] = useState<Rect | null>(null);
  const [selectRect, setSelectRect] = useState<Rect | null>(null);

  const [loadedCurrent, setLoadedCurrent] = useState<LoadedImage | null>(null);
  const [loadedPrev, setLoadedPrev] = useState<LoadedImage | null>(null);
  const [loadedNext, setLoadedNext] = useState<LoadedImage | null>(null);
  const handledFitTokenRef = useRef(0);

  const fitToViewport = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const rect = canvas.getBoundingClientRect();
    if (!loadedCurrent || loadedCurrent.width <= 0 || loadedCurrent.height <= 0) {
      setViewport({ panX: 0, panY: 0 });
      return;
    }

    const margin = 24;
    const fitX = (rect.width - margin * 2) / loadedCurrent.width;
    const fitY = (rect.height - margin * 2) / loadedCurrent.height;
    const nextZoom = Math.max(0.2, Math.min(30, Math.min(fitX, fitY)));
    setViewport({
      zoom: Number(nextZoom.toFixed(3)),
      panX: 0,
      panY: 0
    });
  }, [loadedCurrent, setViewport]);

  useEffect(() => {
    void loadImage(currentDataUrl).then(setLoadedCurrent).catch(() => setLoadedCurrent(null));
  }, [currentDataUrl]);

  useEffect(() => {
    void loadImage(prevDataUrl).then(setLoadedPrev).catch(() => setLoadedPrev(null));
  }, [prevDataUrl]);

  useEffect(() => {
    void loadImage(nextDataUrl).then(setLoadedNext).catch(() => setLoadedNext(null));
  }, [nextDataUrl]);

  useEffect(() => {
    if (fitViewToken === handledFitTokenRef.current) {
      return;
    }
    fitToViewport();
    handledFitTokenRef.current = fitViewToken;
  }, [fitToViewport, fitViewToken]);

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

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.floor(rect.width * dpr));
    const height = Math.max(1, Math.floor(rect.height * dpr));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const bgColor = /^#[0-9a-f]{6}$/i.test(viewport.backgroundColor) ? viewport.backgroundColor : "#151515";
    const imageAreaColor = /^#[0-9a-f]{6}$/i.test(viewport.imageAreaColor) ? viewport.imageAreaColor : "#242424";
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const centerX = canvas.width / 2 + viewport.panX * dpr;
    const centerY = canvas.height / 2 + viewport.panY * dpr;
    const scale = viewport.zoom * dpr;

    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.scale(scale, scale);

    const gridStep = 16;
    const ext = 2000;
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 1 / scale;
    for (let x = -ext; x <= ext; x += gridStep) {
      ctx.beginPath();
      ctx.moveTo(x, -ext);
      ctx.lineTo(x, ext);
      ctx.stroke();
    }
    for (let y = -ext; y <= ext; y += gridStep) {
      ctx.beginPath();
      ctx.moveTo(-ext, y);
      ctx.lineTo(ext, y);
      ctx.stroke();
    }

    const drawFrame = (img: LoadedImage | null, fr: Frame | null, alpha: number, preview = { x: 0, y: 0 }) => {
      if (!img || !fr) {
        return;
      }
      const scaleX = Math.max(0.05, fr.scale?.x ?? 1);
      const scaleY = Math.max(0.05, fr.scale?.y ?? 1);
      const baseX = -img.width / 2 + fr.offsetPx.x + preview.x;
      const baseY = -img.height / 2 + fr.offsetPx.y + preview.y;
      const pivotX = img.width * fr.pivotNorm.x;
      const pivotY = img.height * (1 - fr.pivotNorm.y);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(baseX + pivotX, baseY + pivotY);
      ctx.scale(scaleX, scaleY);
      ctx.drawImage(img.image, -pivotX, -pivotY, img.width, img.height);
      ctx.restore();
    };

    if (loadedCurrent && frame) {
      const scaleX = Math.max(0.05, frame.scale?.x ?? 1);
      const scaleY = Math.max(0.05, frame.scale?.y ?? 1);
      const areaX = -loadedCurrent.width / 2 + frame.offsetPx.x + offsetPreview.x;
      const areaY = -loadedCurrent.height / 2 + frame.offsetPx.y + offsetPreview.y;
      const pivotX = loadedCurrent.width * frame.pivotNorm.x;
      const pivotY = loadedCurrent.height * (1 - frame.pivotNorm.y);
      const drawX = areaX + pivotX - pivotX * scaleX;
      const drawY = areaY + pivotY - pivotY * scaleY;
      const drawW = loadedCurrent.width * scaleX;
      const drawH = loadedCurrent.height * scaleY;
      ctx.fillStyle = imageAreaColor;
      ctx.fillRect(drawX, drawY, drawW, drawH);
      ctx.strokeStyle = "rgba(255,255,255,0.28)";
      ctx.lineWidth = 1 / scale;
      ctx.strokeRect(drawX, drawY, drawW, drawH);
    }

    drawFrame(loadedPrev, prevFrame, viewport.onionPrev);
    drawFrame(loadedNext, nextFrame, viewport.onionNext);
    drawFrame(loadedCurrent, frame, 1, offsetPreview);

    if (viewport.pivotMode && loadedCurrent && frame) {
      const drawX = -loadedCurrent.width / 2 + frame.offsetPx.x + offsetPreview.x;
      const drawY = -loadedCurrent.height / 2 + frame.offsetPx.y + offsetPreview.y;
      const px = drawX + loadedCurrent.width * frame.pivotNorm.x;
      const py = drawY + loadedCurrent.height * (1 - frame.pivotNorm.y);

      ctx.strokeStyle = "#2EA3FF";
      ctx.lineWidth = 2 / scale;
      ctx.beginPath();
      ctx.moveTo(px - 6, py);
      ctx.lineTo(px + 6, py);
      ctx.moveTo(px, py - 6);
      ctx.lineTo(px, py + 6);
      ctx.stroke();
    }

    const drawRectOverlay = (rect: Rect | null, color: string) => {
      if (!loadedCurrent || !frame || !rect) {
        return;
      }
      const normalized = normalizeRect(rect);
      if (normalized.w < 1 || normalized.h < 1) {
        return;
      }
      const scaleX = Math.max(0.05, frame.scale?.x ?? 1);
      const scaleY = Math.max(0.05, frame.scale?.y ?? 1);
      const drawX = -loadedCurrent.width / 2 + frame.offsetPx.x;
      const drawY = -loadedCurrent.height / 2 + frame.offsetPx.y;
      const pivotX = loadedCurrent.width * frame.pivotNorm.x;
      const pivotY = loadedCurrent.height * (1 - frame.pivotNorm.y);
      const rectX = drawX + (normalized.x - pivotX) * scaleX + pivotX;
      const rectY = drawY + (normalized.y - pivotY) * scaleY + pivotY;
      const rectW = normalized.w * scaleX;
      const rectH = normalized.h * scaleY;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2 / scale;
      ctx.setLineDash([6 / scale, 4 / scale]);
      ctx.strokeRect(rectX, rectY, rectW, rectH);
      ctx.setLineDash([]);
    };

    if (tool === "crop") {
      drawRectOverlay(cropDraft ?? frame?.crop ?? null, "#ffaa3b");
    }
    if (tool === "select") {
      drawRectOverlay(selectRect, "#2EA3FF");
    }

    ctx.restore();
  }, [cropDraft, frame, loadedCurrent, loadedNext, loadedPrev, nextFrame, offsetPreview, prevFrame, selectRect, tool, viewport]);

  useEffect(() => {
    draw();
  }, [draw]);

  const dragRef = useRef<
    | {
        mode: "pan" | "offset" | "crop" | "select";
        startX: number;
        startY: number;
      }
    | null
  >(null);

  const toFramePixel = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas || !frame || !loadedCurrent) {
        return null;
      }
      const rect = canvas.getBoundingClientRect();
      const localX = (event.clientX - rect.left - rect.width / 2 - viewport.panX) / viewport.zoom;
      const localY = (event.clientY - rect.top - rect.height / 2 - viewport.panY) / viewport.zoom;

      const drawX = -loadedCurrent.width / 2 + frame.offsetPx.x;
      const drawY = -loadedCurrent.height / 2 + frame.offsetPx.y;
      const pivotX = loadedCurrent.width * frame.pivotNorm.x;
      const pivotY = loadedCurrent.height * (1 - frame.pivotNorm.y);
      const scaleX = Math.max(0.05, frame.scale?.x ?? 1);
      const scaleY = Math.max(0.05, frame.scale?.y ?? 1);

      const transformedX = localX - (drawX + pivotX);
      const transformedY = localY - (drawY + pivotY);
      const unscaledX = transformedX / scaleX + pivotX;
      const unscaledY = transformedY / scaleY + pivotY;

      const pixelX = Math.max(0, Math.min(loadedCurrent.width - 1, unscaledX));
      const pixelY = Math.max(0, Math.min(loadedCurrent.height - 1, unscaledY));
      return { x: pixelX, y: pixelY };
    },
    [frame, loadedCurrent, viewport.panX, viewport.panY, viewport.zoom]
  );

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas || !clip || !frame || !loadedCurrent) {
        return;
      }

      const isPan = event.button === 1 || (event.button === 0 && spaceHeld);
      if (isPan) {
        dragRef.current = {
          mode: "pan",
          startX: event.clientX,
          startY: event.clientY
        };
        return;
      }

      if (event.button !== 0) {
        return;
      }

      if (tool === "pivot") {
        const point = toFramePixel(event);
        if (!point) {
          return;
        }
        const pixelX = point.x;
        const pixelY = point.y;

        const pivotX = clamp01(pixelX / loadedCurrent.width);
        const pivotY = clamp01(1 - pixelY / loadedCurrent.height);
        const selected = new Set(selectedFrameIds.length ? selectedFrameIds : [frame.id]);

        const updated: Clip = {
          ...clip,
          frames: clip.frames.map((f) =>
            selected.has(f.id)
              ? {
                  ...f,
                  pivotNorm: { x: pivotX, y: pivotY }
                }
              : f
          )
        };

        void updateClip(updated, "피벗 설정", true);
        return;
      }

      if (tool === "offset") {
        dragRef.current = {
          mode: "offset",
          startX: event.clientX,
          startY: event.clientY
        };
        setOffsetPreview({ x: 0, y: 0 });
        return;
      }

      if (tool === "crop") {
        const point = toFramePixel(event);
        if (!point) {
          return;
        }
        dragRef.current = {
          mode: "crop",
          startX: point.x,
          startY: point.y
        };
        setCropDraft({ x: point.x, y: point.y, w: 1, h: 1 });
        return;
      }

      if (tool === "select") {
        const point = toFramePixel(event);
        if (!point) {
          return;
        }
        dragRef.current = {
          mode: "select",
          startX: point.x,
          startY: point.y
        };
        setSelectRect({ x: point.x, y: point.y, w: 1, h: 1 });
      }
    },
    [clip, frame, loadedCurrent, selectedFrameIds, setOffsetPreview, spaceHeld, toFramePixel, tool, updateClip]
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (!dragRef.current) {
        return;
      }

      const dx = event.clientX - dragRef.current.startX;
      const dy = event.clientY - dragRef.current.startY;

      if (dragRef.current.mode === "pan") {
        dragRef.current.startX = event.clientX;
        dragRef.current.startY = event.clientY;
        setViewport({ panX: viewport.panX + dx, panY: viewport.panY + dy });
        return;
      }

      if (dragRef.current.mode === "offset") {
        setOffsetPreview({ x: dx / viewport.zoom, y: dy / viewport.zoom });
        return;
      }

      if (dragRef.current.mode === "crop") {
        const point = toFramePixel(event);
        if (!point) {
          return;
        }
        setCropDraft({
          x: dragRef.current.startX,
          y: dragRef.current.startY,
          w: point.x - dragRef.current.startX,
          h: point.y - dragRef.current.startY
        });
        return;
      }

      if (dragRef.current.mode === "select") {
        const point = toFramePixel(event);
        if (!point) {
          return;
        }
        setSelectRect({
          x: dragRef.current.startX,
          y: dragRef.current.startY,
          w: point.x - dragRef.current.startX,
          h: point.y - dragRef.current.startY
        });
      }
    },
    [setViewport, toFramePixel, viewport.panX, viewport.panY, viewport.zoom]
  );

  const onPointerUp = useCallback(() => {
    if (!dragRef.current) {
      return;
    }

    if (dragRef.current.mode === "offset") {
      const dx = Math.round(offsetPreview.x);
      const dy = Math.round(offsetPreview.y);
      setOffsetPreview({ x: 0, y: 0 });
      if (dx !== 0 || dy !== 0) {
        void shiftSelectedOffsets(dx, dy);
      }
    }

    if (dragRef.current.mode === "crop" && clip && frame && cropDraft) {
      const normalized = normalizeRect(cropDraft);
      setCropDraft(null);
      if (normalized.w >= 2 && normalized.h >= 2) {
        const selected = new Set(selectedFrameIds.length ? selectedFrameIds : [frame.id]);
        const next: Clip = {
          ...clip,
          frames: clip.frames.map((f) =>
            selected.has(f.id)
              ? {
                  ...f,
                  crop: {
                    x: Math.round(normalized.x),
                    y: Math.round(normalized.y),
                    w: Math.round(normalized.w),
                    h: Math.round(normalized.h)
                  }
                }
              : f
          )
        };
        void updateClip(next, "크롭 설정", true);
      }
    }

    dragRef.current = null;
  }, [clip, cropDraft, frame, offsetPreview.x, offsetPreview.y, selectedFrameIds, shiftSelectedOffsets, updateClip]);

  const onWheel = useCallback(
    (event: React.WheelEvent<HTMLCanvasElement>) => {
      event.preventDefault();
      const next = viewport.zoom * (event.deltaY > 0 ? 0.9 : 1.1);
      setViewport({ zoom: Math.max(0.2, Math.min(30, next)) });
    },
    [setViewport, viewport.zoom]
  );

  const toolbarButtons = useMemo(
    () => [
      { id: "offset", label: t("tool_offset") },
      { id: "pivot", label: t("tool_pivot") },
      { id: "crop", label: t("tool_crop") },
      { id: "select", label: t("tool_select") }
    ] as const,
    [t]
  );

  useEffect(() => {
    setViewport({ pivotMode: tool === "pivot" });
  }, [setViewport, tool]);

  useEffect(() => {
    if (tool === "offset") setActiveHelpTopic("viewport_offset");
    if (tool === "pivot") setActiveHelpTopic("viewport_pivot");
    if (tool === "crop") setActiveHelpTopic("viewport_crop");
    if (tool === "select") setActiveHelpTopic("viewport_select");
  }, [setActiveHelpTopic, tool]);

  useEffect(() => {
    setCropDraft(null);
    if (tool !== "select") {
      setSelectRect(null);
    }
  }, [tool]);

  return (
    <section className="panel viewport-panel">
      <div className="floating-toolbar">
        {toolbarButtons.map((btn) => (
          <button
            key={btn.id}
            className={tool === btn.id ? "active" : ""}
            onClick={() => {
              setTool(btn.id);
              if (btn.id === "offset" || btn.id === "pivot") {
                scrollInspectorTo("inspector-selection");
              }
              if (btn.id === "crop") {
                scrollInspectorTo("inspector-trim");
              }
            }}
          >
            {btn.label}
          </button>
        ))}
        <button
          onClick={() => {
            setActiveHelpTopic("viewport_align_center");
            scrollInspectorTo("inspector-selection");
            void autoCenterMass();
          }}
        >
          {t("align_c")}
        </button>
        <button
          onClick={() => {
            setActiveHelpTopic("viewport_align_bottom");
            scrollInspectorTo("inspector-selection");
            void smartBottomAlign();
          }}
        >
          {t("align_b")}
        </button>
      </div>

      <canvas
        ref={canvasRef}
        className="viewport-canvas"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        onWheel={onWheel}
      />

      <div className="viewport-footer">
        <label>
          {t("prev_onion")}
          <input
            type="range"
            min={0}
            max={0.8}
            step={0.05}
            value={viewport.onionPrev}
            onChange={(e) => setViewport({ onionPrev: Number(e.target.value) })}
          />
        </label>
        <label>
          {t("next_onion")}
          <input
            type="range"
            min={0}
            max={0.8}
            step={0.05}
            value={viewport.onionNext}
            onChange={(e) => setViewport({ onionNext: Number(e.target.value) })}
          />
        </label>
        <span className="muted">{t("zoom")} {viewport.zoom.toFixed(2)}x</span>
      </div>
    </section>
  );
}
