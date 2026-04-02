import type { CSSProperties, MouseEvent as ReactMouseEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Clip, Frame } from "@sprite-forge/core";
import { useEditorStore } from "../state/editorStore";
import { useCurrentClip } from "../utils/selectors";
import { useFrameDataUrl } from "../hooks/useFrameDataUrl";
import { useI18n } from "../i18n";

type TimelineThumbSize = "compact" | "comfortable" | "large";
type DropIndicatorPosition = "before" | "after";

const thumbSizeLabel: Record<TimelineThumbSize, string> = {
  compact: "S",
  comfortable: "M",
  large: "L"
};

const thumbSizePx: Record<TimelineThumbSize, number> = {
  compact: 48,
  comfortable: 60,
  large: 76
};

function cloneClip(clip: Clip): Clip {
  return JSON.parse(JSON.stringify(clip)) as Clip;
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const tag = target.tagName.toLowerCase();
  return target.isContentEditable || tag === "input" || tag === "textarea" || tag === "select" || tag === "button";
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function getDropPosition(event: React.DragEvent<HTMLButtonElement>): DropIndicatorPosition {
  const bounds = event.currentTarget.getBoundingClientRect();
  return event.clientX - bounds.left < bounds.width / 2 ? "before" : "after";
}

function getReorderTargetIndex(fromIndex: number, targetIndex: number, position: DropIndicatorPosition, frameCount: number): number {
  let insertionIndex = position === "after" ? targetIndex + 1 : targetIndex;
  if (fromIndex < insertionIndex) {
    insertionIndex -= 1;
  }
  return clamp(insertionIndex, 0, Math.max(0, frameCount - 1));
}

function FrameThumb(props: {
  frame: Frame;
  index: number;
  selected: boolean;
  active: boolean;
  thumbPx: number;
  dragIndicator: DropIndicatorPosition | null;
  onSelect: (event: ReactMouseEvent, frameId: string, index: number) => void;
  onContextMenu: (event: ReactMouseEvent, frameId: string, index: number) => void;
  onDragStart: (index: number) => void;
  onDragEnd: () => void;
  onDragHover: (event: React.DragEvent<HTMLButtonElement>, targetIndex: number) => void;
  onDropIndex: (event: React.DragEvent<HTMLButtonElement>, targetIndex: number) => void;
  itemRef: (node: HTMLButtonElement | null) => void;
}): JSX.Element {
  const dataUrl = useFrameDataUrl(props.frame.srcPath);

  return (
    <button
      ref={props.itemRef}
      type="button"
      className={`timeline-frame ${props.selected ? "selected" : ""} ${props.active ? "active" : ""} ${
        props.dragIndicator ? `drag-${props.dragIndicator}` : ""
      }`}
      draggable
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", String(props.index));
        props.onDragStart(props.index);
      }}
      onDragEnd={props.onDragEnd}
      onDragOver={(event) => {
        event.preventDefault();
        props.onDragHover(event, props.index);
      }}
      onDrop={(event) => {
        event.preventDefault();
        props.onDropIndex(event, props.index);
      }}
      onContextMenu={(event) => props.onContextMenu(event, props.frame.id, props.index)}
      onClick={(event) => props.onSelect(event, props.frame.id, props.index)}
      title={`Frame ${props.index + 1}`}
      style={
        {
          "--timeline-thumb-size": `${props.thumbPx}px`
        } as CSSProperties
      }
    >
      <div className="thumb-shell">{dataUrl ? <img src={dataUrl} alt={`Frame ${props.index + 1}`} /> : null}</div>
      <span>{String(props.index + 1).padStart(3, "0")}</span>
      <span className="muted">{(props.frame.delayMs / 1000).toFixed(2)}s</span>
    </button>
  );
}

