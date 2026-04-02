import { create } from "zustand";
import type { Clip, Project } from "@sprite-forge/core";
import type {
  EditorStore,
  EditorTab,
  ExportSettings,
  SpriteAutoGifOptions,
  SpriteAutoGifResult,
  SpriteSheetSettings,
  ViewportSettings
} from "../types/editor";

function deepCloneProject(project: Project): Project {
  return JSON.parse(JSON.stringify(project)) as Project;
}

const videoExtensions = [
  ".mp4",
  ".webm",
  ".mov",
  ".avi",
  ".mkv",
  ".wmv",
  ".m4v",
  ".flv",
  ".mpg",
  ".mpeg",
  ".ts",
  ".m2ts",
  ".3gp",
  ".3g2"
];

function getClip(project: Project | null, clipId: string | null): Clip | null {
  if (!project || !clipId) {
    return null;
  }
  return project.clips.find((c) => c.id === clipId) ?? null;
}

const defaultViewport: ViewportSettings = {
  zoom: 2,
  panX: 0,
  panY: 0,
  onionPrev: 0.25,
  onionNext: 0.25,
  pivotMode: false,
  backgroundColor: "#151515",
  imageAreaColor: "#242424"
};

const defaultExport: ExportSettings = {
  exportMode: "sheet",
  exportRoot: "",
  padding: 2,
  allowRotate: false,
  frameScope: "all"
};

const defaultSpriteSheetSettings: SpriteSheetSettings = {
  mode: "grid",
  cols: 1,
  rows: 1,
  alphaThreshold: 0.04,
  mergeThreshold: 1
};

const editorPrefsStorageKey = "sprite_forge_editor_prefs_v1";

interface PersistedEditorPrefs {
  projectDir: string;
  tab: EditorTab;
  viewport: ViewportSettings;
  exportSettings: ExportSettings;
  spriteSheetSettings: SpriteSheetSettings;
  activeHelpTopic: string | null;
}

function isHexColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
}

function finiteNumber(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, value));
}

function sanitizeEditorPrefs(raw: unknown): PersistedEditorPrefs {
  const source = typeof raw === "object" && raw !== null ? raw as Record<string, unknown> : {};

  const viewportRaw = typeof source.viewport === "object" && source.viewport !== null
    ? source.viewport as Record<string, unknown>
    : {};
  const exportRaw = typeof source.exportSettings === "object" && source.exportSettings !== null
    ? source.exportSettings as Record<string, unknown>
    : {};
  const sheetRaw = typeof source.spriteSheetSettings === "object" && source.spriteSheetSettings !== null
    ? source.spriteSheetSettings as Record<string, unknown>
    : {};

  const tab: EditorTab = source.tab === "pixel" || source.tab === "bg_remove" || source.tab === "pixel_helper" || source.tab === "leshy_sprite" || source.tab === "photo_editor" || source.tab === "iopaint"
    ? source.tab
    : "sprite";

  return {
    projectDir: typeof source.projectDir === "string" ? source.projectDir : "",
    tab,
    viewport: {
      zoom: finiteNumber(viewportRaw.zoom, defaultViewport.zoom, 0.2, 30),
      panX: finiteNumber(viewportRaw.panX, defaultViewport.panX, -100000, 100000),
      panY: finiteNumber(viewportRaw.panY, defaultViewport.panY, -100000, 100000),
      onionPrev: finiteNumber(viewportRaw.onionPrev, defaultViewport.onionPrev, 0, 0.8),
      onionNext: finiteNumber(viewportRaw.onionNext, defaultViewport.onionNext, 0, 0.8),
      pivotMode: typeof viewportRaw.pivotMode === "boolean" ? viewportRaw.pivotMode : defaultViewport.pivotMode,
      backgroundColor: isHexColor(viewportRaw.backgroundColor) ? viewportRaw.backgroundColor : defaultViewport.backgroundColor,
      imageAreaColor: isHexColor(viewportRaw.imageAreaColor) ? viewportRaw.imageAreaColor : defaultViewport.imageAreaColor
    },
    exportSettings: {
      exportMode: exportRaw.exportMode === "sequence" || exportRaw.exportMode === "gif" ? exportRaw.exportMode : "sheet",
      exportRoot: typeof exportRaw.exportRoot === "string" ? exportRaw.exportRoot : "",
      padding: finiteNumber(exportRaw.padding, defaultExport.padding, 0, 1024),
      allowRotate: typeof exportRaw.allowRotate === "boolean" ? exportRaw.allowRotate : defaultExport.allowRotate,
      frameScope: exportRaw.frameScope === "selected" ? "selected" : "all"
    },
    spriteSheetSettings: {
      mode: sheetRaw.mode === "auto" ? "auto" : "grid",
      cols: Math.max(1, Math.round(finiteNumber(sheetRaw.cols, defaultSpriteSheetSettings.cols, 1, 2048))),
      rows: Math.max(1, Math.round(finiteNumber(sheetRaw.rows, defaultSpriteSheetSettings.rows, 1, 2048))),
      alphaThreshold: finiteNumber(sheetRaw.alphaThreshold, defaultSpriteSheetSettings.alphaThreshold, 0, 1),
      mergeThreshold: Math.max(0, Math.round(finiteNumber(sheetRaw.mergeThreshold, defaultSpriteSheetSettings.mergeThreshold, 0, 4096)))
    },
    activeHelpTopic: typeof source.activeHelpTopic === "string" || source.activeHelpTopic === null
      ? source.activeHelpTopic
      : null
  };
}

