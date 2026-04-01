import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "../i18n";

const PHOTO_EDITOR_BUNDLE_VERSION = "2026-03-31-ko-pan";
const PHOTO_EDITOR_HOST_ID = "sprite-forge-photo-editor-host";

function buildSelectionNudgePatch(mainScriptUrl: string, hostSelector: string): string {
  return `
const HOST_SELECTOR = ${JSON.stringify(hostSelector)};
const getHostRoot = () => document.querySelector(HOST_SELECTOR);
const getStore = () => {
  const hostRoot = getHostRoot();
  const root = hostRoot ? hostRoot.querySelector("#app") : null;
  return root && root.__vue_app__ && root.__vue_app__.config && root.__vue_app__.config.globalProperties
    ? root.__vue_app__.config.globalProperties.$store
    : null;
};

const TOOL_ID = "sprite-forge-cut-move-tool";
const TOOL_STYLE_ID = "sprite-forge-cut-move-style";
const TOOL_ACTIVE_CLASS = "sprite-forge-cut-move-tool-active";
const TOOL_ICON_URL = new URL("./icons/tool-Arrange.svg", ${JSON.stringify(mainScriptUrl)}).toString();
const TOOL_TOOLTIP = "활성화된 선택 요소, 선택한 영역을 드래그하여 이동 또는 자르세요";
const ORIGINAL_COMMIT_KEY = "__spriteForgeOriginalStoreCommit";
const FLOATING_STATE_KEY = "__spriteForgeFloatingSelectionState";
const PREVIOUS_TOOL_KEY = "__spriteForgeCutMovePreviousTool";
const ALT_STATE_KEY = "__spriteForgeAltPressed";

const isToolActive = () => window.__spriteForgeCutMoveToolActive === true;
const setToolActive = (next) => {
  window.__spriteForgeCutMoveToolActive = next;
  window.__spriteForgeSuppressCutMoveNotification = next;
  const button = document.getElementById(TOOL_ID);
  if (button) {
    button.classList.toggle("active", next);
    button.classList.toggle(TOOL_ACTIVE_CLASS, next);
    button.setAttribute("aria-pressed", next ? "true" : "false");
    button.setAttribute("title", TOOL_TOOLTIP);
    button.setAttribute("aria-label", TOOL_TOOLTIP);
  }
};

const cloneSelectionPoints = (points) => Array.isArray(points)
  ? points.map((point) => ({ x: point.x, y: point.y }))
  : [];
const shiftSelection = (points, dx, dy) => [
  points.map((point) => ({ x: point.x + dx, y: point.y + dy }))
];
const getFloatingSelectionState = () => window[FLOATING_STATE_KEY] || null;
const setFloatingSelectionState = (state) => {
  window[FLOATING_STATE_KEY] = state;
};
const clearFloatingSelectionState = () => {
  window[FLOATING_STATE_KEY] = null;
};
const setPreviousTool = (tool) => {
  window[PREVIOUS_TOOL_KEY] = tool ?? null;
};
const getPreviousTool = () => window[PREVIOUS_TOOL_KEY] ?? null;
const isAltTrackedDown = () => window[ALT_STATE_KEY] === true;
const setAltTrackedDown = (next) => {
  window[ALT_STATE_KEY] = next;
};
const ensureNotificationPatch = (store) => {
  if (!store || store[ORIGINAL_COMMIT_KEY]) {
    return;
  }
  store[ORIGINAL_COMMIT_KEY] = store.commit.bind(store);
  store.commit = (type, payload, options) => {
    if (window.__spriteForgeSuppressCutMoveNotification && type === "showNotification") {
      return;
    }
    return store[ORIGINAL_COMMIT_KEY](type, payload, options);
  };
};

const isTypingTarget = (target) => {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const tag = target.tagName.toLowerCase();
  return target.isContentEditable || tag === "input" || tag === "textarea" || tag === "select";
};

const getSelectionPoints = (selection) => (
  Array.isArray(selection) && Array.isArray(selection[0]) ? selection[0] : null
);

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

const getCanvasForDocument = (activeDocument) => {
  if (!activeDocument) {
    return null;
  }
  const hostRoot = getHostRoot();
  if (!hostRoot) {
    return null;
  }
  const canvases = Array.from(hostRoot.querySelectorAll("canvas")).filter((canvas) => {
    if (!(canvas instanceof HTMLCanvasElement)) {
      return false;
    }
    const rect = canvas.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  });

  let bestCanvas = null;
  let bestScore = Infinity;
  for (const canvas of canvases) {
    const widthScore = Math.abs((canvas.width || 0) - (activeDocument.width || 0));
    const heightScore = Math.abs((canvas.height || 0) - (activeDocument.height || 0));
    const score = widthScore + heightScore;
    if (!bestCanvas || score < bestScore) {
      bestCanvas = canvas;
      bestScore = score;
    }
  }
  return bestCanvas;
};

const clientPointToDocumentPoint = (clientX, clientY, activeDocument) => {
  const canvas = getCanvasForDocument(activeDocument);
  if (!canvas) {
    return null;
  }
  const rect = canvas.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    return null;
  }
  const scaleX = activeDocument && activeDocument.width ? activeDocument.width / rect.width : canvas.width / rect.width;
  const scaleY = activeDocument && activeDocument.height ? activeDocument.height / rect.height : canvas.height / rect.height;
  return {
    x: (clientX - rect.left) * scaleX,
    y: (clientY - rect.top) * scaleY
  };
};

const isPointInsideBounds = (point, bounds) => {
  if (!point || !bounds) {
    return false;
  }
  return point.x >= bounds.left
    && point.x <= bounds.left + bounds.width
    && point.y >= bounds.top
    && point.y <= bounds.top + bounds.height;
};

const cloneCanvas = (source) => {
  if (!(source instanceof HTMLCanvasElement)) {
    return null;
  }
  const copy = document.createElement("canvas");
  copy.width = source.width;
  copy.height = source.height;
  const ctx = copy.getContext("2d");
  if (!ctx) {
    return null;
  }
  ctx.drawImage(source, 0, 0);
  return copy;
};

const buildSelectionPath = (ctx, points, offsetX, offsetY) => {
  if (!ctx || !points || !points.length) {
    return false;
  }
  ctx.beginPath();
  points.forEach((point, index) => {
    const x = point.x + offsetX;
    const y = point.y + offsetY;
    if (index === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });
  ctx.closePath();
  return true;
};

const removeFloatingOverlay = (state) => {
  if (state && state.overlayCanvas && state.overlayCanvas.parentNode) {
    state.overlayCanvas.parentNode.removeChild(state.overlayCanvas);
  }
  if (state) {
    state.overlayCanvas = null;
  }
};

const syncFloatingOverlay = (activeDocument, state) => {
  if (!activeDocument || !state || !(state.cutCanvas instanceof HTMLCanvasElement)) {
    return;
  }
  const canvas = getCanvasForDocument(activeDocument);
  if (!canvas) {
    return;
  }
  const rect = canvas.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    return;
  }
  const deviceScale = window.devicePixelRatio || 1;
  let overlay = state.overlayCanvas;
  if (!(overlay instanceof HTMLCanvasElement)) {
    overlay = document.createElement("canvas");
    overlay.style.position = "fixed";
    overlay.style.pointerEvents = "none";
    overlay.style.zIndex = "9999";
    overlay.style.left = "0";
    overlay.style.top = "0";
    document.body.appendChild(overlay);
    state.overlayCanvas = overlay;
  }
  overlay.width = Math.max(1, Math.round(rect.width * deviceScale));
  overlay.height = Math.max(1, Math.round(rect.height * deviceScale));
  overlay.style.width = rect.width + "px";
  overlay.style.height = rect.height + "px";
  overlay.style.left = rect.left + "px";
  overlay.style.top = rect.top + "px";
  const ctx = overlay.getContext("2d");
  if (!ctx) {
    return;
  }
  ctx.setTransform(deviceScale, 0, 0, deviceScale, 0, 0);
  ctx.clearRect(0, 0, rect.width, rect.height);
  const scaleX = rect.width / activeDocument.width;
  const scaleY = rect.height / activeDocument.height;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(
    state.cutCanvas,
    (state.bounds.left + state.currentDx) * scaleX,
    (state.bounds.top + state.currentDy) * scaleY,
    state.cutCanvas.width * scaleX,
    state.cutCanvas.height * scaleY
  );
};

const commitFloatingSelection = (store, activeDocument, state) => {
  if (!store || !activeDocument || !state) {
    return;
  }
  const layer = activeDocument.layers[state.layerIndex];
  if (!layer || !(layer.source instanceof HTMLCanvasElement)) {
    removeFloatingOverlay(state);
    clearFloatingSelectionState();
    return;
  }
  const merged = cloneCanvas(layer.source);
  const mergedCtx = merged && merged.getContext("2d");
  if (!merged || !mergedCtx) {
    removeFloatingOverlay(state);
    clearFloatingSelectionState();
    return;
  }
  mergedCtx.drawImage(
    state.cutCanvas,
    Math.round(state.bounds.left + state.currentDx - state.layerLeft),
    Math.round(state.bounds.top + state.currentDy - state.layerTop)
  );
  store.commit("updateLayer", {
    index: state.layerIndex,
    opts: {
      source: merged,
      width: merged.width,
      height: merged.height
    }
  });
  removeFloatingOverlay(state);
  clearFloatingSelectionState();
};

const ensureFloatingSelection = (store, activeDocument, activeLayer, activeLayerIndex, selectionPoints, bounds) => {
  if (!store || !activeDocument || !activeLayer || activeLayerIndex < 0 || !selectionPoints || !bounds) {
    return null;
  }

  const existingState = getFloatingSelectionState();
  if (existingState && existingState.layerIndex === activeLayerIndex) {
    syncFloatingOverlay(activeDocument, existingState);
    return existingState;
  }

  if (!(activeLayer.source instanceof HTMLCanvasElement)) {
    return null;
  }

  const layerLeft = Math.round(activeLayer.left ?? 0);
  const layerTop = Math.round(activeLayer.top ?? 0);
  const sourceX = Math.round(bounds.left - layerLeft);
  const sourceY = Math.round(bounds.top - layerTop);

  const cutCanvas = document.createElement("canvas");
  cutCanvas.width = Math.max(1, bounds.width);
  cutCanvas.height = Math.max(1, bounds.height);
  const cutCtx = cutCanvas.getContext("2d");
  if (!cutCtx) {
    return null;
  }

  cutCtx.save();
  if (!buildSelectionPath(cutCtx, selectionPoints, -bounds.left, -bounds.top)) {
    cutCtx.restore();
    return null;
  }
  cutCtx.clip();
  cutCtx.drawImage(activeLayer.source, sourceX, sourceY, bounds.width, bounds.height, 0, 0, bounds.width, bounds.height);
  cutCtx.restore();

  const clearedCanvas = cloneCanvas(activeLayer.source);
  const clearedCtx = clearedCanvas && clearedCanvas.getContext("2d");
  if (!clearedCanvas || !clearedCtx) {
    return null;
  }
  clearedCtx.save();
  clearedCtx.globalCompositeOperation = "destination-out";
  if (!buildSelectionPath(clearedCtx, selectionPoints, -layerLeft, -layerTop)) {
    clearedCtx.restore();
    return null;
  }
  clearedCtx.fill();
  clearedCtx.restore();

  store.commit("updateLayer", {
    index: activeLayerIndex,
    opts: {
      source: clearedCanvas,
      width: clearedCanvas.width,
      height: clearedCanvas.height
    }
  });

  const nextState = {
    documentName: activeDocument.name ?? "",
    layerIndex: activeLayerIndex,
    layerLeft,
    layerTop,
    selectionPoints: cloneSelectionPoints(selectionPoints),
    bounds: { ...bounds },
    currentDx: 0,
    currentDy: 0,
    cutCanvas,
    overlayCanvas: null
  };
  setFloatingSelectionState(nextState);
  syncFloatingOverlay(activeDocument, nextState);
  return nextState;
};

const getToolbarButtons = () => {
  const hostRoot = getHostRoot();
  if (!hostRoot) {
    return [];
  }
  const candidates = Array.from(hostRoot.querySelectorAll("button")).filter((button) => {
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
      #\${TOOL_ID} img {
        pointer-events: none;
      }
    \`;
    document.head.appendChild(style);
  }

  const existing = document.getElementById(TOOL_ID);
  if (existing && existing.isConnected) {
    existing.classList.toggle("active", isToolActive());
    existing.classList.toggle(TOOL_ACTIVE_CLASS, isToolActive());
    existing.setAttribute("aria-pressed", isToolActive() ? "true" : "false");
    existing.setAttribute("title", TOOL_TOOLTIP);
    existing.setAttribute("aria-label", TOOL_TOOLTIP);
    return existing;
  }

  const toolbarButtons = getToolbarButtons();
  const anchor = toolbarButtons[2] ?? toolbarButtons[0] ?? null;
  if (!anchor || !anchor.parentElement) {
    return null;
  }

  const button = anchor.cloneNode(true);
  button.id = TOOL_ID;
  button.type = "button";
  button.disabled = false;
  button.classList.remove("active");
  button.classList.remove(TOOL_ACTIVE_CLASS);
  button.setAttribute("title", TOOL_TOOLTIP);
  button.setAttribute("aria-label", TOOL_TOOLTIP);
  button.setAttribute("aria-pressed", "false");

  const icon = button.querySelector("img");
  if (icon) {
    icon.src = TOOL_ICON_URL;
    icon.alt = "";
    icon.draggable = false;
    icon.setAttribute("aria-hidden", "true");
  } else {
    const fallbackIcon = document.createElement("img");
    fallbackIcon.src = TOOL_ICON_URL;
    fallbackIcon.alt = "";
    fallbackIcon.draggable = false;
    fallbackIcon.setAttribute("aria-hidden", "true");
    button.replaceChildren(fallbackIcon);
  }

  const activateTool = async (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === "function") {
      event.stopImmediatePropagation();
    }

    const nextActive = !isToolActive();
    setToolActive(nextActive);

    const store = getStore();
    const activeDocument = store && store.getters ? store.getters.activeDocument : null;

    if (!store || !activeDocument) {
      if (!nextActive) clearFloatingSelectionState();
      return;
    }
    ensureNotificationPatch(store);

    if (nextActive) {
      setPreviousTool(store.getters ? store.getters.activeTool : null);
      store.commit("setActiveTool", { tool: null, document: activeDocument });
      return;
    }

    const floatingState = getFloatingSelectionState();
    if (floatingState) {
      commitFloatingSelection(store, activeDocument, floatingState);
    }
    clearFloatingSelectionState();
    const previousTool = getPreviousTool();
    setPreviousTool(null);
    store.commit("setActiveTool", { tool: previousTool, document: activeDocument });
  };

  button.addEventListener("pointerdown", activateTool, true);
  button.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      activateTool(event);
    }
  }, true);
  anchor.parentElement.insertBefore(button, anchor);
  button.classList.toggle("active", isToolActive());
  button.classList.toggle(TOOL_ACTIVE_CLASS, isToolActive());
  button.setAttribute("aria-pressed", isToolActive() ? "true" : "false");
  return button;
};

const dispatchAltRelease = () => {
  if (!isAltTrackedDown()) {
    return;
  }
  setAltTrackedDown(false);
  const altUp = new KeyboardEvent("keyup", {
    key: "Alt",
    code: "AltLeft",
    keyCode: 18,
    which: 18,
    bubbles: true,
    cancelable: true
  });
  window.dispatchEvent(altUp);
  document.dispatchEvent(altUp);
};

const ensurePatched = async () => {
  const mod = await import(${JSON.stringify(mainScriptUrl)});
  if (typeof window.__spriteForgePhotoEditorCleanup === "function") {
    window.__spriteForgePhotoEditorCleanup();
  }
  if (window.__spriteForgePhotoEditorPatched) {
    return;
  }

  window.__spriteForgePhotoEditorPatched = true;
  ensureNotificationPatch(getStore());
  ensureToolButton();
  setToolActive(false);
  clearFloatingSelectionState();

  let dragState = null;

  const observer = new MutationObserver(() => {
    ensureToolButton();
  });
  const hostRoot = getHostRoot();
  if (hostRoot) {
    observer.observe(hostRoot, { childList: true, subtree: true });
  }

  const onTrackAltKeyDown = (event) => {
    if (event.key === "Alt") {
      setAltTrackedDown(true);
    }
  };

  const onTrackAltKeyUp = (event) => {
    if (event.key === "Alt") {
      setAltTrackedDown(false);
    }
  };

  const onWindowBlur = () => {
    dispatchAltRelease();
  };

  const onVisibilityChange = () => {
    if (document.hidden) {
      dispatchAltRelease();
    }
  };

  const onPointerDownAltReset = (event) => {
    if (!event.altKey) {
      dispatchAltRelease();
    }
  };

  const onPointerDownCutMove = async (event) => {
    if (!isToolActive() || event.button !== 0 || isTypingTarget(event.target)) {
      return;
    }

    const store = getStore();
    const activeDocument = store && store.getters ? store.getters.activeDocument : null;
    const activeLayer = store && store.getters ? store.getters.activeLayer : null;
    const activeLayerIndex = store && store.getters ? store.getters.activeLayerIndex : -1;
    const selectionPoints = activeDocument ? getSelectionPoints(activeDocument.activeSelection) : null;
    const bounds = getSelectionBounds(selectionPoints);
    if (!store || !activeDocument || !activeLayer || activeLayerIndex < 0 || !selectionPoints || !bounds) {
      return;
    }

    const documentPoint = clientPointToDocumentPoint(event.clientX, event.clientY, activeDocument);
    if (!isPointInsideBounds(documentPoint, bounds)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === "function") {
      event.stopImmediatePropagation();
    }

    const materialized = ensureFloatingSelection(
      store,
      activeDocument,
      activeLayer,
      activeLayerIndex,
      selectionPoints,
      bounds
    );
    if (!materialized) {
      return;
    }

    store.commit("setActiveLayerIndex", materialized.layerIndex);
    dragState = {
      pointerId: event.pointerId,
      startPoint: documentPoint,
      baseDx: materialized.currentDx ?? 0,
      baseDy: materialized.currentDy ?? 0
    };
  };

  const onPointerMoveCutMove = (event) => {
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    const store = getStore();
    const activeDocument = store && store.getters ? store.getters.activeDocument : null;
    if (!store || !activeDocument) {
      return;
    }

    const documentPoint = clientPointToDocumentPoint(event.clientX, event.clientY, activeDocument);
    if (!documentPoint) {
      return;
    }

    const floatingState = getFloatingSelectionState();
    if (!floatingState) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === "function") {
      event.stopImmediatePropagation();
    }

    floatingState.currentDx = dragState.baseDx + Math.round(documentPoint.x - dragState.startPoint.x);
    floatingState.currentDy = dragState.baseDy + Math.round(documentPoint.y - dragState.startPoint.y);
    syncFloatingOverlay(activeDocument, floatingState);
    store.commit(
      "setActiveSelection",
      shiftSelection(floatingState.selectionPoints, floatingState.currentDx, floatingState.currentDy)
    );
  };

  const onPointerUpCutMove = (event) => {
    if (dragState && dragState.pointerId === event.pointerId) {
      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === "function") {
        event.stopImmediatePropagation();
      }
      dragState = null;
    }
  };

  const onPointerCancelCutMove = (event) => {
    if (dragState && dragState.pointerId === event.pointerId) {
      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === "function") {
        event.stopImmediatePropagation();
      }
      dragState = null;
    }
  };

  const onEditorKeyDown = async (event) => {
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
    const isEscapeKey = event.key === "Escape";

    if (isEscapeKey && store && activeDocument && selectionPoints) {
      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === "function") {
        event.stopImmediatePropagation();
      }
      const floatingState = getFloatingSelectionState();
      if (floatingState) {
        commitFloatingSelection(store, activeDocument, floatingState);
      }
      await store.dispatch("clearSelection");
      clearFloatingSelectionState();
      setToolActive(false);
      const previousTool = getPreviousTool();
      setPreviousTool(null);
      store.commit("setActiveTool", { tool: previousTool, document: activeDocument });
      return;
    }

    if (isDeleteKey && store && activeDocument && activeLayer && selectionPoints && bounds) {
      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === "function") {
        event.stopImmediatePropagation();
      }
      await store.dispatch("deleteInSelection");
      clearFloatingSelectionState();
      return;
    }

    if (!isToolActive()) {
      return;
    }

    const stepX = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
    const stepY = event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : 0;
    if (stepX === 0 && stepY === 0) {
      return;
    }

    if (!store || !activeDocument || !activeLayer || !selectionPoints || !bounds) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === "function") {
      event.stopImmediatePropagation();
    }

    const deltaX = stepX * (event.shiftKey ? 10 : 1);
    const deltaY = stepY * (event.shiftKey ? 10 : 1);

    const materialized = ensureFloatingSelection(
      store,
      activeDocument,
      activeLayer,
      activeLayerIndex,
      selectionPoints,
      bounds
    );
    if (!materialized) {
      return;
    }

    materialized.currentDx += deltaX;
    materialized.currentDy += deltaY;
    store.commit("setActiveLayerIndex", materialized.layerIndex);
    store.commit(
      "setActiveSelection",
      shiftSelection(materialized.selectionPoints, materialized.currentDx, materialized.currentDy)
    );
    syncFloatingOverlay(activeDocument, materialized);

    const editor = mod.y();
    editor && editor.interactionPane && editor.interactionPane.stayOnTop && editor.interactionPane.stayOnTop();
  };

  window.addEventListener("keydown", onTrackAltKeyDown, true);
  window.addEventListener("keyup", onTrackAltKeyUp, true);
  window.addEventListener("blur", onWindowBlur, true);
  document.addEventListener("visibilitychange", onVisibilityChange);
  window.addEventListener("pointerdown", onPointerDownAltReset, true);
  window.addEventListener("pointerdown", onPointerDownCutMove, true);
  window.addEventListener("pointermove", onPointerMoveCutMove, true);
  window.addEventListener("pointerup", onPointerUpCutMove, true);
  window.addEventListener("pointercancel", onPointerCancelCutMove, true);
  window.addEventListener("keydown", onEditorKeyDown, true);

  window.__spriteForgePhotoEditorCleanup = () => {
    observer.disconnect();
    dragState = null;
    const floatingState = getFloatingSelectionState();
    if (floatingState) {
      removeFloatingOverlay(floatingState);
    }
    clearFloatingSelectionState();
    setToolActive(false);
    window.__spriteForgeSuppressCutMoveNotification = false;
    window.removeEventListener("keydown", onTrackAltKeyDown, true);
    window.removeEventListener("keyup", onTrackAltKeyUp, true);
    window.removeEventListener("blur", onWindowBlur, true);
    document.removeEventListener("visibilitychange", onVisibilityChange);
    window.removeEventListener("pointerdown", onPointerDownAltReset, true);
    window.removeEventListener("pointerdown", onPointerDownCutMove, true);
    window.removeEventListener("pointermove", onPointerMoveCutMove, true);
    window.removeEventListener("pointerup", onPointerUpCutMove, true);
    window.removeEventListener("pointercancel", onPointerCancelCutMove, true);
    window.removeEventListener("keydown", onEditorKeyDown, true);
    const button = document.getElementById(TOOL_ID);
    if (button) {
      button.remove();
    }
    const style = document.getElementById(TOOL_STYLE_ID);
    if (style) {
      style.remove();
    }
    window.__spriteForgePhotoEditorPatched = false;
    window.__spriteForgePhotoEditorCleanup = null;
  };
};

ensurePatched();
`;
}

