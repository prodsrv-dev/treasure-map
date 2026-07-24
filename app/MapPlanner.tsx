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
  manualRoute: PointPosition[] | null;
  styled: boolean;
  adventureOpen: boolean;
  adventures: Record<string, AdventureEntry>;
};

type ResizeAxis = "x" | "y" | "xy";
type PointId = number | "start";
type DrawingMode = "points" | "lines" | "route";

type LineSegment = {
  id: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

type DraftLine = Omit<LineSegment, "id">;

type RouteArrow = {
  x: number;
  y: number;
  angle: number;
};

type RouteLayout = {
  path: string;
  arrows: RouteArrow[];
  cross: { x: number; y: number } | null;
};

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

function toPixels(point: PointPosition, size: BoardSize) {
  return {
    x: (point.x / 100) * size.width,
    y: (point.y / 100) * size.height,
  };
}

function pixelDistance(first: PointPosition, second: PointPosition, size: BoardSize) {
  const a = toPixels(first, size);
  const b = toPixels(second, size);
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function distanceToWall(point: PointPosition, wall: LineSegment, size: BoardSize) {
  const pixelPoint = toPixels(point, size);
  const start = toPixels({ x: wall.x1, y: wall.y1 }, size);
  const end = toPixels({ x: wall.x2, y: wall.y2 }, size);
  const lengthSquared = (end.x - start.x) ** 2 + (end.y - start.y) ** 2;
  if (lengthSquared === 0) return Math.hypot(pixelPoint.x - start.x, pixelPoint.y - start.y);

  const progress = clamp(
    ((pixelPoint.x - start.x) * (end.x - start.x)
      + (pixelPoint.y - start.y) * (end.y - start.y)) / lengthSquared,
    0,
    1,
  );
  const nearest = {
    x: start.x + (end.x - start.x) * progress,
    y: start.y + (end.y - start.y) * progress,
  };
  return Math.hypot(pixelPoint.x - nearest.x, pixelPoint.y - nearest.y);
}

function segmentIntersection(
  start: PointPosition,
  end: PointPosition,
  wall: LineSegment,
  size: BoardSize,
): PointPosition | null {
  const a = toPixels(start, size);
  const b = toPixels(end, size);
  const c = toPixels({ x: wall.x1, y: wall.y1 }, size);
  const d = toPixels({ x: wall.x2, y: wall.y2 }, size);
  const denominator = (a.x - b.x) * (c.y - d.y) - (a.y - b.y) * (c.x - d.x);
  if (Math.abs(denominator) < 0.001) return null;

  const routeProgress = ((a.x - c.x) * (c.y - d.y) - (a.y - c.y) * (c.x - d.x)) / denominator;
  const wallProgress = -((a.x - b.x) * (a.y - c.y) - (a.y - b.y) * (a.x - c.x)) / denominator;
  if (routeProgress <= 0.001 || routeProgress >= 0.999 || wallProgress < 0 || wallProgress > 1) {
    return null;
  }

  return {
    x: start.x + (end.x - start.x) * routeProgress,
    y: start.y + (end.y - start.y) * routeProgress,
  };
}

function wallCrossings(
  start: PointPosition,
  end: PointPosition,
  walls: LineSegment[],
  size: BoardSize,
) {
  return walls.flatMap((wall) => {
    const crossing = segmentIntersection(start, end, wall, size);
    return crossing ? [crossing] : [];
  });
}

function runsTooCloseToWall(
  start: PointPosition,
  end: PointPosition,
  walls: LineSegment[],
  size: BoardSize,
  clearance = 10,
) {
  return [0.2, 0.4, 0.6, 0.8].some((progress) => {
    const sample = {
      x: start.x + (end.x - start.x) * progress,
      y: start.y + (end.y - start.y) * progress,
    };
    return walls.some((wall) => distanceToWall(sample, wall, size) < clearance);
  });
}

function simplifyStrictRoute(points: PointPosition[], walls: LineSegment[], size: BoardSize) {
  if (points.length < 3) return points;

  const simplified = [points[0]];
  let index = 0;
  while (index < points.length - 1) {
    let nextIndex = points.length - 1;
    while (nextIndex > index + 1) {
      if (
        wallCrossings(points[index], points[nextIndex], walls, size).length === 0
        && !runsTooCloseToWall(points[index], points[nextIndex], walls, size, 8)
      ) break;
      nextIndex -= 1;
    }
    simplified.push(points[nextIndex]);
    index = nextIndex;
  }
  return simplified;
}

function simplifyDoorRoute(points: PointPosition[], size: BoardSize) {
  if (points.length < 3) return points;

  const simplified = [points[0]];
  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = toPixels(points[index - 1], size);
    const current = toPixels(points[index], size);
    const next = toPixels(points[index + 1], size);
    const first = { x: current.x - previous.x, y: current.y - previous.y };
    const second = { x: next.x - current.x, y: next.y - current.y };
    const firstLength = Math.hypot(first.x, first.y);
    const secondLength = Math.hypot(second.x, second.y);
    const turn = firstLength && secondLength
      ? Math.abs(first.x * second.y - first.y * second.x) / (firstLength * secondLength)
      : 0;
    if (turn > 0.08) simplified.push(points[index]);
  }
  simplified.push(points.at(-1)!);
  return simplified;
}

function findGridRoute(
  start: PointPosition,
  end: PointPosition,
  walls: LineSegment[],
  size: BoardSize,
) {
  const step = 2.5;
  const cellCount = Math.round(100 / step);
  const cellFor = (point: PointPosition) => ({
    x: clamp(Math.round(point.x / step), 1, cellCount - 1),
    y: clamp(Math.round(point.y / step), 1, cellCount - 1),
  });
  const startCell = cellFor(start);
  const endCell = cellFor(end);
  const keyFor = (x: number, y: number) => `${x}:${y}`;
  const startKey = keyFor(startCell.x, startCell.y);
  const endKey = keyFor(endCell.x, endCell.y);
  if (startKey === endKey) return [start, end];

  const pointFor = (x: number, y: number) => {
    const key = keyFor(x, y);
    if (key === startKey) return start;
    if (key === endKey) return end;
    return { x: x * step, y: y * step };
  };
  const parseKey = (key: string) => {
    const [x, y] = key.split(":").map(Number);
    return { x, y };
  };
  const open = new Set([startKey]);
  const cameFrom = new Map<string, string>();
  const costs = new Map([[startKey, 0]]);
  const estimates = new Map([[startKey, pixelDistance(start, end, size)]]);
  const directions = [-1, 0, 1].flatMap((x) => [-1, 0, 1]
    .filter((y) => x !== 0 || y !== 0)
    .map((y) => ({ x, y })));

  for (let iteration = 0; open.size && iteration < 10000; iteration += 1) {
    const currentKey = [...open].reduce((best, candidate) => (
      (estimates.get(candidate) ?? Infinity) < (estimates.get(best) ?? Infinity)
        ? candidate
        : best
    ));
    if (currentKey === endKey) {
      const routeKeys = [currentKey];
      let cursor = currentKey;
      while (cameFrom.has(cursor)) {
        cursor = cameFrom.get(cursor)!;
        routeKeys.push(cursor);
      }
      return routeKeys.reverse().map((key) => {
        const cell = parseKey(key);
        return pointFor(cell.x, cell.y);
      });
    }

    open.delete(currentKey);
    const currentCell = parseKey(currentKey);
    const currentPoint = pointFor(currentCell.x, currentCell.y);
    directions.forEach((direction) => {
      const nextCell = { x: currentCell.x + direction.x, y: currentCell.y + direction.y };
      if (
        nextCell.x < 1 || nextCell.x >= cellCount
        || nextCell.y < 1 || nextCell.y >= cellCount
      ) return;

      const nextKey = keyFor(nextCell.x, nextCell.y);
      const nextPoint = pointFor(nextCell.x, nextCell.y);
      const crossings = wallCrossings(currentPoint, nextPoint, walls, size);
      const nearWall = runsTooCloseToWall(currentPoint, nextPoint, walls, size);
      const isEndpoint = nextKey === endKey;
      if (crossings.length > 0 || (nearWall && !isEndpoint)) return;

      const previousKey = cameFrom.get(currentKey);
      let turnCost = 0;
      if (previousKey) {
        const previousCell = parseKey(previousKey);
        const previousDirection = {
          x: currentCell.x - previousCell.x,
          y: currentCell.y - previousCell.y,
        };
        if (previousDirection.x !== direction.x || previousDirection.y !== direction.y) turnCost = 2;
      }
      const nextCost = (costs.get(currentKey) ?? Infinity)
        + pixelDistance(currentPoint, nextPoint, size)
        + turnCost;
      if (nextCost >= (costs.get(nextKey) ?? Infinity)) return;

      cameFrom.set(nextKey, currentKey);
      costs.set(nextKey, nextCost);
      estimates.set(nextKey, nextCost + pixelDistance(nextPoint, end, size));
      open.add(nextKey);
    });
  }

  return null;
}

function catmullRomPath(points: Array<{ x: number; y: number }>) {
  if (!points.length) return "";

  const coordinate = (value: number) => Number(value.toFixed(1));
  if (points.length < 3) {
    return points.slice(1).reduce(
      (path, point) => `${path} L ${coordinate(point.x)} ${coordinate(point.y)}`,
      `M ${coordinate(points[0].x)} ${coordinate(points[0].y)}`,
    );
  }

  const clampControl = (from: { x: number; y: number }, offset: { x: number; y: number }, limit: number) => {
    const length = Math.hypot(offset.x, offset.y);
    const factor = length > limit && length > 0 ? limit / length : 1;
    return { x: from.x + offset.x * factor, y: from.y + offset.y * factor };
  };

  let path = `M ${coordinate(points[0].x)} ${coordinate(points[0].y)}`;
  for (let index = 0; index < points.length - 1; index += 1) {
    const before = points[Math.max(index - 1, 0)];
    const from = points[index];
    const to = points[index + 1];
    const after = points[Math.min(index + 2, points.length - 1)];
    const spanLimit = Math.hypot(to.x - from.x, to.y - from.y) * 0.42;
    const first = clampControl(from, { x: (to.x - before.x) / 6, y: (to.y - before.y) / 6 }, spanLimit);
    const second = clampControl(to, { x: -(after.x - from.x) / 6, y: -(after.y - from.y) / 6 }, spanLimit);
    path += ` C ${coordinate(first.x)} ${coordinate(first.y)}`
      + ` ${coordinate(second.x)} ${coordinate(second.y)}`
      + ` ${coordinate(to.x)} ${coordinate(to.y)}`;
  }
  return path;
}

function pointToSegmentDistance(
  point: PointPosition,
  start: PointPosition,
  end: PointPosition,
  size: BoardSize,
) {
  const pixelPoint = toPixels(point, size);
  const pixelStart = toPixels(start, size);
  const pixelEnd = toPixels(end, size);
  const lengthSquared = (pixelEnd.x - pixelStart.x) ** 2 + (pixelEnd.y - pixelStart.y) ** 2;
  if (lengthSquared === 0) return pixelDistance(point, start, size);

  const progress = clamp(
    ((pixelPoint.x - pixelStart.x) * (pixelEnd.x - pixelStart.x)
      + (pixelPoint.y - pixelStart.y) * (pixelEnd.y - pixelStart.y)) / lengthSquared,
    0,
    1,
  );
  const nearest = {
    x: pixelStart.x + (pixelEnd.x - pixelStart.x) * progress,
    y: pixelStart.y + (pixelEnd.y - pixelStart.y) * progress,
  };
  return Math.hypot(pixelPoint.x - nearest.x, pixelPoint.y - nearest.y);
}

function simplifyDrawnRoute(points: PointPosition[], size: BoardSize, tolerance = 7): PointPosition[] {
  if (points.length < 3) return points;

  let farthestIndex = 0;
  let farthestDistance = 0;
  for (let index = 1; index < points.length - 1; index += 1) {
    const distance = pointToSegmentDistance(points[index], points[0], points.at(-1)!, size);
    if (distance > farthestDistance) {
      farthestDistance = distance;
      farthestIndex = index;
    }
  }
  if (farthestDistance <= tolerance) return [points[0], points.at(-1)!];

  const first = simplifyDrawnRoute(points.slice(0, farthestIndex + 1), size, tolerance);
  const second = simplifyDrawnRoute(points.slice(farthestIndex), size, tolerance);
  return [...first.slice(0, -1), ...second];
}

function routePointAtDistance(points: Array<{ x: number; y: number }>, targetDistance: number) {
  let travelled = 0;
  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1];
    const to = points[index];
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    if (travelled + length >= targetDistance && length > 0) {
      const progress = (targetDistance - travelled) / length;
      return {
        x: from.x + (to.x - from.x) * progress,
        y: from.y + (to.y - from.y) * progress,
        angle: Math.atan2(to.y - from.y, to.x - from.x) * (180 / Math.PI),
      };
    }
    travelled += length;
  }
  return null;
}

