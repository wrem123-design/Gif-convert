import { useEffect, useRef, useState } from "react";
import { useI18n } from "../i18n";
import type { SpriteForgeApi } from "../../main/preload";

type IOPaintStatus = Awaited<ReturnType<SpriteForgeApi["getIOPaintStatus"]>>;

const DEFAULT_STATUS: IOPaintStatus = {
  phase: "idle",
  message: "대기 중",
  ready: false,
  managed: false,
  url: "http://127.0.0.1:8080",
  repoDir: "",
  venvDir: "",
  modelDir: "",
  logs: [],
  error: null
};

export function IOPaintPanel(): JSX.Element {
  const { t } = useI18n();
  const [status, setStatus] = useState<IOPaintStatus>(DEFAULT_STATUS);
  const [frameKey, setFrameKey] = useState(0);
  const [frameLoaded, setFrameLoaded] = useState(false);
  const [runtimePanelOpen, setRuntimePanelOpen] = useState(false);
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const wasReadyRef = useRef(false);

  useEffect(() => {
    let mounted = true;

    void window.spriteForge.getIOPaintStatus().then((next) => {
      if (mounted) {
        setStatus(next);
      }
    });

    const off = window.spriteForge.onIOPaintStatus((next) => {
      if (!mounted) {
        return;
      }
      setStatus(next);
    });

    void window.spriteForge.ensureIOPaintStarted().catch(() => {
      // Shared status stream already carries the failure details.
    });

    return () => {
      mounted = false;
      off();
    };
  }, []);

  useEffect(() => {
    if (status.ready && !wasReadyRef.current) {
      setFrameLoaded(false);
      setFrameKey((value) => value + 1);
    }
    wasReadyRef.current = status.ready;
  }, [status.ready]);

  const reloadFrame = (): void => {
    setFrameLoaded(false);
    setFrameKey((value) => value + 1);
  };

  const restartService = (): void => {
    setFrameLoaded(false);
    void window.spriteForge.restartIOPaint().catch(() => {
      // Shared status stream already carries the failure details.
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
        'a[href*="buymeacoffee"], a[href*="buymeacoffee.com"], a[href*="ko-fi"], a[href*="kofi"], img[src*="kofi_button"], img[src*="buymeacoffee"]'
      );
      candidates.forEach((node) => {
        const target = node.closest("a, button, div") ?? node;
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

  return (
    <section className="panel iopaint-page">
      <div className="iopaint-header">
        <div>
          <h2>{t("iopaint_title")}</h2>
          <p className="muted">{t("iopaint_desc")}</p>
        </div>
        <div className="row-buttons">
          <button type="button" onClick={() => setRuntimePanelOpen((value) => !value)}>
            {runtimePanelOpen ? t("iopaint_runtime_hide") : t("iopaint_runtime_show")}
          </button>
          <button type="button" onClick={restartService}>
            {t("iopaint_restart_service")}
          </button>
          <button type="button" onClick={reloadFrame} disabled={!status.ready}>
            {t("iopaint_reload")}
          </button>
        </div>
      </div>

      {runtimePanelOpen ? (
        <>
          <div className="iopaint-status-card">
            <div className="iopaint-status-copy">
              <span className={`iopaint-status-badge phase-${status.phase}`}>
                {status.ready ? t("iopaint_status_ready") : t("iopaint_status_setting")}
              </span>
              <strong>{status.message}</strong>
              <p className="muted">{status.error ?? t("iopaint_status_desc")}</p>
            </div>
            <div className="iopaint-meta-grid">
              <div className="iopaint-meta-item">
                <span>{t("iopaint_runtime_url")}</span>
                <code>{status.url}</code>
              </div>
              <div className="iopaint-meta-item">
                <span>{t("iopaint_runtime_repo")}</span>
                <code>{status.repoDir || "-"}</code>
              </div>
              <div className="iopaint-meta-item">
                <span>{t("iopaint_runtime_venv")}</span>
                <code>{status.venvDir || "-"}</code>
              </div>
              <div className="iopaint-meta-item">
                <span>{t("iopaint_runtime_model")}</span>
                <code>{status.modelDir || "-"}</code>
              </div>
            </div>
          </div>

          {!status.ready || status.error ? (
            <div className="iopaint-log-card">
              <div className="iopaint-log-header">
                <strong>{t("iopaint_log_title")}</strong>
                <span className="muted">{t("iopaint_log_desc")}</span>
              </div>
              <pre className="iopaint-log-output">
                {status.logs.length ? status.logs.join("\n") : t("iopaint_log_empty")}
              </pre>
            </div>
          ) : null}
        </>
      ) : (
        <div className="iopaint-runtime-toggle-summary muted">
          {t("iopaint_runtime_collapsed")}
        </div>
      )}

      <div className="iopaint-shell">
        {!status.ready || !frameLoaded ? (
          <div className="iopaint-frame-status">
            <strong>{status.ready ? t("iopaint_loading_frame") : t("iopaint_connecting")}</strong>
            <span>{status.url}</span>
          </div>
        ) : null}
        {status.ready ? (
          <iframe
            ref={frameRef}
            key={frameKey}
            className="iopaint-frame"
            src={status.url}
            title={t("iopaint_title")}
            allow="clipboard-read; clipboard-write"
            onLoad={() => {
              installFrameTweaks();
              setFrameLoaded(true);
            }}
          />
        ) : null}
      </div>
    </section>
  );
}
