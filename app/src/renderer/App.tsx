import { useEffect, useState, useCallback, useRef } from "react";
import { LeftPanel } from "./components/LeftPanel";
import { TimelinePanel } from "./components/TimelinePanel";
import { InspectorPanel } from "./components/InspectorPanel";
import { PixelEditorPanel } from "./components/PixelEditorPanel";
import { BackgroundRemovalPanel } from "./components/BackgroundRemovalPanel";
import { SpriteFramePreviewPanel } from "./components/SpriteFramePreviewPanel";
import { PixelHelperPanel } from "./components/PixelHelperPanel";
import { LeshySpritePanel } from "./components/LeshySpritePanel";
import { PhotoEditorPanel } from "./components/PhotoEditorPanel";
import { IOPaintPanel } from "./components/IOPaintPanel";
import { useEditorStore } from "./state/editorStore";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { usePlayback } from "./hooks/usePlayback";
import { useI18n } from "./i18n";

type ThemeMode = "dark" | "light";

const THEME_STORAGE_KEY = "sprite_forge_theme_v1";
const WORKSPACE_BOTTOM_PANEL_KEY = "sprite_forge_workspace_bottom_panel_v1";

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function loadTheme(): ThemeMode {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch { /* ignore */ }
  return "dark";
}

function saveTheme(theme: ThemeMode): void {
  try { localStorage.setItem(THEME_STORAGE_KEY, theme); } catch { /* ignore */ }
}

function applyTheme(theme: ThemeMode): void {
  document.documentElement.setAttribute("data-theme", theme);
}

/* ── SVG Icons ── */
const IconFolder = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
);
const IconImport = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
);
const IconFilm = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/><line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="17" x2="22" y2="17"/><line x1="17" y1="7" x2="22" y2="7"/></svg>
);
const IconTrash = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
);
const IconMaximize = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>
);
const IconSettings = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
);
const IconX = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
);
const IconSun = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
);
const IconMoon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
);
const IconGrid = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg>
);
const IconPen = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
);
const IconCut = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4 8.12 15.88"/><path d="M14.47 14.48 20 20"/><path d="M8.12 8.12 12 12"/></svg>
);
const IconWand = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m7 21 3-3"/><path d="m16 3-9 9"/><path d="M18 5V3"/><path d="M20 7h2"/><path d="M16 7h-2"/><path d="M18 9v2"/><path d="M3 11h2"/><path d="M6 8V6"/><path d="M5 12v2"/></svg>
);
const IconMap = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/><line x1="9" y1="3" x2="9" y2="18"/><line x1="15" y1="6" x2="15" y2="21"/></svg>
);
const IconImage = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.5-3.5a2.12 2.12 0 0 0-3 0L6 20"/></svg>
);
const IconSparkles = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l1.8 4.2L18 9l-4.2 1.8L12 15l-1.8-4.2L6 9l4.2-1.8Z"/><path d="M5 17l.9 2.1L8 20l-2.1.9L5 23l-.9-2.1L2 20l2.1-.9Z"/><path d="M19 14l1 2 2 1-2 1-1 2-1-2-2-1 2-1Z"/></svg>
);
type AppTab = "sprite" | "pixel" | "export" | "bg_remove" | "pixel_helper" | "leshy_sprite" | "photo_editor" | "iopaint";
const PERSISTENT_TOOL_TABS: AppTab[] = ["bg_remove", "pixel_helper", "leshy_sprite", "photo_editor", "iopaint"];

function isPersistentToolTab(tab: AppTab): boolean {
  return PERSISTENT_TOOL_TABS.includes(tab);
}

