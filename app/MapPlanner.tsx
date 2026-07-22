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
import RiddleDesigner, {
  AdventureEntry,
  MarkerKind,
  createDefaultAdventure,
  markerCatalog,
} from "./RiddleDesigner";

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
  lines: LineSegment[];
  styled: boolean;
  adventureOpen: boolean;
  adventures: Record<string, AdventureEntry>;
};

type ResizeAxis = "x" | "y" | "xy";
type PointId = number | "start";
type DrawingMode = "points" | "lines";

type LineSegment = {
  id: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

type DraftLine = Omit<LineSegment, "id">;

const DEFAULT_SIZE: BoardSize = { width: 920, height: 540 };
const MIN_SIZE: BoardSize = { width: 360, height: 320 };
const boundaryLabel: Record<LocationType, string> = {
  apartment: "квартиры",
  dacha: "дачного участка",
  yard: "двора",
};

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

function pointDistance(first: PointPosition, second: PointPosition, bounds: DOMRect) {
  return Math.hypot(
    ((first.x - second.x) / 100) * bounds.width,
    ((first.y - second.y) / 100) * bounds.height,
  );
}

function nearestLineEndpoint(
  point: PointPosition,
  lines: LineSegment[],
  bounds: DOMRect,
  threshold = 14,
) {
  const endpoints = lines.flatMap((line) => [
    { x: line.x1, y: line.y1 },
    { x: line.x2, y: line.y2 },
  ]);

  return endpoints.reduce<PointPosition | null>((nearest, endpoint) => {
    const distance = pointDistance(point, endpoint, bounds);
    if (distance > threshold) return nearest;
    if (!nearest || distance < pointDistance(point, nearest, bounds)) return endpoint;
    return nearest;
  }, null) ?? point;
}

function lineAngle(line: DraftLine, bounds: DOMRect) {
  return Math.atan2(
    ((line.y2 - line.y1) / 100) * bounds.height,
    ((line.x2 - line.x1) / 100) * bounds.width,
  );
}

function orientationDistance(first: number, second: number) {
  return Math.abs(Math.atan2(Math.sin((first - second) * 2), Math.cos((first - second) * 2))) / 2;
}

function snapLineEnd(
  start: PointPosition,
  rawEnd: PointPosition,
  lines: LineSegment[],
  bounds: DOMRect,
) {
  const startPixels = { x: (start.x / 100) * bounds.width, y: (start.y / 100) * bounds.height };
  const endPixels = { x: (rawEnd.x / 100) * bounds.width, y: (rawEnd.y / 100) * bounds.height };
  const delta = { x: endPixels.x - startPixels.x, y: endPixels.y - startPixels.y };
  const length = Math.hypot(delta.x, delta.y);
  if (length < 1) return rawEnd;

  const rawAngle = Math.atan2(delta.y, delta.x);
  const existingAngles = lines.map((line) => lineAngle(line, bounds));
  const candidates = existingAngles.length
    ? existingAngles.flatMap((angle) => [angle, angle + Math.PI / 2])
    : [0, Math.PI / 2];
  const snappedAngle = candidates.reduce((best, candidate) => (
    orientationDistance(rawAngle, candidate) < orientationDistance(rawAngle, best)
      ? candidate
      : best
  ), candidates[0]);
  const shouldSnap = existingAngles.length > 0
    || orientationDistance(rawAngle, snappedAngle) <= (10 * Math.PI) / 180;

  let end = rawEnd;
  if (shouldSnap) {
    const direction = Math.cos(rawAngle - snappedAngle) >= 0 ? snappedAngle : snappedAngle + Math.PI;
    end = {
      x: clamp(((startPixels.x + Math.cos(direction) * length) / bounds.width) * 100, 0, 100),
      y: clamp(((startPixels.y + Math.sin(direction) * length) / bounds.height) * 100, 0, 100),
    };
  }

  return nearestLineEndpoint(end, lines, bounds);
}

function clusterValues(values: number[], threshold: number) {
  const indexedValues = values
    .map((value, index) => ({ value, index }))
    .sort((first, second) => first.value - second.value);
  const result = [...values];
  let cluster: typeof indexedValues = [];

  function commitCluster() {
    if (!cluster.length) return;
    const average = cluster.reduce((sum, item) => sum + item.value, 0) / cluster.length;
    cluster.forEach((item) => { result[item.index] = average; });
  }

  indexedValues.forEach((item) => {
    const average = cluster.length
      ? cluster.reduce((sum, current) => sum + current.value, 0) / cluster.length
      : item.value;

    if (cluster.length && item.value - average > threshold) {
      commitCluster();
      cluster = [];
    }
    cluster.push(item);
  });
  commitCluster();

  return result;
}

function beautifyLines(lines: LineSegment[], bounds: DOMRect) {
  if (!lines.length) return lines;

  const dominantLine = lines.reduce((longest, line) => {
    const lineLength = Math.hypot(
      ((line.x2 - line.x1) / 100) * bounds.width,
      ((line.y2 - line.y1) / 100) * bounds.height,
    );
    const longestLength = Math.hypot(
      ((longest.x2 - longest.x1) / 100) * bounds.width,
      ((longest.y2 - longest.y1) / 100) * bounds.height,
    );
    return lineLength > longestLength ? line : longest;
  });
  const angle = lineAngle(dominantLine, bounds);
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);

  const localLines = lines.map((line) => {
    const toLocal = (x: number, y: number) => {
      const pixelX = (x / 100) * bounds.width;
      const pixelY = (y / 100) * bounds.height;
      return {
        u: pixelX * cosine + pixelY * sine,
        v: -pixelX * sine + pixelY * cosine,
      };
    };
    const first = toLocal(line.x1, line.y1);
    const second = toLocal(line.x2, line.y2);

    if (Math.abs(second.u - first.u) >= Math.abs(second.v - first.v)) {
      const average = (first.v + second.v) / 2;
      first.v = average;
      second.v = average;
    } else {
      const average = (first.u + second.u) / 2;
      first.u = average;
      second.u = average;
    }

    return { id: line.id, first, second };
  });

  const localPoints = localLines.flatMap((line) => [line.first, line.second]);
  const snappedU = clusterValues(localPoints.map((point) => point.u), 16);
  const snappedV = clusterValues(localPoints.map((point) => point.v), 16);

  return localLines.map((line, index) => {
    const fromLocal = (u: number, v: number) => ({
      x: clamp(((u * cosine - v * sine) / bounds.width) * 100, 0, 100),
      y: clamp(((u * sine + v * cosine) / bounds.height) * 100, 0, 100),
    });
    const first = fromLocal(snappedU[index * 2], snappedV[index * 2]);
    const second = fromLocal(snappedU[index * 2 + 1], snappedV[index * 2 + 1]);

    return {
      id: line.id,
      x1: first.x,
      y1: first.y,
      x2: second.x,
      y2: second.y,
    };
  });
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
    const lines = Array.isArray(stored.lines)
      ? stored.lines.flatMap((line) => {
        if (
          !line
          || !Number.isInteger(line.id)
          || !Number.isFinite(line.x1)
          || !Number.isFinite(line.y1)
          || !Number.isFinite(line.x2)
          || !Number.isFinite(line.y2)
        ) return [];

        return [{
          id: line.id,
          x1: clamp(line.x1, 0, 100),
          y1: clamp(line.y1, 0, 100),
          x2: clamp(line.x2, 0, 100),
          y2: clamp(line.y2, 0, 100),
        }];
      })
      : [];
    const adventures = stored.adventures && typeof stored.adventures === "object"
      ? Object.fromEntries(
        Object.entries(stored.adventures).flatMap(([id, entry]) => {
          if (
            !entry
            || !markerCatalog.some((marker) => marker.id === entry.marker)
            || typeof entry.monster !== "string"
            || typeof entry.riddle !== "string"
          ) return [];

          return [[id, {
            marker: entry.marker as MarkerKind,
            monster: entry.monster,
            riddle: entry.riddle,
          }]];
        }),
      )
      : {};

    return {
      size: {
        width: Math.max(MIN_SIZE.width, stored.size.width),
        height: Math.max(MIN_SIZE.height, stored.size.height),
      },
      positions,
      lines,
      styled: stored.styled === true,
      adventureOpen: stored.adventureOpen === true,
      adventures,
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
  const [lines, setLines] = useState<LineSegment[]>([]);
  const [draftLine, setDraftLine] = useState<DraftLine | null>(null);
  const [mode, setMode] = useState<DrawingMode>("points");
  const [styled, setStyled] = useState(false);
  const [adventureOpen, setAdventureOpen] = useState(false);
  const [adventures, setAdventures] = useState<Record<string, AdventureEntry>>({});
  const [ready, setReady] = useState(false);
  const [draggingId, setDraggingId] = useState<PointId | null>(null);
  const [resizing, setResizing] = useState(false);
  const boardRef = useRef<HTMLDivElement>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const nextLineId = useRef(1);
  const resizeState = useRef<{
    axis: ResizeAxis;
    startX: number;
    startY: number;
    startWidth: number;
    startHeight: number;
  } | null>(null);

  const placedCount = useMemo(
    () => places.filter((place) => positions[String(place.id)]).length
      + (positions.start ? 1 : 0),
    [places, positions],
  );
  const totalPoints = places.length + 1;
  const lineCountLabel = lines.length === 1
    ? "1 линия"
    : lines.length > 1 && lines.length < 5
      ? `${lines.length} линии`
      : `${lines.length} линий`;

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
      setLines(stored.lines);
      setStyled(stored.styled);
      setAdventureOpen(stored.adventureOpen);
      setAdventures(stored.adventures);
      nextLineId.current = Math.max(0, ...stored.lines.map((line) => line.id)) + 1;
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
      window.localStorage.setItem(storageKey(locationType), JSON.stringify({
        size,
        positions,
        lines,
        styled,
        adventureOpen,
        adventures,
      }));
    } catch {
      // Storage can be disabled by browser privacy settings.
    }
  }, [adventureOpen, adventures, lines, locationType, positions, ready, size, styled]);

  useEffect(() => {
    if (!adventureOpen) return;

    setAdventures((current) => {
      let changed = false;
      const next = { ...current };
      places.forEach((place, index) => {
        const key = String(place.id);
        if (!next[key]) {
          next[key] = createDefaultAdventure(place, index, locationType);
          changed = true;
        }
      });
      return changed ? next : current;
    });
  }, [adventureOpen, locationType, places]);

  function updatePointFromPointer(event: ReactPointerEvent) {
    if (mode !== "points" || draggingId === null || !boardRef.current) return;

    const bounds = boardRef.current.getBoundingClientRect();
    setPositions((current) => ({
      ...current,
      [String(draggingId)]: {
        x: clamp(((event.clientX - bounds.left) / bounds.width) * 100, 3, 97),
        y: clamp(((event.clientY - bounds.top) / bounds.height) * 100, 5, 95),
      },
    }));
  }

  function startPointDrag(event: ReactPointerEvent<HTMLButtonElement>, id: PointId) {
    if (mode !== "points") return;

    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDraggingId(id);
  }

  function movePointWithKeyboard(event: KeyboardEvent<HTMLButtonElement>, id: PointId) {
    if (mode !== "points") return;

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

  function pointerPosition(event: ReactPointerEvent, bounds: DOMRect) {
    return {
      x: clamp(((event.clientX - bounds.left) / bounds.width) * 100, 0, 100),
      y: clamp(((event.clientY - bounds.top) / bounds.height) * 100, 0, 100),
    };
  }

  function startLineDrawing(event: ReactPointerEvent<HTMLDivElement>) {
    if (mode !== "lines" || event.button !== 0 || !boardRef.current) return;

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const bounds = boardRef.current.getBoundingClientRect();
    const start = nearestLineEndpoint(pointerPosition(event, bounds), lines, bounds);
    setDraftLine({ x1: start.x, y1: start.y, x2: start.x, y2: start.y });
  }

  function updateLineFromPointer(event: ReactPointerEvent) {
    if (mode !== "lines" || !draftLine || !boardRef.current) return;

    const bounds = boardRef.current.getBoundingClientRect();
    const end = snapLineEnd(
      { x: draftLine.x1, y: draftLine.y1 },
      pointerPosition(event, bounds),
      lines,
      bounds,
    );
    setDraftLine((current) => current ? { ...current, x2: end.x, y2: end.y } : null);
  }

  function handlePointerMove(event: ReactPointerEvent) {
    if (updateResize(event)) return;
    if (draftLine) {
      updateLineFromPointer(event);
      return;
    }
    updatePointFromPointer(event);
  }

  function finishPointerAction(event: ReactPointerEvent) {
    if (draftLine && boardRef.current) {
      const bounds = boardRef.current.getBoundingClientRect();
      const end = snapLineEnd(
        { x: draftLine.x1, y: draftLine.y1 },
        pointerPosition(event, bounds),
        lines,
        bounds,
      );
      const nextLine = { ...draftLine, x2: end.x, y2: end.y };
      const length = Math.hypot(
        ((nextLine.x2 - nextLine.x1) / 100) * bounds.width,
        ((nextLine.y2 - nextLine.y1) / 100) * bounds.height,
      );

      if (length >= 8) {
        setLines((current) => [...current, { ...nextLine, id: nextLineId.current }]);
        nextLineId.current += 1;
      }
    }

    resizeState.current = null;
    setResizing(false);
    setDraggingId(null);
    setDraftLine(null);
  }

  function cancelPointerAction() {
    resizeState.current = null;
    setResizing(false);
    setDraggingId(null);
    setDraftLine(null);
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

  function beautifyMap() {
    if (!boardRef.current || !lines.length) return;

    const bounds = boardRef.current.getBoundingClientRect();
    setLines((current) => beautifyLines(current, bounds));
    setStyled(true);
  }

  function openRiddleDesigner() {
    setAdventures((current) => {
      const next = { ...current };
      places.forEach((place, index) => {
        const key = String(place.id);
        if (!next[key]) next[key] = createDefaultAdventure(place, index, locationType);
      });
      return next;
    });
    setAdventureOpen(true);
    requestAnimationFrame(() => {
      document.getElementById("riddles")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  return (
    <>
      <section className="map-section" id="map-layout" aria-labelledby="map-layout-title">
      <header className="map-section-heading">
        <p className="step-number">03</p>
        <div>
          <p className="eyebrow">Маршрут</p>
          <h2 id="map-layout-title">
            Расставим точки на карте и начертим границы {boundaryLabel[locationType]}
          </h2>
        </div>
        <div className="map-status" aria-live="polite">
          <strong>{placedCount} из {totalPoints}</strong>
          <span>точек расставлено</span>
        </div>
      </header>

      <div className="map-workspace" ref={workspaceRef}>
        <div className="map-toolbar" role="toolbar" aria-label="Инструменты карты">
          <div className="map-mode-switch" role="group" aria-label="Режим работы">
            <button
              className={mode === "points" ? "active" : ""}
              type="button"
              aria-pressed={mode === "points"}
              onClick={() => {
                cancelPointerAction();
                setMode("points");
              }}
            >
              <span aria-hidden="true">●</span>
              Точки
            </button>
            <button
              className={mode === "lines" ? "active" : ""}
              type="button"
              aria-pressed={mode === "lines"}
              onClick={() => {
                cancelPointerAction();
                setMode("lines");
              }}
            >
              <span aria-hidden="true">╱</span>
              Линии
            </button>
          </div>
          <button
            className={`beautify-lines${styled ? " active" : ""}`}
            type="button"
            disabled={lines.length === 0}
            onClick={beautifyMap}
          >
            <span aria-hidden="true">✦</span>
            Выровнять и стилизовать
          </button>
          <span className="line-count" aria-live="polite">{lineCountLabel}</span>
          <button
            className="undo-line"
            type="button"
            aria-label="Отменить последнюю линию"
            title="Отменить последнюю линию"
            disabled={lines.length === 0}
            onClick={() => setLines((current) => current.slice(0, -1))}
          >
            <span aria-hidden="true">↶</span>
          </button>
        </div>

        <div
          className={`map-board mode-${mode}${resizing ? " resizing" : ""}`}
          ref={boardRef}
          style={{ width: `${size.width}px`, height: `${size.height}px` }}
          onPointerDown={startLineDrawing}
          onPointerMove={handlePointerMove}
          onPointerUp={finishPointerAction}
          onPointerCancel={cancelPointerAction}
        >
          <div className="map-board-texture" aria-hidden="true" />
          <svg
            className={`map-lines${styled ? " styled" : ""}`}
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <defs>
              <filter id={`rough-ink-${locationType}`} x="-4%" y="-4%" width="108%" height="108%">
                <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="2" seed="7" result="noise" />
                <feDisplacementMap in="SourceGraphic" in2="noise" scale="0.55" />
              </filter>
            </defs>
            {lines.map((line) => (
              <g key={line.id}>
                <line
                  className="line-wear"
                  x1={line.x1}
                  y1={line.y1}
                  x2={line.x2}
                  y2={line.y2}
                />
                <line
                  className="line-ink"
                  x1={line.x1}
                  y1={line.y1}
                  x2={line.x2}
                  y2={line.y2}
                  style={styled ? { filter: `url(#rough-ink-${locationType})` } : undefined}
                />
              </g>
            ))}
            {draftLine ? (
              <line
                className="draft-line"
                x1={draftLine.x1}
                y1={draftLine.y1}
                x2={draftLine.x2}
                y2={draftLine.y2}
              />
            ) : null}
          </svg>
          <div className="map-size" aria-hidden="true">
            {Math.round(size.width)} × {Math.round(size.height)}
          </div>

          <button
            className={`map-point map-start-point${positions.start ? " placed" : " piled"}${draggingId === "start" ? " dragging" : ""}`}
            type="button"
            style={positions.start
              ? { left: `${positions.start.x}%`, top: `${positions.start.y}%` }
              : {
                "--pile-offset": "42px",
                "--pile-angle": "-10deg",
                "--pile-z": 19,
              } as CSSProperties}
            aria-label="Точка старта"
            title="Точка старта"
            tabIndex={mode === "points" ? 0 : -1}
            onPointerDown={(event) => startPointDrag(event, "start")}
            onKeyDown={(event) => movePointWithKeyboard(event, "start")}
          >
            <span aria-hidden="true">⚑</span>
          </button>

          {places.map((place, index) => {
            const position = positions[String(place.id)];
            const adventure = adventures[String(place.id)];
            const marker = adventure
              ? markerCatalog.find((option) => option.id === adventure.marker)
              : null;
            const pointStyle: CSSProperties = position
              ? { left: `${position.x}%`, top: `${position.y}%` }
              : {
                "--pile-offset": `${49 + index * 7}px`,
                "--pile-angle": `${(index - 1) * 4}deg`,
                "--pile-z": 18 - index,
              } as CSSProperties;
            const name = `${index + 1}. ${place.first} — ${place.second}`;

            return (
              <button
                className={`map-point${marker ? ` marker-${marker.id} customized` : ""}${position ? " placed" : " piled"}${draggingId === place.id ? " dragging" : ""}`}
                type="button"
                style={pointStyle}
                aria-label={name}
                title={name}
                tabIndex={mode === "points" ? 0 : -1}
                onPointerDown={(event) => startPointDrag(event, place.id)}
                onKeyDown={(event) => movePointWithKeyboard(event, place.id)}
                key={place.id}
              >
                {marker?.symbol ?? index + 1}
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
        <div className="map-workspace-footer">
          <button className="map-next-button" type="button" onClick={openRiddleDesigner}>
            {adventureOpen ? "Перейти к загадкам" : "Продолжить"}
            <span aria-hidden="true">→</span>
          </button>
        </div>
      </div>
      </section>

      {adventureOpen ? (
        <RiddleDesigner
          locationType={locationType}
          places={places}
          adventures={adventures}
          onChange={setAdventures}
        />
      ) : null}
    </>
  );
}