function composeDrawnRoute(
  points: PointPosition[],
  walls: LineSegment[],
  size: BoardSize,
): RouteLayout {
  if (points.length < 2) return { path: "", arrows: [], cross: null };

  const routed: PointPosition[] = [points[0]];
  for (let index = 0; index < points.length - 1; index += 1) {
    const segment = findGridRoute(points[index], points[index + 1], walls, size);
    if (!segment) return { path: "", arrows: [], cross: null };
    routed.push(...simplifyStrictRoute(segment, walls, size).slice(1));
  }

  const pixels = routed.map((point) => toPixels(point, size));
  const totalLength = pixels.slice(1).reduce((sum, point, index) => (
    sum + Math.hypot(point.x - pixels[index].x, point.y - pixels[index].y)
  ), 0);
  const arrows = totalLength < 180
    ? []
    : [0.32, 0.62, 0.86].flatMap((progress) => {
      const arrow = routePointAtDistance(pixels, totalLength * progress);
      return arrow ? [arrow] : [];
    });

  return {
    path: catmullRomPath(pixels),
    arrows,
    cross: null,
  };
}

function awayFromNearestWall(point: PointPosition, walls: LineSegment[], size: BoardSize) {
  let nearest: { distance: number; away: { x: number; y: number } } | null = null;
  const pixels = toPixels(point, size);

  walls.forEach((wall) => {
    const start = toPixels({ x: wall.x1, y: wall.y1 }, size);
    const end = toPixels({ x: wall.x2, y: wall.y2 }, size);
    const lengthSquared = (end.x - start.x) ** 2 + (end.y - start.y) ** 2;
    const progress = lengthSquared === 0 ? 0 : clamp(
      ((pixels.x - start.x) * (end.x - start.x) + (pixels.y - start.y) * (end.y - start.y))
        / lengthSquared,
      0,
      1,
    );
    const foot = {
      x: start.x + (end.x - start.x) * progress,
      y: start.y + (end.y - start.y) * progress,
    };
    const distance = Math.hypot(pixels.x - foot.x, pixels.y - foot.y);
    if (nearest && distance >= nearest.distance) return;
    nearest = {
      distance,
      away: distance > 0.5
        ? { x: (pixels.x - foot.x) / distance, y: (pixels.y - foot.y) / distance }
        : { x: 0, y: -1 },
    };
  });
  return nearest as { distance: number; away: { x: number; y: number } } | null;
}

