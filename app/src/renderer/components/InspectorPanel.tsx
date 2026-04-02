import type { Clip, Frame } from "@sprite-forge/core";
import { useMemo, useState, type ReactNode } from "react";
import { useI18n } from "../i18n";
import { useEditorStore } from "../state/editorStore";
import { useCurrentClip } from "../utils/selectors";

type InspectorSectionKey =
  | "spriteSelection"
  | "spriteChroma"
  | "spriteAdjustments"
  | "spriteTrim"
  | "spriteSlicing"
  | "exportSelection"
  | "exportOutput"
  | "pixelSelection"
  | "pixelGuide";

interface SectionProps {
  id: string;
  sectionKey: InspectorSectionKey;
  title: string;
  helpTopic?: string;
  badge?: string;
  children: ReactNode;
}

const defaultInspector = {
  chromaKey: {
    enabled: false,
    keyColor: "#00ff00" as `#${string}`,
    tolerance: 0.18,
    despill: 0.3
  },
  adjustments: {
    brightness: 1,
    contrast: 1,
    saturation: 1,
    hue: 0,
    pixelPerfectScaling: true,
    flipH: false
  },
  trimPad: {
    mode: "none" as const,
    padTo: "maxBounds" as const,
    alphaThreshold: 0.03
  }
};

function cloneClip(clip: Clip): Clip {
  return JSON.parse(JSON.stringify(clip)) as Clip;
}

function formatExportMode(mode: "sheet" | "sequence" | "gif"): string {
  if (mode === "sequence") {
    return "PNG 시퀀스";
  }
  if (mode === "gif") {
    return "GIF";
  }
  return "스프라이트 시트";
}

function formatLoopMode(mode: Clip["loopMode"]): string {
  if (mode === "once") {
    return "1회 재생";
  }
  if (mode === "pingpong") {
    return "왕복";
  }
  if (mode === "reverse") {
    return "역방향 반복";
  }
  return "반복";
}

function formatSourceType(type: Clip["source"]["type"]): string {
  if (type === "png_sequence") {
    return "PNG 시퀀스";
  }
  if (type === "sprite_sheet") {
    return "스프라이트 시트";
  }
  if (type === "webp") {
    return "WebP";
  }
  if (type === "video") {
    return "동영상";
  }
  return "GIF";
}

function sumDuration(frames: Frame[]): number {
  return frames.reduce((total, frame) => total + frame.delayMs, 0);
}

