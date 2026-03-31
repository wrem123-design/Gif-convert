import { useState } from "react";
import { useFrameDataUrl } from "../hooks/useFrameDataUrl";
import { useI18n } from "../i18n";
import { useEditorStore } from "../state/editorStore";
import { useCurrentClip } from "../utils/selectors";
import { ZoomableImagePreview } from "./ZoomableImagePreview";

function fileNameOnly(filePath: string): string {
  const parts = filePath.split(/[\\/]/);
  return parts[parts.length - 1] || filePath;
}

export function SpriteFramePreviewPanel(): JSX.Element {
  const { t } = useI18n();
  const busy = useEditorStore((s) => s.busy);
  const playing = useEditorStore((s) => s.playing);
  const setPlaying = useEditorStore((s) => s.setPlaying);
  const stepFrame = useEditorStore((s) => s.stepFrame);
  const activeFrameIndex = useEditorStore((s) => s.activeFrameIndex);
  const convertSpriteSheetToAutoGif = useEditorStore((s) => s.convertSpriteSheetToAutoGif);
  const cropFramesToActiveFrameSize = useEditorStore((s) => s.cropFramesToActiveFrameSize);
  const setActiveHelpTopic = useEditorStore((s) => s.setActiveHelpTopic);
  const clip = useCurrentClip();

  const [inputPath, setInputPath] = useState("");
  const [delayMs, setDelayMs] = useState(100);
  const [alphaThreshold, setAlphaThreshold] = useState(0.04);
  const [mergeThreshold, setMergeThreshold] = useState(1);
  const [removeBackground, setRemoveBackground] = useState(true);
  const [backgroundTolerance, setBackgroundTolerance] = useState(0.12);

  const frame = clip?.frames[activeFrameIndex] ?? null;
  const frameDataUrl = useFrameDataUrl(frame?.srcPath);

  const pickInput = async () => {
    const selected = await window.spriteForge.pickSpriteSheetImagePath();
    if (selected) {
      setInputPath(selected);
      setActiveHelpTopic("sprite_auto_gif");
    }
  };

  const runImport = async () => {
    setActiveHelpTopic("sprite_auto_gif");
    await convertSpriteSheetToAutoGif({
      inputPath,
      delayMs: Math.max(10, Math.round(delayMs)),
      alphaThreshold: Math.max(0, Math.min(1, alphaThreshold)),
      mergeThreshold: Math.max(0, Math.round(mergeThreshold)),
      removeBackground,
      backgroundTolerance: Math.max(0, Math.min(1, backgroundTolerance)),
      exportGif: false
    });
  };

  return (
    <aside className="panel sprite-preview-panel">
      <h2>{t("sprite_auto_title")}</h2>
      <p className="muted">{t("sprite_auto_desc")}</p>

      <div className="sprite-preview-import">
        <label>
          {t("sprite_auto_input")}
          <input value={inputPath} onChange={(e) => setInputPath(e.target.value)} placeholder="C:\\sheet.png" />
        </label>
        <div className="row-buttons">
          <button onClick={() => void pickInput()} disabled={busy}>{t("sprite_auto_pick_input")}</button>
          <button className="accent" onClick={() => void runImport()} disabled={busy || !inputPath}>{t("import")}</button>
        </div>
      </div>

      <div className="sprite-preview-options">
        <label>
          {t("sprite_auto_delay")}
          <input type="number" min={10} step={10} value={delayMs} onChange={(e) => setDelayMs(Number(e.target.value) || 100)} />
        </label>
        <label>
          {t("sprite_auto_alpha_threshold")}
          <input
            type="number"
            min={0}
            max={1}
            step={0.01}
            value={alphaThreshold}
            onChange={(e) => setAlphaThreshold(Number(e.target.value) || 0)}
          />
        </label>
        <label>
          {t("sprite_auto_merge_threshold")}
          <input type="number" min={0} step={1} value={mergeThreshold} onChange={(e) => setMergeThreshold(Number(e.target.value) || 0)} />
        </label>
        <label className="inline-check">
          <input type="checkbox" checked={removeBackground} onChange={(e) => setRemoveBackground(e.target.checked)} />
          {t("sprite_auto_remove_bg")}
        </label>
        <label>
          {t("sprite_auto_bg_tolerance")}
          <input
            type="number"
            min={0}
            max={1}
            step={0.01}
            value={backgroundTolerance}
            onChange={(e) => setBackgroundTolerance(Number(e.target.value) || 0)}
            disabled={!removeBackground}
          />
        </label>
      </div>

      <div className="sprite-preview-controls">
        <button onClick={() => setPlaying(!playing)}>{playing ? t("pause") : t("play")}</button>
        <button onClick={() => stepFrame(-1)}>{t("prev")}</button>
        <button onClick={() => stepFrame(1)}>{t("next")}</button>
        <button
          onClick={() => void cropFramesToActiveFrameSize()}
          disabled={busy || !clip || clip.frames.length < 2}
        >
          현재 프레임 기준으로 자르기
        </button>
        <span className="muted">
          {clip ? `${t("playhead")} ${activeFrameIndex + 1}/${clip.frames.length}` : t("timeline_empty")}
        </span>
      </div>

      <h3>{t("sprite_auto_preview_output")}</h3>
      <div className="sprite-preview-canvas">
        <ZoomableImagePreview
          src={frameDataUrl}
          alt={frame?.srcPath ? fileNameOnly(frame.srcPath) : "frame-preview"}
          empty={<span className="muted">{t("timeline_empty")}</span>}
          stageStyle={{
            background:
              "linear-gradient(45deg, var(--checker-a) 25%, var(--checker-b) 25%) 0 0 / 16px 16px, "
              + "linear-gradient(-45deg, var(--checker-a) 25%, var(--checker-b) 25%) 0 0 / 16px 16px, "
              + "var(--bg-input)"
          }}
        />
      </div>
      <span className="muted">{frame?.srcPath ? fileNameOnly(frame.srcPath) : t("sprite_auto_no_output")}</span>
    </aside>
  );
}