function swellSegment(
  from: PointPosition,
  to: PointPosition,
  walls: LineSegment[],
  size: BoardSize,
  initialSide: number,
) {
  const fromPixels = toPixels(from, size);
  const toPixelsPoint = toPixels(to, size);
  const length = Math.hypot(toPixelsPoint.x - fromPixels.x, toPixelsPoint.y - fromPixels.y);
  const stops = length > 280
    ? [0.2, 0.5, 0.8]
    : length > 155
      ? [1 / 3, 2 / 3]
      : length > 74
        ? [0.5]
        : [];
  if (!stops.length) return { inserted: [] as PointPosition[], side: initialSide };

  const direction = {
    x: (toPixelsPoint.x - fromPixels.x) / length,
    y: (toPixelsPoint.y - fromPixels.y) / length,
  };
  const perpendicular = { x: -direction.y, y: direction.x };
  const amplitude = clamp(length * 0.34, 30, 110);
  const middle = {
    x: ((fromPixels.x + toPixelsPoint.x) / 2 / size.width) * 100,
    y: ((fromPixels.y + toPixelsPoint.y) / 2 / size.height) * 100,
  };
  const nearestWall = awayFromNearestWall(middle, walls, size);
  const preferredSide = nearestWall && nearestWall.distance < 110
    ? Math.sign(
      nearestWall.away.x * perpendicular.x
      + nearestWall.away.y * perpendicular.y,
    ) || initialSide
    : initialSide;

  const candidates = [preferredSide, -preferredSide].flatMap((side) => (
    [1, 0.82, 0.64, 0.48, 0.34].map((factor) => {
      const inserted = stops.map((stop) => {
        const bow = Math.sin(Math.PI * stop);
        return {
          x: ((fromPixels.x
            + (toPixelsPoint.x - fromPixels.x) * stop
            + perpendicular.x * side * amplitude * factor * bow) / size.width) * 100,
          y: ((fromPixels.y
            + (toPixelsPoint.y - fromPixels.y) * stop
            + perpendicular.y * side * amplitude * factor * bow) / size.height) * 100,
        };
      });
      const route = [from, ...inserted, to];
      const insideBoard = inserted.every((point) => (
        point.x >= 3 && point.x <= 97 && point.y >= 5 && point.y <= 95
      ));
      const clearsWalls = route.slice(0, -1).every((point, index) => (
        wallCrossings(point, route[index + 1], walls, size).length === 0
        && !runsTooCloseToWall(point, route[index + 1], walls, size, 8)
      ));
      const clearance = inserted.reduce((nearest, point) => (
        Math.min(
          nearest,
          ...walls.map((wall) => distanceToWall(point, wall, size)),
        )
      ), Infinity);

      return {
        side,
        inserted,
        valid: insideBoard && clearsWalls,
        score: factor * 100
          + Math.min(clearance, 45) * 0.2
          + (side === preferredSide ? 5 : 0),
      };
    })
  ));
  const chosen = candidates
    .filter((candidate) => candidate.valid)
    .sort((first, second) => second.score - first.score)[0];

  return chosen
    ? { inserted: chosen.inserted, side: -chosen.side }
    : { inserted: [] as PointPosition[], side: initialSide };
}

