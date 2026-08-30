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
import MapBackDesigner from "./MapBackDesigner";
import { boardSizeForPrint, getPrintMetrics } from "./mapExport";
import OutdoorMapLayer, {
  OutdoorFeature,
  OutdoorMapState,
  createEmptyOutdoorMap,
  fetchOutdoorFeatures,
  geocodeOutdoorAddress,
} from "./OutdoorMapLayer";
import RiddleDesigner, {
  AdventureEntry,
  MarkerKind,
  createDefaultAdventure,
  isLegacyRiddle,
  markerCatalog,
} from "./RiddleDesigner";

type LocationType = "apartment" | "dacha" | "yard";

type MapPlace = {
  id: number;
  first: string;
  second: string;
  photoName: string;
  photoDataUrl: string;
  monsterJobId: string;
  monsterSignature: string;
};

type MapPrize = {
  name: string;
  photoName: string;
  photoDataUrl: string;
  imageJobId: string;
  imageSignature: string;
};

type MonsterJobState = {
  status: "pending" | "completed" | "failed";
  resultUrl?: string;
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
  partitionCells: PartitionCell[];
  partitionVersion?: number;
  manualRoutes: PointPosition[][] | null;
  manualRoute?: PointPosition[] | null;
  routeStyle: RouteStyle;
  styled: boolean;
  adventureOpen: boolean;
  backOpen?: boolean;
  seekerName: string;
  adventures: Record<string, AdventureEntry>;
  outdoorMap?: OutdoorMapState;
  placeSignatures?: Record<string, string>;
};

type ResizeAxis = "x" | "y" | "xy";
type PointId = number | "start" | "prize";
const FINAL_COMPOSITE_BOTTOM_GUARD = 110;
const MIN_PARTITION_SEED_DISTANCE = 42;
const PARTITION_VERSION = 4;
type DrawingMode = "points" | "lines" | "route" | "style" | "split";
type RouteStyle = "plain" | "arrows" | "footprints";

function placeSignature(place: MapPlace) {
  let photoHash = 2166136261;
  for (let index = 0; index < place.photoDataUrl.length; index += 1) {
    photoHash ^= place.photoDataUrl.charCodeAt(index);
    photoHash = Math.imul(photoHash, 16777619);
  }
  return [
    place.first.trim(),
    place.second.trim(),
    place.photoName,
    (photoHash >>> 0).toString(36),
  ].join("\u0001");
}