function loadEditorPrefs(): PersistedEditorPrefs {
  if (typeof window === "undefined") {
    return sanitizeEditorPrefs({});
  }
  try {
    const raw = window.localStorage.getItem(editorPrefsStorageKey);
    if (!raw) {
      return sanitizeEditorPrefs({});
    }
    return sanitizeEditorPrefs(JSON.parse(raw));
  } catch {
    return sanitizeEditorPrefs({});
  }
}

function persistEditorPrefs(prefs: PersistedEditorPrefs): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(editorPrefsStorageKey, JSON.stringify(prefs));
  } catch {
    // Ignore storage write failures.
  }
}

function pickPersistedEditorPrefs(state: Pick<EditorStore, "projectDir" | "tab" | "viewport" | "exportSettings" | "spriteSheetSettings" | "activeHelpTopic">): PersistedEditorPrefs {
  return {
    projectDir: state.projectDir,
    tab: state.tab,
    viewport: { ...state.viewport },
    exportSettings: { ...state.exportSettings },
    spriteSheetSettings: { ...state.spriteSheetSettings },
    activeHelpTopic: state.activeHelpTopic
  };
}

const initialEditorPrefs = loadEditorPrefs();

async function persistProject(projectDir: string, project: Project): Promise<void> {
  await window.spriteForge.saveProject({ projectDir, project });
}

function normalizeSelection(
  project: Project,
  currentClipId: string | null,
  currentFrameIds: string[],
  activeFrameIndex: number
): { selectedClipId: string | null; selectedFrameIds: string[]; activeFrameIndex: number } {
  const selectedClipId = project.clips.find((c) => c.id === currentClipId)?.id ?? project.clips[0]?.id ?? null;
  const clip = project.clips.find((c) => c.id === selectedClipId) ?? null;

  if (!clip || !clip.frames.length) {
    return {
      selectedClipId,
      selectedFrameIds: [],
      activeFrameIndex: 0
    };
  }

  const filtered = currentFrameIds.filter((id) => clip.frames.some((f) => f.id === id));
  const selectedFrameIds = filtered.length ? filtered : [clip.frames[Math.min(activeFrameIndex, clip.frames.length - 1)].id];
  const finalActive = Math.min(activeFrameIndex, clip.frames.length - 1);

  return {
    selectedClipId,
    selectedFrameIds,
    activeFrameIndex: finalActive
  };
}

