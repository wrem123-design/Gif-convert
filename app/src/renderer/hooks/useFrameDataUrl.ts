import { useEffect, useState } from "react";
import { useEditorStore } from "../state/editorStore";

export function useFrameDataUrl(filePath: string | undefined): string | null {
  const getImageDataUrl = useEditorStore((s) => s.getImageDataUrl);
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    if (!filePath) {
      setDataUrl(null);
      return;
    }

    void getImageDataUrl(filePath)
      .then((url) => {
        if (alive) {
          setDataUrl(url);
        }
      })
      .catch(() => {
        if (alive) {
          setDataUrl(null);
        }
      });

    return () => {
      alive = false;
    };
  }, [filePath, getImageDataUrl]);

  return dataUrl;
}
