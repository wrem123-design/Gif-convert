import type { Clip, Frame } from "@sprite-forge/core";
import { useMemo } from "react";
import { useEditorStore } from "../state/editorStore";
import { useCurrentClip } from "../utils/selectors";
import { useI18n } from "../i18n";

function cloneClip(clip: Clip): Clip {
  return JSON.parse(JSON.stringify(clip)) as Clip;
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

  const selectedFrame = useMemo<Frame | null>(() => {
    if (!clip) {
      return null;
    }
    const byActiveIndex = clip.frames[activeFrameIndex] ?? null;
    if (byActiveIndex) {
      return byActiveIndex;
    }
    const selected = clip.frames.find((f) => f.id === selectedFrameIds[0]);
    return selected ?? null;
  }, [activeFrameIndex, clip, selectedFrameIds]);

  const patchClip = (action: string, mutator: (next: Clip) => void, withUndo = false) => {
    if (!clip) {
      return;
    }
    const next = cloneClip(clip);
    mutator(next);
    void updateClip(next, action, withUndo);
  };

  const selectionSection = clip ? (
    <section id="inspector-selection" className="inspector-block" onClick={() => setActiveHelpTopic("inspector_selection")}>
      <h3 className="clickable-title" onClick={() => setActiveHelpTopic("inspector_selection")}>{t("selection")}</h3>
      <p className="muted">{t("offset_current_only_hint")}</p>
      <div className="grid-two">
        <label>
          오프셋 X
          <input
            type="number"
            value={selectedFrame?.offsetPx.x ?? 0}
            onChange={(e) => {
              if (!selectedFrame) {
                return;
              }
              const v = Number(e.target.value);
              patchClip("오프셋 X 설정", (next) => {
                const target = next.frames.find((frame) => frame.id === selectedFrame.id);
                if (target) {
                  target.offsetPx.x = v;
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
            onChange={(e) => {
              if (!selectedFrame) {
                return;
              }
              const v = Number(e.target.value);
              patchClip("오프셋 Y 설정", (next) => {
                const target = next.frames.find((frame) => frame.id === selectedFrame.id);
                if (target) {
                  target.offsetPx.y = v;
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
            onChange={(e) => {
              const v = Math.max(0, Math.min(1, Number(e.target.value)));
              patchClip("피벗 X 설정", (next) => {
                for (const frame of next.frames) {
                  if (selectedFrameIds.includes(frame.id)) {
                    frame.pivotNorm.x = v;
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
            onChange={(e) => {
              const v = Math.max(0, Math.min(1, Number(e.target.value)));
              patchClip("피벗 Y 설정", (next) => {
                for (const frame of next.frames) {
                  if (selectedFrameIds.includes(frame.id)) {
                    frame.pivotNorm.y = v;
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
            onChange={(e) => {
              if (!selectedFrame) {
                return;
              }
              const v = Math.max(0.05, Math.min(8, Number(e.target.value)));
              patchClip("스케일 X 설정", (next) => {
                const target = next.frames.find((frame) => frame.id === selectedFrame.id);
                if (!target) {
                  return;
                }
                target.scale = {
                  x: v,
                  y: target.scale?.y ?? 1
                };
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
            onChange={(e) => {
              if (!selectedFrame) {
                return;
              }
              const v = Math.max(0.05, Math.min(8, Number(e.target.value)));
              patchClip("스케일 Y 설정", (next) => {
                const target = next.frames.find((frame) => frame.id === selectedFrame.id);
                if (!target) {
                  return;
                }
                target.scale = {
                  x: target.scale?.x ?? 1,
                  y: v
                };
              });
            }}
          />
        </label>
      </div>
      <div className="row-buttons">
        <button
          onClick={() => {
            if (!selectedFrame) {
              return;
            }
            setActiveHelpTopic("inspector_selection");
            patchClip("현재 프레임 좌표/피벗 복구", (next) => {
              const target = next.frames.find((frame) => frame.id === selectedFrame.id);
              if (!target) {
                return;
              }
              target.offsetPx.x = 0;
              target.offsetPx.y = 0;
              target.pivotNorm.x = 0.5;
              target.pivotNorm.y = 0;
              target.scale = { x: 1, y: 1 };
            }, true);
          }}
        >
          {t("reset_current_frame_transform")}
        </button>
        <button
          onClick={() => {
            if (!selectedFrame) {
              return;
            }
            setActiveHelpTopic("inspector_selection");
            patchClip("현재 프레임 좌표를 전체 적용", (next) => {
              for (const frame of next.frames) {
                frame.offsetPx.x = selectedFrame.offsetPx.x;
                frame.offsetPx.y = selectedFrame.offsetPx.y;
              }
            }, true);
          }}
        >
          {t("offset_apply_current_to_all")}
        </button>
        <button
          onClick={() => {
            if (!selectedFrame) {
              return;
            }
            const currentScaleX = selectedFrame.scale?.x ?? 1;
            const currentScaleY = selectedFrame.scale?.y ?? 1;
            setActiveHelpTopic("inspector_selection");
            patchClip("현재 프레임 스케일을 전체 적용", (next) => {
              for (const frame of next.frames) {
                frame.scale = { x: currentScaleX, y: currentScaleY };
              }
            }, true);
          }}
        >
          {t("scale_apply_current_to_all")}
        </button>
        <button
          onClick={() => {
            setActiveHelpTopic("inspector_selection");
            void setPivotBottomCenter();
          }}
        >
          {t("set_all_pivots_bottom_center")}
        </button>
        <button
          onClick={() => {
            setActiveHelpTopic("viewport_align_center");
            void autoCenterMass();
          }}
        >
          {t("auto_center_mass")}
        </button>
        <button
          onClick={() => {
            setActiveHelpTopic("viewport_align_bottom");
            void smartBottomAlign();
          }}
        >
          {t("smart_bottom_align")}
        </button>
      </div>
    </section>
  ) : null;

  return (
    <aside className="panel right-panel">
      <h2>{t("inspector")}</h2>
      {!clip ? <div className="muted">{t("no_clip_selected")}</div> : null}

      {clip && tab === "sprite" ? (
        <div className="inspector-scroll">
          {selectionSection}

          <section id="inspector-chroma" className="inspector-block" onClick={() => setActiveHelpTopic("inspector_chroma")}>
            <h3 className="clickable-title" onClick={() => setActiveHelpTopic("inspector_chroma")}>크로마 키</h3>
            <label className="inline-check">
              <input
                type="checkbox"
                checked={clip.inspector.chromaKey?.enabled ?? false}
                onChange={(e) =>
                  patchClip("크로마 키 켜기/끄기", (next) => {
                    if (!next.inspector.chromaKey) {
                      next.inspector.chromaKey = { enabled: false, keyColor: "#00ff00", tolerance: 0.18, despill: 0.3 };
                    }
                    next.inspector.chromaKey.enabled = e.target.checked;
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
                  value={clip.inspector.chromaKey?.keyColor ?? "#00ff00"}
                  onChange={(e) =>
                    patchClip("키 컬러 설정", (next) => {
                      if (!next.inspector.chromaKey) return;
                      next.inspector.chromaKey.keyColor = e.target.value as `#${string}`;
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
                  value={clip.inspector.chromaKey?.tolerance ?? 0.18}
                  onChange={(e) =>
                    patchClip("허용치 설정", (next) => {
                      if (!next.inspector.chromaKey) return;
                      next.inspector.chromaKey.tolerance = Number(e.target.value);
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
                  value={clip.inspector.chromaKey?.despill ?? 0.3}
                  onChange={(e) =>
                    patchClip("디스필 설정", (next) => {
                      if (!next.inspector.chromaKey) return;
                      next.inspector.chromaKey.despill = Number(e.target.value);
                    })
                  }
                />
              </label>
            </div>
          </section>

          <section id="inspector-adjustments" className="inspector-block" onClick={() => setActiveHelpTopic("inspector_adjustments")}>
            <h3 className="clickable-title" onClick={() => setActiveHelpTopic("inspector_adjustments")}>조정</h3>
            <div className="grid-two">
              <label>
                밝기
                <input
                  type="number"
                  step={0.05}
                  value={clip.inspector.adjustments?.brightness ?? 1}
                  onChange={(e) =>
                    patchClip("밝기 설정", (next) => {
                      if (!next.inspector.adjustments) return;
                      next.inspector.adjustments.brightness = Number(e.target.value);
                    })
                  }
                />
              </label>
              <label>
                대비
                <input
                  type="number"
                  step={0.05}
                  value={clip.inspector.adjustments?.contrast ?? 1}
                  onChange={(e) =>
                    patchClip("대비 설정", (next) => {
                      if (!next.inspector.adjustments) return;
                      next.inspector.adjustments.contrast = Number(e.target.value);
                    })
                  }
                />
              </label>
              <label>
                채도
                <input
                  type="number"
                  step={0.05}
                  value={clip.inspector.adjustments?.saturation ?? 1}
                  onChange={(e) =>
                    patchClip("채도 설정", (next) => {
                      if (!next.inspector.adjustments) return;
                      next.inspector.adjustments.saturation = Number(e.target.value);
                    })
                  }
                />
              </label>
              <label>
                색조
                <input
                  type="number"
                  step={1}
                  value={clip.inspector.adjustments?.hue ?? 0}
                  onChange={(e) =>
                    patchClip("색조 설정", (next) => {
                      if (!next.inspector.adjustments) return;
                      next.inspector.adjustments.hue = Number(e.target.value);
                    })
                  }
                />
              </label>
            </div>
            <label className="inline-check">
              <input
                type="checkbox"
                checked={clip.inspector.adjustments?.pixelPerfectScaling ?? true}
                onChange={(e) =>
                  patchClip("픽셀 퍼펙트 켜기/끄기", (next) => {
                    if (!next.inspector.adjustments) return;
                    next.inspector.adjustments.pixelPerfectScaling = e.target.checked;
                  }, true)
                }
              />
              픽셀 퍼펙트 스케일링 (nearest)
            </label>
            <label className="inline-check">
              <input
                type="checkbox"
                checked={clip.inspector.adjustments?.flipH ?? false}
                onChange={(e) =>
                  patchClip("좌우 반전 켜기/끄기", (next) => {
                    if (!next.inspector.adjustments) return;
                    next.inspector.adjustments.flipH = e.target.checked;
                  }, true)
                }
              />
              좌우 반전
            </label>
          </section>

          <section id="inspector-trim" className="inspector-block" onClick={() => setActiveHelpTopic("inspector_trim")}>
            <h3 className="clickable-title" onClick={() => setActiveHelpTopic("inspector_trim")}>트림 / 패딩</h3>
            <div className="grid-two">
              <label>
                모드
                <select
                  value={clip.inspector.trimPad?.mode ?? "none"}
                  onChange={(e) =>
                    patchClip("트림 모드 설정", (next) => {
                      if (!next.inspector.trimPad) return;
                      next.inspector.trimPad.mode = e.target.value as "none" | "trim" | "pad";
                    }, true)
                  }
                >
                  <option value="none">없음</option>
                  <option value="trim">트림</option>
                  <option value="pad">패딩</option>
                </select>
              </label>
              <label>
                패딩 기준
                <select
                  value={clip.inspector.trimPad?.padTo ?? "maxBounds"}
                  onChange={(e) =>
                    patchClip("패딩 기준 설정", (next) => {
                      if (!next.inspector.trimPad) return;
                      next.inspector.trimPad.padTo = e.target.value as "maxBounds" | "canvas";
                    }, true)
                  }
                >
                  <option value="maxBounds">최대 경계</option>
                  <option value="canvas">캔버스</option>
                </select>
              </label>
              <label>
                알파 임계값
                <input
                  type="number"
                  step={0.01}
                  min={0}
                  max={1}
                  value={clip.inspector.trimPad?.alphaThreshold ?? 0.03}
                  onChange={(e) =>
                    patchClip("트림 알파 임계값 설정", (next) => {
                      if (!next.inspector.trimPad) return;
                      next.inspector.trimPad.alphaThreshold = Number(e.target.value);
                    })
                  }
                />
              </label>
            </div>
          </section>

          <section id="inspector-unity" className="inspector-block" onClick={() => setActiveHelpTopic("inspector_unity")}>
            <h3 className="clickable-title" onClick={() => setActiveHelpTopic("inspector_unity")}>Unity 프리셋</h3>
            <div className="grid-two">
              <label>
                PPU
                <input
                  type="number"
                  min={1}
                  value={clip.unity.ppu}
                  onChange={(e) =>
                    patchClip("PPU 설정", (next) => {
                      next.unity.ppu = Number(e.target.value);
                    })
                  }
                />
              </label>
              <label>
                필터
                <select
                  value={clip.unity.filterMode}
                  onChange={(e) =>
                    patchClip("필터 모드 설정", (next) => {
                      next.unity.filterMode = e.target.value as "Point" | "Bilinear";
                    }, true)
                  }
                >
                  <option value="Bilinear">Bilinear</option>
                  <option value="Point">Point</option>
                </select>
              </label>
              <label>
                최대 텍스처
                <select
                  value={clip.unity.maxTextureSize}
                  onChange={(e) =>
                    patchClip("최대 텍스처 설정", (next) => {
                      next.unity.maxTextureSize = Number(e.target.value) as 2048 | 4096;
                    }, true)
                  }
                >
                  <option value={2048}>2048</option>
                  <option value={4096}>4096</option>
                </select>
              </label>
              <label>
                기본 스프라이트 모드
                <select
                  value={clip.unity.spriteModeDefault ?? "Single"}
                  onChange={(e) =>
                    patchClip("스프라이트 모드 설정", (next) => {
                      next.unity.spriteModeDefault = e.target.value as "Single" | "Sheet" | "Sequence";
                    }, true)
                  }
                >
                  <option value="Single">Single (시트 아님)</option>
                  <option value="Sheet">시트</option>
                  <option value="Sequence">시퀀스</option>
                </select>
              </label>
              <label className="inline-check">
                <input
                  type="checkbox"
                  checked={clip.unity.createPrefab}
                  onChange={(e) =>
                    patchClip("프리팹 생성 켜기/끄기", (next) => {
                      next.unity.createPrefab = e.target.checked;
                    }, true)
                  }
                />
                프리팹 생성
              </label>
              <label>
                프리팹 렌더러
                <select
                  value={clip.unity.prefabRenderer}
                  onChange={(e) =>
                    patchClip("프리팹 렌더러 설정", (next) => {
                      next.unity.prefabRenderer = e.target.value as "SpriteRenderer" | "UI";
                    }, true)
                  }
                >
                  <option value="SpriteRenderer">SpriteRenderer</option>
                  <option value="UI">UI</option>
                </select>
              </label>
            </div>
          </section>

          <section id="inspector-slicing" className="inspector-block" onClick={() => setActiveHelpTopic("inspector_slicing")}>
            <h3 className="clickable-title" onClick={() => setActiveHelpTopic("inspector_slicing")}>슬라이싱 / 패킹</h3>
            <div className="grid-two">
              <label>
                슬라이스 모드
                <select
                  value={spriteSheetSettings.mode}
                  onChange={(e) => setSpriteSheetSettings({ mode: e.target.value as "grid" | "auto" })}
                >
                  <option value="grid">그리드</option>
                  <option value="auto">자동</option>
                </select>
              </label>
              <label>
                그리드 열 수
                <input
                  type="number"
                  min={1}
                  value={spriteSheetSettings.cols}
                  onChange={(e) => setSpriteSheetSettings({ cols: Number(e.target.value) })}
                />
              </label>
              <label>
                그리드 행 수
                <input
                  type="number"
                  min={1}
                  value={spriteSheetSettings.rows}
                  onChange={(e) => setSpriteSheetSettings({ rows: Number(e.target.value) })}
                />
              </label>
              <label>
                자동 알파 임계값
                <input
                  type="number"
                  step={0.01}
                  min={0}
                  max={1}
                  value={spriteSheetSettings.alphaThreshold}
                  onChange={(e) => setSpriteSheetSettings({ alphaThreshold: Number(e.target.value) })}
                />
              </label>
              <label>
                자동 병합
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={spriteSheetSettings.mergeThreshold}
                  onChange={(e) => setSpriteSheetSettings({ mergeThreshold: Number(e.target.value) })}
                />
              </label>
              <label>
                시트 패딩
                <input
                  type="number"
                  min={0}
                  value={exportSettings.padding}
                  onChange={(e) => setExportSettings({ padding: Number(e.target.value) })}
                />
              </label>
              <label className="inline-check">
                <input
                  type="checkbox"
                  checked={exportSettings.allowRotate}
                  onChange={(e) => setExportSettings({ allowRotate: e.target.checked })}
                />
                {t("allow_rotation")}
              </label>
            </div>
          </section>
        </div>
      ) : null}

      {tab === "export" ? (
        <div className="inspector-scroll">
          {selectionSection}
          <section id="inspector-export" className="inspector-block" onClick={() => setActiveHelpTopic("export_scope_all")}>
            <h3 className="clickable-title" onClick={() => setActiveHelpTopic("export_scope_all")}>내보내기</h3>
            <label>
              {t("export_mode")}
              <select
                value={exportSettings.exportMode}
                onChange={(e) => {
                  setExportSettings({ exportMode: e.target.value as "sheet" | "sequence" | "gif" });
                  setActiveHelpTopic("export_mode");
                }}
              >
                <option value="sheet">시트 (Unity .anim)</option>
                <option value="sequence">시퀀스 (PNG 시퀀스)</option>
                <option value="gif">GIF (GIF 애니메이션)</option>
              </select>
            </label>
            {exportSettings.exportMode === "sheet" ? (
              <div className="export-mode-desc">
                <strong>스프라이트 시트 — Unity .anim 전용</strong>
                <p>내보내면 생성되는 파일:</p>
                <ul>
                  <li><code>sheet.png</code> — 모든 프레임을 담은 스프라이트 시트</li>
                  <li><code>meta.json</code> — 슬라이스/피벗/타이밍 정보</li>
                </ul>
                <p>Unity에서 사용하는 방법:</p>
                <ol>
                  <li><strong>[최초 1회]</strong> 이 앱 폴더의 <code>unity/</code>를<br />Unity 프로젝트 <code>Assets/SpriteForge/</code>에 복사</li>
                  <li>두 파일을 <code>Assets/</code> 원하는 위치에 복사</li>
                  <li>Unity가 <code>meta.json</code> 감지 시 자동 생성:<br /><code>UnityGenerated/클립명.anim</code><br /><code>UnityGenerated/클립명.controller</code></li>
                </ol>
              </div>
            ) : null}
            {exportSettings.exportMode === "sequence" ? (
              <div className="export-mode-desc">
                <strong>PNG 시퀀스</strong>
                <p>각 프레임을 개별 PNG 파일로 내보냅니다.</p>
                <ul>
                  <li><code>frames/frame_000.png</code></li>
                  <li><code>frames/frame_001.png</code> …</li>
                  <li><code>meta.json</code> — 타이밍/피벗 정보</li>
                </ul>
                <p>After Effects, Spine, 커스텀 엔진 등에 활용할 수 있습니다.</p>
              </div>
            ) : null}
            {exportSettings.exportMode === "gif" ? (
              <div className="export-mode-desc">
                <strong>GIF 애니메이션</strong>
                <p>투명도를 지원하는 단일 GIF 파일로 내보냅니다.</p>
                <ul>
                  <li><code>클립명.gif</code></li>
                </ul>
                <p>웹/문서 삽입용으로 적합합니다.<br />Unity에는 시트 모드를 권장합니다.</p>
              </div>
            ) : null}
            <label>
              {t("export_frame_scope")}
              <select
                value={exportSettings.frameScope}
                onChange={(e) => {
                  setExportSettings({ frameScope: e.target.value as "all" | "selected" });
                  setActiveHelpTopic(e.target.value === "selected" ? "export_scope_selected" : "export_scope_all");
                }}
              >
                <option value="all">{t("export_scope_all")}</option>
                <option value="selected">{t("export_scope_selected")}</option>
              </select>
            </label>
            <label>
              {t("export_root")}
              <input
                type="text"
                value={exportSettings.exportRoot}
                onChange={(e) => setExportSettings({ exportRoot: e.target.value })}
                placeholder="내보내기 탭에서 폴더를 선택하세요"
              />
            </label>
            <label>
              {t("packing_padding")}
              <input
                type="number"
                value={exportSettings.padding}
                onChange={(e) => setExportSettings({ padding: Number(e.target.value) })}
              />
            </label>
            <label className="inline-check">
              <input
                type="checkbox"
                checked={exportSettings.allowRotate}
                onChange={(e) => setExportSettings({ allowRotate: e.target.checked })}
              />
              {t("allow_rotation")}
            </label>
            <label className="inline-check">
              <input
                type="checkbox"
                checked={clip?.inspector.adjustments?.flipH ?? false}
                onChange={(e) =>
                  patchClip("좌우 반전 켜기/끄기", (next) => {
                    if (!next.inspector.adjustments) return;
                    next.inspector.adjustments.flipH = e.target.checked;
                  }, true)
                }
                disabled={!clip}
              />
              좌우 반전
            </label>
            <div className="muted">
              {exportSettings.frameScope === "all"
                ? t("export_scope_all_desc")
                : `${t("export_scope_selected_desc")} (${selectedFrameIds.length})`}
            </div>
            <div className="row-buttons">
              <button className="accent" onClick={() => void exportActiveClip()} disabled={!clip}>{t("export_clip")}</button>
              <button onClick={() => void exportActiveClipOneClick()} disabled={!clip}>{t("export_one_click")}</button>
            </div>
          </section>
        </div>
      ) : null}

      {tab === "pixel" ? (
        <div className="inspector-scroll">
          {selectionSection}
          <section className="inspector-block">
            <h3>에셋 편집 도구</h3>
            <p className="muted">하단 프레임을 선택하면 중앙 편집 창에서 펜, 지우개, 스포이드, 채우기, 사각 선택을 사용할 수 있습니다.</p>
            <p className="muted">배경 색 추출/배경 투명화/배경 자동 투명화를 사용한 뒤 프레임 저장으로 반영하세요.</p>
          </section>
        </div>
      ) : null}
    </aside>
  );
}