type LineSegment = {
  id: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

type DraftLine = Omit<LineSegment, "id">;

type LineDragState = {
  id: number;
  start: PointPosition;
  line: LineSegment;
};

type RouteArrow = {
  x: number;
  y: number;
  angle: number;
};

type RouteFootprint = RouteArrow & {
  side: number;
};

type RouteLayout = {
  path: string;
  arrows: RouteArrow[];
  footprints: RouteFootprint[];
  cross: { x: number; y: number } | null;
};

type PartitionSeed = {
  id: string;
  point: PointPosition;
};

type PartitionCell = {
  id: string;
  points: PointPosition[];
};

type CutSegment = {
  id: string;
  start: PointPosition;
  end: PointPosition;
};

const DEFAULT_SIZE: BoardSize = { width: 920, height: 540 };
const MIN_SIZE: BoardSize = { width: 360, height: 320 };
const STANDARD_PRINT_SIZES = [
  { id: "a5", label: "A5", widthCm: 21, heightCm: 14.8 },
  { id: "a4", label: "A4", widthCm: 29.7, heightCm: 21 },
  { id: "a3", label: "A3", widthCm: 42, heightCm: 29.7 },
  { id: "a2", label: "A2", widthCm: 59.4, heightCm: 42 },
] as const;
const MAX_SIZE = boardSizeForPrint(59.4, 42);
const boundaryLabel: Record<LocationType, string> = {
  apartment: "квартиры",
  dacha: "дачного участка",
  yard: "двора",
};
const routeStyleOptions: Array<{ id: RouteStyle; label: string }> = [
  { id: "plain", label: "Без стрелок" },
  { id: "arrows", label: "Стрелки" },
  { id: "footprints", label: "Следы" },
];

function storageKey(locationType: LocationType) {
  return `treasure-map:layout:${locationType}:v1`;
}

function outdoorFeaturePath(feature: OutdoorFeature, size: BoardSize) {
  if (feature.points.length < 2) return "";

  const commands = feature.points.map((point, index) => {
    const pixel = toPixels(point, size);
    return `${index === 0 ? "M" : "L"} ${pixel.x.toFixed(1)} ${pixel.y.toFixed(1)}`;
  });
  if (feature.closed) commands.push("Z");
  return commands.join(" ");
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function finalPositionMaxY(height: number) {
  return Math.max(5, 100 - (FINAL_COMPOSITE_BOTTOM_GUARD / height) * 100);
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

function clipPolygonToHalfPlane(
  polygon: PointPosition[],
  a: number,
  b: number,
  c: number,
) {
  if (!polygon.length) return [];

  const result: PointPosition[] = [];
  const signedDistance = (point: PointPosition) => a * point.x + b * point.y - c;

  polygon.forEach((end, index) => {
    const start = polygon[(index + polygon.length - 1) % polygon.length];
    const startDistance = signedDistance(start);
    const endDistance = signedDistance(end);
    const startInside = startDistance <= 0.0001;
    const endInside = endDistance <= 0.0001;

    if (startInside !== endInside) {
      const progress = startDistance / (startDistance - endDistance);
      result.push({
        x: start.x + (end.x - start.x) * progress,
        y: start.y + (end.y - start.y) * progress,
      });
    }
    if (endInside) result.push(end);
  });

  return result;
}

function createPartitionCells(seeds: PartitionSeed[], size: BoardSize): PartitionCell[] {
  if (seeds.length < 2) return [];

  const pixels = seeds.map(({ id, point }) => ({ id, point: toPixels(point, size) }));
  const startSeed = pixels.find((seed) => seed.id === "start");
  const nearestStartDistanceSquared = startSeed
    ? Math.min(
      ...pixels
        .filter((seed) => seed.id !== "start")
        .map((seed) => (
          (seed.point.x - startSeed.point.x) ** 2
          + (seed.point.y - startSeed.point.y) ** 2
        )),
    )
    : 0;
  const startWeight = startSeed
    ? Math.min(
      Math.min(size.width, size.height) ** 2 * 0.045,
      nearestStartDistanceSquared * 0.36,
    )
    : 0;

  return pixels.flatMap((seed, index) => {
    let polygon: PointPosition[] = [
      { x: 0, y: 0 },
      { x: size.width, y: 0 },
      { x: size.width, y: size.height },
      { x: 0, y: size.height },
    ];
    const weight = seed.id === "start" ? startWeight : 0;

    pixels.forEach((other, otherIndex) => {
      if (otherIndex === index || polygon.length < 3) return;

      const otherWeight = other.id === "start" ? startWeight : 0;
      const a = 2 * (other.point.x - seed.point.x);
      const b = 2 * (other.point.y - seed.point.y);
      const c = other.point.x ** 2 + other.point.y ** 2
        - seed.point.x ** 2 - seed.point.y ** 2
        + weight - otherWeight;
      polygon = clipPolygonToHalfPlane(polygon, a, b, c);
    });

    if (polygon.length < 3) return [];
    return [{
      id: seeds[index].id,
      points: polygon.map((point) => ({
        x: clamp((point.x / size.width) * 100, 0, 100),
        y: clamp((point.y / size.height) * 100, 0, 100),
      })),
    }];
  });
}

function partitionCellPath(cell: PartitionCell, size: BoardSize) {
  if (cell.points.length < 3) return "";

  const pixels = cell.points.map((point) => toPixels(point, size));
  return `${pixels.map((point, index) => (
    `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`
  )).join(" ")} Z`;
}

function isOuterBoundaryEdge(start: PointPosition, end: PointPosition) {
  const epsilon = 0.001;
  return (
    (Math.abs(start.x) < epsilon && Math.abs(end.x) < epsilon)
    || (Math.abs(start.x - 100) < epsilon && Math.abs(end.x - 100) < epsilon)
    || (Math.abs(start.y) < epsilon && Math.abs(end.y) < epsilon)
    || (Math.abs(start.y - 100) < epsilon && Math.abs(end.y - 100) < epsilon)
  );
}

function partitionCutSegments(cells: PartitionCell[]): CutSegment[] {
  const segments = new Map<string, CutSegment>();
  const pointKey = (point: PointPosition) => `${point.x.toFixed(4)},${point.y.toFixed(4)}`;

  cells.forEach((cell) => {
    cell.points.forEach((start, index) => {
      const end = cell.points[(index + 1) % cell.points.length];
      if (isOuterBoundaryEdge(start, end)) return;

      const endpoints = [pointKey(start), pointKey(end)].sort();
      const id = endpoints.join("|");
      if (!segments.has(id)) segments.set(id, { id, start, end });
    });
  });

  return [...segments.values()];
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

function routeFootprints(points: Array<{ x: number; y: number }>): RouteFootprint[] {
  const totalLength = points.slice(1).reduce((sum, point, index) => (
    sum + Math.hypot(point.x - points[index].x, point.y - points[index].y)
  ), 0);
  const marks: RouteFootprint[] = [];

  for (let distance = 14, index = 0; distance < totalLength - 12; distance += 24, index += 1) {
    const point = routePointAtDistance(points, distance);
    if (!point) continue;

    const side = index % 2 === 0 ? -1 : 1;
    const angle = (point.angle * Math.PI) / 180;
    const offset = 2.8 * side;
    marks.push({
      x: point.x - Math.sin(angle) * offset,
      y: point.y + Math.cos(angle) * offset,
      angle: point.angle,
      side,
    });
  }

  return marks;
}

function composeDrawnRoute(
  points: PointPosition[],
  walls: LineSegment[],
  size: BoardSize,
): RouteLayout {
  if (points.length < 2) return {
    path: "", arrows: [], footprints: [], cross: null,
  };

  const routed: PointPosition[] = [points[0]];
  for (let index = 0; index < points.length - 1; index += 1) {
    const segment = findGridRoute(points[index], points[index + 1], walls, size);
    if (!segment) return {
      path: "", arrows: [], footprints: [], cross: null,
    };
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
    footprints: routeFootprints(pixels),
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
  includeFinalCross = true,
): RouteLayout {
  if (points.length < 2) return {
    path: "", arrows: [], footprints: [], cross: null,
  };

  const composed: PointPosition[] = [points[0]];
  const legEnds: number[] = [];
  let swellSide = 1;
  for (let index = 0; index < points.length - 1; index += 1) {
    const strictRoute = findGridRoute(points[index], points[index + 1], walls, size);
    if (!strictRoute) return {
      path: "", arrows: [], footprints: [], cross: null,
    };

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

  const tail = includeFinalCross
    ? finaleTail(composed, walls, size, points.slice(0, -1))
    : null;
  if (tail) composed.push(tail);
  const pixels = composed.map((point) => toPixels(point, size));
  const path = catmullRomPath(pixels);
  return {
    path,
    arrows,
    footprints: routeFootprints(pixels),
    cross: tail ? toPixels(tail, size) : null,
  };
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

function restoreOutdoorMap(value: unknown): OutdoorMapState | undefined {
  if (!value || typeof value !== "object") return undefined;
  const stored = value as Partial<OutdoorMapState>;
  if (
    !stored.center
    || !Number.isFinite(stored.center.lat)
    || !Number.isFinite(stored.center.lng)
    || !Number.isFinite(stored.zoom)
  ) return undefined;

  const bounds = stored.bounds
    && Number.isFinite(stored.bounds.south)
    && Number.isFinite(stored.bounds.west)
    && Number.isFinite(stored.bounds.north)
    && Number.isFinite(stored.bounds.east)
    ? {
      south: stored.bounds.south,
      west: stored.bounds.west,
      north: stored.bounds.north,
      east: stored.bounds.east,
    }
    : null;
  const validKinds = new Set(["building", "road", "path", "fence", "water", "green"]);
  const features = Array.isArray(stored.features)
    ? stored.features.flatMap((feature) => {
      if (
        !feature
        || typeof feature.id !== "string"
        || !validKinds.has(feature.kind)
        || !Array.isArray(feature.points)
      ) return [];

      const points = feature.points.flatMap((point) => (
        point && Number.isFinite(point.x) && Number.isFinite(point.y)
          ? [{ x: clamp(point.x, 0, 100), y: clamp(point.y, 0, 100) }]
          : []
      ));
      return points.length >= 2
        ? [{
          id: feature.id,
          kind: feature.kind,
          points,
          closed: feature.closed === true,
        } as OutdoorFeature]
        : [];
    })
    : [];

  return {
    address: typeof stored.address === "string" ? stored.address.slice(0, 240) : "",
    center: {
      lat: clamp(stored.center.lat, -85, 85),
      lng: clamp(stored.center.lng, -180, 180),
    },
    zoom: clamp(Math.round(stored.zoom), 3, 20),
    bounds,
    locked: stored.locked === true && Boolean(bounds),
    features,
  };
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
    const partitionCells = Array.isArray(stored.partitionCells)
      ? stored.partitionCells.flatMap((cell) => {
        if (!cell || typeof cell.id !== "string" || !Array.isArray(cell.points)) return [];

        const points = cell.points.flatMap((point) => {
          if (
            !point
            || !Number.isFinite(point.x)
            || !Number.isFinite(point.y)
          ) return [];

          return [{
            x: clamp(point.x, 0, 100),
            y: clamp(point.y, 0, 100),
          }];
        });
        return points.length >= 3 ? [{ id: cell.id, points }] : [];
      })
      : [];
    const normalizeRoute = (route: unknown) => (
      Array.isArray(route)
        ? route.flatMap((point) => {
          if (
            !point
            || typeof point !== "object"
            || !("x" in point)
            || !("y" in point)
            || !Number.isFinite(point.x)
            || !Number.isFinite(point.y)
          ) return [];
          return [{
            x: clamp(point.x as number, 0, 100),
            y: clamp(point.y as number, 0, 100),
          }];
        })
        : []
    );
    const restoredRoutes = Array.isArray(stored.manualRoutes)
      ? stored.manualRoutes.map(normalizeRoute).filter((route) => route.length >= 2)
      : Array.isArray(stored.manualRoute)
        ? [normalizeRoute(stored.manualRoute)].filter((route) => route.length >= 2)
        : [];
    const manualRoutes = stored.manualRoutes === null || stored.manualRoute === null
      ? null
      : restoredRoutes.length
        ? restoredRoutes
        : null;
    const routeStyle: RouteStyle = stored.routeStyle === "plain"
      || stored.routeStyle === "footprints"
      || stored.routeStyle === "arrows"
      ? stored.routeStyle
      : "arrows";
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
    const placeSignatures = stored.placeSignatures && typeof stored.placeSignatures === "object"
      ? Object.fromEntries(
        Object.entries(stored.placeSignatures).filter((entry): entry is [string, string] => (
          typeof entry[1] === "string"
        )),
      )
      : {};

    return {
      size: {
        width: Math.max(MIN_SIZE.width, stored.size.width),
        height: Math.max(MIN_SIZE.height, stored.size.height),
      },
      positions,
      lines,
      partitionCells,
      partitionVersion: stored.partitionVersion === PARTITION_VERSION
        ? PARTITION_VERSION
        : undefined,
      manualRoutes,
      routeStyle,
      styled: stored.styled === true,
      adventureOpen: stored.adventureOpen === true,
      backOpen: stored.backOpen === true,
      seekerName: typeof stored.seekerName === "string"
        ? stored.seekerName.slice(0, 40)
        : "",
      adventures,
      outdoorMap: restoreOutdoorMap(stored.outdoorMap),
      placeSignatures,
    };
  } catch {
    return null;
  }
}

export default function MapPlanner({
  locationType,
  places,
  prize,
  seekerName,
}: {
  locationType: LocationType;
  places: MapPlace[];
  prize: MapPrize;
  seekerName: string;
}) {
  const isOutdoor = locationType !== "apartment";
  const [size, setSize] = useState<BoardSize>(DEFAULT_SIZE);
  const [positions, setPositions] = useState<Record<string, PointPosition>>({});
  const [lines, setLines] = useState<LineSegment[]>([]);
  const [partitionCells, setPartitionCells] = useState<PartitionCell[]>([]);
  const [partitionSchemaVersion, setPartitionSchemaVersion] = useState(0);
  const [partitionError, setPartitionError] = useState<string | null>(null);
  const [draftLine, setDraftLine] = useState<DraftLine | null>(null);
  const [manualRoutes, setManualRoutes] = useState<PointPosition[][] | null>(null);
  const [draftRoute, setDraftRoute] = useState<PointPosition[] | null>(null);
  const [routeStyle, setRouteStyle] = useState<RouteStyle>("arrows");
  const [mode, setMode] = useState<DrawingMode>("points");
  const [styled, setStyled] = useState(false);
  const [adventureOpen, setAdventureOpen] = useState(false);
  const [backOpen, setBackOpen] = useState(false);
  const [exportPreview, setExportPreview] = useState(false);
  const [sizeMenuOpen, setSizeMenuOpen] = useState(false);
  const [adventures, setAdventures] = useState<Record<string, AdventureEntry>>({});
  const [monsterJobs, setMonsterJobs] = useState<Record<string, MonsterJobState>>({});
  const [outdoorMap, setOutdoorMap] = useState<OutdoorMapState>(createEmptyOutdoorMap);
  const [outdoorMapBusy, setOutdoorMapBusy] = useState(false);
  const [outdoorMapMessage, setOutdoorMapMessage] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [draggingId, setDraggingId] = useState<PointId | null>(null);
  const [draggingLineId, setDraggingLineId] = useState<number | null>(null);
  const [trashHover, setTrashHover] = useState(false);
  const [resizing, setResizing] = useState(false);
  const boardRef = useRef<HTMLDivElement>(null);
  const trashRef = useRef<HTMLDivElement>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const nextLineId = useRef(1);
  const lineDragState = useRef<LineDragState | null>(null);
  const resizeState = useRef<{
    axis: ResizeAxis;
    startX: number;
    startY: number;
    startWidth: number;
    startHeight: number;
    displayScale: number;
  } | null>(null);
  const prizePosition = positions.prize;
  const partitionSeeds = useMemo<PartitionSeed[]>(() => {
    const seeds: PartitionSeed[] = [];
    if (positions.start) seeds.push({ id: "start", point: positions.start });
    places.forEach((place) => {
      const id = String(place.id);
      const point = positions[id];
      if (point) seeds.push({ id, point });
    });
    if (prizePosition) seeds.push({ id: "prize", point: prizePosition });
    return seeds;
  }, [places, positions, prizePosition]);
  const totalPoints = places.length + 2;
  const currentPlaceSignatures = useMemo(() => Object.fromEntries(
    places.map((place) => [String(place.id), placeSignature(place)]),
  ), [places]);
  const monsterImages = useMemo(() => Object.fromEntries(
    places.flatMap((place) => {
      if (!place.monsterJobId) return [];
      const job = monsterJobs[place.monsterJobId];
      return job?.status === "completed" && job.resultUrl
        ? [[String(place.id), job.resultUrl]]
        : [];
    }),
  ), [monsterJobs, places]);
  const prizeImage = prize.imageJobId
    && monsterJobs[prize.imageJobId]?.status === "completed"
    ? monsterJobs[prize.imageJobId]?.resultUrl
    : undefined;
  const canPartition = partitionSeeds.length === totalPoints
    && partitionSeeds.length >= 2;
  const cutSegments = useMemo(
    () => partitionCutSegments(partitionCells),
    [partitionCells],
  );
  const printMetrics = useMemo(() => getPrintMetrics(size), [size]);
  const selectedStandardSize = STANDARD_PRINT_SIZES.find((format) => {
    const standard = boardSizeForPrint(format.widthCm, format.heightCm);
    return Math.abs(standard.width - size.width) <= 1
      && Math.abs(standard.height - size.height) <= 1;
  });

  const placedCount = useMemo(
    () => places.filter((place) => positions[String(place.id)]).length
      + (positions.start ? 1 : 0)
      + (prizePosition ? 1 : 0),
    [places, positions, prizePosition],
  );
  const routePoints = useMemo(() => {
    const anchored = (point: PointPosition | undefined, drop: number) => (
      point ? { x: point.x, y: Math.min(95, point.y + (drop / size.height) * 100) } : undefined
    );
    return [
      anchored(positions.start, 24),
      ...places.map((place) => anchored(positions[String(place.id)], 34)),
      anchored(prizePosition, 52),
    ].filter((point): point is PointPosition => Boolean(point));
  }, [places, positions, prizePosition, size]);
  const routeLayouts = useMemo(() => (
    manualRoutes === null
      ? [composeRoute(routePoints, lines, size, !prizePosition)]
      : manualRoutes.map((route) => composeDrawnRoute(route, lines, size))
  ), [lines, manualRoutes, prizePosition, routePoints, size]);
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
  const lineCountLabel = lines.length === 1
    ? "1 линия"
    : lines.length > 1 && lines.length < 5
      ? `${lines.length} линии`
      : `${lines.length} линий`;
  const partitionCountLabel = partitionCells.length === 1
    ? "1 часть"
    : partitionCells.length > 1 && partitionCells.length < 5
      ? `${partitionCells.length} части`
      : `${partitionCells.length} частей`;
  const outdoorContourCount = outdoorMap.features.length + lines.length;
  const outdoorContourLabel = outdoorContourCount === 1
    ? "1 контур"
    : outdoorContourCount > 1 && outdoorContourCount < 5
      ? `${outdoorContourCount} контура`
      : `${outdoorContourCount} контуров`;
  const toolbarStatusLabel = mode === "split"
    ? partitionCountLabel
    : isOutdoor
      ? outdoorContourLabel
      : lineCountLabel;

  useEffect(() => {
    const jobIds = [
      ...places.map((place) => place.monsterJobId),
      prize.imageJobId,
    ].filter(Boolean);
    if (!jobIds.length) return;

    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      try {
        const response = await fetch(`/api/monster-jobs?ids=${encodeURIComponent(jobIds.join(","))}`, {
          cache: "no-store",
        });
        if (!response.ok) throw new Error("monster status unavailable");
        const payload = await response.json() as { jobs?: Array<MonsterJobState & { id: string }> };
        if (stopped) return;
        const next = Object.fromEntries((payload.jobs ?? []).map((job) => [job.id, job]));
        setMonsterJobs((current) => ({ ...current, ...next }));
        if ((payload.jobs ?? []).some((job) => job.status === "pending")) {
          timer = setTimeout(poll, 10000);
        }
      } catch {
        if (!stopped) timer = setTimeout(poll, 15000);
      }
    };

    void poll();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [places, prize.imageJobId]);

  useEffect(() => {
    let stored: StoredMap | null = null;

    try {
      stored = restoreMap(window.localStorage.getItem(storageKey(locationType)));
    } catch {
      // The planner remains usable when storage is unavailable.
    }

    if (stored) {
      const validPlaceIds = new Set(places.map((place) => String(place.id)));
      const restoredAdventures = Object.fromEntries(
        Object.entries(stored.adventures).filter(([id]) => validPlaceIds.has(id)),
      );
      places.forEach((place, index) => {
        const key = String(place.id);
        const suggested = createDefaultAdventure(place, index, locationType);
        if (
          !restoredAdventures[key]
          || stored.placeSignatures?.[key] !== currentPlaceSignatures[key]
        ) {
          restoredAdventures[key] = suggested;
        }
      });
      const restoredPositions = { ...stored.positions };
      if (!restoredPositions.prize && restoredPositions.treasure) {
        restoredPositions.prize = {
          x: clamp(restoredPositions.treasure.x + 12, 3, 97),
          y: clamp(restoredPositions.treasure.y + 10, 5, finalPositionMaxY(stored.size.height)),
        };
      } else if (restoredPositions.prize) {
        restoredPositions.prize = {
          ...restoredPositions.prize,
          y: Math.min(restoredPositions.prize.y, finalPositionMaxY(stored.size.height)),
        };
      }
      setSize(stored.size);
      setPositions(restoredPositions);
      setLines(stored.lines);
      const validPartitionIds = new Set([
        "start",
        ...places.map((place) => String(place.id)),
        "prize",
      ]);
      const restoredPartitionCells = stored.partitionCells.filter((cell) => validPartitionIds.has(cell.id));
      const restoredPartitionSeeds: PartitionSeed[] = [];
      if (restoredPositions.start) {
        restoredPartitionSeeds.push({ id: "start", point: restoredPositions.start });
      }
      places.forEach((place) => {
        const id = String(place.id);
        const point = restoredPositions[id];
        if (point) restoredPartitionSeeds.push({ id, point });
      });
      if (restoredPositions.prize) {
        restoredPartitionSeeds.push({ id: "prize", point: restoredPositions.prize });
      }
      const shouldMigratePartition = stored.partitionVersion !== PARTITION_VERSION
        && restoredPartitionSeeds.length === validPartitionIds.size;
      const migratedPartitionCells = shouldMigratePartition
        ? createPartitionCells(restoredPartitionSeeds, stored.size)
        : [];
      const nextPartitionCells = restoredPartitionCells.length === validPartitionIds.size
        ? restoredPartitionCells
        : migratedPartitionCells;
      setPartitionCells(
        nextPartitionCells.length === validPartitionIds.size ? nextPartitionCells : [],
      );
      setPartitionSchemaVersion(
        nextPartitionCells.length === validPartitionIds.size ? PARTITION_VERSION : 0,
      );
      setPartitionError(null);
      setManualRoutes(stored.manualRoutes);
      setRouteStyle(stored.routeStyle);
      setStyled(stored.styled);
      setAdventureOpen(stored.adventureOpen);
      setBackOpen(
        (stored.backOpen === true
          || (shouldMigratePartition && stored.adventureOpen === true))
        && nextPartitionCells.length === validPartitionIds.size,
      );
      setAdventures(restoredAdventures);
      setOutdoorMap(stored.outdoorMap ?? createEmptyOutdoorMap());
      nextLineId.current = Math.max(0, ...stored.lines.map((line) => line.id)) + 1;
    } else {
      setPartitionCells([]);
      setPartitionSchemaVersion(0);
      setPartitionError(null);
      setBackOpen(false);
      setOutdoorMap(createEmptyOutdoorMap());
    }
    setReady(true);
  }, [locationType]);

  useEffect(() => {
    if (!ready) return;

    try {
      window.localStorage.setItem(storageKey(locationType), JSON.stringify({
        size,
        positions,
        lines,
        partitionCells,
        partitionVersion: partitionCells.length === totalPoints
          ? partitionSchemaVersion
          : undefined,
        manualRoutes,
        routeStyle,
        styled,
        adventureOpen,
        backOpen,
        seekerName,
        adventures,
        outdoorMap: isOutdoor ? outdoorMap : undefined,
        placeSignatures: currentPlaceSignatures,
      }));
    } catch {
      // Storage can be disabled by browser privacy settings.
    }
  }, [
    adventureOpen,
    adventures,
    backOpen,
    lines,
    locationType,
    manualRoutes,
    isOutdoor,
    outdoorMap,
    partitionCells,
    partitionSchemaVersion,
    positions,
    ready,
    routeStyle,
    seekerName,
    size,
    styled,
    currentPlaceSignatures,
  ]);

  useEffect(() => {
    if (!adventureOpen) return;

    setAdventures((current) => {
      let changed = false;
      const next = { ...current };
      places.forEach((place, index) => {
        const key = String(place.id);
        if (!next[key] || isLegacyRiddle(next[key].riddle)) {
          next[key] = createDefaultAdventure(place, index, locationType);
          changed = true;
        }
      });
      return changed ? next : current;
    });
  }, [adventureOpen, locationType, places]);

  useEffect(() => {
    if (!ready || !backOpen) return;
    requestAnimationFrame(() => {
      document.getElementById("map-back")?.scrollIntoView({ block: "start" });
    });
  }, [backOpen, ready]);

  function invalidatePartition() {
    setPartitionCells([]);
    setPartitionSchemaVersion(0);
    setPartitionError(null);
    setBackOpen(false);
  }

  function resetOutdoorWork() {
    cancelPointerAction();
    setPositions({});
    setLines([]);
    setManualRoutes(null);
    setStyled(false);
    setAdventureOpen(false);
    setBackOpen(false);
    setPartitionCells([]);
    setPartitionSchemaVersion(0);
    setPartitionError(null);
    setMode("points");
    nextLineId.current = 1;
  }

  function updateOutdoorView(
    patch: Pick<OutdoorMapState, "center" | "zoom" | "bounds">,
  ) {
    setOutdoorMap((current) => (
      current.locked ? current : { ...current, ...patch }
    ));
  }

  async function searchOutdoorLocation() {
    const query = outdoorMap.address.trim();
    if (query.length < 3) {
      setOutdoorMapMessage("Введите адрес или название места.");
      return;
    }

    setOutdoorMapBusy(true);
    setOutdoorMapMessage(null);
    try {
      const result = await geocodeOutdoorAddress(query);
      if (!result) {
        setOutdoorMapMessage("Место не найдено. Уточните населенный пункт или улицу.");
        return;
      }
      resetOutdoorWork();
      setOutdoorMap((current) => ({
        ...current,
        address: result.address,
        center: result.center,
        zoom: 18,
        bounds: null,
        locked: false,
        features: [],
      }));
    } catch {
      setOutdoorMapMessage("Не удалось связаться с OpenStreetMap. Попробуйте еще раз.");
    } finally {
      setOutdoorMapBusy(false);
    }
  }

  function locateOutdoorMap() {
    if (!navigator.geolocation) {
      setOutdoorMapMessage("Браузер не поддерживает определение местоположения.");
      return;
    }

    setOutdoorMapBusy(true);
    setOutdoorMapMessage(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resetOutdoorWork();
        setOutdoorMap((current) => ({
          ...current,
          address: "Мое местоположение",
          center: {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          },
          zoom: 18,
          bounds: null,
          locked: false,
          features: [],
        }));
        setOutdoorMapBusy(false);
      },
      () => {
        setOutdoorMapMessage("Доступ к местоположению не получен. Найдите место по адресу.");
        setOutdoorMapBusy(false);
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
    );
  }

  async function lockOutdoorUnderlay() {
    if (!outdoorMap.bounds) {
      setOutdoorMapMessage("Сначала найдите место и дождитесь загрузки карты.");
      return;
    }
    if (outdoorMap.zoom < 16) {
      setOutdoorMapMessage("Приблизьте карту: должны быть видны отдельные здания и дорожки.");
      return;
    }

    setOutdoorMapBusy(true);
    setOutdoorMapMessage("Собираем здания, дорожки и границы выбранного фрагмента.");
    try {
      const features = await fetchOutdoorFeatures(outdoorMap.bounds);
      setOutdoorMap((current) => ({ ...current, locked: true, features }));
      setOutdoorMapMessage(
        features.length
          ? `Подложка закреплена: найдено ${features.length} контуров.`
          : "Подложка закреплена. Контуры можно уточнить вручную.",
      );
    } catch {
      setOutdoorMap((current) => ({ ...current, locked: true, features: [] }));
      setOutdoorMapMessage(
        "Подложка закреплена без автоматических контуров. Уточните нужные границы вручную.",
      );
    } finally {
      setOutdoorMapBusy(false);
    }
  }

  function unlockOutdoorUnderlay() {
    resetOutdoorWork();
    setOutdoorMap((current) => ({
      ...current,
      locked: false,
      features: [],
    }));
    setOutdoorMapMessage("Настройте фрагмент заново. Расставленные точки были сброшены.");
  }

  function buildPartition() {
    cancelPointerAction();
    setMode("split");

    if (!styled) {
      setPartitionCells([]);
      setPartitionSchemaVersion(0);
      setPartitionError("Сначала выровняйте и стилизуйте карту.");
      return;
    }

    if (!canPartition) {
      setPartitionCells([]);
      setPartitionSchemaVersion(0);
      setPartitionError("Сначала расставьте все точки на карте.");
      return;
    }

    for (let first = 0; first < partitionSeeds.length; first += 1) {
      for (let second = first + 1; second < partitionSeeds.length; second += 1) {
        if (
          pixelDistance(partitionSeeds[first].point, partitionSeeds[second].point, size)
          < MIN_PARTITION_SEED_DISTANCE
        ) {
          setPartitionCells([]);
          setPartitionSchemaVersion(0);
          setPartitionError("Две точки стоят слишком близко. Разведите их и повторите разбиение.");
          return;
        }
      }
    }

    const nextCells = createPartitionCells(partitionSeeds, size);
    if (nextCells.length !== partitionSeeds.length) {
      setPartitionCells([]);
      setPartitionSchemaVersion(0);
      setPartitionError("Не удалось построить замкнутые части. Немного раздвиньте точки.");
      return;
    }

    setPartitionCells(nextCells);
    setPartitionSchemaVersion(PARTITION_VERSION);
    setPartitionError(null);
  }

  function updatePointFromPointer(event: ReactPointerEvent) {
    if (mode !== "points" || draggingId === null || !boardRef.current) return;

    setTrashHover(isPointerOverTrash(event));
    const bounds = boardRef.current.getBoundingClientRect();
    const pointKey = String(draggingId);
    const isPrizePoint = pointKey === "prize";
    const nextPosition = {
      x: clamp(((event.clientX - bounds.left) / bounds.width) * 100, 3, 97),
      y: clamp(
        ((event.clientY - bounds.top) / bounds.height) * 100,
        5,
        isPrizePoint ? finalPositionMaxY(size.height) : 95,
      ),
    };
    invalidatePartition();
    setPositions((current) => {
      return { ...current, [pointKey]: nextPosition };
    });
  }

  function startPointDrag(event: ReactPointerEvent<HTMLButtonElement>, id: PointId) {
    if (mode !== "points" || (isOutdoor && !outdoorMap.locked)) return;

    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDraggingId(id);
  }

  function isPointerOverTrash(event: ReactPointerEvent) {
    const bounds = trashRef.current?.getBoundingClientRect();
    return Boolean(
      bounds
      && event.clientX >= bounds.left
      && event.clientX <= bounds.right
      && event.clientY >= bounds.top
      && event.clientY <= bounds.bottom
    );
  }

  function removePointFromMap(id: PointId) {
    const pointKey = String(id);
    invalidatePartition();
    setPositions((current) => {
      const next = { ...current };
      delete next[pointKey];
      return next;
    });
  }

  function movePointWithKeyboard(event: KeyboardEvent<HTMLButtonElement>, id: PointId) {
    if (mode !== "points" || (isOutdoor && !outdoorMap.locked)) return;

    const pointKey = String(id);
    const isPrizePoint = pointKey === "prize";
    const setPointPosition = (position: PointPosition) => {
      invalidatePartition();
      setPositions((current) => ({ ...current, [pointKey]: position }));
    };
    const direction = {
      ArrowLeft: [-2, 0],
      ArrowRight: [2, 0],
      ArrowUp: [0, -2],
      ArrowDown: [0, 2],
    }[event.key];

    if (!direction) {
      const pointPosition = positions[pointKey];
      if (event.key === "Enter" && !pointPosition) {
        event.preventDefault();
        setPointPosition({ x: 50, y: 50 });
      }
      return;
    }

    event.preventDefault();
    const currentPosition = positions[pointKey] ?? { x: 12, y: 16 };
    setPointPosition({
      x: clamp(currentPosition.x + direction[0], 3, 97),
      y: clamp(
        currentPosition.y + direction[1],
        5,
        isPrizePoint ? finalPositionMaxY(size.height) : 95,
      ),
    });
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
      startWidth: size.width,
      startHeight: size.height,
      displayScale: bounds.width / size.width,
    };
    invalidatePartition();
    setSizeMenuOpen(false);
    setResizing(true);
  }

  function updateResize(event: ReactPointerEvent) {
    const activeResize = resizeState.current;
    if (!activeResize) return false;

    const displayScale = Math.max(0.01, activeResize.displayScale);
    const nextWidth = activeResize.axis.includes("x")
      ? clamp(
        activeResize.startWidth + (event.clientX - activeResize.startX) / displayScale,
        MIN_SIZE.width,
        MAX_SIZE.width,
      )
      : activeResize.startWidth;
    const nextHeight = activeResize.axis.includes("y")
      ? clamp(
        activeResize.startHeight + (event.clientY - activeResize.startY) / displayScale,
        MIN_SIZE.height,
        MAX_SIZE.height,
      )
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
    if (
      event.button !== 0
      || !boardRef.current
      || (isOutdoor && !outdoorMap.locked)
    ) return;

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

  function startLineDrag(event: ReactPointerEvent<SVGPathElement>, line: LineSegment) {
    if (event.button !== 0 || !boardRef.current || mode === "route" || mode === "split") return;

    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const bounds = boardRef.current.getBoundingClientRect();
    lineDragState.current = {
      id: line.id,
      start: pointerPosition(event, bounds),
      line: { ...line },
    };
    setDraggingLineId(line.id);
  }

  function updateLineDrag(event: ReactPointerEvent) {
    const drag = lineDragState.current;
    if (!drag || !boardRef.current) return false;

    setTrashHover(isPointerOverTrash(event));
    const bounds = boardRef.current.getBoundingClientRect();
    const pointer = pointerPosition(event, bounds);
    const minX = Math.min(drag.line.x1, drag.line.x2);
    const maxX = Math.max(drag.line.x1, drag.line.x2);
    const minY = Math.min(drag.line.y1, drag.line.y2);
    const maxY = Math.max(drag.line.y1, drag.line.y2);
    const dx = clamp(pointer.x - drag.start.x, -minX, 100 - maxX);
    const dy = clamp(pointer.y - drag.start.y, -minY, 100 - maxY);

    setLines((current) => current.map((line) => line.id === drag.id ? {
      ...line,
      x1: drag.line.x1 + dx,
      y1: drag.line.y1 + dy,
      x2: drag.line.x2 + dx,
      y2: drag.line.y2 + dy,
    } : line));
    return true;
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
    if (updateLineDrag(event)) return;
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
    if (lineDragState.current) {
      if (isPointerOverTrash(event)) {
        const draggedLineId = lineDragState.current.id;
        setLines((current) => current.filter((line) => line.id !== draggedLineId));
      }
      lineDragState.current = null;
      setDraggingLineId(null);
      setTrashHover(false);
      return;
    }
    if (draggingId !== null && isPointerOverTrash(event)) {
      removePointFromMap(draggingId);
      setDraggingId(null);
      setTrashHover(false);
      return;
    }
    if (draftRoute && boardRef.current) {
      const bounds = boardRef.current.getBoundingClientRect();
      const end = pointerPosition(event, bounds);
      const completeRoute = [...draftRoute, end];
      const routeLength = completeRoute.slice(1).reduce((sum, point, index) => (
        sum + pixelDistance(completeRoute[index], point, size)
      ), 0);
      if (routeLength >= 40) {
        const nextRoute = simplifyDrawnRoute(completeRoute, size);
        setManualRoutes((current) => current ? [...current, nextRoute] : [nextRoute]);
      }
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
    setTrashHover(false);
    setDraftLine(null);
    setDraftRoute(null);
  }

  function cancelPointerAction() {
    resizeState.current = null;
    lineDragState.current = null;
    setResizing(false);
    setDraggingId(null);
    setDraggingLineId(null);
    setTrashHover(false);
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
    invalidatePartition();
    setSizeMenuOpen(false);
    setSize((current) => ({
      width: clamp(current.width + widthDelta, MIN_SIZE.width, MAX_SIZE.width),
      height: clamp(current.height + heightDelta, MIN_SIZE.height, MAX_SIZE.height),
    }));
  }

  function selectStandardSize(widthCm: number, heightCm: number) {
    cancelPointerAction();
    invalidatePartition();
    setSize(boardSizeForPrint(widthCm, heightCm));
    setSizeMenuOpen(false);
  }

  function beautifyMap() {
    if (
      !boardRef.current
      || (isOutdoor ? !outdoorMap.locked : !lines.length)
    ) return;

    cancelPointerAction();
    setMode("style");
    if (lines.length) {
      const bounds = boardRef.current.getBoundingClientRect();
      setLines((current) => beautifyLines(current, bounds));
    }
    setStyled(true);
  }

  function openRiddleDesigner() {
    setAdventures((current) => {
      const next = { ...current };
      places.forEach((place, index) => {
        const key = String(place.id);
        if (!next[key] || isLegacyRiddle(next[key].riddle)) {
          next[key] = createDefaultAdventure(place, index, locationType);
        }
      });
      return next;
    });
    setAdventureOpen(true);
    setBackOpen(false);
    requestAnimationFrame(() => {
      document.getElementById("riddles")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function openMapBack() {
    if (!canPartition) return;

    const nextPartitionCells = partitionCells.length === totalPoints
      ? partitionCells
      : createPartitionCells(partitionSeeds, size);
    if (nextPartitionCells.length !== totalPoints) {
      setPartitionError("Не удалось восстановить части карты. Немного раздвиньте точки и повторите.");
      return;
    }

    setAdventures((current) => {
      const next = { ...current };
      places.forEach((place, index) => {
        const key = String(place.id);
        if (!next[key]) next[key] = createDefaultAdventure(place, index, locationType);
      });
      return next;
    });
    setPartitionCells(nextPartitionCells);
    setPartitionSchemaVersion(PARTITION_VERSION);
    setPartitionError(null);
    setBackOpen(true);
    requestAnimationFrame(() => {
      document.getElementById("map-back")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function closeMapBack() {
    setBackOpen(false);
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
            {isOutdoor
              ? `Расставим объекты по реальному плану ${boundaryLabel[locationType]}`
              : `Расставим точки на карте и начертим границы ${boundaryLabel[locationType]}`}
          </h2>
        </div>
        <div className="map-status" aria-live="polite">
          <strong>{placedCount} из {totalPoints}</strong>
          <span>{isOutdoor ? "меток расставлено" : "точек расставлено"}</span>
        </div>
      </header>

      <div className="map-workspace" ref={workspaceRef}>
        {isOutdoor ? (
          <div className={`outdoor-map-setup${styled ? " styled" : ""}`}>
            <div className="outdoor-map-search">
              <label htmlFor={`outdoor-map-address-${locationType}`}>
                <span>Место на OpenStreetMap</span>
                <input
                  id={`outdoor-map-address-${locationType}`}
                  type="search"
                  value={outdoorMap.address}
                  placeholder="Адрес, поселок или название места"
                  disabled={outdoorMap.locked || outdoorMapBusy || styled}
                  onChange={(event) => setOutdoorMap((current) => ({
                    ...current,
                    address: event.target.value,
                  }))}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void searchOutdoorLocation();
                    }
                  }}
                />
              </label>
              <button
                type="button"
                disabled={outdoorMap.locked || outdoorMapBusy || styled}
                onClick={() => void searchOutdoorLocation()}
              >
                Найти
              </button>
              <button
                className="outdoor-location-button"
                type="button"
                disabled={outdoorMap.locked || outdoorMapBusy || styled}
                onClick={locateOutdoorMap}
              >
                Мое место
              </button>
            </div>
            <div className="outdoor-map-actions">
              {!outdoorMap.locked && !styled ? (
                <button
                  className="outdoor-lock-button"
                  type="button"
                  disabled={outdoorMapBusy}
                  onClick={() => void lockOutdoorUnderlay()}
                >
                  {outdoorMapBusy ? "Подготавливаем…" : "Зафиксировать подложку"}
                </button>
              ) : (
                <button
                  className="outdoor-unlock-button"
                  type="button"
                  disabled={outdoorMapBusy}
                  onClick={unlockOutdoorUnderlay}
                >
                  Изменить место
                </button>
              )}
              <span className="outdoor-zoom">Масштаб {outdoorMap.zoom}</span>
            </div>
            {outdoorMapMessage ? (
              <p className="outdoor-map-message" aria-live="polite">{outdoorMapMessage}</p>
            ) : null}
          </div>
        ) : null}
        <div className="map-toolbar" role="toolbar" aria-label="Инструменты карты">
          <div className="map-mode-switch" role="group" aria-label="Шаги подготовки карты">
            <button
              className={mode === "points" ? "active" : ""}
              type="button"
              aria-pressed={mode === "points"}
              disabled={isOutdoor && !outdoorMap.locked}
              onClick={() => {
                cancelPointerAction();
                setMode("points");
              }}
            >
              <span aria-hidden="true">1</span>
              {isOutdoor ? "Расставить объекты" : "Расставить точки"}
            </button>
            <button
              className={mode === "lines" ? "active" : ""}
              type="button"
              aria-pressed={mode === "lines"}
              disabled={isOutdoor && !outdoorMap.locked}
              onClick={() => {
                cancelPointerAction();
                setMode("lines");
              }}
            >
              <span aria-hidden="true">2</span>
              {isOutdoor ? "Уточнить границы" : "Нарисовать стены"}
            </button>
            <button
              className={mode === "route" ? "active" : ""}
              type="button"
              aria-pressed={mode === "route"}
              disabled={isOutdoor && !outdoorMap.locked}
              onClick={() => {
                cancelPointerAction();
                setMode("route");
              }}
            >
              <span aria-hidden="true">3</span>
              Начертить маршрут
            </button>
            <button
              className={mode === "style" ? "active" : ""}
              type="button"
              aria-pressed={mode === "style"}
              aria-label={styled
                ? "Выровнять и стилизовать повторно"
                : "Выровнять и стилизовать"}
              title={styled
                ? "Нажмите, чтобы повторно подравнять карту"
                : "Подравнять линии и оформить карту"}
              disabled={isOutdoor ? !outdoorMap.locked : lines.length === 0}
              onClick={beautifyMap}
            >
              <span aria-hidden="true">4</span>
              {isOutdoor ? "Стилизовать карту" : "Выровнять и стилизовать"}
            </button>
            <button
              className={mode === "split" ? "active" : ""}
              type="button"
              aria-pressed={mode === "split"}
              aria-label="Разбить на части"
              title="Разбить на части"
              disabled={!canPartition || !styled}
              onClick={buildPartition}
            >
              <span aria-hidden="true">5</span>
              Разбить на части
            </button>
          </div>
          {mode === "route" ? (
            <div className="route-style-switch" role="group" aria-label="Оформление маршрута">
              {routeStyleOptions.map((option) => (
                <button
                  className={routeStyle === option.id ? "active" : ""}
                  type="button"
                  aria-pressed={routeStyle === option.id}
                  onClick={() => setRouteStyle(option.id)}
                  key={option.id}
                >
                  {option.label}
                </button>
              ))}
            </div>
          ) : null}
          <div className="standard-size-picker">
            <button
              className={`standard-size-trigger${sizeMenuOpen ? " active" : ""}`}
              type="button"
              aria-label="Выбрать стандартный размер"
              aria-expanded={sizeMenuOpen}
              aria-haspopup="menu"
              onClick={() => setSizeMenuOpen((current) => !current)}
            >
              <span aria-hidden="true">▱</span>
              Выбрать стандартный размер
              {selectedStandardSize ? <small>{selectedStandardSize.label}</small> : null}
            </button>
            {sizeMenuOpen ? (
              <div className="standard-size-menu" role="menu" aria-label="Стандартные размеры листа">
                {STANDARD_PRINT_SIZES.map((format) => {
                  const selected = selectedStandardSize?.id === format.id;
                  return (
                    <button
                      className={selected ? "selected" : ""}
                      type="button"
                      role="menuitemradio"
                      aria-checked={selected}
                      onClick={() => selectStandardSize(format.widthCm, format.heightCm)}
                      key={format.id}
                    >
                      <strong>{format.label}</strong>
                      <span>{format.widthCm.toLocaleString("ru-RU")} × {format.heightCm.toLocaleString("ru-RU")} см</span>
                        {selected ? <span className="standard-size-check" aria-hidden="true">✓</span> : null}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
          <span className="line-count" aria-live="polite">{toolbarStatusLabel}</span>
          <button
            className="undo-line"
            type="button"
            aria-label={mode === "route"
              ? "Отменить последний участок маршрута"
              : mode === "split"
                ? "Удалить разбиение"
                : "Отменить последнюю линию"}
            title={mode === "route"
              ? "Отменить последний участок маршрута"
              : mode === "split"
                ? "Удалить разбиение"
                : "Отменить последнюю линию"}
            disabled={mode === "route"
              ? manualRoutes === null
              : mode === "split"
                ? partitionCells.length === 0
                : lines.length === 0}
            onClick={() => {
              if (mode === "route") {
                setManualRoutes((current) => (
                  current && current.length > 1 ? current.slice(0, -1) : null
                ));
                return;
              }
              if (mode === "split") {
                setPartitionCells([]);
                setPartitionSchemaVersion(0);
                setPartitionError(null);
                return;
              }
              setLines((current) => current.slice(0, -1));
            }}
          >
            <span aria-hidden="true">↶</span>
          </button>
        </div>

        <div
          className={`map-board mode-${mode}${isOutdoor ? " outdoor" : ""}${resizing ? " resizing" : ""}${draggingLineId !== null ? " dragging-line" : ""}${draggingId !== null || draggingLineId !== null ? " dragging-element" : ""}${adventureOpen ? " adventure-open" : ""}`}
          id="map-front-export"
          ref={boardRef}
          style={{
            width: `min(${size.width}px, 100%)`,
            height: "auto",
            aspectRatio: `${size.width} / ${size.height}`,
          }}
          onPointerDown={startMapDrawing}
          onPointerMove={handlePointerMove}
          onPointerUp={finishPointerAction}
          onPointerCancel={cancelPointerAction}
        >
          <div className="map-board-texture" aria-hidden="true" />
          {isOutdoor && !styled ? (
            <OutdoorMapLayer state={outdoorMap} onViewChange={updateOutdoorView} />
          ) : null}
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
            {isOutdoor && styled && outdoorMap.features.length ? (
              <g className="outdoor-context">
                {outdoorMap.features.map((feature) => {
                  const path = outdoorFeaturePath(feature, size);
                  return path ? (
                    <path
                      className={`outdoor-feature outdoor-${feature.kind}`}
                      d={path}
                      key={feature.id}
                    />
                  ) : null;
                })}
              </g>
            ) : null}
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
              <g className="map-wall-handles">
                {wallPieces.map((piece) => {
                  const line = lines.find((candidate) => candidate.id === piece.id);
                  return piece.d && line ? (
                    <path
                      className={draggingLineId === piece.id ? "map-wall-hit dragging" : "map-wall-hit"}
                      d={piece.d}
                      key={piece.id}
                      onPointerDown={(event) => startLineDrag(event, line)}
                    />
                  ) : null;
                })}
              </g>
            </g>
            {(adventureOpen || mode === "route" || mode === "split")
              && !(draftRoute && manualRoutes === null) ? (
                <g className="map-routes">
                  {routeLayouts.map((routeLayout, routeIndex) => (
                    routeLayout.path ? (
                      <g className="map-route" key={routeIndex}>
                        {routeStyle !== "footprints" ? (
                          <path className="map-route-ink" d={routeLayout.path} />
                        ) : null}
                        {routeStyle === "arrows"
                          ? routeLayout.arrows.map((arrow, index) => (
                            <path
                              className="route-arrow"
                              d="M -9.5 -5.5 L 3.5 0 L -9.5 5.5 C -6.5 3 -6.5 -3 -9.5 -5.5 Z"
                              transform={`translate(${arrow.x.toFixed(1)} ${arrow.y.toFixed(1)}) rotate(${arrow.angle.toFixed(1)})`}
                              key={index}
                            />
                          ))
                          : null}
                        {routeStyle === "footprints"
                          ? routeLayout.footprints.map((footprint, index) => (
                            <g
                              className="route-footprint"
                              transform={`translate(${footprint.x.toFixed(1)} ${footprint.y.toFixed(1)}) rotate(${footprint.angle.toFixed(1)}) scale(1 ${footprint.side})`}
                              key={index}
                            >
                              <path
                                className="footprint-heel"
                                d="M -8 -2.5 C -6.5 -3.3 -3.8 -3.2 -2.4 -2.3 L -2.4 2.3 C -4 3.2 -6.7 3.3 -8 2.3 C -8.8 1.1 -8.8 -1.2 -8 -2.5 Z"
                              />
                              <path
                                className="footprint-sole"
                                d="M -0.5 -2.4 C 1.9 -4 6 -3.7 8 -1.7 C 9.3 -0.4 9.1 1.7 7.5 2.8 C 5.2 4.2 1.4 3.7 -0.6 2.1 C -1.5 1.1 -1.5 -1.3 -0.5 -2.4 Z"
                              />
                              <path className="footprint-tread" d="M 1.4 -2.8 L 0.8 2.7 M 4.2 -3.1 L 3.8 3.2 M 6.7 -2.5 L 6.4 2.6" />
                            </g>
                          ))
                          : null}
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
                    ) : null
                  ))}
                </g>
              ) : null}
            {(mode === "split" || exportPreview) && partitionCells.length ? (
              <g className="map-cut-layer">
                <g className="map-cut-cells">
                  {partitionCells.map((cell, index) => {
                    const path = partitionCellPath(cell, size);
                    return path ? (
                      <path
                        className={index % 2 === 0 ? "even" : "odd"}
                        d={path}
                        key={cell.id}
                      />
                    ) : null;
                  })}
                </g>
                <g className="map-cut-segments">
                  {cutSegments.map((segment) => {
                    const start = toPixels(segment.start, size);
                    const end = toPixels(segment.end, size);
                    return (
                      <g key={segment.id}>
                        <line
                          className="map-cut-line-under"
                          x1={start.x}
                          y1={start.y}
                          x2={end.x}
                          y2={end.y}
                        />
                        <line
                          className="map-cut-line"
                          x1={start.x}
                          y1={start.y}
                          x2={end.x}
                          y2={end.y}
                        />
                      </g>
                    );
                  })}
                </g>
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
          {mode === "split" && partitionError ? (
            <p className="partition-error" role="alert">{partitionError}</p>
          ) : null}
          <div className="map-size" aria-hidden="true">
            <span>{Math.round(size.width)} × {Math.round(size.height)}</span>
            <strong>
              {printMetrics.widthCm.toLocaleString("ru-RU", { maximumFractionDigits: 1 })}
              {" × "}
              {printMetrics.heightCm.toLocaleString("ru-RU", { maximumFractionDigits: 1 })} см
            </strong>
          </div>
          <div
            className={`map-trash${trashHover ? " hover" : ""}`}
            ref={trashRef}
            aria-hidden="true"
          >
            <span>🗑</span>
            <strong>{trashHover ? "Отпустите" : "Удалить"}</strong>
          </div>
          {isOutdoor && styled ? (
            <a
              className="map-data-credit"
              href="https://www.openstreetmap.org/copyright"
              target="_blank"
              rel="noreferrer"
            >
              © OpenStreetMap contributors
            </a>
          ) : null}

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
            const adventure = adventures[String(place.id)]
              ?? createDefaultAdventure(place, index, locationType);
            const configuredMarker = adventure
              ? markerCatalog.find((option) => option.id === adventure.marker)
              : null;
            const generatedMonster = monsterImages[String(place.id)];
            const marker = place.monsterJobId ? null : configuredMarker;
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
                className={`map-point${marker ? ` marker-${marker.id} customized` : ""}${generatedMonster ? " generated-monster" : ""}${position ? " placed" : " piled"}${draggingId === place.id ? " dragging" : ""}`}
                type="button"
                style={pointStyle}
                aria-label={name}
                title={name}
                tabIndex={mode === "points" ? 0 : -1}
                onPointerDown={(event) => startPointDrag(event, place.id)}
                onKeyDown={(event) => movePointWithKeyboard(event, place.id)}
                key={place.id}
              >
                {generatedMonster || marker
                  ? (
                    <img className="map-monster-image" src={generatedMonster || marker?.image} alt="" draggable={false} />
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
            className={`map-point map-prize-point${prizeImage ? " generated-prize" : ""}${prizePosition ? " placed" : " piled"}${draggingId === "prize" ? " dragging" : ""}`}
            type="button"
            style={prizePosition
              ? { left: `${prizePosition.x}%`, top: `${prizePosition.y}%` }
              : {
                "--pile-offset": `${86 + places.length * 7}px`,
                "--pile-angle": "8deg",
                "--pile-z": 17 - places.length,
              } as CSSProperties}
            aria-label={`Приз: ${prize.name}`}
            title={`Приз: ${prize.name}`}
            tabIndex={mode === "points" ? 0 : -1}
            onPointerDown={(event) => startPointDrag(event, "prize")}
            onKeyDown={(event) => movePointWithKeyboard(event, "prize")}
          >
            {prizeImage
              ? <img className="map-prize-image" src={prizeImage} alt="" draggable={false} />
              : <span className="map-prize-placeholder" aria-hidden="true">?</span>}
            <span className="map-prize-label">Приз</span>
          </button>

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
          monsterImages={monsterImages}
          onChange={setAdventures}
          onDistribute={openMapBack}
          canDistribute={canPartition}
        />
      ) : null}
      {adventureOpen && backOpen ? (
        <MapBackDesigner
          size={size}
          fragments={partitionCells}
          adventures={adventures}
          seekerName={seekerName}
          prizeName={prize.name}
          onBack={closeMapBack}
          onExportStateChange={setExportPreview}
        />
      ) : null}
    </>
  );
}
