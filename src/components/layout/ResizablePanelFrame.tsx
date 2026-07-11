"use client";

import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState
} from "react";

type ResizeDirection = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

type ResizablePanelFrameProps = {
  children: ReactNode;
  className?: string;
  defaultWidth?: number;
  defaultHeight?: number;
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
};

type PanelSize = {
  width?: number;
  height?: number;
  offsetX: number;
  offsetY: number;
};

const edgeHandleClasses: Record<ResizeDirection, string> = {
  n: "left-8 right-8 top-0 h-[3px] cursor-ns-resize",
  s: "bottom-0 left-8 right-8 h-[3px] cursor-ns-resize",
  e: "bottom-8 right-0 top-8 w-[3px] cursor-ew-resize",
  w: "bottom-8 left-0 top-8 w-[3px] cursor-ew-resize",
  ne: "right-0 top-0 h-2 w-2 cursor-nesw-resize",
  nw: "left-0 top-0 h-2 w-2 cursor-nwse-resize",
  se: "bottom-0 right-0 h-2 w-2 cursor-nwse-resize",
  sw: "bottom-0 left-0 h-2 w-2 cursor-nesw-resize"
};

const edgePreviewClasses: Record<ResizeDirection, string> = {
  n: "inset-x-2 top-1/2 h-px -translate-y-1/2",
  s: "inset-x-2 top-1/2 h-px -translate-y-1/2",
  e: "left-1/2 inset-y-2 w-px -translate-x-1/2",
  w: "left-1/2 inset-y-2 w-px -translate-x-1/2",
  ne: "right-0.5 top-0.5 h-1.5 w-1.5 rounded-full",
  nw: "left-0.5 top-0.5 h-1.5 w-1.5 rounded-full",
  se: "bottom-0.5 right-0.5 h-1.5 w-1.5 rounded-full",
  sw: "bottom-0.5 left-0.5 h-1.5 w-1.5 rounded-full"
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function ResizablePanelFrame({
  children,
  className = "",
  defaultWidth,
  defaultHeight,
  minWidth = 280,
  minHeight = 160,
  maxWidth,
  maxHeight
}: ResizablePanelFrameProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<PanelSize>({
    width: defaultWidth,
    height: defaultHeight,
    offsetX: 0,
    offsetY: 0
  });

  useEffect(() => {
    const viewportMaxWidth = Math.max(minWidth, window.innerWidth - 48);
    const viewportMaxHeight = Math.max(minHeight, window.innerHeight - 96);

    setSize({
      width: defaultWidth
        ? clamp(defaultWidth, minWidth, maxWidth ?? viewportMaxWidth)
        : undefined,
      height: defaultHeight
        ? clamp(defaultHeight, minHeight, maxHeight ?? viewportMaxHeight)
        : undefined,
      offsetX: 0,
      offsetY: 0
    });
  }, [defaultHeight, defaultWidth, maxHeight, maxWidth, minHeight, minWidth]);

  function startResize(
    direction: ResizeDirection,
    event: ReactPointerEvent<HTMLDivElement>
  ) {
    event.preventDefault();
    event.stopPropagation();

    const panel = panelRef.current;

    if (!panel) {
      return;
    }

    const rect = panel.getBoundingClientRect();
    const startWidth = rect.width;
    const startHeight = rect.height;
    const startOffsetX = size.offsetX;
    const startOffsetY = size.offsetY;
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    const cursor =
      direction === "e" || direction === "w"
        ? "ew-resize"
        : direction === "n" || direction === "s"
          ? "ns-resize"
          : direction === "ne" || direction === "sw"
            ? "nesw-resize"
            : "nwse-resize";

    document.body.style.cursor = cursor;
    document.body.style.userSelect = "none";

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const viewportMaxWidth = Math.max(minWidth, window.innerWidth - 48);
      const viewportMaxHeight = Math.max(minHeight, window.innerHeight - 96);
      let resolvedWidth = size.width;
      let resolvedHeight = size.height;
      let nextOffsetX = startOffsetX;
      let nextOffsetY = startOffsetY;

      if (direction.includes("e")) {
        resolvedWidth = clamp(
          moveEvent.clientX - rect.left,
          minWidth,
          maxWidth ?? viewportMaxWidth
        );
      } else if (direction.includes("w")) {
        resolvedWidth = clamp(
          rect.right - moveEvent.clientX,
          minWidth,
          maxWidth ?? viewportMaxWidth
        );
        nextOffsetX = startOffsetX + (startWidth - resolvedWidth);
      }

      if (direction.includes("s")) {
        resolvedHeight = clamp(
          moveEvent.clientY - rect.top,
          minHeight,
          maxHeight ?? viewportMaxHeight
        );
      } else if (direction.includes("n")) {
        resolvedHeight = clamp(
          rect.bottom - moveEvent.clientY,
          minHeight,
          maxHeight ?? viewportMaxHeight
        );
        nextOffsetY = startOffsetY + (startHeight - resolvedHeight);
      }

      const nextSize = {
        width: resolvedWidth,
        height: resolvedHeight,
        offsetX: nextOffsetX,
        offsetY: nextOffsetY
      };

      setSize(nextSize);
    };

    const handlePointerUp = () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  }

  const style: CSSProperties = {
    width: size.width,
    height: size.height,
    flexBasis: size.width,
    flexGrow: size.width ? 0 : undefined,
    flexShrink: size.width ? 1 : undefined,
    marginLeft: size.offsetX || undefined,
    marginTop: size.offsetY || undefined
  };

  return (
    <div
      ref={panelRef}
      className={`relative min-h-0 min-w-0 ${className}`}
      style={style}
    >
      <div className="h-full min-h-0 min-w-0">{children}</div>
      {(Object.keys(edgeHandleClasses) as ResizeDirection[]).map((direction) => (
        <div
          key={direction}
          role="separator"
          aria-label={`Resize panel ${direction}`}
          onPointerDown={(event) => startResize(direction, event)}
          className={`group absolute z-50 bg-transparent ${edgeHandleClasses[direction]}`}
        >
          <span
            className={`pointer-events-none absolute bg-atlasBlue/0 transition group-hover:bg-atlasBlue/70 group-focus:bg-atlasBlue/70 ${edgePreviewClasses[direction]}`}
          />
        </div>
      ))}
    </div>
  );
}
