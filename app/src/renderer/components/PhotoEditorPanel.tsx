import { useMemo, useState } from "react";
import { useI18n } from "../i18n";

const PHOTO_EDITOR_BUNDLE_VERSION = "2026-03-31-ko-pan";

export function PhotoEditorPanel(): JSX.Element {
  const { t } = useI18n();
  const [frameKey, setFrameKey] = useState(0);

  const editorUrl = useMemo(() => {
    if (typeof window === "undefined") {
      return `bitmappery/index.html?v=${PHOTO_EDITOR_BUNDLE_VERSION}`;
    }
    const url = new URL("bitmappery/index.html", window.location.href);
    url.searchParams.set("v", PHOTO_EDITOR_BUNDLE_VERSION);
    return url.toString();
  }, []);

  return (
    <section className="panel photo-editor-page">
      <div className="photo-editor-header">
        <div>
          <h2>{t("photo_editor_title")}</h2>
          <p className="muted">{t("photo_editor_desc")}</p>
        </div>
        <div className="row-buttons">
          <button type="button" onClick={() => setFrameKey((value) => value + 1)}>
            {t("photo_editor_reload")}
          </button>
        </div>
      </div>

      <div className="photo-editor-shell">
        <iframe
          key={frameKey}
          className="photo-editor-frame"
          src={editorUrl}
          title={t("photo_editor_title")}
        />
      </div>
    </section>
  );
}