export function InspectorPanel(): JSX.Element {
  const { t } = useI18n();
  const clip = useCurrentClip();
  const selectedFrameIds = useEditorStore((s) => s.selectedFrameIds);
  const activeFrameIndex = useEditorStore((s) => s.activeFrameIndex);
  const tab = useEditorStore((s) => s.tab);
  const updateClip = useEditorStore((s) => s.updateClip);
  const autoCenterMass = useEditorStore((s) => s.autoCenterMass);
  const smartBottomAlign = useEditorStore((s) => s.smartBottomAlign);
  const setPivotBottomCenter = useEditorStore((s) => s.setPivotBottomCenter);
  const setActiveHelpTopic = useEditorStore((s) => s.setActiveHelpTopic);
  const exportSettings = useEditorStore((s) => s.exportSettings);
  const setExportSettings = useEditorStore((s) => s.setExportSettings);
  const spriteSheetSettings = useEditorStore((s) => s.spriteSheetSettings);
  const setSpriteSheetSettings = useEditorStore((s) => s.setSpriteSheetSettings);
  const exportActiveClip = useEditorStore((s) => s.exportActiveClip);
  const exportActiveClipOneClick = useEditorStore((s) => s.exportActiveClipOneClick);

  const [openSections, setOpenSections] = useState<Record<InspectorSectionKey, boolean>>({
    spriteSelection: true,
    spriteChroma: false,
    spriteAdjustments: true,
    spriteTrim: false,
    spriteSlicing: false,
    exportSelection: false,
    exportOutput: true,
    pixelSelection: false,
    pixelGuide: true
  });

  const selectedFrame = useMemo<Frame | null>(() => {
    if (!clip) {
      return null;
    }
    const byActiveIndex = clip.frames[activeFrameIndex] ?? null;
    if (byActiveIndex) {
      return byActiveIndex;
    }
    return clip.frames.find((frame) => frame.id === selectedFrameIds[0]) ?? null;
  }, [activeFrameIndex, clip, selectedFrameIds]);

  const selectedFrameCount = selectedFrameIds.length || (selectedFrame ? 1 : 0);
  const targetFrameIds = useMemo(
    () => (selectedFrameIds.length ? selectedFrameIds : selectedFrame ? [selectedFrame.id] : []),
    [selectedFrame, selectedFrameIds]
  );

  const chromaKey = clip?.inspector.chromaKey ?? defaultInspector.chromaKey;
  const adjustments = clip?.inspector.adjustments ?? defaultInspector.adjustments;
  const trimPad = clip?.inspector.trimPad ?? defaultInspector.trimPad;

  const patchClip = (action: string, mutator: (next: Clip) => void, withUndo = false) => {
    if (!clip) {
      return;
    }
    const next = cloneClip(clip);
    mutator(next);
    void updateClip(next, action, withUndo);
  };

  const setSectionOpen = (sectionKey: InspectorSectionKey, open: boolean) => {
    setOpenSections((prev) => ({ ...prev, [sectionKey]: open }));
  };

  const toggleSection = (sectionKey: InspectorSectionKey, helpTopic?: string) => {
    if (helpTopic) {
      setActiveHelpTopic(helpTopic);
    }
    setOpenSections((prev) => ({ ...prev, [sectionKey]: !prev[sectionKey] }));
  };

  const jumpToSection = (id: string, sectionKey: InspectorSectionKey, helpTopic?: string) => {
    if (helpTopic) {
      setActiveHelpTopic(helpTopic);
    }
    setSectionOpen(sectionKey, true);
    window.requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({ block: "start", behavior: "smooth" });
    });
  };

  const renderSection = ({ id, sectionKey, title, helpTopic, badge, children }: SectionProps): JSX.Element => {
    const open = openSections[sectionKey];
    return (
      <section id={id} className="inspector-block">
        <div className="inspector-section-header">
          <button
            type="button"
            className="inspector-section-title"
            onClick={() => toggleSection(sectionKey, helpTopic)}
          >
            <span>{title}</span>
            {badge ? <span className="inspector-section-badge">{badge}</span> : null}
          </button>
          <button
            type="button"
            className="inspector-section-toggle"
            onClick={() => toggleSection(sectionKey, helpTopic)}
          >
            {open ? "접기" : "펼치기"}
          </button>
        </div>
        {open ? <div className="inspector-section-body">{children}</div> : null}
      </section>
    );
  };

  const selectionSection = clip
    ? renderSection({
        id: "inspector-selection",
        sectionKey: tab === "export" ? "exportSelection" : tab === "pixel" ? "pixelSelection" : "spriteSelection",
        title: t("selection"),
        helpTopic: "inspector_selection",
        badge: selectedFrame ? `프레임 ${activeFrameIndex + 1}` : undefined,
        children: (
          <>
            <p className="muted">{t("offset_current_only_hint")}</p>
            <div className="inspector-inline-summary">
              <span>선택 {selectedFrameCount}개</span>
              <span>캔버스 {clip.canvas.width} x {clip.canvas.height}</span>
              <span>루프 {formatLoopMode(clip.loopMode)}</span>
            </div>
            <div className="grid-two">
              <label>
                오프셋 X
                <input
                  type="number"
                  value={selectedFrame?.offsetPx.x ?? 0}
                  onChange={(event) => {
                    if (!selectedFrame) {
                      return;
                    }
                    const value = Number(event.target.value);
                    patchClip("오프셋 X 변경", (next) => {
                      const target = next.frames.find((frame) => frame.id === selectedFrame.id);
                      if (target) {
                        target.offsetPx.x = value;
                      }
                    });
                  }}
                />
              </label>
              <label>
                오프셋 Y
                <input
                  type="number"
                  value={selectedFrame?.offsetPx.y ?? 0}
                  onChange={(event) => {
                    if (!selectedFrame) {
                      return;
                    }
                    const value = Number(event.target.value);
                    patchClip("오프셋 Y 변경", (next) => {
                      const target = next.frames.find((frame) => frame.id === selectedFrame.id);
                      if (target) {
                        target.offsetPx.y = value;
                      }
                    });
                  }}
                />
              </label>
              <label>
                피벗 X
                <input
                  type="number"
                  step={0.01}
                  min={0}
                  max={1}
                  value={selectedFrame?.pivotNorm.x ?? 0.5}
                  onChange={(event) => {
                    const value = Math.max(0, Math.min(1, Number(event.target.value)));
                    patchClip("피벗 X 변경", (next) => {
                      for (const frame of next.frames) {
                        if (targetFrameIds.includes(frame.id)) {
                          frame.pivotNorm.x = value;
                        }
                      }
                    });
                  }}
                />
              </label>
              <label>
                피벗 Y
                <input
                  type="number"
                  step={0.01}
                  min={0}
                  max={1}
                  value={selectedFrame?.pivotNorm.y ?? 0}
                  onChange={(event) => {
                    const value = Math.max(0, Math.min(1, Number(event.target.value)));
                    patchClip("피벗 Y 변경", (next) => {
                      for (const frame of next.frames) {
                        if (targetFrameIds.includes(frame.id)) {
                          frame.pivotNorm.y = value;
                        }
                      }
                    });
                  }}
                />
              </label>
              <label>
                스케일 X
                <input
                  type="number"
                  step={0.01}
                  min={0.05}
                  max={8}
                  value={selectedFrame?.scale?.x ?? 1}
                  onChange={(event) => {
                    if (!selectedFrame) {
                      return;
                    }
                    const value = Math.max(0.05, Math.min(8, Number(event.target.value)));
                    patchClip("스케일 X 변경", (next) => {
                      const target = next.frames.find((frame) => frame.id === selectedFrame.id);
                      if (!target) {
                        return;
                      }
                      target.scale = { x: value, y: target.scale?.y ?? 1 };
                    });
                  }}
                />
              </label>
              <label>
                스케일 Y
                <input
                  type="number"
                  step={0.01}
                  min={0.05}
                  max={8}
                  value={selectedFrame?.scale?.y ?? 1}
                  onChange={(event) => {
                    if (!selectedFrame) {
                      return;
                    }
                    const value = Math.max(0.05, Math.min(8, Number(event.target.value)));
                    patchClip("스케일 Y 변경", (next) => {
                      const target = next.frames.find((frame) => frame.id === selectedFrame.id);
                      if (!target) {
                        return;
                      }
                      target.scale = { x: target.scale?.x ?? 1, y: value };
                    });
                  }}
                />
              </label>
            </div>
            <div className="row-buttons">
              <button
                type="button"
                onClick={() => {
                  if (!selectedFrame) {
                    return;
                  }
                  setActiveHelpTopic("inspector_selection");
                  patchClip("현재 프레임 변환 초기화", (next) => {
                    const target = next.frames.find((frame) => frame.id === selectedFrame.id);
                    if (!target) {
                      return;
                    }
                    target.offsetPx = { x: 0, y: 0 };
                    target.pivotNorm = { x: 0.5, y: 0 };
                    target.scale = { x: 1, y: 1 };
                  }, true);
                }}
              >
                {t("reset_current_frame_transform")}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!selectedFrame) {
                    return;
                  }
                  setActiveHelpTopic("inspector_selection");
                  patchClip("현재 프레임 오프셋 전체 적용", (next) => {
                    for (const frame of next.frames) {
                      frame.offsetPx = { ...selectedFrame.offsetPx };
                    }
                  }, true);
                }}
              >
                {t("offset_apply_current_to_all")}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!selectedFrame) {
                    return;
                  }
                  const currentScale = selectedFrame.scale ?? { x: 1, y: 1 };
                  setActiveHelpTopic("inspector_selection");
                  patchClip("현재 프레임 스케일 전체 적용", (next) => {
                    for (const frame of next.frames) {
                      frame.scale = { ...currentScale };
                    }
                  }, true);
                }}
              >
                {t("scale_apply_current_to_all")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveHelpTopic("inspector_selection");
                  void setPivotBottomCenter();
                }}
              >
                {t("set_all_pivots_bottom_center")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveHelpTopic("viewport_align_center");
                  void autoCenterMass();
                }}
              >
                {t("auto_center_mass")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveHelpTopic("viewport_align_bottom");
                  void smartBottomAlign();
                }}
              >
                {t("smart_bottom_align")}
              </button>
            </div>
          </>
        )
      })
    : null;

  return (
    <aside className="panel right-panel">
      <h2>{t("inspector")}</h2>
      {!clip ? <div className="muted">{t("no_clip_selected")}</div> : null}
      {clip && tab === "sprite" ? (
        <div className="inspector-scroll">
          <section className="inspector-block inspector-summary-card">
            <div className="inspector-summary-grid">
              <div>
                <span className="muted">{t("left_panel_selected_clip")}</span>
                <strong>{clip.name}</strong>
              </div>
              <div>
                <span className="muted">{t("timeline_selection_summary")}</span>
                <strong>{selectedFrameCount} {t("timeline_selection_frames")}</strong>
              </div>
              <div>
                <span className="muted">소스</span>
                <strong>{formatSourceType(clip.source.type)}</strong>
              </div>
            </div>
            <div className="inspector-inline-summary">
              <span>전체 길이 {sumDuration(clip.frames)}ms</span>
              <span>캔버스 {clip.canvas.width} x {clip.canvas.height}</span>
              <span>루프 {formatLoopMode(clip.loopMode)}</span>
            </div>
            <div className="inspector-chip-row">
              <button type="button" onClick={() => jumpToSection("inspector-selection", "spriteSelection", "inspector_selection")}>
                {t("selection")}
              </button>
              <button type="button" onClick={() => jumpToSection("inspector-chroma", "spriteChroma", "inspector_chroma")}>
                크로마 키
              </button>
              <button type="button" onClick={() => jumpToSection("inspector-adjustments", "spriteAdjustments", "inspector_adjustments")}>
                {t("inspector_tab_adjustments")}
              </button>
              <button type="button" onClick={() => jumpToSection("inspector-trim", "spriteTrim", "inspector_trim")}>
                트림/패딩
              </button>
              <button type="button" onClick={() => jumpToSection("inspector-slicing", "spriteSlicing", "inspector_slicing")}>
                {t("inspector_tab_export_ready")}
              </button>
            </div>
          </section>

          {selectionSection}

          {renderSection({
            id: "inspector-chroma",
            sectionKey: "spriteChroma",
            title: "크로마 키",
            helpTopic: "inspector_chroma",
            badge: chromaKey.enabled ? "활성" : "비활성",
            children: (
              <>
                <p className="muted">{t("help_inspector_chroma_desc")}</p>
                <label className="inline-check">
                  <input
                    type="checkbox"
                    checked={chromaKey.enabled}
                    onChange={(event) =>
                      patchClip("크로마 키 사용", (next) => {
                        next.inspector.chromaKey = next.inspector.chromaKey ?? { ...defaultInspector.chromaKey };
                        next.inspector.chromaKey.enabled = event.target.checked;
                      }, true)
                    }
                  />
                  사용
                </label>
                <div className="grid-two">
                  <label>
                    키 컬러
                    <input
                      type="color"
                      value={chromaKey.keyColor}
                      onChange={(event) =>
                        patchClip("크로마 키 색상 변경", (next) => {
                          next.inspector.chromaKey = next.inspector.chromaKey ?? { ...defaultInspector.chromaKey };
                          next.inspector.chromaKey.keyColor = event.target.value as `#${string}`;
                        })
                      }
                    />
                  </label>
                  <label>
                    허용치
                    <input
                      type="number"
                      step={0.01}
                      min={0}
                      max={1}
                      value={chromaKey.tolerance}
                      onChange={(event) =>
                        patchClip("크로마 허용치 변경", (next) => {
                          next.inspector.chromaKey = next.inspector.chromaKey ?? { ...defaultInspector.chromaKey };
                          next.inspector.chromaKey.tolerance = Number(event.target.value);
                        })
                      }
                    />
                  </label>
                  <label>
                    디스필
                    <input
                      type="number"
                      step={0.01}
                      min={0}
                      max={1}
                      value={chromaKey.despill}
                      onChange={(event) =>
                        patchClip("크로마 디스필 변경", (next) => {
                          next.inspector.chromaKey = next.inspector.chromaKey ?? { ...defaultInspector.chromaKey };
                          next.inspector.chromaKey.despill = Number(event.target.value);
                        })
                      }
                    />
                  </label>
                </div>
              </>
            )
          })}

          {renderSection({
            id: "inspector-adjustments",
            sectionKey: "spriteAdjustments",
            title: t("inspector_tab_adjustments"),
            helpTopic: "inspector_adjustments",
            badge: adjustments.flipH ? "좌우 반전" : undefined,
            children: (
              <>
                <p className="muted">{t("help_inspector_adjustments_desc")}</p>
                <div className="grid-two">
                  <label>
                    밝기
                    <input type="number" step={0.05} value={adjustments.brightness} onChange={(event) => patchClip("밝기 변경", (next) => {
                      next.inspector.adjustments = next.inspector.adjustments ?? { ...defaultInspector.adjustments };
                      next.inspector.adjustments.brightness = Number(event.target.value);
                    })} />
                  </label>
                  <label>
                    대비
                    <input type="number" step={0.05} value={adjustments.contrast} onChange={(event) => patchClip("대비 변경", (next) => {
                      next.inspector.adjustments = next.inspector.adjustments ?? { ...defaultInspector.adjustments };
                      next.inspector.adjustments.contrast = Number(event.target.value);
                    })} />
                  </label>
                  <label>
                    채도
                    <input type="number" step={0.05} value={adjustments.saturation} onChange={(event) => patchClip("채도 변경", (next) => {
                      next.inspector.adjustments = next.inspector.adjustments ?? { ...defaultInspector.adjustments };
                      next.inspector.adjustments.saturation = Number(event.target.value);
                    })} />
                  </label>
                  <label>
                    색조
                    <input type="number" step={1} value={adjustments.hue} onChange={(event) => patchClip("색조 변경", (next) => {
                      next.inspector.adjustments = next.inspector.adjustments ?? { ...defaultInspector.adjustments };
                      next.inspector.adjustments.hue = Number(event.target.value);
                    })} />
                  </label>
                </div>
                <label className="inline-check">
                  <input type="checkbox" checked={adjustments.pixelPerfectScaling} onChange={(event) => patchClip("픽셀 퍼펙트 스케일링 변경", (next) => {
                    next.inspector.adjustments = next.inspector.adjustments ?? { ...defaultInspector.adjustments };
                    next.inspector.adjustments.pixelPerfectScaling = event.target.checked;
                  }, true)} />
                  픽셀 퍼펙트 스케일링 사용
                </label>
                <label className="inline-check">
                  <input type="checkbox" checked={adjustments.flipH} onChange={(event) => patchClip("좌우 반전 변경", (next) => {
                    next.inspector.adjustments = next.inspector.adjustments ?? { ...defaultInspector.adjustments };
                    next.inspector.adjustments.flipH = event.target.checked;
                  }, true)} />
                  좌우 반전
                </label>
              </>
            )
          })}
          {renderSection({
            id: "inspector-trim",
            sectionKey: "spriteTrim",
            title: "트림 / 패딩",
            helpTopic: "inspector_trim",
            badge: trimPad.mode === "none" ? "사용 안 함" : trimPad.mode === "trim" ? "트림" : "패딩",
            children: (
              <>
                <p className="muted">{t("help_inspector_trim_desc")}</p>
                <div className="grid-two">
                  <label>
                    모드
                    <select value={trimPad.mode} onChange={(event) => patchClip("트림 모드 변경", (next) => {
                      next.inspector.trimPad = next.inspector.trimPad ?? { ...defaultInspector.trimPad };
                      next.inspector.trimPad.mode = event.target.value as "none" | "trim" | "pad";
                    }, true)}>
                      <option value="none">없음</option>
                      <option value="trim">트림</option>
                      <option value="pad">패딩</option>
                    </select>
                  </label>
                  <label>
                    패딩 기준
                    <select value={trimPad.padTo} onChange={(event) => patchClip("패딩 기준 변경", (next) => {
                      next.inspector.trimPad = next.inspector.trimPad ?? { ...defaultInspector.trimPad };
                      next.inspector.trimPad.padTo = event.target.value as "maxBounds" | "canvas";
                    }, true)}>
                      <option value="maxBounds">최대 경계 기준</option>
                      <option value="canvas">캔버스 기준</option>
                    </select>
                  </label>
                  <label>
                    알파 임계값
                    <input type="number" step={0.01} min={0} max={1} value={trimPad.alphaThreshold} onChange={(event) => patchClip("트림 임계값 변경", (next) => {
                      next.inspector.trimPad = next.inspector.trimPad ?? { ...defaultInspector.trimPad };
                      next.inspector.trimPad.alphaThreshold = Number(event.target.value);
                    })} />
                  </label>
                </div>
              </>
            )
          })}
          {renderSection({
            id: "inspector-slicing",
            sectionKey: "spriteSlicing",
            title: "슬라이싱 / 패킹",
            helpTopic: "inspector_slicing",
            badge: spriteSheetSettings.mode === "auto" ? "자동" : "그리드",
            children: (
              <>
                <p className="muted">{t("help_inspector_slicing_desc")}</p>
                <div className="grid-two">
                  <label>
                    슬라이싱 모드
                    <select value={spriteSheetSettings.mode} onChange={(event) => setSpriteSheetSettings({ mode: event.target.value as "grid" | "auto" })}>
                      <option value="grid">그리드</option>
                      <option value="auto">자동</option>
                    </select>
                  </label>
                  <label>
                    열 수
                    <input type="number" min={1} value={spriteSheetSettings.cols} onChange={(event) => setSpriteSheetSettings({ cols: Number(event.target.value) })} />
                  </label>
                  <label>
                    행 수
                    <input type="number" min={1} value={spriteSheetSettings.rows} onChange={(event) => setSpriteSheetSettings({ rows: Number(event.target.value) })} />
                  </label>
                  <label>
                    자동 알파 임계값
                    <input type="number" step={0.01} min={0} max={1} value={spriteSheetSettings.alphaThreshold} onChange={(event) => setSpriteSheetSettings({ alphaThreshold: Number(event.target.value) })} />
                  </label>
                  <label>
                    자동 병합 거리
                    <input type="number" min={0} step={1} value={spriteSheetSettings.mergeThreshold} onChange={(event) => setSpriteSheetSettings({ mergeThreshold: Number(event.target.value) })} />
                  </label>
                  <label>
                    시트 여백
                    <input type="number" min={0} value={exportSettings.padding} onChange={(event) => setExportSettings({ padding: Number(event.target.value) })} />
                  </label>
                </div>
                <label className="inline-check">
                  <input type="checkbox" checked={exportSettings.allowRotate} onChange={(event) => setExportSettings({ allowRotate: event.target.checked })} />
                  {t("allow_rotation")}
                </label>
              </>
            )
          })}
        </div>
      ) : null}

      {tab === "export" ? (
        <div className="inspector-scroll">
          <section className="inspector-block inspector-summary-card">
            <div className="inspector-summary-grid">
              <div>
                <span className="muted">{t("left_panel_selected_clip")}</span>
                <strong>{clip?.name ?? "-"}</strong>
              </div>
              <div>
                <span className="muted">{t("export_frame_scope")}</span>
                <strong>{exportSettings.frameScope === "all" ? t("export_scope_all") : t("export_scope_selected")}</strong>
              </div>
              <div>
                <span className="muted">{t("export_mode")}</span>
                <strong>{formatExportMode(exportSettings.exportMode)}</strong>
              </div>
            </div>
            <div className="inspector-inline-summary">
              <span>선택 프레임 {selectedFrameCount}개</span>
              <span>패딩 {exportSettings.padding}px</span>
              <span>회전 {exportSettings.allowRotate ? "허용" : "미허용"}</span>
            </div>
            <div className="inspector-chip-row">
              <button type="button" onClick={() => jumpToSection("inspector-selection", "exportSelection", "inspector_selection")}>
                {t("selection")}
              </button>
              <button type="button" onClick={() => jumpToSection("inspector-export", "exportOutput", "export_scope_all")}>
                {t("export_clip")}
              </button>
            </div>
          </section>

          {selectionSection}

          {renderSection({
            id: "inspector-export",
            sectionKey: "exportOutput",
            title: "내보내기 설정",
            helpTopic: "export_scope_all",
            badge: formatExportMode(exportSettings.exportMode),
            children: (
              <>
                <div className="inspector-callout">
                  <strong>{t("inspector_export_callout_title")}</strong>
                  <p className="muted">{t("inspector_export_callout_desc")}</p>
                </div>
                <label>
                  {t("export_mode")}
                  <select value={exportSettings.exportMode} onChange={(event) => {
                    setExportSettings({ exportMode: event.target.value as "sheet" | "sequence" | "gif" });
                    setActiveHelpTopic("export_mode");
                  }}>
                    <option value="sheet">스프라이트 시트</option>
                    <option value="sequence">PNG 시퀀스</option>
                    <option value="gif">GIF</option>
                  </select>
                </label>
                {exportSettings.exportMode === "sheet" ? <div className="inspector-callout"><strong>스프라이트 시트</strong><p className="muted">`sheet.png`와 `meta.json`을 함께 출력합니다. 프레임 위치, 피벗, 오프셋 정보가 메타에 기록됩니다.</p></div> : null}
                {exportSettings.exportMode === "sequence" ? <div className="inspector-callout"><strong>PNG 시퀀스</strong><p className="muted">프레임별 PNG 파일과 `meta.json`을 출력합니다. 외부 툴로 넘기기 쉬운 포맷입니다.</p></div> : null}
                {exportSettings.exportMode === "gif" ? <div className="inspector-callout"><strong>GIF</strong><p className="muted">애니메이션 미리보기와 공유용 결과물이 필요할 때 적합합니다.</p></div> : null}
                <label>
                  {t("export_frame_scope")}
                  <select value={exportSettings.frameScope} onChange={(event) => {
                    setExportSettings({ frameScope: event.target.value as "all" | "selected" });
                    setActiveHelpTopic(event.target.value === "selected" ? "export_scope_selected" : "export_scope_all");
                  }}>
                    <option value="all">{t("export_scope_all")}</option>
                    <option value="selected">{t("export_scope_selected")}</option>
                  </select>
                </label>
                <label>
                  {t("export_root")}
                  <input type="text" value={exportSettings.exportRoot} onChange={(event) => setExportSettings({ exportRoot: event.target.value })} placeholder="내보내기 폴더 경로" />
                </label>
                <div className="grid-two">
                  <label>
                    {t("packing_padding")}
                    <input type="number" value={exportSettings.padding} onChange={(event) => setExportSettings({ padding: Number(event.target.value) })} />
                  </label>
                  <label className="inline-check">
                    <input type="checkbox" checked={exportSettings.allowRotate} onChange={(event) => setExportSettings({ allowRotate: event.target.checked })} />
                    {t("allow_rotation")}
                  </label>
                  <label className="inline-check">
                    <input type="checkbox" checked={clip?.inspector.adjustments?.flipH ?? false} onChange={(event) => patchClip("내보내기 좌우 반전", (next) => {
                      next.inspector.adjustments = next.inspector.adjustments ?? { ...defaultInspector.adjustments };
                      next.inspector.adjustments.flipH = event.target.checked;
                    }, true)} disabled={!clip} />
                    좌우 반전
                  </label>
                </div>
                <div className="muted">
                  {exportSettings.frameScope === "all" ? t("export_scope_all_desc") : `${t("export_scope_selected_desc")} (${selectedFrameCount})`}
                </div>
                <div className="row-buttons">
                  <button className="accent" type="button" onClick={() => void exportActiveClip()} disabled={!clip}>{t("export_clip")}</button>
                  <button type="button" onClick={() => void exportActiveClipOneClick()} disabled={!clip}>{t("export_one_click")}</button>
                </div>
              </>
            )
          })}
        </div>
      ) : null}

      {tab === "pixel" ? (
        <div className="inspector-scroll">
          <section className="inspector-block inspector-summary-card">
            <div className="inspector-summary-grid">
              <div>
                <span className="muted">{t("left_panel_selected_clip")}</span>
                <strong>{clip?.name ?? "-"}</strong>
              </div>
              <div>
                <span className="muted">{t("timeline_selection_summary")}</span>
                <strong>{selectedFrameCount} {t("timeline_selection_frames")}</strong>
              </div>
              <div>
                <span className="muted">{t("tab_pixel")}</span>
                <strong>{t("pixel_quick_panel_title")}</strong>
              </div>
            </div>
            <div className="inspector-chip-row">
              <button type="button" onClick={() => jumpToSection("inspector-selection", "pixelSelection", "inspector_selection")}>
                {t("selection")}
              </button>
              <button type="button" onClick={() => jumpToSection("inspector-pixel-guide", "pixelGuide", "pixel_tools")}>
                빠른 안내
              </button>
            </div>
          </section>

          {selectionSection}

          {renderSection({
            id: "inspector-pixel-guide",
            sectionKey: "pixelGuide",
            title: "빠른 편집 안내",
            helpTopic: "pixel_tools",
            children: (
              <>
                <p className="muted">{t("help_pixel_tools_desc")}</p>
                <ul className="inspector-bullet-list">
                  <li>펜, 지우개, 스포이드, 채우기, 사각 선택, 이동 도구를 중앙 캔버스에서 바로 사용할 수 있습니다.</li>
                  <li>배경 추출과 배경 투명화는 현재 프레임에 즉시 반영됩니다.</li>
                  <li>선택 영역 이동과 복제는 키보드 단축키와 함께 쓰는 편이 가장 빠릅니다.</li>
                </ul>
              </>
            )
          })}
        </div>
      ) : null}
    </aside>
  );
}
