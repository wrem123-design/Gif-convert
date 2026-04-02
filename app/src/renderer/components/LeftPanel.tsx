import { useMemo, useState } from "react";
import type { Clip } from "@sprite-forge/core";
import { useEditorStore } from "../state/editorStore";
import { useI18n } from "../i18n";
import { useFrameDataUrl } from "../hooks/useFrameDataUrl";

type ClipSortMode = "recent" | "name" | "frames";

function ClipListItem(props: {
  clip: Clip;
  selected: boolean;
  onSelect: () => void;
}): JSX.Element {
  const previewPath = props.clip.frames[0]?.srcPath;
  const previewDataUrl = useFrameDataUrl(previewPath);

  return (
    <button
      type="button"
      className={`clip-item ${props.selected ? "selected" : ""}`}
      onClick={props.onSelect}
      title={props.clip.name}
    >
      <div className="clip-item-thumb">
        {previewDataUrl ? <img src={previewDataUrl} alt={props.clip.name} /> : <span>{props.clip.name.slice(0, 1).toUpperCase()}</span>}
      </div>
      <div className="clip-item-copy">
        <span className="clip-name">{props.clip.name}</span>
        <span className="clip-meta">{props.clip.frames.length} {props.clip.frames.length === 1 ? "frame" : "frames"}</span>
      </div>
    </button>
  );
}

export function LeftPanel(): JSX.Element {
  const { t } = useI18n();
  const project = useEditorStore((s) => s.project);
  const selectedClipId = useEditorStore((s) => s.selectedClipId);
  const selectClip = useEditorStore((s) => s.selectClip);
  const pickAndImport = useEditorStore((s) => s.pickAndImport);
  const viewportBackgroundColor = useEditorStore((s) => s.viewport.backgroundColor);
  const imageAreaColor = useEditorStore((s) => s.viewport.imageAreaColor);
  const setViewport = useEditorStore((s) => s.setViewport);
  const activeHelpTopic = useEditorStore((s) => s.activeHelpTopic);
  const setActiveHelpTopic = useEditorStore((s) => s.setActiveHelpTopic);
  const [query, setQuery] = useState("");
  const [sortMode, setSortMode] = useState<ClipSortMode>("recent");

  const helpTitle = activeHelpTopic ? t(`help_${activeHelpTopic}_title`) : t("help_default_title");
  const helpDesc = activeHelpTopic ? t(`help_${activeHelpTopic}_desc`) : t("help_default_desc");

  const clips = useMemo(() => {
    const base = [...(project?.clips ?? [])];
    const normalizedQuery = query.trim().toLowerCase();
    const filtered = normalizedQuery
      ? base.filter((clip) => clip.name.toLowerCase().includes(normalizedQuery))
      : base;

    if (sortMode === "name") {
      filtered.sort((a, b) => a.name.localeCompare(b.name, "ko"));
    } else if (sortMode === "frames") {
      filtered.sort((a, b) => b.frames.length - a.frames.length || a.name.localeCompare(b.name, "ko"));
    }

    return filtered;
  }, [project?.clips, query, sortMode]);

  const selectedClip = project?.clips.find((clip) => clip.id === selectedClipId) ?? null;

  return (
    <aside className="panel left-panel">
      <div className="panel-header-row">
        <div>
          <h2>{t("resources")}</h2>
          <p className="muted left-panel-subtitle">
            {project?.clips.length ?? 0}{t("left_panel_clip_count_suffix")}
          </p>
        </div>
        <button className="accent" onClick={() => void pickAndImport()}>{t("import")}</button>
      </div>

      <div className="left-panel-search">
        <label>
          <span>{t("left_panel_search")}</span>
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("left_panel_search_placeholder")}
          />
        </label>
        <label>
          <span>{t("left_panel_sort")}</span>
          <select value={sortMode} onChange={(event) => setSortMode(event.target.value as ClipSortMode)}>
            <option value="recent">{t("left_panel_sort_recent")}</option>
            <option value="name">{t("left_panel_sort_name")}</option>
            <option value="frames">{t("left_panel_sort_frames")}</option>
          </select>
        </label>
      </div>

      {selectedClip ? (
        <div className="left-panel-summary-card">
          <strong>{selectedClip.name}</strong>
          <span className="muted">
            {selectedClip.frames.length} {t("frames_count")} · {t("left_panel_selected_clip")}
          </span>
        </div>
      ) : null}

      <div className="clip-list">
        {clips.length ? clips.map((clip) => (
          <ClipListItem
            key={clip.id}
            clip={clip}
            selected={clip.id === selectedClipId}
            onSelect={() => selectClip(clip.id)}
          />
        )) : (
          <div className="left-panel-empty muted">
            {query.trim() ? t("left_panel_no_search_result") : t("timeline_empty")}
          </div>
        )}
      </div>

      <div className="viewport-bg-controls">
        <button
          type="button"
          onClick={() => {
            setActiveHelpTopic("viewport_bg");
          }}
        >
          {t("viewport_bg_button")}
        </button>
        <label>
          {t("viewport_bg_canvas")}
          <input
            type="color"
            value={viewportBackgroundColor}
            onChange={(e) => setViewport({ backgroundColor: e.target.value })}
          />
        </label>
        <label>
          {t("viewport_bg_image_area")}
          <input
            type="color"
            value={imageAreaColor}
            onChange={(e) => setViewport({ imageAreaColor: e.target.value })}
          />
        </label>
      </div>

      <h3>{t("feature_guide")}</h3>
      <div className={`help-card ${activeHelpTopic ? "active" : ""}`}>
        <strong>{helpTitle}</strong>
        <p>{helpDesc}</p>
      </div>
    </aside>
  );
}
