"use client";

import { CSSProperties, useState } from "react";
import { downloadMapArchive, getPrintMetrics } from "./mapExport";
import type { AdventureEntry } from "./RiddleDesigner";

type PointPosition = {
  x: number;
  y: number;
};

type BoardSize = {
  width: number;
  height: number;
};

type MapFragment = {
  id: string;
  points: PointPosition[];
};

type PixelPoint = {
  x: number;
  y: number;
};

type TextRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

function displayName(seekerName: string) {
  return seekerName.trim() || "Юный искатель";
}

function introFragmentMessage(seekerName: string, firstRiddle: string) {
  return `${displayName(seekerName)}, твой дальний родственник — старый пират — оставил эту карту своему прапрапра-племяннику. Теперь она твоя. Пройди его путь, перехитри чудовищ и найди семейный клад.

Первый след:
${firstRiddle}`;
}

function finalFragmentMessage(seekerName: string) {
  return `${displayName(seekerName)}, молодец!
Ты прошёл все испытания, разгадал все загадки и добыл свой клад.
Пусть эта победа станет первой из многих великих приключений!`;
}

function toPixels(point: PointPosition, size: BoardSize): PixelPoint {
  return {
    x: ((100 - point.x) / 100) * size.width,
    y: (point.y / 100) * size.height,
  };
}

function polygonPath(points: PixelPoint[]) {
  if (points.length < 3) return "";
  return `${points.map((point, index) => (
    `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`
  )).join(" ")} Z`;
}

function pointInPolygon(point: PixelPoint, polygon: PixelPoint[]) {
  let inside = false;

  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const currentPoint = polygon[index];
    const previousPoint = polygon[previous];
    const crosses = (currentPoint.y > point.y) !== (previousPoint.y > point.y)
      && point.x < (
        ((previousPoint.x - currentPoint.x) * (point.y - currentPoint.y))
        / (previousPoint.y - currentPoint.y)
      ) + currentPoint.x;
    if (crosses) inside = !inside;
  }

  return inside;
}

function polygonCentroid(polygon: PixelPoint[]) {
  let area = 0;
  let x = 0;
  let y = 0;

  polygon.forEach((point, index) => {
    const next = polygon[(index + 1) % polygon.length];
    const cross = point.x * next.y - next.x * point.y;
    area += cross;
    x += (point.x + next.x) * cross;
    y += (point.y + next.y) * cross;
  });

  if (Math.abs(area) < 0.001) {
    return polygon.reduce(
      (sum, point) => ({ x: sum.x + point.x / polygon.length, y: sum.y + point.y / polygon.length }),
      { x: 0, y: 0 },
    );
  }

  return {
    x: x / (3 * area),
    y: y / (3 * area),
  };
}

function rectangleFits(center: PixelPoint, width: number, height: number, polygon: PixelPoint[]) {
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  return [
    { x: center.x - halfWidth, y: center.y - halfHeight },
    { x: center.x + halfWidth, y: center.y - halfHeight },
    { x: center.x + halfWidth, y: center.y + halfHeight },
    { x: center.x - halfWidth, y: center.y + halfHeight },
  ].every((corner) => pointInPolygon(corner, polygon));
}

function largestTextRect(polygon: PixelPoint[]): TextRect {
  const bounds = polygon.reduce(
    (current, point) => ({
      minX: Math.min(current.minX, point.x),
      maxX: Math.max(current.maxX, point.x),
      minY: Math.min(current.minY, point.y),
      maxY: Math.max(current.maxY, point.y),
    }),
    { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity },
  );
  const centroid = polygonCentroid(polygon);
  const candidates: PixelPoint[] = [centroid];

  for (let xStep = 2; xStep <= 8; xStep += 2) {
    for (let yStep = 2; yStep <= 8; yStep += 2) {
      const candidate = {
        x: bounds.minX + ((bounds.maxX - bounds.minX) * xStep) / 10,
        y: bounds.minY + ((bounds.maxY - bounds.minY) * yStep) / 10,
      };
      if (pointInPolygon(candidate, polygon)) candidates.push(candidate);
    }
  }

  let best = {
    x: centroid.x,
    y: centroid.y,
    width: 0,
    height: 0,
  };

  candidates.forEach((center) => {
    [1.35, 1.6, 1.9].forEach((aspect) => {
      let low = 0;
      let high = Math.min(
        (bounds.maxX - bounds.minX) * 0.92,
        (bounds.maxY - bounds.minY) * aspect * 0.92,
      );

      for (let iteration = 0; iteration < 18; iteration += 1) {
        const width = (low + high) / 2;
        const height = width / aspect;
        if (rectangleFits(center, width, height, polygon)) low = width;
        else high = width;
      }

      const width = low;
      const height = width / aspect;
      if (width * height > best.width * best.height) {
        best = { x: center.x, y: center.y, width, height };
      }
    });
  });

  const horizontalPadding = Math.min(16, best.width * 0.06);
  const verticalPadding = Math.min(14, best.height * 0.07);
  return {
    x: best.x - best.width / 2 + horizontalPadding,
    y: best.y - best.height / 2 + verticalPadding,
    width: Math.max(24, best.width - horizontalPadding * 2),
    height: Math.max(24, best.height - verticalPadding * 2),
  };
}

function fittedFontSize(text: string, rect: TextRect, minimumSize = 10) {
  for (let size = 19; size >= minimumSize; size -= 0.5) {
    const charactersPerLine = Math.max(8, Math.floor(rect.width / (size * 0.52)));
    const lineCount = text.split("\n").reduce(
      (count, line) => count + Math.max(1, Math.ceil(line.length / charactersPerLine)),
      0,
    );
    if (lineCount * size * 1.34 <= rect.height - 30) return size;
  }
  return minimumSize;
}

