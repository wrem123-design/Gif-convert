import { useEditorStore } from "../state/editorStore";
import { useI18n } from "../i18n";

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

  const helpTitle = activeHelpTopic ? t(`help_${activeHelpTopic}_title`) : t("help_default_title");
  const helpDesc = activeHelpTopic ? t(`help_${activeHelpTopic}_desc`) : t("help_default_desc");

  return (
    <aside className="panel left-panel">
      <div className="panel-header-row">
        <h2>{t("resources")}</h2>
        <button className="accent" onClick={() => void pickAndImport()}>{t("import")}</button>
      </div>

      <div className="clip-list">
        {(project?.clips ?? []).map((clip) => (
          <button
            key={clip.id}
            className={`clip-item ${clip.id === selectedClipId ? "selected" : ""}`}
            onClick={() => selectClip(clip.id)}
          >
            <span className="clip-name">{clip.name}</span>
            <span className="clip-meta">{clip.frames.length} {t("frames_count")}</span>
          </button>
        ))}
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

      <div className="export-unity-guide">
        <h3>Unity .anim 연동 방법</h3>
        <ol>
          <li>
            <strong>[최초 1회]</strong> 이 프로젝트의 <code>unity/</code> 폴더를 Unity 프로젝트에 복사
            <br />
            <span className="muted">예: <code>Assets/SpriteForge/</code></span>
          </li>
          <li>
            오른쪽 인스펙터에서 내보내기 모드를 <strong>sheet</strong>로 설정 후 <strong>클립 내보내기</strong>를 실행
            <br />
            <span className="muted">생성 파일: <code>sheet.png</code> + <code>meta.json</code></span>
          </li>
          <li>생성된 두 파일을 Unity <code>Assets/</code> 하위 원하는 폴더에 복사</li>
          <li>
            Unity가 <code>meta.json</code>을 감지하면 자동 생성:
            <br />
            <code>UnityGenerated/&lt;클립명&gt;.anim</code>
            <br />
            <code>UnityGenerated/&lt;클립명&gt;.controller</code>
          </li>
        </ol>
        <p className="muted">수동 재생성: Unity 메뉴 -&gt; <em>Sprite Forge &gt; Regenerate From Meta (Selected)</em></p>
      </div>

      <h3>{t("feature_guide")}</h3>
      <div className={`help-card ${activeHelpTopic ? "active" : ""}`}>
        <strong>{helpTitle}</strong>
        <p>{helpDesc}</p>
      </div>
    </aside>
  );
}
