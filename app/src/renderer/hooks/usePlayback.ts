import { useEffect, useRef } from "react";
import { useEditorStore } from "../state/editorStore";

export function usePlayback(): void {
  const playing = useEditorStore((s) => s.playing);
  const project = useEditorStore((s) => s.project);
  const selectedClipId = useEditorStore((s) => s.selectedClipId);
  const activeFrameIndex = useEditorStore((s) => s.activeFrameIndex);
  const setActiveFrameIndex = useEditorStore((s) => s.setActiveFrameIndex);
  const setPlaying = useEditorStore((s) => s.setPlaying);

  const pingpongDirection = useRef<1 | -1>(1);

  useEffect(() => {
    if (!playing || !project || !selectedClipId) {
      pingpongDirection.current = 1;
      return;
    }

    const clip = project.clips.find((c) => c.id === selectedClipId);
    if (!clip || clip.frames.length <= 1) {
      return;
    }

    const delayMs = Math.max(10, clip.frames[activeFrameIndex]?.delayMs ?? 100);
    const timer = window.setTimeout(() => {
      if (clip.loopMode === "reverse") {
        const next = (activeFrameIndex - 1 + clip.frames.length) % clip.frames.length;
        setActiveFrameIndex(next);
        return;
      }

      if (clip.loopMode === "pingpong") {
        let next = activeFrameIndex + pingpongDirection.current;
        if (next >= clip.frames.length) {
          pingpongDirection.current = -1;
          next = Math.max(0, clip.frames.length - 2);
        } else if (next < 0) {
          pingpongDirection.current = 1;
          next = Math.min(1, clip.frames.length - 1);
        }
        setActiveFrameIndex(next);
        return;
      }

      if (clip.loopMode === "once") {
        if (activeFrameIndex >= clip.frames.length - 1) {
          setPlaying(false);
          return;
        }
        setActiveFrameIndex(activeFrameIndex + 1);
        return;
      }

      const next = (activeFrameIndex + 1) % clip.frames.length;
      setActiveFrameIndex(next);
    }, delayMs);

    return () => window.clearTimeout(timer);
  }, [activeFrameIndex, playing, project, selectedClipId, setActiveFrameIndex, setPlaying]);
}