function swellLeg(
  keyPoints: PointPosition[],
  walls: LineSegment[],
  size: BoardSize,
  initialSide: number,
) {
  const out: PointPosition[] = [keyPoints[0]];
  let side = initialSide;
  for (let index = 0; index < keyPoints.length - 1; index += 1) {
    const swell = swellSegment(keyPoints[index], keyPoints[index + 1], walls, size, side);
    out.push(...swell.inserted, keyPoints[index + 1]);
    side = swell.side;
  }
  return { points: out, side };
}

function routePointNearEnd(points: Array<{ x: number; y: number }>, distanceFromEnd: number) {
  let remaining = distanceFromEnd;
  for (let index = points.length - 1; index > 0; index -= 1) {
    const from = points[index - 1];
    const to = points[index];
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    if (length >= remaining && length > 0) {
      const progress = (length - remaining) / length;
      return {
        x: from.x + (to.x - from.x) * progress,
        y: from.y + (to.y - from.y) * progress,
        angle: Math.atan2(to.y - from.y, to.x - from.x) * (180 / Math.PI),
      };
    }
    remaining -= length;
  }
  return null;
}

function finaleTail(
  composed: PointPosition[],
  walls: LineSegment[],
  size: BoardSize,
  stops: PointPosition[],
) {
  const last = composed.at(-1)!;
  const previous = composed.at(-2) ?? last;
  const lastPixels = toPixels(last, size);
  const previousPixels = toPixels(previous, size);
  const baseAngle = Math.atan2(lastPixels.y - previousPixels.y, lastPixels.x - previousPixels.x);
  const tailLength = 74;

  for (const turn of [0, 0.6, -0.6, 1.2, -1.2, 1.9, -1.9, Math.PI]) {
    const angle = baseAngle + turn;
    const end = {
      x: ((lastPixels.x + Math.cos(angle) * tailLength) / size.width) * 100,
      y: ((lastPixels.y + Math.sin(angle) * tailLength) / size.height) * 100,
    };
    if (end.x < 4 || end.x > 96 || end.y < 7 || end.y > 93) continue;
    if (wallCrossings(last, end, walls, size).length > 0) continue;
    if (runsTooCloseToWall(last, end, walls, size, 12)) continue;
    if (stops.some((stop) => pixelDistance(stop, end, size) < 52)) continue;
    return end;
  }
  return null;
}