export function PhotoEditorPanel(): JSX.Element {
  const { t } = useI18n();
  const [editorKey, setEditorKey] = useState(0);
  const hostRef = useRef<HTMLDivElement | null>(null);

  const { mainScriptUrl, styleUrl } = useMemo(() => {
    if (typeof window === "undefined") {
      return {
        mainScriptUrl: `bitmappery/assets/index-7j50M8El.js?v=${PHOTO_EDITOR_BUNDLE_VERSION}&editor=0`,
        styleUrl: `bitmappery/assets/style-BippZVWk.css?v=${PHOTO_EDITOR_BUNDLE_VERSION}`
      };
    }
    const script = new URL("bitmappery/assets/index-7j50M8El.js", window.location.href);
    script.searchParams.set("v", PHOTO_EDITOR_BUNDLE_VERSION);
    script.searchParams.set("editor", String(editorKey));
    const style = new URL("bitmappery/assets/style-BippZVWk.css", window.location.href);
    style.searchParams.set("v", PHOTO_EDITOR_BUNDLE_VERSION);
    return {
      mainScriptUrl: script.toString(),
      styleUrl: style.toString()
    };
  }, [editorKey]);

  useEffect(() => {
    if (typeof window === "undefined" || !hostRef.current) {
      return;
    }

    const host = hostRef.current;
    const previousMount = host.querySelector<HTMLElement>("#app");
    const previousVueApp = previousMount && "__vue_app__" in previousMount
      ? (previousMount as HTMLElement & { __vue_app__?: { unmount?: () => void } }).__vue_app__
      : undefined;
    if (previousVueApp && typeof previousVueApp.unmount === "function") {
      previousVueApp.unmount();
    }

    const spriteWindow = window as Window & {
      __spriteForgePhotoEditorCleanup?: (() => void) | null;
      __spriteForgePhotoEditorPatched?: boolean;
    };

    if (typeof spriteWindow.__spriteForgePhotoEditorCleanup === "function") {
      spriteWindow.__spriteForgePhotoEditorCleanup();
    }
    spriteWindow.__spriteForgePhotoEditorPatched = false;

    host.replaceChildren();

    let styleLink = document.getElementById("sprite-forge-bitmappery-style") as HTMLLinkElement | null;
    if (!styleLink) {
      styleLink = document.createElement("link");
      styleLink.id = "sprite-forge-bitmappery-style";
      styleLink.rel = "stylesheet";
      document.head.appendChild(styleLink);
    }
    styleLink.href = styleUrl;

    const mountRoot = document.createElement("div");
    mountRoot.id = "app";
    mountRoot.className = "photo-editor-direct-root";
    host.appendChild(mountRoot);

    const script = document.createElement("script");
    script.type = "module";
    script.textContent = buildSelectionNudgePatch(mainScriptUrl, `#${PHOTO_EDITOR_HOST_ID}`);
    host.appendChild(script);

    return () => {
      const currentMount = host.querySelector<HTMLElement>("#app");
      const currentVueApp = currentMount && "__vue_app__" in currentMount
        ? (currentMount as HTMLElement & { __vue_app__?: { unmount?: () => void } }).__vue_app__
        : undefined;
      if (currentVueApp && typeof currentVueApp.unmount === "function") {
        currentVueApp.unmount();
      }
      if (typeof spriteWindow.__spriteForgePhotoEditorCleanup === "function") {
        spriteWindow.__spriteForgePhotoEditorCleanup();
      }
      spriteWindow.__spriteForgePhotoEditorPatched = false;
      script.remove();
      host.replaceChildren();
    };
  }, [mainScriptUrl, styleUrl]);

  return (
    <section className="panel photo-editor-page">
      <div className="photo-editor-header">
        <div>
          <h2>{t("photo_editor_title")}</h2>
          <p className="muted">{t("photo_editor_desc")}</p>
        </div>
        <div className="row-buttons">
          <button type="button" onClick={() => setEditorKey((value) => value + 1)}>
            {t("photo_editor_reload")}
          </button>
        </div>
      </div>

      <div ref={hostRef} id={PHOTO_EDITOR_HOST_ID} className="photo-editor-shell" aria-label={t("photo_editor_title")} />
    </section>
  );
}
