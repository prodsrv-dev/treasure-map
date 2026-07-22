"use client";

import {
  CSSProperties,
  KeyboardEvent,
  PointerEvent as ReactPointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type LocationType = "apartment" | "dacha" | "yard";

type MapPlace = {
  id: number;
  first: string;
  second: string;
};

type PointPosition = {
  x: number;
  y: number;
};

type BoardSize = {
  width: number;
  height: number;
};

type StoredMap = {
  size: BoardSize;
  positions: Record<string, PointPosition>;
};

type ResizeAxis = "x" | "y" | "xy";

const DEFAULT_SIZE: BoardSize = { width: 920, height: 540 };
const MIN_SIZE: BoardSize = { width: 360, height: 320 };

function storageKey(locationType: LocationType) {
  return `treasure-map:layout:${locationType}:v1`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function availableBoardWidth(workspace: HTMLDivElement | null, fallback: number) {
  if (!workspace) return fallback;

  const styles = window.getComputedStyle(workspace);
  return workspace.clientWidth
    - Number.parseFloat(styles.paddingLeft)
    - Number.parseFloat(styles.paddingRight);
}

function restoreMap(value: string | null): StoredMap | null {
  if (!value) return null;

  try {
    const stored = JSON.parse(value) as Partial<StoredMap>;
    if (
      !stored.size
      || !Number.isFinite(stored.size.width)
      || !Number.isFinite(stored.size.height)
      || !stored.positions
      || typeof stored.positions !== "object"
    ) return null;

    const positions = Object.fromEntries(
      Object.entries(stored.positions).flatMap(([id, position]) => {
        if (
          !position
          || !Number.isFinite(position.x)
          || !Number.isFinite(position.y)
        ) return [];

        return [[id, {
          x: clamp(position.x, 3, 97),
          y: clamp(position.y, 5, 95),
        }]];
      }),
    );

    return {
      size: {
        width: Math.max(MIN_SIZE.width, stored.size.width),
        height: Math.max(MIN_SIZE.height, stored.size.height),
      },
      positions,
    };
  } catch {
    return null;
  }
}

export default function MapPlanner({
  locationType,
  places,
}: {
  locationType: LocationType;
  places: MapPlace[];
}) {
  const [size, setSize] = useState<BoardSize>(DEFAULT_SIZE);
  const [positions, setPositions] = useState<Record<string, PointPosition>>({});
  const [ready, setReady] = useState(false);
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [resizing, setResizing] = useState(false);
  const boardRef = useRef<HTMLDivElement>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const resizeState = useRef<{
    axis: ResizeAxis;
    startX: number;
    startY: number;
    startWidth: number;
    startHeight: number;
  } | null>(null);

  const placedCount = useMemo(
    () => places.filter((place) => positions[String(place.id)]).length,
    [places, positions],
  );

  useEffect(() => {
    let stored: StoredMap | null = null;

    try {
      stored = restoreMap(window.localStorage.getItem(storageKey(locationType)));
    } catch {
      // The planner remains usable when storage is unavailable.
    }

    if (stored) {
      setSize(stored.size);
      setPositions(stored.positions);
    }
    setReady(true);
  }, [locationType]);

  useEffect(() => {
    function fitBoardToWorkspace() {
      const availableWidth = availableBoardWidth(workspaceRef.current, 0);
      if (availableWidth <= 0) return;

      setSize((current) => {
        if (current.width <= availableWidth) return current;

        const scale = availableWidth / current.width;
        return {
          width: Math.round(availableWidth),
          height: Math.max(MIN_SIZE.height, Math.round(current.height * scale)),
        };
      });
    }

    fitBoardToWorkspace();
    window.addEventListener("resize", fitBoardToWorkspace);
    return () => window.removeEventListener("resize", fitBoardToWorkspace);
  }, []);

  useEffect(() => {
    if (!ready) return;

    try {
      window.localStorage.setItem(storageKey(locationType), JSON.stringify({ size, positions }));
    } catch {
      // Storage can be disabled by browser privacy settings.
    }
  }, [locationType, positions, ready, size]);

  function updatePointFromPointer(event: ReactPointerEvent) {
    if (draggingId === null || !boardRef.current) return;

    const bounds = boardRef.current.getBoundingClientRect();
    setPositions((current) => ({
      ...current,
      [String(draggingId)]: {
        x: clamp(((event.clientX - bounds.left) / bounds.width) * 100, 3, 97),
        y: clamp(((event.clientY - bounds.top) / bounds.height) * 100, 5, 95),
      },
    }));
  }

  function startPointDrag(event: ReactPointerEvent<HTMLButtonElement>, id: number) {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDraggingId(id);
  }

  function movePointWithKeyboard(event: KeyboardEvent<HTMLButtonElement>, id: number) {
    const direction = {
      ArrowLeft: [-2, 0],
      ArrowRight: [2, 0],
      ArrowUp: [0, -2],
      ArrowDown: [0, 2],
    }[event.key];

    if (!direction) {
      if (event.key === "Enter" && !positions[String(id)]) {
        event.preventDefault();
        setPositions((current) => ({ ...current, [String(id)]: { x: 50, y: 50 } }));
      }
      return;
    }

    event.preventDefault();
    const currentPosition = positions[String(id)] ?? { x: 12, y: 16 };
    setPositions((current) => ({
      ...current,
      [String(id)]: {
        x: clamp(currentPosition.x + direction[0], 3, 97),
        y: clamp(currentPosition.y + direction[1], 5, 95),
      },
    }));
  }

  function startResize(event: ReactPointerEvent<HTMLButtonElement>, axis: ResizeAxis) {
    if (!boardRef.current) return;

    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const bounds = boardRef.current.getBoundingClientRect();
    resizeState.current = {
      axis,
      startX: event.clientX,
      startY: event.clientY,
      startWidth: bounds.width,
      startHeight: bounds.height,
    };
    setResizing(true);
  }

  function updateResize(event: ReactPointerEvent) {
    const activeResize = resizeState.current;
    if (!activeResize) return false;

    const maxWidth = availableBoardWidth(workspaceRef.current, activeResize.startWidth);
    const minWidth = Math.min(MIN_SIZE.width, maxWidth);
    const nextWidth = activeResize.axis.includes("x")
      ? clamp(activeResize.startWidth + event.clientX - activeResize.startX, minWidth, maxWidth)
      : activeResize.startWidth;
    const nextHeight = activeResize.axis.includes("y")
      ? clamp(activeResize.startHeight + event.clientY - activeResize.startY, MIN_SIZE.height, 760)
      : activeResize.startHeight;

    setSize({ width: Math.round(nextWidth), height: Math.round(nextHeight) });
    return true;
  }

  function handlePointerMove(event: ReactPointerEvent) {
    if (updateResize(event)) return;
    updatePointFromPointer(event);
  }

  function finishPointerAction() {
    resizeState.current = null;
    setResizing(false);
    setDraggingId(null);
  }

  function resizeWithKeyboard(event: KeyboardEvent<HTMLButtonElement>, axis: ResizeAxis) {
    const amount = event.shiftKey ? 40 : 16;
    let widthDelta = 0;
    let heightDelta = 0;

    if (axis.includes("x") && event.key === "ArrowRight") widthDelta = amount;
    if (axis.includes("x") && event.key === "ArrowLeft") widthDelta = -amount;
    if (axis.includes("y") && event.key === "ArrowDown") heightDelta = amount;
    if (axis.includes("y") && event.key === "ArrowUp") heightDelta = -amount;
    if (!widthDelta && !heightDelta) return;

    event.preventDefault();
    const maxWidth = availableBoardWidth(workspaceRef.current, size.width);
    setSize((current) => ({
      width: clamp(current.width + widthDelta, Math.min(MIN_SIZE.width, maxWidth), maxWidth),
      height: clamp(current.height + heightDelta, MIN_SIZE.height, 760),
    }));
  }

  return (
    <section className="map-section" id="map-layout" aria-labelledby="map-layout-title">
      <header className="map-section-heading">
        <p className="step-number">03</p>
        <div>
          <p className="eyebrow">Маршрут</p>
          <h2 id="map-layout-title">Расставим точки на карте</h2>
        </div>
        <div className="map-status" aria-live="polite">
          <strong>{placedCount} из {places.length}</strong>
          <span>точек расставлено</span>
        </div>
      </header>

      <div className="map-workspace" ref={workspaceRef}>
        <div
          className={`map-board${resizing ? " resizing" : ""}`}
          ref={boardRef}
          style={{ width: `${size.width}px`, height: `${size.height}px` }}
          onPointerMove={handlePointerMove}
          onPointerUp={finishPointerAction}
          onPointerCancel={finishPointerAction}
        >
          <div className="map-board-texture" aria-hidden="true" />
          <div className="map-size" aria-hidden="true">
            {Math.round(size.width)} × {Math.round(size.height)}
          </div>

          {places.map((place, index) => {
            const position = positions[String(place.id)];
            const pointStyle: CSSProperties = position
              ? { left: `${position.x}%`, top: `${position.y}%` }
              : {
                "--pile-offset": `${42 + index * 7}px`,
                "--pile-angle": `${(index - 2) * 4}deg`,
                "--pile-z": 18 - index,
              } as CSSProperties;
            const name = `${index + 1}. ${place.first} — ${place.second}`;

            return (
              <button
                className={`map-point${position ? " placed" : " piled"}${draggingId === place.id ? " dragging" : ""}`}
                type="button"
                style={pointStyle}
                aria-label={name}
                title={name}
                onPointerDown={(event) => startPointDrag(event, place.id)}
                onKeyDown={(event) => movePointWithKeyboard(event, place.id)}
                key={place.id}
              >
                {index + 1}
              </button>
            );
          })}

          <button
            className="resize-edge resize-edge-right"
            type="button"
            aria-label="Изменить ширину карты"
            title="Изменить ширину карты"
            onPointerDown={(event) => startResize(event, "x")}
            onKeyDown={(event) => resizeWithKeyboard(event, "x")}
          />
          <button
            className="resize-edge resize-edge-bottom"
            type="button"
            aria-label="Изменить высоту карты"
            title="Изменить высоту карты"
            onPointerDown={(event) => startResize(event, "y")}
            onKeyDown={(event) => resizeWithKeyboard(event, "y")}
          />
          <button
            className="resize-corner"
            type="button"
            aria-label="Изменить размер карты"
            title="Изменить размер карты"
            onPointerDown={(event) => startResize(event, "xy")}
            onKeyDown={(event) => resizeWithKeyboard(event, "xy")}
          />
        </div>
      </div>
    </section>
  );
}
