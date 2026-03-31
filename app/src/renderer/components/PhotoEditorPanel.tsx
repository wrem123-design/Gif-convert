import { useMemo, useRef, useState } from "react";
import { useI18n } from "../i18n";

const PHOTO_EDITOR_BUNDLE_VERSION = "2026-03-31-ko-pan";

function buildSelectionNudgePatch(mainScriptUrl: string): string {
  return `
const getStore = () => {
  const root = document.getElementById("app");
  return root && root.__vue_app__ && root.__vue_app__.config && root.__vue_app__.config.globalProperties
    ? root.__vue_app__.config.globalProperties.$store
    : null;
};

const TOOL_ID = "sprite-forge-cut-move-tool";
const TOOL_STYLE_ID = "sprite-forge-cut-move-style";
const TOOL_ACTIVE_CLASS = "sprite-forge-cut-move-tool-active";
const originalCommitKey = "__spriteForgeOriginalStoreCommit";
const isToolActive = () => window.__spriteForgeCutMoveToolActive === true;
const setToolActive = (next) => {
  window.__spriteForgeCutMoveToolActive = next;
  const button = document.getElementById(TOOL_ID);
  if (button) {
    button.classList.toggle("active", next);
    button.classList.toggle(TOOL_ACTIVE_CLASS, next);
    button.setAttribute("aria-pressed", next ? "true" : "false");
  }
};

const isTypingTarget = (target) => {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const tag = target.tagName.toLowerCase();
  return target.isContentEditable || tag === "input" || tag === "textarea" || tag === "select";
};

const getSelectionPoints = (selection) => Array.isArray(selection) && Array.isArray(selection[0]) ? selection[0] : null;
const getSelectionBounds = (points) => {
  if (!points || !points.length) {
    return null;
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  return {
    left: Math.round(minX),
    top: Math.round(minY),
    width: Math.max(1, Math.round(maxX - minX)),
    height: Math.max(1, Math.round(maxY - minY))
  };
};

const shiftSelection = (points, dx, dy) => [points.map((point) => ({ x: point.x + dx, y: point.y + dy }))];
const looksLikeFloatingLayer = (layer, bounds) => {
  if (!layer || !bounds) {
    return false;
  }
  return Math.round(layer.left ?? 0) === bounds.left
    && Math.round(layer.top ?? 0) === bounds.top
    && Math.round(layer.width ?? 0) === bounds.width
    && Math.round(layer.height ?? 0) === bounds.height;
};

const runWithoutNotifications = async (store, callback) => {
  if (!store[originalCommitKey]) {
    store[originalCommitKey] = store.commit.bind(store);
    store.commit = (type, payload, options) => {
      if (window.__spriteForgeSuppressCutMoveNotification && type === "showNotification") {
        return;
      }
      return store[originalCommitKey](type, payload, options);
    };
  }

  window.__spriteForgeSuppressCutMoveNotification = true;
  try {
    return await callback();
  } finally {
    window.__spriteForgeSuppressCutMoveNotification = false;
  }
};

const getToolbarButtons = () => {
  const candidates = Array.from(document.querySelectorAll("button")).filter((button) => {
    if (!(button instanceof HTMLButtonElement) || button.id === TOOL_ID) {
      return false;
    }
    const rect = button.getBoundingClientRect();
    return rect.left >= 0
      && rect.left <= 80
      && rect.top >= 40
      && rect.width >= 24
      && rect.width <= 56
      && rect.height >= 24
      && rect.height <= 56;
  });

  const groups = new Map();
  for (const button of candidates) {
    const parent = button.parentElement;
    if (!parent) {
      continue;
    }
    const group = groups.get(parent) ?? [];
    group.push(button);
    groups.set(parent, group);
  }

  let toolbarButtons = [];
  for (const group of groups.values()) {
    if (group.length > toolbarButtons.length) {
      toolbarButtons = group;
    }
  }

  return toolbarButtons
    .slice()
    .sort((left, right) => left.getBoundingClientRect().top - right.getBoundingClientRect().top);
};

const ensureToolButton = () => {
  if (!document.getElementById(TOOL_STYLE_ID)) {
    const style = document.createElement("style");
    style.id = TOOL_STYLE_ID;
    style.textContent = \`
      #\${TOOL_ID} {
        display: flex;
        align-items: center;
        justify-content: center;
      }
      #\${TOOL_ID}.\${TOOL_ACTIVE_CLASS} {
        box-shadow: inset 0 0 0 2px #17d9ff;
      }
      #\${TOOL_ID} svg {
        width: 18px;
        height: 18px;
        pointer-events: none;
      }
    \`;
    document.head.appendChild(style);
  }

  const existing = document.getElementById(TOOL_ID);
  if (existing && existing.isConnected) {
    return existing;
  }

  const toolbarButtons = getToolbarButtons();
  const anchor = toolbarButtons[2] ?? toolbarButtons[0] ?? null;
  if (!anchor || !anchor.parentElement) {
    return null;
  }

  const button = anchor.cloneNode(false);
  button.id = TOOL_ID;
  button.classList.remove("active");
  button.classList.remove(TOOL_ACTIVE_CLASS);
  button.title = "자르기 이동 도구";
  button.setAttribute("aria-label", "자르기 이동 도구");
  button.setAttribute("aria-pressed", "false");
  button.innerHTML = \`
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M8 4v16"></path>
      <path d="M4 8h8"></path>
      <path d="M10 14l7-7"></path>
      <path d="M14 10h3v3"></path>
      <path d="M10 18h8"></path>
    </svg>
  \`;
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    setToolActive(!isToolActive());
  });
  anchor.parentElement.insertBefore(button, anchor);
  return button;
};

const ensurePatched = async () => {
  const mod = await import(${JSON.stringify(mainScriptUrl)});
  if (window.__spriteForgePhotoEditorPatched) {
    return;
  }
  window.__spriteForgePhotoEditorPatched = true;
  ensureToolButton();
  setToolActive(false);
  const observer = new MutationObserver(() => {
    ensureToolButton();
  });
  observer.observe(document.body, { childList: true, subtree: true });

  window.addEventListener("keydown", async (event) => {
    if (isTypingTarget(event.target)) {
      return;
    }
    const store = getStore();
    const activeDocument = store && store.getters ? store.getters.activeDocument : null;
    const activeLayer = store && store.getters ? store.getters.activeLayer : null;
    const activeLayerIndex = store && store.getters ? store.getters.activeLayerIndex : -1;
    const selectionPoints = activeDocument ? getSelectionPoints(activeDocument.activeSelection) : null;
    const bounds = getSelectionBounds(selectionPoints);
    const isDeleteKey = event.key === "Delete" || event.key === "Backspace";

    if (isDeleteKey && store && activeDocument && activeLayer && selectionPoints && bounds) {
      event.preventDefault();
      event.stopPropagation();
      await store.dispatch("deleteInSelection");
      return;
    }

    if (!isToolActive()) {
      return;
    }
    const stepX = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
    const stepY = event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : 0;
    if (stepX === 0 && stepY === 0) {
      if (event.key === "Escape") {
        setToolActive(false);
      }
      return;
    }

    if (!store || !activeDocument || !activeLayer || !selectionPoints || !bounds) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const deltaX = stepX * (event.shiftKey ? 10 : 1);
    const deltaY = stepY * (event.shiftKey ? 10 : 1);
    const targetLeft = bounds.left + deltaX;
    const targetTop = bounds.top + deltaY;

    if (!event.altKey && looksLikeFloatingLayer(activeLayer, bounds) && activeLayerIndex >= 0) {
      store.commit("updateLayer", {
        index: activeLayerIndex,
        opts: {
          left: targetLeft,
          top: targetTop
        }
      });
      store.commit("setActiveSelection", shiftSelection(selectionPoints, deltaX, deltaY));
      return;
    }

    await runWithoutNotifications(store, async () => {
      if (event.altKey) {
        await store.dispatch("requestSelectionCopy", { merged: false, isCut: false });
      } else {
        await store.dispatch("requestSelectionCut");
      }
      await store.dispatch("pasteSelection");
    });

    const nextDocument = store.getters.activeDocument;
    const nextLayerIndex = nextDocument.layers.length - 1;
    store.commit("updateLayer", {
      index: nextLayerIndex,
      opts: {
        left: targetLeft,
        top: targetTop
      }
    });
    store.commit("setActiveLayerIndex", nextLayerIndex);
    store.commit("setActiveSelection", shiftSelection(selectionPoints, deltaX, deltaY));
    store.commit("setActiveTool", { tool: "selection", document: nextDocument });

    const editor = mod.y();
    editor && editor.interactionPane && editor.interactionPane.stayOnTop && editor.interactionPane.stayOnTop();
  }, true);
};

ensurePatched();
`;
}