function composeRoute(
  points: PointPosition[],
  walls: LineSegment[],
  size: BoardSize,
): RouteLayout {
  if (points.length < 2) return { path: "", arrows: [], cross: null };

  const composed: PointPosition[] = [points[0]];
  const legEnds: number[] = [];
  let swellSide = 1;
  for (let index = 0; index < points.length - 1; index += 1) {
    const strictRoute = findGridRoute(points[index], points[index + 1], walls, size);
    if (!strictRoute) return { path: "", arrows: [], cross: null };

    const segment = simplifyStrictRoute(strictRoute, walls, size);
    const swollen = swellLeg(segment, walls, size, swellSide);
    swellSide = swollen.side;
    composed.push(...swollen.points.slice(1));
    legEnds.push(composed.length - 1);
  }

  const arrows = legEnds.flatMap((endIndex, leg) => {
    const startIndex = leg === 0 ? 0 : legEnds[leg - 1];
    const legPixels = composed
      .slice(startIndex, endIndex + 1)
      .map((point) => toPixels(point, size));
    const legLength = legPixels.slice(1).reduce((sum, point, index) => (
      sum + Math.hypot(point.x - legPixels[index].x, point.y - legPixels[index].y)
    ), 0);
    if (legLength < 118) return [];

    const arrow = routePointNearEnd(legPixels, 64);
    return arrow ? [arrow] : [];
  });

  const tail = finaleTail(composed, walls, size, points.slice(0, -1));
  if (tail) composed.push(tail);
  const path = catmullRomPath(composed.map((point) => toPixels(point, size)));
  return {
    path,
    arrows,
    cross: tail ? toPixels(tail, size) : null,
  };
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
    const manualRoute = stored.manualRoute === null
      ? null
      : Array.isArray(stored.manualRoute)
        ? stored.manualRoute.flatMap((point) => {
          if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return [];
          return [{ x: clamp(point.x, 0, 100), y: clamp(point.y, 0, 100) }];
        })
        : null;
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
      manualRoute,
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
  const [manualRoute, setManualRoute] = useState<PointPosition[] | null>(null);
  const [draftRoute, setDraftRoute] = useState<PointPosition[] | null>(null);
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
  const routePoints = useMemo(() => {
    const anchored = (point: PointPosition | undefined, drop: number) => (
      point ? { x: point.x, y: Math.min(95, point.y + (drop / size.height) * 100) } : undefined
    );
    return [
      anchored(positions.start, 24),
      ...places.map((place) => anchored(positions[String(place.id)], 34)),
    ].filter((point): point is PointPosition => Boolean(point));
  }, [places, positions, size]);
  const routeLayout = useMemo(() => (
    manualRoute === null
      ? composeRoute(routePoints, lines, size)
      : composeDrawnRoute(manualRoute, lines, size)
  ), [lines, manualRoute, routePoints, size]);
  const wallPieces = useMemo(
    () => lines.map((line) => {
      const start = toPixels({ x: line.x1, y: line.y1 }, size);
      const end = toPixels({ x: line.x2, y: line.y2 }, size);
      return {
        id: line.id,
        d: `M ${start.x.toFixed(1)} ${start.y.toFixed(1)} L ${end.x.toFixed(1)} ${end.y.toFixed(1)}`,
      };
    }),
    [lines, size],
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
      const restoredAdventures = { ...stored.adventures };
      places.forEach((place, index) => {
        const key = String(place.id);
        const suggested = createDefaultAdventure(place, index, locationType);
        if (!restoredAdventures[key]) {
          restoredAdventures[key] = suggested;
        }
      });
      setSize(stored.size);
      setPositions(stored.positions);
      setLines(stored.lines);
      setManualRoute(stored.manualRoute);
      setStyled(stored.styled);
      setAdventureOpen(stored.adventureOpen);
      setAdventures(restoredAdventures);
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
        manualRoute,
        styled,
        adventureOpen,
        adventures,
      }));
    } catch {
      // Storage can be disabled by browser privacy settings.
    }
  }, [adventureOpen, adventures, lines, locationType, manualRoute, positions, ready, size, styled]);

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

  function startMapDrawing(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || !boardRef.current) return;

    if (mode === "route") {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      const bounds = boardRef.current.getBoundingClientRect();
      const start = pointerPosition(event, bounds);
      setDraftRoute([start]);
      return;
    }
    if (mode !== "lines") return;

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
    if (draftRoute && boardRef.current) {
      const bounds = boardRef.current.getBoundingClientRect();
      const point = pointerPosition(event, bounds);
      setDraftRoute((current) => {
        if (!current?.length) return [point];
        if (pixelDistance(current.at(-1)!, point, size) < 8) return current;
        return [...current, point];
      });
      return;
    }
    if (draftLine) {
      updateLineFromPointer(event);
      return;
    }
    updatePointFromPointer(event);
  }

  function finishPointerAction(event: ReactPointerEvent) {
    if (draftRoute && boardRef.current) {
      const bounds = boardRef.current.getBoundingClientRect();
      const end = pointerPosition(event, bounds);
      const completeRoute = [...draftRoute, end];
      const routeLength = completeRoute.slice(1).reduce((sum, point, index) => (
        sum + pixelDistance(completeRoute[index], point, size)
      ), 0);
      setManualRoute(routeLength >= 40 ? simplifyDrawnRoute(completeRoute, size) : null);
    }
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
    setDraftRoute(null);
  }

  function cancelPointerAction() {
    resizeState.current = null;
    setResizing(false);
    setDraggingId(null);
    setDraftLine(null);
    setDraftRoute(null);
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
            <button
              className={mode === "route" ? "active" : ""}
              type="button"
              aria-pressed={mode === "route"}
              onClick={() => {
                cancelPointerAction();
                setMode("route");
              }}
            >
              <span aria-hidden="true">⌁</span>
              Маршрут
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
            aria-label={mode === "route" ? "Вернуть автоматический маршрут" : "Отменить последнюю линию"}
            title={mode === "route" ? "Вернуть автоматический маршрут" : "Отменить последнюю линию"}
            disabled={mode === "route" ? manualRoute === null : lines.length === 0}
            onClick={() => {
              if (mode === "route") {
                setManualRoute(null);
                return;
              }
              setLines((current) => current.slice(0, -1));
            }}
          >
            <span aria-hidden="true">↶</span>
          </button>
        </div>

        <div
          className={`map-board mode-${mode}${resizing ? " resizing" : ""}${adventureOpen ? " adventure-open" : ""}`}
          ref={boardRef}
          style={{ width: `${size.width}px`, height: `${size.height}px` }}
          onPointerDown={startMapDrawing}
          onPointerMove={handlePointerMove}
          onPointerUp={finishPointerAction}
          onPointerCancel={cancelPointerAction}
        >
          <div className="map-board-texture" aria-hidden="true" />
          <svg
            className={`map-lines${styled ? " styled" : ""}`}
            viewBox={`0 0 ${size.width} ${size.height}`}
            aria-hidden="true"
          >
            <defs>
              <filter id={`rough-seal-${locationType}`} x="-12%" y="-12%" width="124%" height="124%">
                <feTurbulence type="fractalNoise" baseFrequency="0.14" numOctaves="2" seed="4" result="noise" />
                <feDisplacementMap in="SourceGraphic" in2="noise" scale="1.4" />
              </filter>
            </defs>
            <g className="map-walls">
              {styled ? (
                <g className="map-walls-wash" transform="translate(1.6 2.2)">
                  {wallPieces.map((piece) => (
                    piece.d ? <path d={piece.d} key={piece.id} /> : null
                  ))}
                </g>
              ) : null}
              <g className="map-walls-ink">
                {wallPieces.map((piece) => (
                  piece.d ? <path d={piece.d} key={piece.id} /> : null
                ))}
              </g>
            </g>
            {(adventureOpen || mode === "route") && routeLayout.path && !draftRoute ? (
              <g className="map-route">
                <path className="map-route-ink" d={routeLayout.path} />
                {routeLayout.arrows.map((arrow, index) => (
                  <path
                    className="route-arrow"
                    d="M -9.5 -5.5 L 3.5 0 L -9.5 5.5 C -6.5 3 -6.5 -3 -9.5 -5.5 Z"
                    transform={`translate(${arrow.x.toFixed(1)} ${arrow.y.toFixed(1)}) rotate(${arrow.angle.toFixed(1)})`}
                    key={index}
                  />
                ))}
                {routeLayout.cross ? (
                  <g
                    className="route-cross"
                    transform={`translate(${routeLayout.cross.x.toFixed(1)} ${routeLayout.cross.y.toFixed(1)}) rotate(-8)`}
                  >
                    <line className="route-cross-under" x1="-12" y1="-12" x2="12" y2="12" />
                    <line className="route-cross-under" x1="-12" y1="12" x2="12" y2="-12" />
                    <line className="route-cross-ink" x1="-11" y1="-11" x2="11" y2="11" />
                    <line className="route-cross-ink" x1="-11" y1="11" x2="11" y2="-11" />
                  </g>
                ) : null}
              </g>
            ) : null}
            {draftRoute?.length ? (
              <path
                className="draft-route"
                d={catmullRomPath(draftRoute.map((point) => toPixels(point, size)))}
              />
            ) : null}
            {draftLine ? (
              <line
                className="draft-line"
                x1={(draftLine.x1 / 100) * size.width}
                y1={(draftLine.y1 / 100) * size.height}
                x2={(draftLine.x2 / 100) * size.width}
                y2={(draftLine.y2 / 100) * size.height}
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
            <svg className="map-compass" viewBox="0 0 64 64" aria-hidden="true">
              <circle className="compass-paper" cx="32" cy="32" r="28.5" />
              <circle className="compass-rim" cx="32" cy="32" r="28.5" />
              <circle className="compass-rim-inner" cx="32" cy="32" r="22.5" />
              <g className="compass-star-minor" transform="rotate(45 32 32)">
                <path d="M 32 15 L 34.4 32 L 32 49 L 29.6 32 Z" />
                <path d="M 15 32 L 32 29.6 L 49 32 L 32 34.4 Z" />
              </g>
              <g className="compass-star">
                <path className="compass-ink" d="M 32 5.5 L 36.4 32 L 32 32 Z M 32 58.5 L 27.6 32 L 32 32 Z M 5.5 32 L 32 27.6 L 32 32 Z M 58.5 32 L 32 36.4 L 32 32 Z" />
                <path className="compass-red" d="M 32 5.5 L 27.6 32 L 32 32 Z M 32 58.5 L 36.4 32 L 32 32 Z M 5.5 32 L 32 36.4 L 32 32 Z M 58.5 32 L 32 27.6 L 32 32 Z" />
              </g>
              <circle className="compass-pin" cx="32" cy="32" r="2.2" />
            </svg>
          </button>

          {places.map((place, index) => {
            const position = positions[String(place.id)];
            const adventure = adventures[String(place.id)];
            const marker = adventure
              ? markerCatalog.find((option) => option.id === adventure.marker)
              : null;
            const markerScale = marker ? { "--marker-scale": marker.scale } : null;
            const pointStyle: CSSProperties = position
              ? { left: `${position.x}%`, top: `${position.y}%`, ...markerScale } as CSSProperties
              : {
                "--pile-offset": `${49 + index * 7}px`,
                "--pile-angle": `${(index - 1) * 4}deg`,
                "--pile-z": 18 - index,
                ...markerScale,
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
                {marker
                  ? (
                    <img className="map-monster-image" src={marker.image} alt="" draggable={false} />
                  )
                  : (
                    <>
                      <svg className="map-seal" viewBox="0 0 44 44" aria-hidden="true">
                        <circle className="seal-paper" cx="22" cy="22" r="18.5" />
                        <g filter={`url(#rough-seal-${locationType})`}>
                          <circle className="seal-ring" cx="22" cy="22" r="18.5" />
                          <circle className="seal-ring-inner" cx="22" cy="22" r="13.5" />
                        </g>
                      </svg>
                      <span className="map-point-number" aria-hidden="true">{index + 1}</span>
                    </>
                  )}
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
