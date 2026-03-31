import { useEffect, useMemo, useState } from "react";
import type { Clip, Frame } from "@sprite-forge/core";
import { useEditorStore } from "../state/editorStore";
import { useCurrentClip } from "../utils/selectors";
import { useFrameDataUrl } from "../hooks/useFrameDataUrl";
import { useI18n } from "../i18n";

function cloneClip(clip: Clip): Clip {
  return JSON.parse(JSON.stringify(clip)) as Clip;
}

function FrameThumb(props: {
  frame: Frame;
  index: number;
  selected: boolean;
  onSelect: (event: React.MouseEvent, frameId: string, index: number) => void;
  onDropIndex: (from: number, to: number) => void;
}): JSX.Element {
  const dataUrl = useFrameDataUrl(props.frame.srcPath);

  return (
    <div
      className={`timeline-frame ${props.selected ? "selected" : ""}`}
      draggable
      onDragStart={(e) => e.dataTransfer.setData("text/plain", String(props.index))}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const from = Number.parseInt(e.dataTransfer.getData("text/plain"), 10);
        if (!Number.isNaN(from)) {
          props.onDropIndex(from, props.index);
        }
      }}
      onClick={(e) => props.onSelect(e, props.frame.id, props.index)}
      title={`프레임 ${props.index}`}
    >
      <div className="thumb-shell">{dataUrl ? <img src={dataUrl} alt={`프레임-${props.index}`} /> : null}</div>
      <span>{String(props.index).padStart(3, "0")}</span>
      <span className="muted">{(props.frame.delayMs / 1000).toFixed(2)}s</span>
    </div>
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
  const selectFrame = useEditorStore((s) => s.selectFrame);
  const reorderFrame = useEditorStore((s) => s.reorderFrame);
  const duplicateSelectedFrames = useEditorStore((s) => s.duplicateSelectedFrames);
  const deleteSelectedFrames = useEditorStore((s) => s.deleteSelectedFrames);
  const setLoopMode = useEditorStore((s) => s.setLoopMode);
  const stepFrame = useEditorStore((s) => s.stepFrame);
  const updateClip = useEditorStore((s) => s.updateClip);

  const allDelaySec = useMemo(() => {
    if (!clip || !clip.frames.length) return 0.1;
    return (clip.frames[0]?.delayMs ?? 100) / 1000;
  }, [clip]);

  const [delayInput, setDelayInput] = useState(String(allDelaySec));

  useEffect(() => {
    setDelayInput(String(allDelaySec));
  }, [allDelaySec]);

  const applyDelayToAll = (rawValue = delayInput) => {
    if (!clip) return;
    const sec = parseFloat(rawValue);
    if (Number.isNaN(sec) || sec < 0.001) return;
    const delayMs = Math.max(10, Math.round(sec * 1000));
    if (clip.frames.every((frame) => frame.delayMs === delayMs)) {
      return;
    }
    const next = cloneClip(clip);
    for (const frame of next.frames) {
      frame.delayMs = delayMs;
    }
    void updateClip(next, "전체 지연시간 설정", true);
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
      <div className="timeline-top-row">
        <button onClick={() => setPlaying(!playing)}>{playing ? t("pause") : t("play")}</button>
        <button onClick={() => stepFrame(-1)}>{t("prev")}</button>
        <button onClick={() => stepFrame(1)}>{t("next")}</button>
        <button onClick={() => void duplicateSelectedFrames()}>{t("duplicate")}</button>
        <button onClick={() => void deleteSelectedFrames()}>{t("delete")}</button>

        <label>
          {t("delay")} (초)
          <input
            type="number"
            step={0.01}
            min={0.01}
            value={delayInput}
            onChange={(e) => {
              setDelayInput(e.target.value);
              applyDelayToAll(e.target.value);
            }}
            onBlur={() => applyDelayToAll()}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                applyDelayToAll();
              }
            }}
          />
        </label>

        <label>
          {t("loop")}
          <select value={clip.loopMode} onChange={(e) => void setLoopMode(e.target.value as typeof clip.loopMode)}>
            <option value="loop">반복</option>
            <option value="once">1회 재생</option>
            <option value="pingpong">핑퐁</option>
            <option value="reverse">역방향 반복</option>
          </select>
        </label>

        <span className="muted">{t("playhead")} {activeFrameIndex + 1}/{clip.frames.length}</span>
      </div>

      <div className="timeline-scroll">
        {clip.frames.map((frame, index) => (
          <FrameThumb
            key={frame.id}
            frame={frame}
            index={index}
            selected={selectedFrameIds.includes(frame.id)}
            onSelect={(event, frameId, idx) => {
              if (event.ctrlKey || event.metaKey) {
                selectFrame(frameId, true);
                setActiveFrameIndexOnly(idx);
                return;
              }
              setActiveFrameIndex(idx);
            }}
            onDropIndex={(from, to) => {
              if (from !== to) {
                void reorderFrame(from, to);
              }
            }}
          />
        ))}
      </div>
    </section>
  );
}