export function App(): JSX.Element {
  const { t } = useI18n();
  const init = useEditorStore((s) => s.init);
  const pickAndImport = useEditorStore((s) => s.pickAndImport);
  const pickAndImportMedia = useEditorStore((s) => s.pickAndImportMedia);
  const resetCurrentProject = useEditorStore((s) => s.resetCurrentProject);
  const loadProject = useEditorStore((s) => s.loadProject);
  const importPaths = useEditorStore((s) => s.importPaths);
  const setExportSettings = useEditorStore((s) => s.setExportSettings);
  const status = useEditorStore((s) => s.status);
  const busy = useEditorStore((s) => s.busy);
  const tab = useEditorStore((s) => s.tab);
  const setTab = useEditorStore((s) => s.setTab);
  const requestFitView = useEditorStore((s) => s.requestFitView);
  const setActiveHelpTopic = useEditorStore((s) => s.setActiveHelpTopic);
  const projectDir = useEditorStore((s) => s.projectDir);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [theme, setThemeState] = useState<ThemeMode>(loadTheme);
  const [bottomPanelHeight, setBottomPanelHeight] = useState(200);
  const [compactLayout, setCompactLayout] = useState(() => window.innerWidth <= 980);
  const [mountedToolTabs, setMountedToolTabs] = useState<AppTab[]>(() => (isPersistentToolTab(tab) ? [tab] : []));
  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const bottomResizeRef = useRef<{ startY: number; startHeight: number } | null>(null);

  const setTheme = useCallback((t: ThemeMode) => {
    setThemeState(t);
    applyTheme(t);
    saveTheme(t);
  }, []);

  useEffect(() => {
    applyTheme(theme);
  }, []);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(WORKSPACE_BOTTOM_PANEL_KEY);
      if (!raw) {
        return;
      }
      const parsed = Number(raw);
      if (Number.isFinite(parsed)) {
        setBottomPanelHeight(clamp(parsed, 120, 420));
      }
    } catch {
      // Ignore malformed saved workspace layout.
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(WORKSPACE_BOTTOM_PANEL_KEY, String(Math.round(bottomPanelHeight)));
    } catch {
      // Ignore storage write failures.
    }
  }, [bottomPanelHeight]);

  useEffect(() => {
    const onResize = () => {
      setCompactLayout(window.innerWidth <= 980);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      const resizeState = bottomResizeRef.current;
      const workspace = workspaceRef.current;
      if (!resizeState || !workspace) {
        return;
      }

      const maxHeight = Math.max(120, workspace.clientHeight - 180);
      const nextHeight = clamp(resizeState.startHeight + (event.clientY - resizeState.startY), 120, maxHeight);
      setBottomPanelHeight(nextHeight);
    };

    const onPointerUp = () => {
      bottomResizeRef.current = null;
      document.body.classList.remove("workspace-resizing");
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, []);

  const showBottomResize = tab === "sprite" || tab === "pixel" || tab === "export";
  const isProjectWorkspaceTab = tab === "sprite" || tab === "pixel" || tab === "export";
  const activeTabLabel = (
    tab === "sprite" ? t("tab_sprite")
      : tab === "pixel" || tab === "export" ? t("tab_pixel")
        : tab === "bg_remove" ? t("tab_bg_remove")
            : tab === "pixel_helper" ? t("tab_pixel_helper")
              : tab === "leshy_sprite" ? t("tab_leshy_sprite")
                : tab === "photo_editor" ? t("tab_photo_editor")
                  : t("tab_iopaint")
  );
  const workspaceClassName = [
    "workspace-grid",
    tab === "sprite" ? "sprite-workspace" : "",
    !compactLayout && showBottomResize ? "resizable-workspace" : ""
  ].filter(Boolean).join(" ");
  const workspaceStyle = !compactLayout && showBottomResize
    ? { gridTemplateRows: `minmax(0, 1fr) 10px ${Math.round(bottomPanelHeight)}px` }
    : undefined;
  const shouldRenderPersistentToolPanel = (panelTab: AppTab): boolean => tab === panelTab || mountedToolTabs.includes(panelTab);

  useEffect(() => {
    void init();
  }, [init]);

  useEffect(() => {
    if (!isPersistentToolTab(tab)) {
      return;
    }
    setMountedToolTabs((current) => (current.includes(tab) ? current : [...current, tab]));
  }, [tab]);

  useEffect(() => {
    const offOpen = window.spriteForge.onMenuOpenProjectDir((dir) => {
      void loadProject(dir);
    });
    const offImport = window.spriteForge.onMenuImportPaths((paths) => {
      if (paths.length) {
        void importPaths(paths);
      }
    });
    const offExportRoot = window.spriteForge.onMenuSetExportRoot((exportRoot) => {
      setExportSettings({ exportRoot });
    });

    return () => {
      offOpen();
      offImport();
      offExportRoot();
    };
  }, [importPaths, loadProject, setExportSettings]);

  useKeyboardShortcuts(tab);
  usePlayback();

  const changeTab = (nextTab: AppTab) => {
    setTab(nextTab);
    if (nextTab === "sprite") {
      setActiveHelpTopic("sprite_auto_gif");
      return;
    }
    if (nextTab === "pixel") {
      setActiveHelpTopic("pixel_tools");
      return;
    }
    if (nextTab === "bg_remove") {
      setActiveHelpTopic("bg_remove");
      return;
    }
    setActiveHelpTopic(null);
  };

  const tabItems: Array<{ id: AppTab; label: string; icon: JSX.Element; tone: "project" | "tool" }> = [
    { id: "sprite", label: t("tab_sprite"), icon: <IconGrid />, tone: "project" },
    { id: "pixel", label: t("tab_pixel"), icon: <IconPen />, tone: "project" },
    { id: "bg_remove", label: t("tab_bg_remove"), icon: <IconCut />, tone: "tool" },
    { id: "pixel_helper", label: t("tab_pixel_helper"), icon: <IconWand />, tone: "tool" },
    { id: "leshy_sprite", label: t("tab_leshy_sprite"), icon: <IconMap />, tone: "tool" },
    { id: "photo_editor", label: t("tab_photo_editor"), icon: <IconImage />, tone: "tool" },
    { id: "iopaint", label: t("tab_iopaint"), icon: <IconSparkles />, tone: "tool" }
  ];

  return (
    <div
      className="app-shell"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const paths = Array.from(e.dataTransfer.files)
          .map((file) => (file as File & { path?: string }).path)
          .filter((value): value is string => Boolean(value));

        if (paths.length) {
          void importPaths(paths);
        }
      }}
    >
      {/* ── Header ── */}
      <header className="top-chrome">
        <div className="top-bar top-bar-main">
          <div className="top-brand">
            <div className="top-brand-mark">SS</div>
            <div className="top-brand-copy">
              <strong>Sprite Studio</strong>
              <span className="muted">{t("toolbar_brand_subtitle")}</span>
            </div>
          </div>

          <div className="tab-bar-wrap">
            <div className="tab-bar-group-label">{t("toolbar_group_project")}</div>
            <div className="tab-bar">
              {tabItems.filter((item) => item.tone === "project").map((item) => (
                <button
                  key={item.id}
                  className={tab === item.id ? "active" : ""}
                  onClick={() => changeTab(item.id)}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
            <div className="tab-bar-divider" />
            <div className="tab-bar-group-label">{t("toolbar_group_tools")}</div>
            <div className="tab-bar tab-bar-tools">
              {tabItems.filter((item) => item.tone === "tool").map((item) => (
                <button
                  key={item.id}
                  className={tab === item.id ? "active" : ""}
                  onClick={() => changeTab(item.id)}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="top-right">
            <div className="project-chip" title={projectDir || t("no_project")}>
              <IconFolder />
              <span>{projectDir || t("no_project")}</span>
            </div>
            <button onClick={() => setSettingsOpen(true)} title={t("settings")}>
              <IconSettings />
            </button>
          </div>
        </div>

        <div className="top-bar top-bar-sub">
          {isProjectWorkspaceTab ? (
            <>
              <div className="toolbar-group">
                <span className="toolbar-label">{t("toolbar_group_workspace")}</span>
                <button className="accent" onClick={() => void pickAndImport()} title={t("import_folder")}>
                  <IconImport /> {t("import_folder")}
                </button>
                <button onClick={() => void pickAndImportMedia()} title={t("open_gif_video")}>
                  <IconFilm /> {t("open_gif_video")}
                </button>
                <button onClick={requestFitView} title={t("fit_view")}>
                  <IconMaximize /> {t("fit_view")}
                </button>
                <button className="danger" onClick={() => void resetCurrentProject()} title={t("reset")}>
                  <IconTrash /> {t("reset")}
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="toolbar-separator" />
              <div className="toolbar-group toolbar-group-passive">
                <span className="toolbar-label">{activeTabLabel}</span>
              </div>
            </>
          )}
        </div>
      </header>

      {/* ── Workspace ── */}
      <div ref={workspaceRef} className={workspaceClassName} style={workspaceStyle}>
        {tab === "sprite" ? (
          <>
            <PixelEditorPanel mode="sprite" />
            <SpriteFramePreviewPanel />
            {!compactLayout ? (
              <div
                className="workspace-row-splitter"
                onPointerDown={(event) => {
                  bottomResizeRef.current = {
                    startY: event.clientY,
                    startHeight: bottomPanelHeight
                  };
                  document.body.classList.add("workspace-resizing");
                }}
              />
            ) : null}
            <TimelinePanel />
          </>
        ) : tab === "pixel" || tab === "export" ? (
          <>
            <LeftPanel />
            <PixelEditorPanel mode="asset" />
            <InspectorPanel />
            {!compactLayout ? (
              <div
                className="workspace-row-splitter"
                onPointerDown={(event) => {
                  bottomResizeRef.current = {
                    startY: event.clientY,
                    startHeight: bottomPanelHeight
                  };
                  document.body.classList.add("workspace-resizing");
                }}
              />
            ) : null}
            <TimelinePanel />
          </>
        ) : null}
        {shouldRenderPersistentToolPanel("bg_remove") ? (
          <div className={`persistent-tool-panel${tab === "bg_remove" ? " is-active" : ""}`} aria-hidden={tab !== "bg_remove"}>
            <BackgroundRemovalPanel />
          </div>
        ) : null}
        {shouldRenderPersistentToolPanel("pixel_helper") ? (
          <div className={`persistent-tool-panel${tab === "pixel_helper" ? " is-active" : ""}`} aria-hidden={tab !== "pixel_helper"}>
            <PixelHelperPanel />
          </div>
        ) : null}
        {shouldRenderPersistentToolPanel("leshy_sprite") ? (
          <div className={`persistent-tool-panel${tab === "leshy_sprite" ? " is-active" : ""}`} aria-hidden={tab !== "leshy_sprite"}>
            <LeshySpritePanel />
          </div>
        ) : null}
        {shouldRenderPersistentToolPanel("photo_editor") ? (
          <div className={`persistent-tool-panel${tab === "photo_editor" ? " is-active" : ""}`} aria-hidden={tab !== "photo_editor"}>
            <PhotoEditorPanel />
          </div>
        ) : null}
        {shouldRenderPersistentToolPanel("iopaint") ? (
          <div className={`persistent-tool-panel${tab === "iopaint" ? " is-active" : ""}`} aria-hidden={tab !== "iopaint"}>
            <IOPaintPanel />
          </div>
        ) : null}
      </div>

      {/* ── Status Bar ── */}
      <footer className="status-bar">
        <span>{busy ? "⏳ " + t("status_working") : "✓ " + t("status_ready")}</span>
        <span>{status}</span>
      </footer>

      {/* ── Settings Modal ── */}
      {settingsOpen ? (
        <div className="settings-overlay" onClick={() => setSettingsOpen(false)}>
          <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
            <div className="settings-modal-header">
              <h3>{t("settings")}</h3>
              <button className="ghost" onClick={() => setSettingsOpen(false)}>
                <IconX />
              </button>
            </div>

            <div className="settings-modal-body">
              {/* Theme Selection */}
              <div className="settings-section">
                <span className="settings-section-title">테마</span>
                <div className="theme-selector">
                  <div
                    className={`theme-option ${theme === "dark" ? "active" : ""}`}
                    onClick={() => setTheme("dark")}
                  >
                    <div className="theme-option-preview theme-option-preview-dark">
                      <div className="theme-prev-header" />
                      <div className="theme-prev-body">
                        <div className="theme-prev-sidebar" />
                        <div className="theme-prev-main" />
                        <div className="theme-prev-right" />
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <IconMoon />
                      <span className="theme-option-label">다크</span>
                    </div>
                  </div>

                  <div
                    className={`theme-option ${theme === "light" ? "active" : ""}`}
                    onClick={() => setTheme("light")}
                  >
                    <div className="theme-option-preview theme-option-preview-light">
                      <div className="theme-prev-header" />
                      <div className="theme-prev-body">
                        <div className="theme-prev-sidebar" />
                        <div className="theme-prev-main" />
                        <div className="theme-prev-right" />
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <IconSun />
                      <span className="theme-option-label">라이트</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* App Info */}
              <div className="settings-section">
                <span className="settings-section-title">정보</span>
                <p className="settings-info">Sprite Studio v1.0.2</p>
              </div>
            </div>

            <div className="settings-modal-footer">
              <button className="accent" onClick={() => setSettingsOpen(false)}>
                {t("close")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