export default function MapBackDesigner({
  size,
  fragments,
  adventures,
  seekerName,
  onBack,
  onExportStateChange,
}: {
  size: BoardSize;
  fragments: MapFragment[];
  adventures: Record<string, AdventureEntry>;
  seekerName: string;
  onBack: () => void;
  onExportStateChange: (exporting: boolean) => void;
}) {
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportComplete, setExportComplete] = useState(false);
  const preparedFragments = fragments.flatMap((fragment, index) => {
    const nextFragment = fragments[index + 1];
    const nextAdventure = nextFragment ? adventures[nextFragment.id] : null;
    if (fragment.points.length < 3 || (nextFragment && !nextAdventure)) return [];

    const isIntro = fragment.id === "start" && Boolean(nextAdventure);
    const isFinal = !nextFragment;
    const text = isIntro && nextAdventure
      ? introFragmentMessage(seekerName, nextAdventure.riddle)
      : isFinal
        ? finalFragmentMessage(seekerName)
        : nextAdventure?.riddle ?? "";
    const polygon = fragment.points.map((point) => toPixels(point, size));
    const textRect = largestTextRect(polygon);
    return [{
      ...fragment,
      text,
      isIntro,
      isFinal,
      polygon,
      path: polygonPath(polygon),
      textRect,
      fontSize: fittedFontSize(text, textRect, isIntro ? 8.5 : 10),
    }];
  });
  const boardStyle = {
    "--back-map-width": `${size.width}px`,
    "--back-map-ratio": `${size.width} / ${size.height}`,
  } as CSSProperties;
  const fragmentCountLabel = preparedFragments.length === 1
    ? "1 осколок"
    : preparedFragments.length > 1 && preparedFragments.length < 5
      ? `${preparedFragments.length} осколка`
      : `${preparedFragments.length} осколков`;
  const print = getPrintMetrics(size);
  const printSizeLabel = `${print.widthCm.toLocaleString("ru-RU", { maximumFractionDigits: 1 })}`
    + ` × ${print.heightCm.toLocaleString("ru-RU", { maximumFractionDigits: 1 })} см`;

  async function exportLayout() {
    const frontNode = document.getElementById("map-front-export");
    const backNode = document.getElementById("map-back-export");
    if (!frontNode || !backNode || exporting) return;

    setExporting(true);
    setExportError(null);
    setExportComplete(false);
    onExportStateChange(true);

    try {
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      });
      await downloadMapArchive({
        frontNode,
        backNode,
        size,
        fragments,
      });
      setExportComplete(true);
    } catch {
      setExportError("Не удалось собрать макет. Проверьте изображения и повторите попытку.");
    } finally {
      onExportStateChange(false);
      setExporting(false);
    }
  }

  return (
    <section className="map-back-section" id="map-back" aria-labelledby="map-back-title">
      <header className="map-back-heading">
        <p className="step-number">05</p>
        <div>
          <p className="eyebrow">Оборот карты</p>
          <h2 id="map-back-title">Распределим загадки по осколкам</h2>
        </div>
        <button className="back-to-riddles" type="button" onClick={onBack}>
          <span aria-hidden="true">←</span>
          К загадкам
        </button>
      </header>

      <div className="map-back-workspace" style={boardStyle}>
        <div className="map-back-note">
          <span aria-hidden="true">↻</span>
          Карта перевернута. Линии совпадут при двусторонней печати.
        </div>
        <div className="map-back-board" id="map-back-export">
          <div className="map-back-texture" aria-hidden="true" />
          <svg
            className="map-back-layout"
            viewBox={`0 0 ${size.width} ${size.height}`}
            role="img"
            aria-label={`Оборот карты: ${fragmentCountLabel} с загадками`}
          >
            <g className="map-back-fragments">
              {preparedFragments.map((fragment, index) => (
                <path
                  className={index % 2 === 0 ? "even" : "odd"}
                  d={fragment.path}
                  key={`fragment-${fragment.id}`}
                />
              ))}
            </g>
            <g className="map-back-riddles">
              {preparedFragments.map((fragment) => (
                <foreignObject
                  x={fragment.textRect.x}
                  y={fragment.textRect.y}
                  width={fragment.textRect.width}
                  height={fragment.textRect.height}
                  key={`riddle-${fragment.id}`}
                >
                  <div
                    className={`fragment-riddle${fragment.isIntro ? " is-intro" : ""}${fragment.isFinal ? " is-finale" : ""}`}
                    style={{ fontSize: `${fragment.fontSize}px` }}
                    xmlns="http://www.w3.org/1999/xhtml"
                  >
                    <span className="fragment-riddle-mark" aria-hidden="true">✦</span>
                    <p>{fragment.text}</p>
                  </div>
                </foreignObject>
              ))}
            </g>
          </svg>
        </div>
        <div className="map-export-actions">
          <button
            className="download-layout"
            type="button"
            disabled={exporting || preparedFragments.length !== fragments.length}
            onClick={exportLayout}
          >
            <span aria-hidden="true">↓</span>
            {exporting ? "Готовим макет..." : "Скачать макет"}
          </button>
          <p>
            Печать: {printSizeLabel} · {print.dpi} dpi · {print.widthPx} × {print.heightPx} px
          </p>
          <p>
            {exportComplete
              ? "Макет готов: в архиве 4 файла."
              : "ZIP: PNG и SVG, лицевая и обратная стороны."}
          </p>
          {exportError ? <p className="export-error" role="alert">{exportError}</p> : null}
        </div>
      </div>
    </section>
  );
}
