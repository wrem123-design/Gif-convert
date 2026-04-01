import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "../i18n";

const PHOTO_EDITOR_BUNDLE_VERSION = "2026-03-31-ko-pan";
const PHOTO_EDITOR_HOST_ID = "sprite-forge-photo-editor-host";

function buildSelectionNudgePatch(mainScriptUrl: string, hostSelector: string, sessionToken: string): string {
  return `
const HOST_SELECTOR = ${JSON.stringify(hostSelector)};
const SESSION_TOKEN = ${JSON.stringify(sessionToken)};
const getHostRoot = () => document.querySelector(HOST_SELECTOR);
const getStore = () => {
  const hostRoot = getHostRoot();
  const root = hostRoot ? hostRoot.querySelector("#app") : null;
  return root && root.__vue_app__ && root.__vue_app__.config && root.__vue_app__.config.globalProperties
    ? root.__vue_app__.config.globalProperties.$store
    : null;
};

const TOOL_ID = "sprite-forge-cut-move-tool";
const CROP_TOOL_ID = "sprite-forge-crop-tool";
const TOOL_STYLE_ID = "sprite-forge-cut-move-style";
const TOOL_ACTIVE_CLASS = "sprite-forge-cut-move-tool-active";
const TOOL_ICON_URL = new URL("./icons/tool-Arrange.svg", ${JSON.stringify(mainScriptUrl)}).toString();
const CROP_TOOL_ICON_URL = new URL("assets/icons/tool-crop.svg", window.location.href).toString();
const TOOL_TOOLTIP = "활성화된 선택 요소, 선택한 영역을 드래그하여 이동 또는 자르세요";
const CROP_TOOL_TOOLTIP = "자르기";
const ORIGINAL_COMMIT_KEY = "__spriteForgeOriginalStoreCommit";
const FLOATING_STATE_KEY = "__spriteForgeFloatingSelectionState";
const PREVIOUS_TOOL_KEY = "__spriteForgeCutMovePreviousTool";
const CROP_PREVIOUS_TOOL_KEY = "__spriteForgeCropPreviousTool";
const ALT_STATE_KEY = "__spriteForgeAltPressed";
const ALT_RELEASE_AT_KEY = "__spriteForgeAltReleasedAt";
const ALT_RELEASE_RAF_KEY = "__spriteForgeAltReleaseRaf";
const POINTER_STATE_KEY = "__spriteForgePointerState";
const FILE_BRIDGE_CLEANUP_KEY = "__spriteForgePhotoEditorFileBridgeCleanup";
const FILE_BRIDGE_BUSY_KEY = "__spriteForgePhotoEditorFileBridgeBusy";
const CROP_STATE_KEY = "__spriteForgeCropState";
const MODULE_KEY = "__spriteForgePhotoEditorModule";
const DIRECT_LAYER_ADD_KEY = "__spriteForgeDirectGraphicLayerAddRequestedAt";
const SESSION_KEY = "__spriteForgePhotoEditorSessionToken";
const PATCHED_TOKEN_KEY = "__spriteForgePhotoEditorPatchedToken";
const ALT_RELEASE_COOLDOWN_MS = 90;

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
const isCropToolActive = () => window.__spriteForgeCropToolActive === true;
const setCropToolActive = (next) => {
  window.__spriteForgeCropToolActive = next;
  const button = document.getElementById(CROP_TOOL_ID);
  if (button) {
    button.classList.toggle("active", next);
    button.classList.toggle(TOOL_ACTIVE_CLASS, next);
    button.setAttribute("aria-pressed", next ? "true" : "false");
    button.setAttribute("title", CROP_TOOL_TOOLTIP);
    button.setAttribute("aria-label", CROP_TOOL_TOOLTIP);
  }
};

const cloneSelectionPoints = (points) => Array.isArray(points)
  ? points.map((point) => ({ x: point.x, y: point.y }))
  : [];
const cloneSelectionShapes = (selection) => Array.isArray(selection)
  ? selection.map((shape) => cloneSelectionPoints(shape))
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
const setCropPreviousTool = (tool) => {
  window[CROP_PREVIOUS_TOOL_KEY] = tool ?? null;
};
const getCropPreviousTool = () => window[CROP_PREVIOUS_TOOL_KEY] ?? null;
const isAltTrackedDown = () => window[ALT_STATE_KEY] === true;
const setAltTrackedDown = (next) => {
  window[ALT_STATE_KEY] = next;
};
const getAltReleaseAt = () => Number(window[ALT_RELEASE_AT_KEY] || 0);
const setAltReleaseAt = (value) => {
  window[ALT_RELEASE_AT_KEY] = value;
};
const clearScheduledAltRefresh = () => {
  const scheduled = Number(window[ALT_RELEASE_RAF_KEY] || 0);
  if (scheduled && typeof window.cancelAnimationFrame === "function") {
    window.cancelAnimationFrame(scheduled);
  }
  window[ALT_RELEASE_RAF_KEY] = 0;
};
const getPointerState = () => window[POINTER_STATE_KEY] || null;
const setPointerState = (state) => {
  window[POINTER_STATE_KEY] = state;
};
const getCropState = () => window[CROP_STATE_KEY] || null;
const setCropState = (state) => {
  window[CROP_STATE_KEY] = state;
};
const clearCropState = () => {
  window[CROP_STATE_KEY] = null;
};
const markDirectGraphicLayerAdd = () => {
  window[DIRECT_LAYER_ADD_KEY] = Date.now();
};
const clearDirectGraphicLayerAdd = () => {
  window[DIRECT_LAYER_ADD_KEY] = 0;
};
const hasPendingDirectGraphicLayerAdd = () => {
  const requestedAt = Number(window[DIRECT_LAYER_ADD_KEY] || 0);
  return requestedAt > 0 && Date.now() - requestedAt < 1500;
};
const getEditor = () => {
  const mod = window[MODULE_KEY];
  return mod && typeof mod.y === "function" ? mod.y() : null;
};
const commitHistoryEntry = (store, key, entry) => {
  if (!store || !entry || typeof entry.undo !== "function" || typeof entry.redo !== "function") {
    return false;
  }
  if (typeof store.commit === "function") {
    store.commit("saveState", {
      undo: entry.undo,
      redo: entry.redo,
      resources: entry.resources ?? null,
      groupId: key
    });
    return true;
  }
  return false;
};
const isNewLayerModalRequest = (payload) => {
  if (!payload) {
    return false;
  }
  const candidate = payload.default || payload;
  const messages = candidate && candidate.i18n && candidate.i18n.messages;
  if (messages && ((messages["ko-KR"] && messages["ko-KR"].addNewLayer) || (messages["en-US"] && messages["en-US"].addNewLayer))) {
    return true;
  }
  const loader = candidate && candidate.__asyncLoader;
  if (typeof loader === "function") {
    const loaderText = Function.prototype.toString.call(loader);
    if (loaderText.includes("new-layer-window") || loaderText.includes("addNewLayer") || loaderText.includes("newLayerNum")) {
      return true;
    }
  }
  return false;
};

const createGraphicLayerDirectly = (store, mod) => {
  if (!store || !mod || !mod.aY || !mod.aX) {
    return false;
  }

  const activeDocument = store.getters ? store.getters.activeDocument : null;
  const activeLayerIndex = store.getters ? store.getters.activeLayerIndex : -1;
  const activeGroup = store.getters ? store.getters.activeGroup : null;
  const layers = store.getters && Array.isArray(store.getters.layers) ? store.getters.layers : [];
  if (!activeDocument || !Number.isFinite(activeLayerIndex)) {
    return false;
  }

  const nextIndex = Math.max(0, activeLayerIndex + 1);
  const name = store.getters && typeof store.getters.t === "function"
    ? store.getters.t("newLayerNum", { num: layers.length + 1 })
    : \`새 레이어 #\${layers.length + 1}\`;
  const rel = activeDocument.type === "timeline" && activeGroup
    ? { type: "tile", id: activeGroup }
    : undefined;
  const layer = mod.aY.create({
    name,
    type: mod.aX.LAYER_GRAPHIC,
    width: activeDocument.width,
    height: activeDocument.height,
    rel
  });
  const commitInsert = () => {
    store.commit("insertLayerAtIndex", { index: nextIndex, layer });
  };

  commitInsert();
  if (!commitHistoryEntry(store, \`layerAdd_\${nextIndex}\`, {
    undo() {
      store.commit("removeLayer", nextIndex);
    },
    redo: commitInsert
  }) && typeof mod.aj === "function") {
    mod.aj(\`layerAdd_\${nextIndex}\`, {
      undo() {
        store.commit("removeLayer", nextIndex);
      },
      redo: commitInsert
    });
  }
  return true;
};

const forceClosePhotoEditorModal = (store) => {
  if (store && typeof store.commit === "function") {
    try {
      store.commit("closeModal");
    } catch (_error) {
      // noop
    }
    try {
      store.commit("setBlindActive", false);
    } catch (_error) {
      // noop
    }
  }
  const hostRoot = getHostRoot();
  if (!hostRoot) {
    return;
  }
  hostRoot.querySelectorAll(".modal").forEach((element) => {
    if (element.parentNode) {
      element.parentNode.removeChild(element);
    }
  });
};

const isNewLayerModalElement = (element) => {
  if (!(element instanceof HTMLElement) || !element.classList.contains("modal")) {
    return false;
  }
  const text = (element.textContent || "").replace(/\\s+/g, " ").trim();
  if (!text) {
    return false;
  }
  return [
    "새 레이어 추가",
    "Add new layer",
    "레이어 유형",
    "Layer type",
    "그래픽",
    "Graphic",
    "텍스트",
    "Text"
  ].some((token) => text.includes(token));
};

const suppressNewLayerModalIfNeeded = (store, mod, sourceNode = null) => {
  const hostRoot = getHostRoot();
  if (!hostRoot) {
    return false;
  }
  const candidates = [];
  if (sourceNode instanceof HTMLElement) {
    if (sourceNode.classList.contains("modal")) {
      candidates.push(sourceNode);
    }
    candidates.push(...Array.from(sourceNode.querySelectorAll(".modal")));
  }
  candidates.push(...Array.from(hostRoot.querySelectorAll(".modal")));
  const modal = candidates.find((element, index) => candidates.indexOf(element) === index && isNewLayerModalElement(element));
  if (!modal) {
    return false;
  }
  if (!hasPendingDirectGraphicLayerAdd()) {
    markDirectGraphicLayerAdd();
    createGraphicLayerDirectly(store, mod);
  }
  clearDirectGraphicLayerAdd();
  forceClosePhotoEditorModal(store);
  return true;
};

const ensureNotificationPatch = (store, mod) => {
  if (!store || store[ORIGINAL_COMMIT_KEY]) {
    return;
  }
  store[ORIGINAL_COMMIT_KEY] = store.commit.bind(store);
  store.commit = (type, payload, options) => {
    if (type === "openModal" && (isNewLayerModalRequest(payload) || hasPendingDirectGraphicLayerAdd())) {
      if (createGraphicLayerDirectly(store, mod)) {
        clearDirectGraphicLayerAdd();
        queueMicrotask(() => forceClosePhotoEditorModal(store));
        return;
      }
    }
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
  const left = Math.floor(minX);
  const top = Math.floor(minY);
  const right = Math.ceil(maxX);
  const bottom = Math.ceil(maxY);
  return {
    left,
    top,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top)
  };
};

const getCanvasForDocument = (activeDocument) => {
  if (!activeDocument) {
    return null;
  }
  const editor = getEditor();
  const editorCanvas = editor && typeof editor.getElement === "function" ? editor.getElement() : null;
  if (editorCanvas instanceof HTMLCanvasElement) {
    return editorCanvas;
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
  const editor = getEditor();
  const viewport = editor && typeof editor.getViewport === "function"
    ? editor.getViewport()
    : { left: 0, top: 0 };
  const zoomFactor = editor && Number.isFinite(editor.zoomFactor) ? editor.zoomFactor : null;
  if (zoomFactor && zoomFactor > 0) {
    return {
      x: (clientX - rect.left) / zoomFactor + (viewport.left || 0),
      y: (clientY - rect.top) / zoomFactor + (viewport.top || 0)
    };
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

const isPointInPolygon = (point, polygon) => {
  if (!point || !Array.isArray(polygon) || polygon.length < 3) {
    return false;
  }
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const currentPoint = polygon[index];
    const previousPoint = polygon[previous];
    const intersects = ((currentPoint.y > point.y) !== (previousPoint.y > point.y))
      && (point.x < ((previousPoint.x - currentPoint.x) * (point.y - currentPoint.y)) / ((previousPoint.y - currentPoint.y) || 1e-6) + currentPoint.x);
    if (intersects) {
      inside = !inside;
    }
  }
  return inside;
};

const isPointInSelection = (point, points, bounds) => (
  isPointInsideBounds(point, bounds) && isPointInPolygon(point, points)
);

const decodeBase64ToBytes = (base64Value) => {
  const binary = window.atob(base64Value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
};

const payloadToFile = (payload) => new File(
  [decodeBase64ToBytes(payload.dataBase64)],
  payload.name || "imported-file",
  {
    type: payload.mimeType || "application/octet-stream",
    lastModified: Date.now()
  }
);

const ensureFileInputBridge = () => {
  if (typeof window[FILE_BRIDGE_CLEANUP_KEY] === "function") {
    return;
  }

  const onDirectGraphicLayerAdd = (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    const button = target.closest("button");
    if (!(button instanceof HTMLButtonElement)) {
      return;
    }
    const hostRoot = getHostRoot();
    if (!hostRoot || !hostRoot.contains(button)) {
      return;
    }
    const label = (button.textContent || "").replace(/\\s+/g, " ").trim();
    if (label !== "레이어 추가" && label !== "Add layer") {
      return;
    }
    const store = getStore();
    const mod = window[MODULE_KEY];
    markDirectGraphicLayerAdd();
    if (!store || !mod || !createGraphicLayerDirectly(store, mod)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === "function") {
      event.stopImmediatePropagation();
    }
    queueMicrotask(() => forceClosePhotoEditorModal(store));
  };

  const onFileInputClick = async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || target.type !== "file") {
      return;
    }

    const hostRoot = getHostRoot();
    const api = window.spriteForge;
    if (
      !hostRoot
      || !hostRoot.contains(target)
      || !api
      || typeof api.pickPhotoEditorPaths !== "function"
      || typeof api.readBinaryFile !== "function"
    ) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === "function") {
      event.stopImmediatePropagation();
    }

    if (window[FILE_BRIDGE_BUSY_KEY]) {
      return;
    }

    window[FILE_BRIDGE_BUSY_KEY] = true;
    try {
      await new Promise((resolve) => window.setTimeout(resolve, 0));
      const selectedPaths = await api.pickPhotoEditorPaths(target.multiple !== false);
      if (!Array.isArray(selectedPaths) || selectedPaths.length === 0) {
        return;
      }

      if (typeof DataTransfer === "undefined") {
        throw new Error("DataTransfer API is unavailable.");
      }

      const dataTransfer = new DataTransfer();
      const inputPaths = target.multiple ? selectedPaths : [selectedPaths[0]];
      for (const filePath of inputPaths) {
        const payload = await api.readBinaryFile(filePath);
        dataTransfer.items.add(payloadToFile(payload));
      }

      target.files = dataTransfer.files;
      target.dispatchEvent(new Event("input", { bubbles: true }));
      target.dispatchEvent(new Event("change", { bubbles: true }));
      target.focus();
    } catch (error) {
      console.error("Sprite Studio photo editor file bridge failed:", error);
    } finally {
      window[FILE_BRIDGE_BUSY_KEY] = false;
    }
  };

  document.addEventListener("pointerdown", onDirectGraphicLayerAdd, true);
  document.addEventListener("click", onFileInputClick, true);
  window[FILE_BRIDGE_CLEANUP_KEY] = () => {
    document.removeEventListener("pointerdown", onDirectGraphicLayerAdd, true);
    document.removeEventListener("click", onFileInputClick, true);
    window[FILE_BRIDGE_CLEANUP_KEY] = null;
  };
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

const cloneDrawable = (source, fallbackWidth, fallbackHeight) => {
  if (!source) {
    return source;
  }
  if (source instanceof HTMLCanvasElement) {
    return cloneCanvas(source);
  }
  const width = Math.max(1, Math.round(source.width || fallbackWidth || 1));
  const height = Math.max(1, Math.round(source.height || fallbackHeight || 1));
  const copy = document.createElement("canvas");
  copy.width = width;
  copy.height = height;
  const ctx = copy.getContext("2d");
  if (!ctx) {
    return source;
  }
  try {
    ctx.drawImage(source, 0, 0, width, height);
    return copy;
  } catch (_error) {
    return source;
  }
};

const cloneLayerSnapshot = (layer) => {
  if (!layer || typeof layer !== "object") {
    return layer;
  }
  return {
    ...layer,
    source: cloneDrawable(layer.source, layer.width, layer.height),
    mask: cloneDrawable(layer.mask, layer.width, layer.height),
    transform: layer.transform ? { ...layer.transform } : layer.transform,
    filters: layer.filters ? { ...layer.filters } : layer.filters,
    text: layer.text ? { ...layer.text } : layer.text,
    meta: layer.meta ? { ...layer.meta } : layer.meta
  };
};

const cloneLayerSnapshots = (layers) => Array.isArray(layers)
  ? layers.map((layer) => cloneLayerSnapshot(layer))
  : [];

const cropDrawableToRect = (source, cropRect, originLeft, originTop, fallbackWidth, fallbackHeight) => {
  if (!source) {
    return null;
  }
  const sourceWidth = Math.max(1, Math.round(source.width || fallbackWidth || 1));
  const sourceHeight = Math.max(1, Math.round(source.height || fallbackHeight || 1));
  const overlapLeft = Math.max(originLeft, cropRect.x);
  const overlapTop = Math.max(originTop, cropRect.y);
  const overlapRight = Math.min(originLeft + sourceWidth, cropRect.x + cropRect.width);
  const overlapBottom = Math.min(originTop + sourceHeight, cropRect.y + cropRect.height);
  const width = Math.max(0, overlapRight - overlapLeft);
  const height = Math.max(0, overlapBottom - overlapTop);
  if (width <= 0 || height <= 0) {
    return null;
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return null;
  }
  ctx.drawImage(
    source,
    overlapLeft - originLeft,
    overlapTop - originTop,
    width,
    height,
    0,
    0,
    width,
    height
  );
  return {
    canvas,
    left: overlapLeft - cropRect.x,
    top: overlapTop - cropRect.y,
    width,
    height
  };
};

const cropLayerSnapshotToRect = (layer, cropRect) => {
  if (!layer || typeof layer !== "object") {
    return null;
  }
  const layerLeft = Math.round(layer.left || 0);
  const layerTop = Math.round(layer.top || 0);
  const fallbackWidth = Math.max(1, Math.round(layer.width || (layer.source && layer.source.width) || 1));
  const fallbackHeight = Math.max(1, Math.round(layer.height || (layer.source && layer.source.height) || 1));
  const croppedSource = cropDrawableToRect(layer.source, cropRect, layerLeft, layerTop, fallbackWidth, fallbackHeight);
  if (!croppedSource) {
    return null;
  }
  const nextLayer = {
    ...layer,
    source: croppedSource.canvas,
    width: croppedSource.width,
    height: croppedSource.height,
    left: croppedSource.left,
    top: croppedSource.top,
    transform: layer.transform ? { ...layer.transform } : layer.transform,
    filters: layer.filters ? { ...layer.filters } : layer.filters,
    text: layer.text ? { ...layer.text } : layer.text,
    meta: layer.meta ? { ...layer.meta } : layer.meta
  };
  if (layer.mask) {
    const maskLeft = Math.round(layer.maskX ?? nextLayer.left);
    const maskTop = Math.round(layer.maskY ?? nextLayer.top);
    const croppedMask = cropDrawableToRect(layer.mask, cropRect, maskLeft, maskTop, fallbackWidth, fallbackHeight);
    nextLayer.mask = croppedMask ? croppedMask.canvas : null;
    nextLayer.maskX = croppedMask ? croppedMask.left : 0;
    nextLayer.maskY = croppedMask ? croppedMask.top : 0;
  } else {
    nextLayer.mask = layer.mask;
    nextLayer.maskX = layer.maskX;
    nextLayer.maskY = layer.maskY;
  }
  return nextLayer;
};

const buildCroppedSnapshot = (store, mod, cropRect) => {
  const activeDocument = store && store.getters ? store.getters.activeDocument : null;
  const activeLayerIndex = store && store.getters ? store.getters.activeLayerIndex : 0;
  const layers = activeDocument && Array.isArray(activeDocument.layers) ? activeDocument.layers : [];
  const nextLayers = [];
  let nextActiveLayerIndex = -1;
  layers.forEach((layer, index) => {
    const croppedLayer = cropLayerSnapshotToRect(layer, cropRect);
    if (!croppedLayer) {
      return;
    }
    const insertedIndex = nextLayers.push(croppedLayer) - 1;
    if (index === activeLayerIndex) {
      nextActiveLayerIndex = insertedIndex;
    }
  });
  if (nextLayers.length === 0 && mod && mod.aY) {
    nextLayers.push(mod.aY.create({
      name: "Layer 1",
      type: mod.aX ? mod.aX.LAYER_GRAPHIC : "graphic",
      width: cropRect.width,
      height: cropRect.height
    }));
    nextActiveLayerIndex = 0;
  }
  if (nextActiveLayerIndex < 0) {
    nextActiveLayerIndex = Math.min(activeLayerIndex, Math.max(0, nextLayers.length - 1));
  }
  return {
    size: {
      width: cropRect.width,
      height: cropRect.height
    },
    layers: nextLayers,
    activeLayerIndex: nextActiveLayerIndex,
    selection: []
  };
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
  const editor = getEditor();
  const viewport = editor && typeof editor.getViewport === "function"
    ? editor.getViewport()
    : { left: 0, top: 0 };
  const zoomFactor = editor && Number.isFinite(editor.zoomFactor) && editor.zoomFactor > 0
    ? editor.zoomFactor
    : null;
  ctx.imageSmoothingEnabled = false;
  if (zoomFactor) {
    ctx.drawImage(
      state.cutCanvas,
      (state.bounds.left + state.currentDx - (viewport.left || 0)) * zoomFactor,
      (state.bounds.top + state.currentDy - (viewport.top || 0)) * zoomFactor,
      state.cutCanvas.width * zoomFactor,
      state.cutCanvas.height * zoomFactor
    );
    return;
  }
  const scaleX = rect.width / activeDocument.width;
  const scaleY = rect.height / activeDocument.height;
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

const getCanvasScale = (activeDocument) => {
  const canvas = getCanvasForDocument(activeDocument);
  if (!canvas) {
    return null;
  }
  const rect = canvas.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    return null;
  }
  const editor = getEditor();
  return {
    canvas,
    rect,
    scaleX: editor && Number.isFinite(editor.zoomFactor) && editor.zoomFactor > 0 ? editor.zoomFactor : rect.width / activeDocument.width,
    scaleY: editor && Number.isFinite(editor.zoomFactor) && editor.zoomFactor > 0 ? editor.zoomFactor : rect.height / activeDocument.height,
    viewport: editor && typeof editor.getViewport === "function" ? editor.getViewport() : { left: 0, top: 0 }
  };
};

const removeCropOverlay = (state) => {
  if (state && state.overlayCanvas && state.overlayCanvas.parentNode) {
    state.overlayCanvas.parentNode.removeChild(state.overlayCanvas);
  }
  if (state) {
    state.overlayCanvas = null;
  }
};

const clampValue = (value, min, max) => Math.min(max, Math.max(min, value));

const normalizeCropRect = (startPoint, endPoint, activeDocument) => {
  if (!startPoint || !endPoint || !activeDocument) {
    return null;
  }
  const maxX = Math.max(1, activeDocument.width);
  const maxY = Math.max(1, activeDocument.height);
  const x1 = clampValue(startPoint.x, 0, maxX);
  const y1 = clampValue(startPoint.y, 0, maxY);
  const x2 = clampValue(endPoint.x, 0, maxX);
  const y2 = clampValue(endPoint.y, 0, maxY);
  const left = Math.floor(Math.min(x1, x2));
  const top = Math.floor(Math.min(y1, y2));
  const right = Math.ceil(Math.max(x1, x2));
  const bottom = Math.ceil(Math.max(y1, y2));
  return {
    x: left,
    y: top,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top)
  };
};

const clampCropRect = (rect, activeDocument) => {
  if (!rect || !activeDocument) {
    return null;
  }
  const maxWidth = Math.max(1, activeDocument.width);
  const maxHeight = Math.max(1, activeDocument.height);
  const width = clampValue(Math.round(rect.width || 1), 1, maxWidth);
  const height = clampValue(Math.round(rect.height || 1), 1, maxHeight);
  const x = clampValue(Math.round(rect.x || 0), 0, maxWidth - width);
  const y = clampValue(Math.round(rect.y || 0), 0, maxHeight - height);
  return { x, y, width, height };
};

const createDefaultCropRect = (activeDocument) => {
  if (!activeDocument) {
    return null;
  }
  const width = Math.max(1, Math.round(activeDocument.width * 0.8));
  const height = Math.max(1, Math.round(activeDocument.height * 0.8));
  return clampCropRect({
    x: Math.round((activeDocument.width - width) / 2),
    y: Math.round((activeDocument.height - height) / 2),
    width,
    height
  }, activeDocument);
};

const isPointInsideCropRect = (point, rect) => (
  !!point
  && !!rect
  && point.x >= rect.x
  && point.x <= rect.x + rect.width
  && point.y >= rect.y
  && point.y <= rect.y + rect.height
);

const getCropHandleRects = (rect, activeDocument) => {
  const scale = getCanvasScale(activeDocument);
  if (!rect || !scale) {
    return [];
  }
  const halfWidth = Math.max(4, Math.round(12 / Math.max(scale.scaleX, 0.001))) / 2;
  const halfHeight = Math.max(4, Math.round(12 / Math.max(scale.scaleY, 0.001))) / 2;
  const left = rect.x;
  const right = rect.x + rect.width;
  const top = rect.y;
  const bottom = rect.y + rect.height;
  const middleX = left + rect.width / 2;
  const middleY = top + rect.height / 2;
  return [
    { name: "nw", x: left, y: top },
    { name: "n", x: middleX, y: top },
    { name: "ne", x: right, y: top },
    { name: "e", x: right, y: middleY },
    { name: "se", x: right, y: bottom },
    { name: "s", x: middleX, y: bottom },
    { name: "sw", x: left, y: bottom },
    { name: "w", x: left, y: middleY }
  ].map((handle) => ({
    ...handle,
    left: handle.x - halfWidth,
    top: handle.y - halfHeight,
    width: halfWidth * 2,
    height: halfHeight * 2
  }));
};

const getCropHandleAtPoint = (point, rect, activeDocument) => {
  if (!point || !rect || !activeDocument) {
    return null;
  }
  const handle = getCropHandleRects(rect, activeDocument).find((candidate) => (
    point.x >= candidate.left
    && point.x <= candidate.left + candidate.width
    && point.y >= candidate.top
    && point.y <= candidate.top + candidate.height
  ));
  return handle ? handle.name : null;
};

const resizeCropRect = (initialRect, handle, point, activeDocument) => {
  if (!initialRect || !handle || !point || !activeDocument) {
    return null;
  }
  let left = initialRect.x;
  let right = initialRect.x + initialRect.width;
  let top = initialRect.y;
  let bottom = initialRect.y + initialRect.height;
  const px = clampValue(point.x, 0, activeDocument.width);
  const py = clampValue(point.y, 0, activeDocument.height);

  if (handle.includes("w")) {
    left = px;
  }
  if (handle.includes("e")) {
    right = px;
  }
  if (handle.includes("n")) {
    top = py;
  }
  if (handle.includes("s")) {
    bottom = py;
  }
  if (handle === "n" || handle === "s") {
    left = initialRect.x;
    right = initialRect.x + initialRect.width;
  }
  if (handle === "e" || handle === "w") {
    top = initialRect.y;
    bottom = initialRect.y + initialRect.height;
  }

  return normalizeCropRect({ x: left, y: top }, { x: right, y: bottom }, activeDocument);
};

const syncCropOverlay = (activeDocument, state) => {
  if (!activeDocument || !state || !state.rect) {
    removeCropOverlay(state);
    return;
  }

  const scale = getCanvasScale(activeDocument);
  if (!scale) {
    removeCropOverlay(state);
    return;
  }

  const cropRect = clampCropRect(state.rect, activeDocument);
  if (!cropRect) {
    removeCropOverlay(state);
    return;
  }

  const { rect, scaleX, scaleY, viewport } = scale;
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
  ctx.fillStyle = "rgba(8, 12, 22, 0.62)";
  ctx.fillRect(0, 0, rect.width, rect.height);

  const cropLeft = (cropRect.x - (viewport.left || 0)) * scaleX;
  const cropTop = (cropRect.y - (viewport.top || 0)) * scaleY;
  const cropWidth = cropRect.width * scaleX;
  const cropHeight = cropRect.height * scaleY;

  ctx.clearRect(cropLeft, cropTop, cropWidth, cropHeight);
  ctx.save();
  ctx.strokeStyle = "#17d9ff";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(cropLeft + 0.5, cropTop + 0.5, Math.max(1, cropWidth - 1), Math.max(1, cropHeight - 1));
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
  ctx.lineWidth = 1;
  const thirdWidth = cropWidth / 3;
  const thirdHeight = cropHeight / 3;
  for (let index = 1; index < 3; index += 1) {
    ctx.beginPath();
    ctx.moveTo(cropLeft + thirdWidth * index, cropTop);
    ctx.lineTo(cropLeft + thirdWidth * index, cropTop + cropHeight);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cropLeft, cropTop + thirdHeight * index);
    ctx.lineTo(cropLeft + cropWidth, cropTop + thirdHeight * index);
    ctx.stroke();
  }
  ctx.restore();

  const handleSize = 10;
  ctx.save();
  ctx.fillStyle = "#17d9ff";
  ctx.strokeStyle = "#04111a";
  ctx.lineWidth = 1;
  [
    [cropLeft, cropTop],
    [cropLeft + cropWidth / 2, cropTop],
    [cropLeft + cropWidth, cropTop],
    [cropLeft + cropWidth, cropTop + cropHeight / 2],
    [cropLeft + cropWidth, cropTop + cropHeight],
    [cropLeft + cropWidth / 2, cropTop + cropHeight],
    [cropLeft, cropTop + cropHeight],
    [cropLeft, cropTop + cropHeight / 2]
  ].forEach(([x, y]) => {
    ctx.beginPath();
    ctx.rect(x - handleSize / 2, y - handleSize / 2, handleSize, handleSize);
    ctx.fill();
    ctx.stroke();
  });
  ctx.restore();
};

const captureEditorSnapshot = (store) => {
  const activeDocument = store && store.getters ? store.getters.activeDocument : null;
  return {
    size: activeDocument ? { width: activeDocument.width, height: activeDocument.height } : { width: 1, height: 1 },
    layers: cloneLayerSnapshots(activeDocument && Array.isArray(activeDocument.layers) ? activeDocument.layers : []),
    activeLayerIndex: store && store.getters ? store.getters.activeLayerIndex : 0,
    selection: cloneSelectionShapes(activeDocument ? activeDocument.activeSelection : [])
  };
};

const restoreEditorSnapshot = (store, snapshot) => {
  if (!store || !snapshot) {
    return;
  }
  const layers = cloneLayerSnapshots(snapshot.layers);
  store.commit("setActiveDocumentSize", snapshot.size);
  store.commit("replaceLayers", layers);
  layers.forEach((layer, index) => {
    store.commit("updateLayer", {
      index,
      opts: {},
      recreateRenderer: true
    });
    if (layer && layer.transform) {
      store.commit("updateLayerTransform", {
        index,
        transform: { ...layer.transform }
      });
    }
  });
  if (layers.length > 0) {
    store.commit("setActiveLayerIndex", Math.min(Math.max(snapshot.activeLayerIndex, 0), layers.length - 1));
  }
  store.commit("setActiveSelection", cloneSelectionShapes(snapshot.selection));
};

const applyCropRect = async (store, mod) => {
  const activeDocument = store && store.getters ? store.getters.activeDocument : null;
  const cropState = getCropState();
  const cropRect = clampCropRect(cropState && cropState.rect, activeDocument);
  if (!store || !activeDocument || !cropRect) {
    return false;
  }

  const beforeSnapshot = captureEditorSnapshot(store);
  const afterSnapshot = buildCroppedSnapshot(store, mod, cropRect);
  restoreEditorSnapshot(store, afterSnapshot);

  if (!commitHistoryEntry(store, \`crop_\${activeDocument.name || "document"}_\${cropRect.x}_\${cropRect.y}_\${cropRect.width}_\${cropRect.height}\`, {
    undo() {
      restoreEditorSnapshot(store, beforeSnapshot);
    },
    redo() {
      restoreEditorSnapshot(store, afterSnapshot);
    }
  }) && typeof mod.aj === "function") {
    mod.aj(\`crop_\${activeDocument.name || "document"}_\${cropRect.x}_\${cropRect.y}_\${cropRect.width}_\${cropRect.height}\`, {
      undo() {
        restoreEditorSnapshot(store, beforeSnapshot);
      },
      redo() {
        restoreEditorSnapshot(store, afterSnapshot);
      }
    });
  }

  return true;
};

const deactivateCutMoveTool = (store, activeDocument, restorePreviousTool = true) => {
  const floatingState = getFloatingSelectionState();
  if (store && activeDocument && floatingState) {
    commitFloatingSelection(store, activeDocument, floatingState);
  } else if (floatingState) {
    removeFloatingOverlay(floatingState);
    clearFloatingSelectionState();
  }
  clearFloatingSelectionState();
  if (!isToolActive()) {
    if (!restorePreviousTool) {
      setPreviousTool(null);
    }
    return;
  }
  setToolActive(false);
  const previousTool = getPreviousTool();
  setPreviousTool(null);
  if (restorePreviousTool && store && activeDocument) {
    store.commit("setActiveTool", { tool: previousTool, document: activeDocument });
  }
};

const deactivateCropTool = (store, activeDocument, restorePreviousTool = true) => {
  const cropState = getCropState();
  if (cropState) {
    removeCropOverlay(cropState);
  }
  clearCropState();
  if (!isCropToolActive()) {
    if (!restorePreviousTool) {
      setCropPreviousTool(null);
    }
    return;
  }
  setCropToolActive(false);
  const previousTool = getCropPreviousTool();
  setCropPreviousTool(null);
  if (restorePreviousTool && store && activeDocument) {
    store.commit("setActiveTool", { tool: previousTool, document: activeDocument });
  }
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
    if (!(button instanceof HTMLButtonElement) || button.id === TOOL_ID || button.id === CROP_TOOL_ID) {
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
      #\${CROP_TOOL_ID} {
        display: flex;
        align-items: center;
        justify-content: center;
      }
      #\${TOOL_ID}.\${TOOL_ACTIVE_CLASS} {
        box-shadow: inset 0 0 0 2px #17d9ff;
      }
      #\${CROP_TOOL_ID}.\${TOOL_ACTIVE_CLASS} {
        box-shadow: inset 0 0 0 2px #17d9ff;
      }
      #\${TOOL_ID} img {
        pointer-events: none;
      }
      #\${CROP_TOOL_ID} img {
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
    deactivateCropTool(store, activeDocument, false);

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

const ensureCropToolButton = () => {
  const existing = document.getElementById(CROP_TOOL_ID);
  if (existing && existing.isConnected) {
    existing.classList.toggle("active", isCropToolActive());
    existing.classList.toggle(TOOL_ACTIVE_CLASS, isCropToolActive());
    existing.setAttribute("aria-pressed", isCropToolActive() ? "true" : "false");
    existing.setAttribute("title", CROP_TOOL_TOOLTIP);
    existing.setAttribute("aria-label", CROP_TOOL_TOOLTIP);
    return existing;
  }

  const toolbarButtons = getToolbarButtons();
  const cutMoveButton = document.getElementById(TOOL_ID);
  const anchor = cutMoveButton instanceof HTMLButtonElement
    ? cutMoveButton
    : toolbarButtons[0] ?? null;
  if (!anchor || !anchor.parentElement) {
    return null;
  }

  const button = anchor.cloneNode(true);
  button.id = CROP_TOOL_ID;
  button.type = "button";
  button.disabled = false;
  button.classList.remove("active");
  button.classList.remove(TOOL_ACTIVE_CLASS);
  button.setAttribute("title", CROP_TOOL_TOOLTIP);
  button.setAttribute("aria-label", CROP_TOOL_TOOLTIP);
  button.setAttribute("aria-pressed", "false");

  const icon = button.querySelector("img");
  if (icon) {
    icon.src = CROP_TOOL_ICON_URL;
    icon.alt = "";
    icon.draggable = false;
    icon.setAttribute("aria-hidden", "true");
  } else {
    const fallbackIcon = document.createElement("img");
    fallbackIcon.src = CROP_TOOL_ICON_URL;
    fallbackIcon.alt = "";
    fallbackIcon.draggable = false;
    fallbackIcon.setAttribute("aria-hidden", "true");
    button.replaceChildren(fallbackIcon);
  }

  const activateCropTool = (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === "function") {
      event.stopImmediatePropagation();
    }

    const store = getStore();
    const activeDocument = store && store.getters ? store.getters.activeDocument : null;
    if (!store || !activeDocument) {
      return;
    }

    if (isCropToolActive()) {
      deactivateCropTool(store, activeDocument, true);
      return;
    }

    deactivateCutMoveTool(store, activeDocument, false);
    setCropPreviousTool(store.getters ? store.getters.activeTool : null);
    store.commit("setActiveTool", { tool: null, document: activeDocument });
    setCropToolActive(true);
    const nextState = {
      ...(getCropState() || {}),
      rect: createDefaultCropRect(activeDocument)
    };
    setCropState(nextState);
    syncCropOverlay(activeDocument, nextState);
  };

  button.addEventListener("pointerdown", activateCropTool, true);
  button.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      activateCropTool(event);
    }
  }, true);
  anchor.parentElement.insertBefore(button, anchor.nextSibling);
  button.classList.toggle("active", isCropToolActive());
  button.classList.toggle(TOOL_ACTIVE_CLASS, isCropToolActive());
  button.setAttribute("aria-pressed", isCropToolActive() ? "true" : "false");
  return button;
};

const dispatchAltRelease = (force = false) => {
  const wasTrackedDown = isAltTrackedDown();
  const now = Date.now();
  if (!force && !wasTrackedDown) {
    return;
  }
  if (!wasTrackedDown && force && now - getAltReleaseAt() < ALT_RELEASE_COOLDOWN_MS) {
    return;
  }
  setAltTrackedDown(false);
  setAltReleaseAt(now);
  const createAltUpEvent = () => new KeyboardEvent("keyup", {
    key: "Alt",
    code: "AltLeft",
    keyCode: 18,
    which: 18,
    bubbles: true,
    cancelable: true
  });
  const pointerState = getPointerState();
  const hostRoot = getHostRoot();
  const store = getStore();
  const activeDocument = store && store.getters ? store.getters.activeDocument : null;
  const canvas = activeDocument ? getCanvasForDocument(activeDocument) : null;
  const hovered = pointerState && Number.isFinite(pointerState.clientX) && Number.isFinite(pointerState.clientY)
    ? document.elementFromPoint(pointerState.clientX, pointerState.clientY)
    : null;
  const primaryTarget = [
    document.activeElement,
    hovered,
    canvas,
    hostRoot
  ].find((target) => target && typeof target.dispatchEvent === "function") || null;

  if (typeof document.dispatchEvent === "function") {
    document.dispatchEvent(createAltUpEvent());
  }
  if (primaryTarget && primaryTarget !== document) {
    primaryTarget.dispatchEvent(createAltUpEvent());
  }

  clearScheduledAltRefresh();
  if (pointerState && Number.isFinite(pointerState.clientX) && Number.isFinite(pointerState.clientY)) {
    const refreshTarget = primaryTarget || hovered || canvas || hostRoot;
    if (refreshTarget && typeof refreshTarget.dispatchEvent === "function" && typeof window.requestAnimationFrame === "function") {
      window[ALT_RELEASE_RAF_KEY] = window.requestAnimationFrame(() => {
        window[ALT_RELEASE_RAF_KEY] = 0;
        const moveInit = {
          bubbles: true,
          cancelable: true,
          clientX: pointerState.clientX,
          clientY: pointerState.clientY,
          screenX: pointerState.screenX ?? pointerState.clientX,
          screenY: pointerState.screenY ?? pointerState.clientY,
          altKey: false,
          buttons: pointerState.buttons ?? 0,
          button: -1
        };
        try {
          refreshTarget.dispatchEvent(new MouseEvent("mousemove", moveInit));
        } catch (_error) {
          // Ignore cursor refresh failures; the Alt state has already been cleared.
        }
      });
    }
  }
};

const ensurePatched = async () => {
  if (window[SESSION_KEY] !== SESSION_TOKEN) {
    return;
  }
  const mod = await import(${JSON.stringify(mainScriptUrl)});
  if (window[SESSION_KEY] !== SESSION_TOKEN) {
    return;
  }
  if (window.__spriteForgePhotoEditorPatched && window[PATCHED_TOKEN_KEY] === SESSION_TOKEN) {
    return;
  }

  window.__spriteForgePhotoEditorPatched = true;
  window[PATCHED_TOKEN_KEY] = SESSION_TOKEN;
  window[MODULE_KEY] = mod;
  ensureNotificationPatch(getStore(), mod);
  ensureFileInputBridge();
  ensureToolButton();
  ensureCropToolButton();
  setToolActive(false);
  setCropToolActive(false);
  clearFloatingSelectionState();
  clearCropState();

  let dragState = null;
  let cropDragState = null;

  const observer = new MutationObserver(() => {
    ensureToolButton();
    ensureCropToolButton();
    const store = getStore();
    suppressNewLayerModalIfNeeded(store, mod);
    const activeDocument = store && store.getters ? store.getters.activeDocument : null;
    const cropState = getCropState();
    if (isCropToolActive() && activeDocument && cropState) {
      syncCropOverlay(activeDocument, cropState);
    }
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
      dispatchAltRelease(true);
    }
  };

  const onTrackPointerState = (event) => {
    setPointerState({
      clientX: event.clientX,
      clientY: event.clientY,
      screenX: event.screenX,
      screenY: event.screenY,
      buttons: event.buttons,
      targetTag: event.target && event.target.tagName ? event.target.tagName : null
    });
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
    if (!isPointInSelection(documentPoint, selectionPoints, bounds)) {
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

  const finalizeFloatingMove = () => {
    const store = getStore();
    const activeDocument = store && store.getters ? store.getters.activeDocument : null;
    const floatingState = getFloatingSelectionState();
    if (store && activeDocument && floatingState) {
      commitFloatingSelection(store, activeDocument, floatingState);
      return;
    }
    if (floatingState) {
      removeFloatingOverlay(floatingState);
      clearFloatingSelectionState();
    }
  };

  const onPointerDownCrop = (event) => {
    if (!isCropToolActive() || event.button !== 0 || isTypingTarget(event.target)) {
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

    const currentState = getCropState() || { rect: createDefaultCropRect(activeDocument), overlayCanvas: null };
    const currentRect = clampCropRect(currentState.rect, activeDocument);
    const handle = currentRect ? getCropHandleAtPoint(documentPoint, currentRect, activeDocument) : null;
    const insideRect = currentRect ? isPointInsideCropRect(documentPoint, currentRect) : false;

    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === "function") {
      event.stopImmediatePropagation();
    }

    if (handle && currentRect) {
      cropDragState = {
        pointerId: event.pointerId,
        mode: "resize",
        handle,
        initialRect: { ...currentRect }
      };
      return;
    }

    if (insideRect && currentRect) {
      cropDragState = {
        pointerId: event.pointerId,
        mode: "move",
        offsetX: documentPoint.x - currentRect.x,
        offsetY: documentPoint.y - currentRect.y,
        initialRect: { ...currentRect }
      };
      return;
    }

    const nextState = {
      ...currentState,
      rect: normalizeCropRect(documentPoint, documentPoint, activeDocument)
    };
    setCropState(nextState);
    syncCropOverlay(activeDocument, nextState);
    cropDragState = {
      pointerId: event.pointerId,
      mode: "draw",
      startPoint: documentPoint
    };
  };

  const onPointerMoveCrop = (event) => {
    if (!cropDragState || cropDragState.pointerId !== event.pointerId) {
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

    const currentState = getCropState() || { rect: createDefaultCropRect(activeDocument), overlayCanvas: null };
    let nextRect = currentState.rect;

    if (cropDragState.mode === "draw") {
      nextRect = normalizeCropRect(cropDragState.startPoint, documentPoint, activeDocument);
    } else if (cropDragState.mode === "move" && cropDragState.initialRect) {
      nextRect = clampCropRect({
        x: Math.round(documentPoint.x - cropDragState.offsetX),
        y: Math.round(documentPoint.y - cropDragState.offsetY),
        width: cropDragState.initialRect.width,
        height: cropDragState.initialRect.height
      }, activeDocument);
    } else if (cropDragState.mode === "resize" && cropDragState.initialRect) {
      nextRect = resizeCropRect(cropDragState.initialRect, cropDragState.handle, documentPoint, activeDocument);
    }

    if (!nextRect) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === "function") {
      event.stopImmediatePropagation();
    }

    const nextState = {
      ...currentState,
      rect: nextRect
    };
    setCropState(nextState);
    syncCropOverlay(activeDocument, nextState);
  };

  const onPointerUpCrop = (event) => {
    if (!cropDragState || cropDragState.pointerId !== event.pointerId) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === "function") {
      event.stopImmediatePropagation();
    }
    cropDragState = null;
  };

  const onPointerCancelCrop = (event) => {
    if (!cropDragState || cropDragState.pointerId !== event.pointerId) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === "function") {
      event.stopImmediatePropagation();
    }
    cropDragState = null;
  };

  const onDoubleClickCrop = async (event) => {
    if (!isCropToolActive() || isTypingTarget(event.target)) {
      return;
    }
    const store = getStore();
    const activeDocument = store && store.getters ? store.getters.activeDocument : null;
    if (!store || !activeDocument) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === "function") {
      event.stopImmediatePropagation();
    }
    const didApply = await applyCropRect(store, mod);
    if (didApply) {
      deactivateCropTool(store, activeDocument, true);
    }
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
      finalizeFloatingMove();
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
      finalizeFloatingMove();
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
    const isEnterKey = event.key === "Enter";

    if (isCropToolActive() && store && activeDocument) {
      if (isEscapeKey) {
        event.preventDefault();
        event.stopPropagation();
        if (typeof event.stopImmediatePropagation === "function") {
          event.stopImmediatePropagation();
        }
        deactivateCropTool(store, activeDocument, true);
        return;
      }

      if (isEnterKey) {
        event.preventDefault();
        event.stopPropagation();
        if (typeof event.stopImmediatePropagation === "function") {
          event.stopImmediatePropagation();
        }
        const didApply = await applyCropRect(store, mod);
        if (didApply) {
          deactivateCropTool(store, activeDocument, true);
        }
        return;
      }
    }

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
    finalizeFloatingMove();

    const editor = mod.y();
    editor && editor.interactionPane && editor.interactionPane.stayOnTop && editor.interactionPane.stayOnTop();
  };

  window.addEventListener("keydown", onTrackAltKeyDown, true);
  window.addEventListener("keyup", onTrackAltKeyUp, true);
  window.addEventListener("pointermove", onTrackPointerState, true);
  window.addEventListener("mousemove", onTrackPointerState, true);
  window.addEventListener("blur", onWindowBlur, true);
  document.addEventListener("visibilitychange", onVisibilityChange);
  window.addEventListener("pointerdown", onPointerDownAltReset, true);
  window.addEventListener("pointerdown", onPointerDownCrop, true);
  window.addEventListener("pointermove", onPointerMoveCrop, true);
  window.addEventListener("pointerup", onPointerUpCrop, true);
  window.addEventListener("pointercancel", onPointerCancelCrop, true);
  window.addEventListener("dblclick", onDoubleClickCrop, true);
  window.addEventListener("pointerdown", onPointerDownCutMove, true);
  window.addEventListener("pointermove", onPointerMoveCutMove, true);
  window.addEventListener("pointerup", onPointerUpCutMove, true);
  window.addEventListener("pointercancel", onPointerCancelCutMove, true);
  window.addEventListener("keydown", onEditorKeyDown, true);

  window.__spriteForgePhotoEditorCleanup = () => {
    observer.disconnect();
    dragState = null;
    cropDragState = null;
    const floatingState = getFloatingSelectionState();
    if (floatingState) {
      removeFloatingOverlay(floatingState);
    }
    const cropState = getCropState();
    if (cropState) {
      removeCropOverlay(cropState);
    }
    clearFloatingSelectionState();
    clearCropState();
    clearScheduledAltRefresh();
    setAltReleaseAt(0);
    setToolActive(false);
    setCropToolActive(false);
    window.__spriteForgeSuppressCutMoveNotification = false;
    window.removeEventListener("keydown", onTrackAltKeyDown, true);
    window.removeEventListener("keyup", onTrackAltKeyUp, true);
    window.removeEventListener("pointermove", onTrackPointerState, true);
    window.removeEventListener("mousemove", onTrackPointerState, true);
    window.removeEventListener("blur", onWindowBlur, true);
    document.removeEventListener("visibilitychange", onVisibilityChange);
    window.removeEventListener("pointerdown", onPointerDownAltReset, true);
    window.removeEventListener("pointerdown", onPointerDownCrop, true);
    window.removeEventListener("pointermove", onPointerMoveCrop, true);
    window.removeEventListener("pointerup", onPointerUpCrop, true);
    window.removeEventListener("pointercancel", onPointerCancelCrop, true);
    window.removeEventListener("dblclick", onDoubleClickCrop, true);
    window.removeEventListener("pointerdown", onPointerDownCutMove, true);
    window.removeEventListener("pointermove", onPointerMoveCutMove, true);
    window.removeEventListener("pointerup", onPointerUpCutMove, true);
    window.removeEventListener("pointercancel", onPointerCancelCutMove, true);
    window.removeEventListener("keydown", onEditorKeyDown, true);
    const button = document.getElementById(TOOL_ID);
    if (button) {
      button.remove();
    }
    const cropButton = document.getElementById(CROP_TOOL_ID);
    if (cropButton) {
      cropButton.remove();
    }
    const style = document.getElementById(TOOL_STYLE_ID);
    if (style) {
      style.remove();
    }
    if (typeof window[FILE_BRIDGE_CLEANUP_KEY] === "function") {
      window[FILE_BRIDGE_CLEANUP_KEY]();
    }
    window[MODULE_KEY] = null;
    window.__spriteForgePhotoEditorPatched = false;
    window[PATCHED_TOKEN_KEY] = null;
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
    const sessionToken = `photo-editor-${editorKey}-${Date.now()}`;
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
      __spriteForgePhotoEditorSessionToken?: string | null;
      __spriteForgePhotoEditorPatchedToken?: string | null;
    };

    if (typeof spriteWindow.__spriteForgePhotoEditorCleanup === "function") {
      spriteWindow.__spriteForgePhotoEditorCleanup();
    }
    spriteWindow.__spriteForgePhotoEditorPatched = false;
    spriteWindow.__spriteForgePhotoEditorPatchedToken = null;
    spriteWindow.__spriteForgePhotoEditorSessionToken = sessionToken;

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
    script.textContent = buildSelectionNudgePatch(mainScriptUrl, `#${PHOTO_EDITOR_HOST_ID}`, sessionToken);
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
      spriteWindow.__spriteForgePhotoEditorPatchedToken = null;
      if (spriteWindow.__spriteForgePhotoEditorSessionToken === sessionToken) {
        spriteWindow.__spriteForgePhotoEditorSessionToken = null;
      }
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

      <div key={editorKey} ref={hostRef} id={PHOTO_EDITOR_HOST_ID} className="photo-editor-shell" aria-label={t("photo_editor_title")} />
    </section>
  );
}
