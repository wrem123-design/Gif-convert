import { useEffect } from "react";
import { useEditorStore } from "../state/editorStore";
import type { EditorTab } from "../types/editor";

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const tag = target.tagName.toLowerCase();
  return target.isContentEditable || tag === "input" || tag === "textarea" || tag === "select";
}

export function useKeyboardShortcuts(tab: EditorTab): void {
  const setPlaying = useEditorStore((s) => s.setPlaying);
  const playing = useEditorStore((s) => s.playing);
  const stepFrame = useEditorStore((s) => s.stepFrame);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  const duplicateSelectedFrames = useEditorStore((s) => s.duplicateSelectedFrames);
  const deleteSelectedFrames = useEditorStore((s) => s.deleteSelectedFrames);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) {
        return;
      }

      if (tab === "pixel_helper" || tab === "leshy_sprite") {
        return;
      }

      if (event.code === "Space") {
        event.preventDefault();
        setPlaying(!playing);
        return;
      }

      if (event.ctrlKey && event.key.toLowerCase() === "z") {
        event.preventDefault();
        void undo();
        return;
      }

      if (event.ctrlKey && event.key.toLowerCase() === "y") {
        event.preventDefault();
        void redo();
        return;
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        stepFrame(-1);
        return;
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        stepFrame(1);
        return;
      }

      if (tab === "export" && event.ctrlKey && event.key.toLowerCase() === "c") {
        event.preventDefault();
        void duplicateSelectedFrames();
        return;
      }

      if (tab === "export" && event.ctrlKey && event.key.toLowerCase() === "v") {
        event.preventDefault();
        void duplicateSelectedFrames();
        return;
      }

      if ((tab === "sprite" || tab === "export") && event.key === "Delete") {
        event.preventDefault();
        void deleteSelectedFrames();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [deleteSelectedFrames, duplicateSelectedFrames, playing, redo, setPlaying, stepFrame, tab, undo]);
}