export function TimelinePanel(): JSX.Element {
  const { t } = useI18n();
  const clip = useCurrentClip();
  const playing = useEditorStore((s) => s.playing);
  const setPlaying = useEditorStore((s) => s.setPlaying);
  const activeFrameIndex = useEditorStore((s) => s.activeFrameIndex);
  const setActiveFrameIndex = useEditorStore((s) => s.setActiveFrameIndex);
  const setActiveFrameIndexOnly = useEditorStore((s) => s.setActiveFrameIndexOnly);
  const selectedFrameIds = useEditorStore((s) => s.selectedFrameIds);
  const setSelectedFrameIds = useEditorStore((s) => s.setSelectedFrameIds);
  const selectFrame = useEditorStore((s) => s.selectFrame);
  const reorderFrame = useEditorStore((s) => s.reorderFrame);
  const duplicateSelectedFrames = useEditorStore((s) => s.duplicateSelectedFrames);
  const deleteSelectedFrames = useEditorStore((s) => s.deleteSelectedFrames);
  const setLoopMode = useEditorStore((s) => s.setLoopMode);
  const setDelayForSelection = useEditorStore((s) => s.setDelayForSelection);
  const stepFrame = useEditorStore((s) => s.stepFrame);
  const updateClip = useEditorStore((s) => s.updateClip);

  const [delayInput, setDelayInput] = useState("0.10");
  const [selectionDelayInput, setSelectionDelayInput] = useState("0.10");
  const [thumbSize, setThumbSize] = useState<TimelineThumbSize>("comfortable");
  const [dragSourceIndex, setDragSourceIndex] = useState<number | null>(null);
  const [dragTarget, setDragTarget] = useState<{ index: number; position: DropIndicatorPosition } | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; index: number } | null>(null);
  const anchorIndexRef = useRef<number | null>(null);
  const frameRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const allDelaySec = useMemo(() => {
    if (!clip || !clip.frames.length) {
      return 0.1;
    }
    return (clip.frames[0]?.delayMs ?? 100) / 1000;
  }, [clip]);

  const selectionSummary = useMemo(() => {
    if (!clip || !clip.frames.length) {
      return {
        selectedCount: 0,
        selectedDurationMs: 0,
        firstIndex: 0,
        lastIndex: 0
      };
    }
    const indices = clip.frames
      .map((frame, index) => (selectedFrameIds.includes(frame.id) ? index : -1))
      .filter((index) => index >= 0);
    const selectedFrames = clip.frames.filter((frame) => selectedFrameIds.includes(frame.id));
    return {
      selectedCount: selectedFrames.length,
      selectedDurationMs: selectedFrames.reduce((sum, frame) => sum + frame.delayMs, 0),
      firstIndex: indices.length ? Math.min(...indices) + 1 : activeFrameIndex + 1,
      lastIndex: indices.length ? Math.max(...indices) + 1 : activeFrameIndex + 1
    };
  }, [activeFrameIndex, clip, selectedFrameIds]);

  useEffect(() => {
    setDelayInput(allDelaySec.toFixed(2));
  }, [allDelaySec]);

  useEffect(() => {
    if (!clip || !clip.frames.length) {
      setSelectionDelayInput("0.10");
      return;
    }
    const selectedFrames = clip.frames.filter((frame) => selectedFrameIds.includes(frame.id));
    const firstDelay = selectedFrames[0]?.delayMs ?? clip.frames[activeFrameIndex]?.delayMs ?? 100;
    setSelectionDelayInput((firstDelay / 1000).toFixed(2));
  }, [activeFrameIndex, clip, selectedFrameIds]);

  useEffect(() => {
    const activeFrame = clip?.frames[activeFrameIndex];
    if (!activeFrame) {
      return;
    }
    frameRefs.current[activeFrame.id]?.scrollIntoView({
      block: "nearest",
      inline: "center",
      behavior: "smooth"
    });
  }, [activeFrameIndex, clip]);

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
    const onKeyDown = (event: KeyboardEvent) => {
      if (!clip || !clip.frames.length || isTypingTarget(event.target)) {
        return;
      }

      if (event.code === "Space") {
        event.preventDefault();
        setPlaying(!playing);
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "d") {
        event.preventDefault();
        void duplicateSelectedFrames();
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") {
        event.preventDefault();
        setSelectedFrameIds(clip.frames.map((frame) => frame.id), activeFrameIndex);
        return;
      }

      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        void deleteSelectedFrames();
        return;
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        stepFrame(-1);
        return;
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        stepFrame(1);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeFrameIndex, clip, deleteSelectedFrames, duplicateSelectedFrames, playing, setPlaying, setSelectedFrameIds, stepFrame]);

  const applyDelayToAll = (rawValue = delayInput) => {
    if (!clip) {
      return;
    }
    const sec = parseFloat(rawValue);
    if (Number.isNaN(sec) || sec < 0.001) {
      return;
    }
    const delayMs = Math.max(10, Math.round(sec * 1000));
    if (clip.frames.every((frame) => frame.delayMs === delayMs)) {
      return;
    }
    const next = cloneClip(clip);
    for (const frame of next.frames) {
      frame.delayMs = delayMs;
    }
    void updateClip(next, "Apply delay to all frames", true);
  };

  const applyDelayToSelection = (rawValue = selectionDelayInput) => {
    const sec = parseFloat(rawValue);
    if (Number.isNaN(sec) || sec < 0.001) {
      return;
    }
    void setDelayForSelection(Math.max(10, Math.round(sec * 1000)));
  };

  const selectAllFrames = () => {
    if (!clip) {
      return;
    }
    setSelectedFrameIds(clip.frames.map((frame) => frame.id), activeFrameIndex);
  };

  const ensureSingleFrameSelection = (frameId: string, index: number) => {
    setSelectedFrameIds([frameId], index);
    anchorIndexRef.current = index;
  };

  const moveContextFrameToEdge = async (position: "start" | "end") => {
    if (!clip || !contextMenu) {
      return;
    }
    const targetIndex = position === "start" ? 0 : clip.frames.length - 1;
    const nextIndex = getReorderTargetIndex(contextMenu.index, targetIndex, position === "start" ? "before" : "after", clip.frames.length);
    if (contextMenu.index !== nextIndex) {
      await reorderFrame(contextMenu.index, nextIndex);
    }
    setContextMenu(null);
  };

  const copyCurrentDelayToSelection = () => {
    if (!clip || !contextMenu) {
      return;
    }
    const frame = clip.frames[contextMenu.index];
    if (!frame) {
      return;
    }
    setSelectionDelayInput((frame.delayMs / 1000).toFixed(2));
    void setDelayForSelection(frame.delayMs);
    setContextMenu(null);
  };

  const handleFrameSelect = (event: ReactMouseEvent, frameId: string, index: number) => {
    if (!clip) {
      return;
    }

    if (event.shiftKey) {
      const anchor = anchorIndexRef.current ?? activeFrameIndex;
      const start = Math.min(anchor, index);
      const end = Math.max(anchor, index);
      const ids = clip.frames.slice(start, end + 1).map((frame) => frame.id);
      setSelectedFrameIds(ids, index);
      anchorIndexRef.current = anchor;
      return;
    }

    anchorIndexRef.current = index;

    if (event.ctrlKey || event.metaKey) {
      selectFrame(frameId, true);
      setActiveFrameIndexOnly(index);
      return;
    }

    setActiveFrameIndex(index);
  };

  const handleFrameContextMenu = (event: ReactMouseEvent, frameId: string, index: number) => {
    event.preventDefault();
    event.stopPropagation();

    if (!selectedFrameIds.includes(frameId)) {
      ensureSingleFrameSelection(frameId, index);
    } else {
      setActiveFrameIndexOnly(index);
    }

    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      index
    });
  };

  const handleDragHover = (event: React.DragEvent<HTMLButtonElement>, targetIndex: number) => {
    if (dragSourceIndex === null) {
      return;
    }
    setDragTarget({
      index: targetIndex,
      position: getDropPosition(event)
    });
  };

  const handleDropIndex = async (event: React.DragEvent<HTMLButtonElement>, targetIndex: number) => {
    const fromIndex = dragSourceIndex ?? Number.parseInt(event.dataTransfer.getData("text/plain"), 10);
    if (Number.isNaN(fromIndex) || !clip) {
      setDragSourceIndex(null);
      setDragTarget(null);
      return;
    }

    const position = getDropPosition(event);
    const nextIndex = getReorderTargetIndex(fromIndex, targetIndex, position, clip.frames.length);
    if (fromIndex !== nextIndex) {
      await reorderFrame(fromIndex, nextIndex);
    }
    setDragSourceIndex(null);
    setDragTarget(null);
  };

  if (!clip) {
    return (
      <section className="panel timeline-panel">
        <div className="muted">{t("timeline_empty")}</div>
      </section>
    );
  }

  return (
    <section className="panel timeline-panel">
      <div className="timeline-top-row timeline-top-row--primary">
        <div className="timeline-action-group">
          <button onClick={() => setPlaying(!playing)}>{playing ? t("pause") : t("play")}</button>
          <button onClick={() => stepFrame(-1)}>{t("prev")}</button>
          <button onClick={() => stepFrame(1)}>{t("next")}</button>
          <button onClick={selectAllFrames}>{t("timeline_select_all")}</button>
        </div>

        <div className="timeline-action-group">
          <button onClick={() => void duplicateSelectedFrames()}>{t("duplicate")}</button>
          <button onClick={() => void deleteSelectedFrames()}>{t("delete")}</button>
        </div>

        <div className="timeline-thumb-size-group" role="group" aria-label={t("timeline_thumb_size")}>
          <span className="muted">{t("timeline_thumb_size")}</span>
          {(Object.keys(thumbSizeLabel) as TimelineThumbSize[]).map((size) => (
            <button
              key={size}
              type="button"
              className={thumbSize === size ? "active" : ""}
              onClick={() => setThumbSize(size)}
            >
              {thumbSizeLabel[size]}
            </button>
          ))}
        </div>

        <span className="muted timeline-playhead">
          {t("playhead")} {activeFrameIndex + 1}/{clip.frames.length}
        </span>
      </div>

      <div className="timeline-top-row timeline-top-row--secondary">
        <div className="timeline-selection-summary">
          <strong>{t("timeline_selection_summary")}</strong>
          <span className="muted">
            {selectionSummary.selectedCount > 1
              ? `${selectionSummary.firstIndex}-${selectionSummary.lastIndex} · ${selectionSummary.selectedCount}${t("timeline_selection_frames")}`
              : `${selectionSummary.firstIndex}${t("timeline_selection_frame_single")}`}
          </span>
          <span className="muted">
            {t("timeline_total_duration")}: {(selectionSummary.selectedDurationMs / 1000).toFixed(2)}s
          </span>
        </div>

        <label className="timeline-inline-field">
          <span>{t("timeline_delay_selection")}</span>
          <input
            type="number"
            step={0.01}
            min={0.01}
            value={selectionDelayInput}
            onChange={(event) => setSelectionDelayInput(event.target.value)}
            onBlur={() => applyDelayToSelection()}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                applyDelayToSelection();
              }
            }}
          />
        </label>

        <label className="timeline-inline-field">
          <span>{t("timeline_delay_all")}</span>
          <input
            type="number"
            step={0.01}
            min={0.01}
            value={delayInput}
            onChange={(event) => setDelayInput(event.target.value)}
            onBlur={() => applyDelayToAll()}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                applyDelayToAll();
              }
            }}
          />
        </label>

        <label className="timeline-inline-field">
          <span>{t("loop")}</span>
          <select value={clip.loopMode} onChange={(event) => void setLoopMode(event.target.value as typeof clip.loopMode)}>
            <option value="loop">반복</option>
            <option value="once">1회 재생</option>
            <option value="pingpong">왕복</option>
            <option value="reverse">역방향 반복</option>
          </select>
        </label>
      </div>

      <div className="timeline-shortcuts muted">
        {t("timeline_shortcuts")}
      </div>

      <div className="timeline-scroll">
        {clip.frames.map((frame, index) => (
          <FrameThumb
            key={frame.id}
            frame={frame}
            index={index}
            selected={selectedFrameIds.includes(frame.id)}
            active={index === activeFrameIndex}
            thumbPx={thumbSizePx[thumbSize]}
            dragIndicator={dragTarget?.index === index ? dragTarget.position : null}
            onSelect={handleFrameSelect}
            onContextMenu={handleFrameContextMenu}
            onDragStart={setDragSourceIndex}
            onDragEnd={() => {
              setDragSourceIndex(null);
              setDragTarget(null);
            }}
            onDragHover={handleDragHover}
            onDropIndex={handleDropIndex}
            itemRef={(node) => {
              frameRefs.current[frame.id] = node;
            }}
          />
        ))}
      </div>

      {contextMenu ? (
        <div
          className="timeline-context-menu"
          style={{
            left: `${contextMenu.x}px`,
            top: `${contextMenu.y}px`
          }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <button type="button" onClick={() => {
            const frame = clip.frames[contextMenu.index];
            if (frame) {
              ensureSingleFrameSelection(frame.id, contextMenu.index);
            }
            setContextMenu(null);
          }}
          >
            {t("timeline_context_select_only")}
          </button>
          <button type="button" onClick={() => {
            void duplicateSelectedFrames();
            setContextMenu(null);
          }}
          >
            {t("timeline_context_duplicate_selection")}
          </button>
          <button type="button" onClick={() => {
            void deleteSelectedFrames();
            setContextMenu(null);
          }}
          >
            {t("timeline_context_delete_selection")}
          </button>
          <button type="button" onClick={() => void moveContextFrameToEdge("start")}>
            {t("timeline_context_move_start")}
          </button>
          <button type="button" onClick={() => void moveContextFrameToEdge("end")}>
            {t("timeline_context_move_end")}
          </button>
          <button type="button" onClick={copyCurrentDelayToSelection}>
            {t("timeline_context_copy_delay")}
          </button>
        </div>
      ) : null}
    </section>
  );
}