export const useEditorStore = create<EditorStore>((set, get) => ({
  projectDir: "",
  project: null,
  selectedClipId: null,
  selectedFrameIds: [],
  activeFrameIndex: 0,
  tab: initialEditorPrefs.tab,
  playing: false,
  busy: false,
  status: "준비됨",
  undoStack: [],
  redoStack: [],
  imageCache: {},
  viewport: { ...initialEditorPrefs.viewport },
  exportSettings: { ...initialEditorPrefs.exportSettings },
  spriteSheetSettings: { ...initialEditorPrefs.spriteSheetSettings },
  activeHelpTopic: initialEditorPrefs.activeHelpTopic,
  fitViewToken: 0,

  init: async () => {
    const persistedDir = initialEditorPrefs.projectDir.trim();
    const defaultDir = await window.spriteForge.getDefaultProjectDir();
    const targetDir = persistedDir || defaultDir;

    await get().loadProject(targetDir);

    if (persistedDir && persistedDir !== defaultDir && !get().project) {
      await get().loadProject(defaultDir);
    }
  },

  loadProject: async (projectDir) => {
    set({ busy: true, status: "프로젝트를 불러오는 중..." });
    try {
      const result = await window.spriteForge.loadProject({ projectDir }) as { project: Project };
      const normalized = normalizeSelection(result.project, get().selectedClipId, get().selectedFrameIds, get().activeFrameIndex);
      set({
        projectDir,
        project: result.project,
        selectedClipId: normalized.selectedClipId,
        selectedFrameIds: normalized.selectedFrameIds,
        activeFrameIndex: normalized.activeFrameIndex,
        busy: false,
        status: `프로젝트 불러오기 완료: ${projectDir}`,
        undoStack: [],
        redoStack: [],
        activeHelpTopic: null
      });
    } catch (error) {
      set({ busy: false, status: `프로젝트 불러오기 실패: ${error instanceof Error ? error.message : String(error)}` });
    }
  },

  pickAndLoadProject: async () => {
    const dir = await window.spriteForge.pickProjectDir();
    await get().loadProject(dir);
  },

  pickAndImport: async () => {
    const paths = await window.spriteForge.pickImportPaths();
    if (paths.length) {
      await get().importPaths(paths);
    }
  },

  pickAndImportMedia: async () => {
    const paths = await window.spriteForge.pickMediaPaths();
    if (paths.length) {
      await get().importPaths(paths);
    }
  },

  resetCurrentProject: async () => {
    const state = get();
    if (!state.projectDir) {
      return;
    }

    set({ busy: true, status: "프로젝트를 초기화하는 중..." });
    try {
      const result = await window.spriteForge.resetProject({
        projectDir: state.projectDir
      }) as { project: Project };

      set({
        project: result.project,
        selectedClipId: null,
        selectedFrameIds: [],
        activeFrameIndex: 0,
        playing: false,
        busy: false,
        status: "가져온 리소스 초기화 완료",
        undoStack: [],
        redoStack: [],
        imageCache: {}
      });
    } catch (error) {
      set({ busy: false, status: `프로젝트 초기화 실패: ${error instanceof Error ? error.message : String(error)}` });
    }
  },

  importPaths: async (paths) => {
    const state = get();
    if (!state.projectDir) {
      return;
    }

    set({ busy: true, status: "소스를 가져오는 중..." });

    const lower = paths[0]?.toLowerCase() ?? "";
    let sourceType: "gif" | "video" | "png_sequence" | "sprite_sheet" | "webp" | undefined;
    if (lower.endsWith(".gif")) sourceType = "gif";
    if (videoExtensions.some((ext) => lower.endsWith(ext))) sourceType = "video";
    if (lower.endsWith(".webp")) sourceType = "webp";
    if (lower.endsWith(".png") && paths.length > 1) sourceType = "png_sequence";
    if (lower.endsWith(".png") && paths.length === 1) sourceType = "sprite_sheet";

    try {
      const result = await window.spriteForge.importSources({
        projectDir: state.projectDir,
        paths,
        sourceType,
        spriteSheet: state.spriteSheetSettings
      }) as { project: Project };

      const latestClip = result.project.clips[result.project.clips.length - 1] ?? null;
      const selection = normalizeSelection(result.project, latestClip?.id ?? state.selectedClipId, [], 0);
      set((prev) => ({
        project: result.project,
        selectedClipId: selection.selectedClipId,
        selectedFrameIds: selection.selectedFrameIds,
        activeFrameIndex: selection.activeFrameIndex,
        busy: false,
        status: "가져오기 완료",
        undoStack: prev.project ? [...prev.undoStack, deepCloneProject(prev.project)].slice(-100) : prev.undoStack,
        redoStack: []
      }));
    } catch (error) {
      set({ busy: false, status: `가져오기 실패: ${error instanceof Error ? error.message : String(error)}` });
    }
  },

  updateClip: async (clip, action, withUndo = true) => {
    const state = get();
    if (!state.project || !state.projectDir) {
      return;
    }

    const projectBeforeUpdate = deepCloneProject(state.project);
    const optimisticProject: Project = {
      ...state.project,
      clips: state.project.clips.map((entry) => (entry.id === clip.id ? clip : entry))
    };
    const optimisticSelection = normalizeSelection(
      optimisticProject,
      state.selectedClipId,
      state.selectedFrameIds,
      state.activeFrameIndex
    );

    set({
      project: optimisticProject,
      selectedClipId: optimisticSelection.selectedClipId,
      selectedFrameIds: optimisticSelection.selectedFrameIds,
      activeFrameIndex: optimisticSelection.activeFrameIndex,
      busy: true,
      status: `${action}...`
    });

    try {
      const result = await window.spriteForge.updateClip({ projectDir: state.projectDir, clip }) as { project: Project };
      const latestState = get();
      const selection = normalizeSelection(
        result.project,
        latestState.selectedClipId,
        latestState.selectedFrameIds,
        latestState.activeFrameIndex
      );
      set((prev) => ({
        project: result.project,
        selectedClipId: selection.selectedClipId,
        selectedFrameIds: selection.selectedFrameIds,
        activeFrameIndex: selection.activeFrameIndex,
        busy: false,
        status: action,
        undoStack: withUndo ? [...prev.undoStack, projectBeforeUpdate].slice(-100) : prev.undoStack,
        redoStack: withUndo ? [] : prev.redoStack
      }));
    } catch (error) {
      set({ busy: false, status: `작업 실패: ${error instanceof Error ? error.message : String(error)}` });
    }
  },

  selectClip: (clipId) => {
    const clip = getClip(get().project, clipId);
    set({
      selectedClipId: clipId,
      selectedFrameIds: clip?.frames[0] ? [clip.frames[0].id] : [],
      activeFrameIndex: 0
    });
  },

  selectFrame: (frameId, additive = false) => {
    const state = get();
    const clip = getClip(state.project, state.selectedClipId);
    if (!clip) {
      return;
    }

    if (!additive) {
      const index = clip.frames.findIndex((f) => f.id === frameId);
      set({
        selectedFrameIds: [frameId],
        activeFrameIndex: Math.max(0, index)
      });
      return;
    }

    const selected = new Set(state.selectedFrameIds);
    if (selected.has(frameId)) {
      selected.delete(frameId);
    } else {
      selected.add(frameId);
    }

    const list = [...selected];
    set({ selectedFrameIds: list.length ? list : [frameId] });
  },

  setSelectedFrameIds: (frameIds, activeFrameIndex) => {
    const state = get();
    const clip = getClip(state.project, state.selectedClipId);
    if (!clip || !clip.frames.length) {
      return;
    }

    const validIds = clip.frames
      .filter((frame) => frameIds.includes(frame.id))
      .map((frame) => frame.id);

    if (!validIds.length) {
      return;
    }

    const fallbackIndex = clip.frames.findIndex((frame) => frame.id === validIds[0]);
    const bounded = Math.max(
      0,
      Math.min(
        typeof activeFrameIndex === "number" && Number.isFinite(activeFrameIndex) ? activeFrameIndex : fallbackIndex,
        clip.frames.length - 1
      )
    );

    set({
      selectedFrameIds: validIds,
      activeFrameIndex: bounded
    });
  },

  setActiveFrameIndex: (index) => {
    const state = get();
    const clip = getClip(state.project, state.selectedClipId);
    if (!clip || !clip.frames.length) {
      return;
    }
    const bounded = Math.max(0, Math.min(index, clip.frames.length - 1));
    set({
      activeFrameIndex: bounded,
      selectedFrameIds: [clip.frames[bounded].id]
    });
  },

  setActiveFrameIndexOnly: (index) => {
    const state = get();
    const clip = getClip(state.project, state.selectedClipId);
    if (!clip || !clip.frames.length) {
      return;
    }
    const bounded = Math.max(0, Math.min(index, clip.frames.length - 1));
    set({ activeFrameIndex: bounded });
  },

  setTab: (tab) => set({ tab }),
  setPlaying: (playing) => set({ playing }),
  requestFitView: () => set((state) => ({ fitViewToken: state.fitViewToken + 1 })),

  stepFrame: (direction) => {
    const state = get();
    const clip = getClip(state.project, state.selectedClipId);
    if (!clip || !clip.frames.length) {
      return;
    }
    const next = (state.activeFrameIndex + direction + clip.frames.length) % clip.frames.length;
    get().setActiveFrameIndex(next);
  },

  setViewport: (patch) => set((state) => ({ viewport: { ...state.viewport, ...patch } })),

  shiftSelectedOffsets: async (deltaX, deltaY) => {
    const state = get();
    const clip = getClip(state.project, state.selectedClipId);
    if (!clip) {
      return;
    }

    const selected = new Set(state.selectedFrameIds);
    const updated: Clip = {
      ...clip,
      frames: clip.frames.map((frame) =>
        selected.has(frame.id)
          ? {
              ...frame,
              offsetPx: {
                x: frame.offsetPx.x + deltaX,
                y: frame.offsetPx.y + deltaY
              }
            }
          : frame
      )
    };

    await get().updateClip(updated, "프레임 오프셋 조정");
  },

  setPivotBottomCenter: async () => {
    const state = get();
    if (!state.projectDir || !state.selectedClipId) return;
    set({ busy: true, status: "피벗을 설정하는 중..." });
    try {
      const result = await window.spriteForge.applyAlignment({
        projectDir: state.projectDir,
        clipId: state.selectedClipId,
        mode: "setBottomCenterPivot",
        frameIds: state.selectedFrameIds
      }) as { project: Project };
      const selection = normalizeSelection(result.project, state.selectedClipId, state.selectedFrameIds, state.activeFrameIndex);
      set((prev) => ({
        project: result.project,
        selectedClipId: selection.selectedClipId,
        selectedFrameIds: selection.selectedFrameIds,
        activeFrameIndex: selection.activeFrameIndex,
        busy: false,
        status: "피벗을 하단-중앙으로 설정 완료",
        undoStack: prev.project ? [...prev.undoStack, deepCloneProject(prev.project)].slice(-100) : prev.undoStack,
        redoStack: []
      }));
    } catch (error) {
      set({ busy: false, status: `피벗 설정 실패: ${error instanceof Error ? error.message : String(error)}` });
    }
  },

  autoCenterMass: async () => {
    const state = get();
    if (!state.projectDir || !state.selectedClipId) return;
    set({ busy: true, status: "질량 중심 자동 정렬 중..." });
    try {
      const result = await window.spriteForge.applyAlignment({
        projectDir: state.projectDir,
        clipId: state.selectedClipId,
        mode: "autoCenter",
        frameIds: state.selectedFrameIds
      }) as { project: Project };
      const selection = normalizeSelection(result.project, state.selectedClipId, state.selectedFrameIds, state.activeFrameIndex);
      set((prev) => ({
        project: result.project,
        selectedClipId: selection.selectedClipId,
        selectedFrameIds: selection.selectedFrameIds,
        activeFrameIndex: selection.activeFrameIndex,
        busy: false,
        status: "질량 중심 자동 정렬 완료",
        undoStack: prev.project ? [...prev.undoStack, deepCloneProject(prev.project)].slice(-100) : prev.undoStack,
        redoStack: []
      }));
    } catch (error) {
      set({ busy: false, status: `질량 중심 자동 정렬 실패: ${error instanceof Error ? error.message : String(error)}` });
    }
  },

  smartBottomAlign: async () => {
    const state = get();
    if (!state.projectDir || !state.selectedClipId) return;
    set({ busy: true, status: "하단 라인 정렬 중..." });
    try {
      const result = await window.spriteForge.applyAlignment({
        projectDir: state.projectDir,
        clipId: state.selectedClipId,
        mode: "smartBottom",
        frameIds: state.selectedFrameIds
      }) as { project: Project };
      const selection = normalizeSelection(result.project, state.selectedClipId, state.selectedFrameIds, state.activeFrameIndex);
      set((prev) => ({
        project: result.project,
        selectedClipId: selection.selectedClipId,
        selectedFrameIds: selection.selectedFrameIds,
        activeFrameIndex: selection.activeFrameIndex,
        busy: false,
        status: "하단 라인 정렬 완료",
        undoStack: prev.project ? [...prev.undoStack, deepCloneProject(prev.project)].slice(-100) : prev.undoStack,
        redoStack: []
      }));
    } catch (error) {
      set({ busy: false, status: `하단 라인 정렬 실패: ${error instanceof Error ? error.message : String(error)}` });
    }
  },

  reorderFrame: async (fromIndex, toIndex) => {
    const state = get();
    if (!state.projectDir || !state.selectedClipId) return;
    set({ busy: true, status: "프레임 순서 변경 중..." });
    try {
      const result = await window.spriteForge.timelineAction({
        projectDir: state.projectDir,
        clipId: state.selectedClipId,
        action: { type: "reorder", fromIndex, toIndex }
      }) as { project: Project };
      const selection = normalizeSelection(result.project, state.selectedClipId, state.selectedFrameIds, state.activeFrameIndex);
      set((prev) => ({
        project: result.project,
        selectedClipId: selection.selectedClipId,
        selectedFrameIds: selection.selectedFrameIds,
        activeFrameIndex: selection.activeFrameIndex,
        busy: false,
        status: "프레임 순서 변경 완료",
        undoStack: prev.project ? [...prev.undoStack, deepCloneProject(prev.project)].slice(-100) : prev.undoStack,
        redoStack: []
      }));
    } catch (error) {
      set({ busy: false, status: `프레임 순서 변경 실패: ${error instanceof Error ? error.message : String(error)}` });
    }
  },

  duplicateSelectedFrames: async () => {
    const state = get();
    if (!state.projectDir || !state.selectedClipId || !state.selectedFrameIds.length) return;
    set({ busy: true, status: "프레임 복제 중..." });
    try {
      const result = await window.spriteForge.timelineAction({
        projectDir: state.projectDir,
        clipId: state.selectedClipId,
        action: { type: "duplicate", frameIds: state.selectedFrameIds }
      }) as { project: Project };
      const selection = normalizeSelection(result.project, state.selectedClipId, state.selectedFrameIds, state.activeFrameIndex);
      set((prev) => ({
        project: result.project,
        selectedClipId: selection.selectedClipId,
        selectedFrameIds: selection.selectedFrameIds,
        activeFrameIndex: selection.activeFrameIndex,
        busy: false,
        status: "프레임 복제 완료",
        undoStack: prev.project ? [...prev.undoStack, deepCloneProject(prev.project)].slice(-100) : prev.undoStack,
        redoStack: []
      }));
    } catch (error) {
      set({ busy: false, status: `프레임 복제 실패: ${error instanceof Error ? error.message : String(error)}` });
    }
  },

  deleteSelectedFrames: async () => {
    const state = get();
    if (!state.projectDir || !state.selectedClipId || !state.selectedFrameIds.length) return;
    set({ busy: true, status: "프레임 삭제 중..." });
    try {
      const result = await window.spriteForge.timelineAction({
        projectDir: state.projectDir,
        clipId: state.selectedClipId,
        action: { type: "delete", frameIds: state.selectedFrameIds }
      }) as { project: Project };
      const selection = normalizeSelection(result.project, state.selectedClipId, [], state.activeFrameIndex);
      set((prev) => ({
        project: result.project,
        selectedClipId: selection.selectedClipId,
        selectedFrameIds: selection.selectedFrameIds,
        activeFrameIndex: selection.activeFrameIndex,
        busy: false,
        status: "프레임 삭제 완료",
        undoStack: prev.project ? [...prev.undoStack, deepCloneProject(prev.project)].slice(-100) : prev.undoStack,
        redoStack: []
      }));
    } catch (error) {
      set({ busy: false, status: `프레임 삭제 실패: ${error instanceof Error ? error.message : String(error)}` });
    }
  },

  setDelayForSelection: async (delayMs) => {
    const state = get();
    if (!state.projectDir || !state.selectedClipId || !state.selectedFrameIds.length) return;
    set({ busy: true, status: "지연시간을 업데이트하는 중..." });
    try {
      const result = await window.spriteForge.timelineAction({
        projectDir: state.projectDir,
        clipId: state.selectedClipId,
        action: { type: "setDelay", frameIds: state.selectedFrameIds, delayMs }
      }) as { project: Project };
      const selection = normalizeSelection(result.project, state.selectedClipId, state.selectedFrameIds, state.activeFrameIndex);
      set((prev) => ({
        project: result.project,
        selectedClipId: selection.selectedClipId,
        selectedFrameIds: selection.selectedFrameIds,
        activeFrameIndex: selection.activeFrameIndex,
        busy: false,
        status: "지연시간 업데이트 완료",
        undoStack: prev.project ? [...prev.undoStack, deepCloneProject(prev.project)].slice(-100) : prev.undoStack,
        redoStack: []
      }));
    } catch (error) {
      set({ busy: false, status: `지연시간 업데이트 실패: ${error instanceof Error ? error.message : String(error)}` });
    }
  },

  setLoopMode: async (loopMode) => {
    const state = get();
    if (!state.projectDir || !state.selectedClipId) return;
    set({ busy: true, status: "루프 모드 업데이트 중..." });
    try {
      const result = await window.spriteForge.timelineAction({
        projectDir: state.projectDir,
        clipId: state.selectedClipId,
        action: { type: "setLoopMode", loopMode }
      }) as { project: Project };
      const selection = normalizeSelection(result.project, state.selectedClipId, state.selectedFrameIds, state.activeFrameIndex);
      set((prev) => ({
        project: result.project,
        selectedClipId: selection.selectedClipId,
        selectedFrameIds: selection.selectedFrameIds,
        activeFrameIndex: selection.activeFrameIndex,
        busy: false,
        status: "루프 모드 업데이트 완료",
        undoStack: prev.project ? [...prev.undoStack, deepCloneProject(prev.project)].slice(-100) : prev.undoStack,
        redoStack: []
      }));
    } catch (error) {
      set({ busy: false, status: `루프 모드 업데이트 실패: ${error instanceof Error ? error.message : String(error)}` });
    }
  },

  cropFramesToActiveFrameSize: async () => {
    const state = get();
    if (!state.projectDir || !state.selectedClipId || !state.project) {
      return;
    }
    const clip = state.project.clips.find((c) => c.id === state.selectedClipId);
    if (!clip || !clip.frames.length) {
      return;
    }
    const baseFrame = clip.frames[state.activeFrameIndex];
    if (!baseFrame) {
      return;
    }

    set({ busy: true, status: "현재 프레임 기준으로 자르는 중..." });
    try {
      const result = await window.spriteForge.timelineAction({
        projectDir: state.projectDir,
        clipId: state.selectedClipId,
        action: { type: "matchSizeToFrame", baseFrameId: baseFrame.id }
      }) as { project: Project };

      const selection = normalizeSelection(result.project, state.selectedClipId, state.selectedFrameIds, state.activeFrameIndex);
      const nextCache = { ...state.imageCache };
      for (const frame of clip.frames) {
        delete nextCache[frame.srcPath];
      }

      set((prev) => ({
        project: result.project,
        selectedClipId: selection.selectedClipId,
        selectedFrameIds: selection.selectedFrameIds,
        activeFrameIndex: selection.activeFrameIndex,
        busy: false,
        status: "현재 프레임 기준으로 자르기 완료",
        imageCache: nextCache,
        undoStack: prev.project ? [...prev.undoStack, deepCloneProject(prev.project)].slice(-100) : prev.undoStack,
        redoStack: []
      }));
    } catch (error) {
      set({ busy: false, status: `자르기 실패: ${error instanceof Error ? error.message : String(error)}` });
    }
  },

  exportActiveClip: async () => {
    const state = get();
    if (!state.projectDir || !state.selectedClipId || !state.project) {
      return;
    }
    const clip = state.project.clips.find((c) => c.id === state.selectedClipId);
    if (!clip) {
      return;
    }

    const frameIds = state.exportSettings.frameScope === "selected"
      ? clip.frames.filter((frame) => state.selectedFrameIds.includes(frame.id)).map((frame) => frame.id)
      : undefined;

    if (state.exportSettings.frameScope === "selected" && (!frameIds || !frameIds.length)) {
      set({ status: "선택 모드에서는 최소 1개 이상의 프레임을 선택해야 합니다." });
      return;
    }

    let exportRoot = state.exportSettings.exportRoot;
    if (!exportRoot) {
      exportRoot = (await window.spriteForge.pickExportRoot()) ?? "";
      if (!exportRoot) {
        return;
      }
      set((prev) => ({ exportSettings: { ...prev.exportSettings, exportRoot } }));
    }

    set({ busy: true, status: "내보내는 중..." });
    try {
      const result = await window.spriteForge.exportClip({
        projectDir: state.projectDir,
        clipId: state.selectedClipId,
        exportRoot,
        exportMode: state.exportSettings.exportMode,
        padding: state.exportSettings.padding,
        allowRotate: state.exportSettings.allowRotate,
        frameIds
      }) as { exportDir: string; metaPath: string };

      set(() => ({
        busy: false,
        status: `내보내기 완료: ${frameIds?.length ?? clip.frames.length}프레임 (${result.exportDir})`
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("Unable to pack sprites within max texture size")) {
        const maxTexture = clip.unity.maxTextureSize;
        set({
          busy: false,
          status: `내보내기 실패: 시트 패킹이 ${maxTexture} 제한을 초과했습니다. 해결: 최대 텍스처 크기를 4096으로 올리거나, 프레임 범위를 줄이거나, 시퀀스 모드를 사용하세요.`
        });
        return;
      }
      set({ busy: false, status: `내보내기 실패: ${message}` });
    }
  },

  exportActiveClipOneClick: async () => {
    const state = get();
    if (!state.projectDir || !state.selectedClipId || !state.project) {
      return;
    }

    const originalClip = state.project.clips.find((c) => c.id === state.selectedClipId);
    if (!originalClip) {
      return;
    }

    const presetClip: Clip = JSON.parse(JSON.stringify(originalClip)) as Clip;
    if (!presetClip.inspector.trimPad) {
      presetClip.inspector.trimPad = { mode: "trim", padTo: "maxBounds", alphaThreshold: 0.03 };
    }
    presetClip.inspector.trimPad.mode = "trim";
    presetClip.inspector.trimPad.padTo = "maxBounds";
    presetClip.inspector.trimPad.alphaThreshold = 0.03;
    presetClip.unity.maxTextureSize = 4096;

    await get().updateClip(presetClip, "딸깍 내보내기 프리셋 적용", true);
    set((prev) => ({
      exportSettings: {
        ...prev.exportSettings,
        exportMode: "sheet",
        padding: 1,
        allowRotate: true
      }
    }));

    const refreshed = get();
    if (!refreshed.projectDir || !refreshed.selectedClipId || !refreshed.project) {
      return;
    }
    const clip = refreshed.project.clips.find((c) => c.id === refreshed.selectedClipId);
    if (!clip) {
      return;
    }

    const frameIds = refreshed.exportSettings.frameScope === "selected"
      ? clip.frames.filter((frame) => refreshed.selectedFrameIds.includes(frame.id)).map((frame) => frame.id)
      : undefined;

    if (refreshed.exportSettings.frameScope === "selected" && (!frameIds || !frameIds.length)) {
      set({ status: "선택 모드에서는 최소 1개 이상의 프레임을 선택해야 합니다." });
      return;
    }

    let exportRoot = refreshed.exportSettings.exportRoot;
    if (!exportRoot) {
      exportRoot = (await window.spriteForge.pickExportRoot()) ?? "";
      if (!exportRoot) {
        return;
      }
      set((prev) => ({ exportSettings: { ...prev.exportSettings, exportRoot } }));
    }

    set({ busy: true, status: "딸깍 내보내기 실행 중..." });
    try {
      const sheetResult = await window.spriteForge.exportClip({
        projectDir: refreshed.projectDir,
        clipId: refreshed.selectedClipId,
        exportRoot,
        exportMode: "sheet",
        padding: 1,
        allowRotate: true,
        frameIds
      }) as { exportDir: string; metaPath: string };

      set({
        busy: false,
        status: `딸깍 내보내기 완료: 시트로 저장됨 (${sheetResult.exportDir})`
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes("Unable to pack sprites within max texture size")) {
        set({ busy: false, status: `딸깍 내보내기 실패: ${message}` });
        return;
      }

      try {
        const sequenceResult = await window.spriteForge.exportClip({
          projectDir: refreshed.projectDir,
          clipId: refreshed.selectedClipId,
          exportRoot,
          exportMode: "sequence",
          padding: 1,
          allowRotate: true,
          frameIds
        }) as { exportDir: string; metaPath: string };

        set((prev) => ({
          busy: false,
          exportSettings: { ...prev.exportSettings, exportMode: "sequence" },
          status: `딸깍 내보내기 완료: 시트 용량 초과로 시퀀스로 자동 대체됨 (${sequenceResult.exportDir})`
        }));
      } catch (sequenceError) {
        set({
          busy: false,
          status: `딸깍 내보내기 실패: ${sequenceError instanceof Error ? sequenceError.message : String(sequenceError)}`
        });
      }
    }
  },

  convertSpriteSheetToAutoGif: async (options: SpriteAutoGifOptions): Promise<SpriteAutoGifResult | null> => {
    const state = get();
    if (!state.projectDir) {
      return null;
    }
    if (!options.inputPath) {
      set({ status: "스프라이트 시트 파일을 먼저 선택하세요." });
      return null;
    }

    set({ busy: true, status: "스프라이트 시트를 자동 변환하는 중..." });
    try {
      const result = await window.spriteForge.convertSpriteSheetAutoGif({
        projectDir: state.projectDir,
        inputPath: options.inputPath,
        outputDir: options.outputDir,
        delayMs: options.delayMs,
        alphaThreshold: options.alphaThreshold,
        mergeThreshold: options.mergeThreshold,
        removeBackground: options.removeBackground,
        backgroundTolerance: options.backgroundTolerance,
        exportGif: options.exportGif ?? false
      }) as {
        project: Project;
        clipId: string;
        clipName: string;
        frameCount: number;
        exportDir: string | null;
        gifPath: string | null;
      };

      const selection = normalizeSelection(result.project, result.clipId, [], 0);
      set((prev) => ({
        project: result.project,
        selectedClipId: selection.selectedClipId,
        selectedFrameIds: selection.selectedFrameIds,
        activeFrameIndex: selection.activeFrameIndex,
        busy: false,
        status: result.gifPath
          ? `자동 변환 완료: ${result.frameCount}프레임 (${result.gifPath})`
          : `스프라이트 시트 가져오기 완료: ${result.frameCount}프레임`,
        undoStack: prev.project ? [...prev.undoStack, deepCloneProject(prev.project)].slice(-100) : prev.undoStack,
        redoStack: []
      }));

      return {
        clipId: result.clipId,
        clipName: result.clipName,
        frameCount: result.frameCount,
        exportDir: result.exportDir,
        gifPath: result.gifPath
      };
    } catch (error) {
      set({ busy: false, status: `자동 변환 실패: ${error instanceof Error ? error.message : String(error)}` });
      return null;
    }
  },

  setExportSettings: (patch) => set((state) => ({ exportSettings: { ...state.exportSettings, ...patch } })),
  setSpriteSheetSettings: (patch) => set((state) => ({ spriteSheetSettings: { ...state.spriteSheetSettings, ...patch } })),
  setActiveHelpTopic: (activeHelpTopic) => set({ activeHelpTopic }),

  getImageDataUrl: async (filePath) => {
    const cached = get().imageCache[filePath];
    if (cached) {
      return cached;
    }
    const dataUrl = await window.spriteForge.readImageDataUrl(filePath);
    set((state) => ({
      imageCache: {
        ...state.imageCache,
        [filePath]: dataUrl
      }
    }));
    return dataUrl;
  },

  writeImageDataUrl: async (filePath, dataUrl) => {
    await window.spriteForge.writeImageDataUrl({ filePath, dataUrl });
    set((state) => {
      const next = { ...state.imageCache };
      delete next[filePath];
      return {
        imageCache: next,
        status: `저장 완료: ${filePath}`
      };
    });
  },

  undo: async () => {
    const state = get();
    if (!state.project || !state.undoStack.length || !state.projectDir) {
      return;
    }

    const previous = deepCloneProject(state.undoStack[state.undoStack.length - 1]);
    const nextUndo = state.undoStack.slice(0, -1);
    const nextRedo = [...state.redoStack, deepCloneProject(state.project)].slice(-100);
    await persistProject(state.projectDir, previous);
    const selection = normalizeSelection(previous, state.selectedClipId, state.selectedFrameIds, state.activeFrameIndex);

    set(() => ({
      project: previous,
      selectedClipId: selection.selectedClipId,
      selectedFrameIds: selection.selectedFrameIds,
      activeFrameIndex: selection.activeFrameIndex,
      undoStack: nextUndo,
      redoStack: nextRedo,
      status: "실행 취소"
    }));
  },

  redo: async () => {
    const state = get();
    if (!state.project || !state.redoStack.length || !state.projectDir) {
      return;
    }

    const next = deepCloneProject(state.redoStack[state.redoStack.length - 1]);
    const nextRedo = state.redoStack.slice(0, -1);
    const nextUndo = [...state.undoStack, deepCloneProject(state.project)].slice(-100);
    await persistProject(state.projectDir, next);
    const selection = normalizeSelection(next, state.selectedClipId, state.selectedFrameIds, state.activeFrameIndex);

    set(() => ({
      project: next,
      selectedClipId: selection.selectedClipId,
      selectedFrameIds: selection.selectedFrameIds,
      activeFrameIndex: selection.activeFrameIndex,
      undoStack: nextUndo,
      redoStack: nextRedo,
      status: "다시 실행"
    }));
  }
}));

let lastPersistedEditorPrefs = "";
try {
  lastPersistedEditorPrefs = JSON.stringify(pickPersistedEditorPrefs(useEditorStore.getState()));
} catch {
  lastPersistedEditorPrefs = "";
}

useEditorStore.subscribe((state) => {
  const next = pickPersistedEditorPrefs(state);
  let serialized = "";
  try {
    serialized = JSON.stringify(next);
  } catch {
    return;
  }
  if (serialized === lastPersistedEditorPrefs) {
    return;
  }
  lastPersistedEditorPrefs = serialized;
  persistEditorPrefs(next);
});
