import { useEffect, useMemo, useState } from "react";
import type { Frame } from "@sprite-forge/core";
import { useCurrentClip } from "../utils/selectors";
import { useEditorStore } from "../state/editorStore";
import { useI18n } from "../i18n";
import { useFrameDataUrl } from "../hooks/useFrameDataUrl";
import { ZoomableImagePreview } from "./ZoomableImagePreview";

function getScopedFrames(
  frames: Frame[],
  frameScope: "all" | "selected",
  selectedFrameIds: string[]
): Frame[] {
  if (frameScope === "all") {
    return frames;
  }
  const selected = new Set(selectedFrameIds);
  return frames.filter((frame) => selected.has(frame.id));
}

export function ExportCenterPanel(): JSX.Element {
  const { t } = useI18n();
  const clip = useCurrentClip();
  const playing = useEditorStore((s) => s.playing);
  const selectedFrameIds = useEditorStore((s) => s.selectedFrameIds);
  const exportSettings = useEditorStore((s) => s.exportSettings);
  const setActiveHelpTopic = useEditorStore((s) => s.setActiveHelpTopic);
  const [previewIndex, setPreviewIndex] = useState(0);

  const scopedFrames = useMemo(
    () => (clip ? getScopedFrames(clip.frames, exportSettings.frameScope, selectedFrameIds) : []),
    [clip, exportSettings.frameScope, selectedFrameIds]
  );

  useEffect(() => {
    setPreviewIndex(0);
  }, [clip?.id, exportSettings.frameScope, selectedFrameIds.join(",")]);

  useEffect(() => {
    if (!playing || scopedFrames.length <= 1) {
      return;
    }
    const current = scopedFrames[previewIndex] ?? scopedFrames[0];
    const delay = Math.max(10, current?.delayMs ?? 100);
    const timer = window.setTimeout(() => {
      setPreviewIndex((idx) => (idx + 1) % scopedFrames.length);
    }, delay);
    return () => window.clearTimeout(timer);
  }, [playing, previewIndex, scopedFrames]);

  const previewFrame = scopedFrames[previewIndex] ?? null;
  const previewDataUrl = useFrameDataUrl(previewFrame?.srcPath);
  const previewPadding = previewFrame
    ? Math.max(72, Math.abs(previewFrame.offsetPx.x) + 48, Math.abs(previewFrame.offsetPx.y) + 48)
    : 72;

  return (
    <section className="panel viewport-panel export-panel">
      <h2>{t("export_unity")}</h2>
      {!clip ? <p className="muted">{t("select_clip_to_export")}</p> : null}

      {clip ? (
        <div className="export-preview-layout">
          <div className="export-preview-header">
            <strong>
              {exportSettings.frameScope === "all" ? t("export_scope_all") : t("export_scope_selected")}
            </strong>
            <span className="muted">
              {t("export_frame_count")} {scopedFrames.length}/{clip.frames.length}
            </span>
            <span className="muted">{t("export_preview_note")}</span>
          </div>

          {scopedFrames.length === 0 ? (
            <div className="muted">{t("export_scope_selected_desc")}</div>
          ) : (
            <>
              <div className="export-preview-canvas" onClick={() => setActiveHelpTopic("export_preview")}>
                <ZoomableImagePreview
                  src={previewDataUrl}
                  alt="내보내기 미리보기"
                  empty={<div className="muted">프레임 로딩 중...</div>}
                  stagePadding={previewPadding}
                  imageStyle={{
                    transform: `translate(${previewFrame?.offsetPx.x ?? 0}px, ${previewFrame?.offsetPx.y ?? 0}px)`
                  }}
                  stageStyle={{
                    background:
                      "linear-gradient(45deg, var(--checker-a) 25%, var(--checker-b) 25%) 0 0 / 16px 16px, "
                      + "linear-gradient(-45deg, var(--checker-a) 25%, var(--checker-b) 25%) 0 0 / 16px 16px, "
                      + "var(--bg-input)"
                  }}
                />
              </div>
              <div className="export-preview-controls">
                <button
                  disabled={scopedFrames.length <= 1}
                  onClick={() => setPreviewIndex((idx) => (idx - 1 + scopedFrames.length) % scopedFrames.length)}
                >
                  {t("prev")}
                </button>
                <button
                  disabled={scopedFrames.length <= 1}
                  onClick={() => setPreviewIndex((idx) => (idx + 1) % scopedFrames.length)}
                >
                  {t("next")}
                </button>
                <span className="muted">
                  {t("playhead")} {previewIndex + 1}/{scopedFrames.length}
                </span>
                <span className="muted">{previewFrame?.delayMs ?? 100}ms</span>
                <span className="muted">{playing ? "하단 타임라인 재생 중" : "하단 타임라인에서 재생 가능"}</span>
              </div>
            </>
          )}
        </div>
      ) : null}
    </section>
  );
}