export function PhotoEditorPanel(): JSX.Element {
  const { t } = useI18n();
  const [frameKey, setFrameKey] = useState(0);
  const frameRef = useRef<HTMLIFrameElement | null>(null);

  const editorUrl = useMemo(() => {
    if (typeof window === "undefined") {
      return `bitmappery/index.html?v=${PHOTO_EDITOR_BUNDLE_VERSION}`;
    }
    const url = new URL("bitmappery/index.html", window.location.href);
    url.searchParams.set("v", PHOTO_EDITOR_BUNDLE_VERSION);
    return url.toString();
  }, []);

  const patchEmbeddedEditor = (): void => {
    const frame = frameRef.current;
    const doc = frame?.contentDocument;
    const win = frame?.contentWindow as (Window & { __spriteForgePhotoEditorPatchBooted?: boolean }) | null;
    if (!frame || !doc || !win || win.__spriteForgePhotoEditorPatchBooted) {
      return;
    }

    const mainScriptUrl = doc.querySelector<HTMLScriptElement>('script[type="module"][src]')?.src;
    if (!mainScriptUrl) {
      return;
    }

    const script = doc.createElement("script");
    script.type = "module";
    script.textContent = buildSelectionNudgePatch(mainScriptUrl);
    doc.head.appendChild(script);
    win.__spriteForgePhotoEditorPatchBooted = true;
  };

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
          ref={frameRef}
          key={frameKey}
          className="photo-editor-frame"
          src={editorUrl}
          title={t("photo_editor_title")}
          onLoad={patchEmbeddedEditor}
        />
      </div>
    </section>
  );
}
