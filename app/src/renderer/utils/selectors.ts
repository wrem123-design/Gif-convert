import type { Clip } from "@sprite-forge/core";
import { useEditorStore } from "../state/editorStore";

export function useCurrentClip(): Clip | null {
  const project = useEditorStore((s) => s.project);
  const selectedClipId = useEditorStore((s) => s.selectedClipId);
  if (!project || !selectedClipId) {
    return null;
  }
  return project.clips.find((c) => c.id === selectedClipId) ?? null;
}
