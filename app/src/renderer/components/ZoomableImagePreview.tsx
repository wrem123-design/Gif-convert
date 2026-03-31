import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode, WheelEvent } from "react";

interface ImageSize {
  width: number;
  height: number;
}

interface ZoomableImagePreviewProps {
  src?: string | null;
  alt: string;
  empty: ReactNode;
  imageStyle?: CSSProperties;
  stagePadding?: number;
  stageStyle?: CSSProperties;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function ZoomableImagePreview(props: ZoomableImagePreviewProps): JSX.Element {
  const stagePadding = props.stagePadding ?? 48;
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const panStateRef = useRef<{ pointerId: number; startX: number; startY: number; scrollLeft: number; scrollTop: number } | null>(null);
  const [imageSize, setImageSize] = useState<ImageSize>({ width: 0, height: 0 });
  const [viewportSize, setViewportSize] = useState<ImageSize>({ width: 1, height: 1 });
  const [zoom, setZoom] = useState(1);
  const [userZoomed, setUserZoomed] = useState(false);
  const [middlePanning, setMiddlePanning] = useState(false);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) {
      return;
    }

    const updateViewport = () => {
      setViewportSize({
        width: Math.max(1, scroller.clientWidth),
        height: Math.max(1, scroller.clientHeight)
      });
    };

    updateViewport();

    const observer = new ResizeObserver(updateViewport);
    observer.observe(scroller);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!props.src) {
      setImageSize({ width: 0, height: 0 });
      setZoom(1);
      setUserZoomed(false);
      return;
    }

    let cancelled = false;
    const image = new Image();
    image.onload = () => {
      if (cancelled) {
        return;
      }
      setImageSize({
        width: Math.max(1, image.naturalWidth || image.width),
        height: Math.max(1, image.naturalHeight || image.height)
      });
      setUserZoomed(false);
    };
    image.onerror = () => {
      if (!cancelled) {
        setImageSize({ width: 0, height: 0 });
      }
    };
    image.src = props.src;

    return () => {
      cancelled = true;
    };
  }, [props.src]);

  const stageWidth = Math.max(1, imageSize.width + stagePadding * 2);
  const stageHeight = Math.max(1, imageSize.height + stagePadding * 2);
  const fitZoom = imageSize.width > 0 && imageSize.height > 0
    ? clamp(
      Math.min(
        Math.max(1, viewportSize.width - 24) / stageWidth,
        Math.max(1, viewportSize.height - 24) / stageHeight
      ),
      0.1,
      24
    )
    : 1;

  useEffect(() => {
    if (!props.src || imageSize.width <= 0 || imageSize.height <= 0 || userZoomed) {
      return;
    }
    setZoom(Number(fitZoom.toFixed(3)));
    const scroller = scrollerRef.current;
    if (scroller) {
      scroller.scrollLeft = 0;
      scroller.scrollTop = 0;
    }
  }, [fitZoom, imageSize.height, imageSize.width, props.src, userZoomed]);

  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
    const scroller = scrollerRef.current;
    if (!scroller || imageSize.width <= 0 || imageSize.height <= 0) {
      return;
    }

    event.preventDefault();

    const rect = scroller.getBoundingClientRect();
    const localX = event.clientX - rect.left;
    const localY = event.clientY - rect.top;
    const currentContentWidth = Math.max(stageWidth * zoom, scroller.clientWidth);
    const currentContentHeight = Math.max(stageHeight * zoom, scroller.clientHeight);
    const anchorX = currentContentWidth > 0 ? (scroller.scrollLeft + localX) / currentContentWidth : 0.5;
    const anchorY = currentContentHeight > 0 ? (scroller.scrollTop + localY) / currentContentHeight : 0.5;
    const nextZoom = clamp(Number((zoom * (event.deltaY > 0 ? 0.9 : 1.1)).toFixed(3)), 0.1, 24);

    if (nextZoom === zoom) {
      return;
    }

    setUserZoomed(true);
    setZoom(nextZoom);

    window.requestAnimationFrame(() => {
      const activeScroller = scrollerRef.current;
      if (!activeScroller) {
        return;
      }
      const nextContentWidth = Math.max(stageWidth * nextZoom, activeScroller.clientWidth);
      const nextContentHeight = Math.max(stageHeight * nextZoom, activeScroller.clientHeight);
      activeScroller.scrollLeft = anchorX * nextContentWidth - localX;
      activeScroller.scrollTop = anchorY * nextContentHeight - localY;
    });
  };

  const resetZoom = () => {
    setUserZoomed(false);
    setZoom(Number(fitZoom.toFixed(3)));
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 1) {
      return;
    }
    const scroller = scrollerRef.current;
    if (!scroller) {
      return;
    }
    event.preventDefault();
    panStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      scrollLeft: scroller.scrollLeft,
      scrollTop: scroller.scrollTop
    };
    setMiddlePanning(true);
    scroller.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const scroller = scrollerRef.current;
    const panState = panStateRef.current;
    if (!scroller || !panState || panState.pointerId !== event.pointerId) {
      return;
    }
    event.preventDefault();
    scroller.scrollLeft = panState.scrollLeft - (event.clientX - panState.startX);
    scroller.scrollTop = panState.scrollTop - (event.clientY - panState.startY);
  };

  const endMiddlePan = (event: React.PointerEvent<HTMLDivElement>) => {
    const scroller = scrollerRef.current;
    const panState = panStateRef.current;
    if (!panState || panState.pointerId !== event.pointerId) {
      return;
    }
    if (scroller?.hasPointerCapture(event.pointerId)) {
      scroller.releasePointerCapture(event.pointerId);
    }
    panStateRef.current = null;
    setMiddlePanning(false);
  };

  return (
    <div className="zoom-preview">
      <div
        ref={scrollerRef}
        className={`zoom-preview-scroller ${middlePanning ? "middle-panning" : ""}`}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endMiddlePan}
        onPointerCancel={endMiddlePan}
      >
        {props.src && imageSize.width > 0 && imageSize.height > 0 ? (
          <div
            className="zoom-preview-content"
            style={{
              width: `${Math.max(stageWidth * zoom, viewportSize.width)}px`,
              height: `${Math.max(stageHeight * zoom, viewportSize.height)}px`
            }}
          >
            <div
              className="zoom-preview-stage"
              style={{
                width: `${stageWidth * zoom}px`,
                height: `${stageHeight * zoom}px`,
                ...props.stageStyle
              }}
            >
              <img
                src={props.src}
                alt={props.alt}
                draggable={false}
                style={{
                  left: `${stagePadding * zoom}px`,
                  top: `${stagePadding * zoom}px`,
                  width: `${imageSize.width * zoom}px`,
                  height: `${imageSize.height * zoom}px`,
                  ...props.imageStyle
                }}
              />
            </div>
          </div>
        ) : (
          <div className="zoom-preview-empty">
            {props.empty}
          </div>
        )}
      </div>

      <div className="zoom-preview-status">
        <span className="muted">휠 확대/축소 · {Math.round(zoom * 100)}%</span>
        <button type="button" onClick={resetZoom}>맞춤</button>
      </div>
    </div>
  );
}
