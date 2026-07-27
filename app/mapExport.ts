"use client";

import { toPng } from "html-to-image";
import JSZip from "jszip";

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

type ExportOptions = {
  frontNode: HTMLElement;
  backNode: HTMLElement;
  size: BoardSize;
  fragments: MapFragment[];
};

type CutSegment = {
  start: PointPosition;
  end: PointPosition;
};

export const PRINT_DPI = 300;
const BASE_MAP_WIDTH_UNITS = 920;
const BASE_MAP_WIDTH_CM = 30;
const CM_PER_MAP_UNIT = BASE_MAP_WIDTH_CM / BASE_MAP_WIDTH_UNITS;
const PAPER_COLOR = "#e9d8b5";
const PAPER_TEXTURE_URL = "/parchment-map-texture.png";
const CUT_LINE_COLOR = "#77756f";
const FRONT_DRAWING_STYLES = `
  .map-walls-ink path {
    fill: none;
    stroke: #382918;
    stroke-opacity: 0.88;
    stroke-width: 2.6;
    stroke-linecap: round;
  }
  .map-lines.styled .map-walls-ink path {
    stroke: #3c2c1a;
    stroke-opacity: 0.94;
    stroke-width: 2.4;
  }
  .map-walls-wash path {
    fill: none;
    stroke: #966e42;
    stroke-opacity: 0.13;
    stroke-width: 7.5;
    stroke-linecap: round;
  }
  .map-route-ink {
    fill: none;
    stroke: #3a2a18;
    stroke-opacity: 0.82;
    stroke-width: 2.6;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-dasharray: 10 8;
  }
  .route-arrow {
    fill: #b23a24;
    fill-opacity: 0.92;
    stroke: #542d18;
    stroke-opacity: 0.8;
    stroke-width: 1;
    stroke-linejoin: round;
  }
  .route-footprint {
    fill: #3d3022;
    fill-opacity: 0.8;
  }
  .footprint-tread {
    fill: none;
    stroke: #f6efe0;
    stroke-opacity: 0.38;
    stroke-width: 0.65;
    stroke-linecap: round;
  }
  .footprint-heel {
    opacity: 0.92;
  }
  .route-cross-under {
    stroke: #542c18;
    stroke-opacity: 0.5;
    stroke-width: 8.5;
    stroke-linecap: round;
  }
  .route-cross-ink {
    stroke: #b23a24;
    stroke-opacity: 0.92;
    stroke-width: 5.6;
    stroke-linecap: round;
  }
`;
let paperTexturePromise: Promise<string> | null = null;

export function getPrintMetrics(size: BoardSize) {
  const widthCm = size.width * CM_PER_MAP_UNIT;
  const heightCm = size.height * CM_PER_MAP_UNIT;
  return {
    dpi: PRINT_DPI,
    widthCm,
    heightCm,
    widthMm: widthCm * 10,
    heightMm: heightCm * 10,
    widthPx: Math.round((widthCm / 2.54) * PRINT_DPI),
    heightPx: Math.round((heightCm / 2.54) * PRINT_DPI),
  };
}

export function boardSizeForPrint(widthCm: number, heightCm: number): BoardSize {
  return {
    width: Math.round(widthCm / CM_PER_MAP_UNIT),
    height: Math.round(heightCm / CM_PER_MAP_UNIT),
  };
}

const hiddenFromEveryExport = [
  ".resize-edge",
  ".resize-corner",
  ".map-size",
  ".partition-error",
];

function exportFilter(node: HTMLElement) {
  if (!(node instanceof Element)) return true;
  return !hiddenFromEveryExport.some((selector) => node.matches(selector));
}

function artworkFilter(node: HTMLElement) {
  if (!exportFilter(node)) return false;
  if (!(node instanceof Element)) return true;
  return !node.matches(
    ".map-cut-layer, .map-back-fragments, .map-board-texture, .map-back-texture",
  );
}

function normalizedEdgeKey(start: PointPosition, end: PointPosition) {
  const pointKey = (point: PointPosition) => `${point.x.toFixed(4)}:${point.y.toFixed(4)}`;
  const first = pointKey(start);
  const second = pointKey(end);
  return first < second ? `${first}|${second}` : `${second}|${first}`;
}

function uniqueCutSegments(fragments: MapFragment[]) {
  const segments = new Map<string, CutSegment>();

  fragments.forEach((fragment) => {
    fragment.points.forEach((start, index) => {
      const end = fragment.points[(index + 1) % fragment.points.length];
      const key = normalizedEdgeKey(start, end);
      if (!segments.has(key)) segments.set(key, { start, end });
    });
  });

  return [...segments.values()];
}

function coordinate(value: number) {
  return Number(value.toFixed(3));
}

function vectorSvg({
  artwork,
  paperTexture,
  frontDrawing,
  fragments,
  size,
  mirrored,
  title,
}: {
  artwork: string;
  paperTexture: string;
  frontDrawing?: string;
  fragments: MapFragment[];
  size: BoardSize;
  mirrored: boolean;
  title: string;
}) {
  const segments = uniqueCutSegments(fragments);
  const print = getPrintMetrics(size);
  const lines = segments.map(({ start, end }) => {
    const startX = (mirrored ? 100 - start.x : start.x) * size.width / 100;
    const endX = (mirrored ? 100 - end.x : end.x) * size.width / 100;
    const startY = start.y * size.height / 100;
    const endY = end.y * size.height / 100;
    return `<line x1="${coordinate(startX)}" y1="${coordinate(startY)}" x2="${coordinate(endX)}" y2="${coordinate(endY)}" />`;
  }).join("");

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"`,
    ` width="${print.widthMm.toFixed(2)}mm" height="${print.heightMm.toFixed(2)}mm"`,
    ` viewBox="0 0 ${size.width} ${size.height}">`,
    `<title>${title}</title>`,
    `<rect id="PAPER_COLOR" width="${size.width}" height="${size.height}" fill="${PAPER_COLOR}" />`,
    `<image id="PARCHMENT" width="${size.width}" height="${size.height}" preserveAspectRatio="xMidYMid slice"`,
    ` href="${paperTexture}" xlink:href="${paperTexture}" />`,
    frontDrawing
      ? `<image id="PLAN_AND_ROUTE" width="${size.width}" height="${size.height}" href="${frontDrawing}" xlink:href="${frontDrawing}" />`
      : "",
    `<image id="ARTWORK" width="${size.width}" height="${size.height}" href="${artwork}" xlink:href="${artwork}" />`,
    `<g id="CUT_LINES" data-purpose="cut" fill="none" stroke="${CUT_LINE_COLOR}" stroke-opacity="0.48" stroke-width="1.2"`,
    ` stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke">`,
    lines,
    `</g>`,
    `</svg>`,
  ].join("");
}

function pngBase64(dataUrl: string) {
  const marker = "base64,";
  const index = dataUrl.indexOf(marker);
  if (index < 0) throw new Error("Не удалось подготовить растровый файл.");
  return dataUrl.slice(index + marker.length);
}

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  bytes.forEach((byte) => {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  });
  return (crc ^ 0xffffffff) >>> 0;
}

function writeUint32(target: Uint8Array, offset: number, value: number) {
  target[offset] = (value >>> 24) & 0xff;
  target[offset + 1] = (value >>> 16) & 0xff;
  target[offset + 2] = (value >>> 8) & 0xff;
  target[offset + 3] = value & 0xff;
}

function readUint32(source: Uint8Array, offset: number) {
  return (
    (source[offset] << 24)
    | (source[offset + 1] << 16)
    | (source[offset + 2] << 8)
    | source[offset + 3]
  ) >>> 0;
}

function pngBytes(dataUrl: string) {
  const binary = atob(pngBase64(dataUrl));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function pngDataUrl(bytes: Uint8Array) {
  const chunkSize = 0x8000;
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return `data:image/png;base64,${btoa(binary)}`;
}

function withPngDpi(dataUrl: string, dpi: number) {
  const source = pngBytes(dataUrl);
  const physicalChunk = new Uint8Array(21);
  writeUint32(physicalChunk, 0, 9);
  physicalChunk.set([0x70, 0x48, 0x59, 0x73], 4);
  const pixelsPerMeter = Math.round(dpi / 0.0254);
  writeUint32(physicalChunk, 8, pixelsPerMeter);
  writeUint32(physicalChunk, 12, pixelsPerMeter);
  physicalChunk[16] = 1;
  writeUint32(physicalChunk, 17, crc32(physicalChunk.subarray(4, 17)));

  const parts: Uint8Array[] = [source.subarray(0, 8)];
  let offset = 8;
  while (offset < source.length) {
    const length = readUint32(source, offset);
    const end = offset + 12 + length;
    const type = String.fromCharCode(...source.subarray(offset + 4, offset + 8));
    if (type !== "pHYs") parts.push(source.subarray(offset, end));
    if (type === "IHDR") parts.push(physicalChunk);
    offset = end;
  }

  const output = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let outputOffset = 0;
  parts.forEach((part) => {
    output.set(part, outputOffset);
    outputOffset += part.length;
  });
  return pngDataUrl(output);
}

function nextPaint() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

function loadPaperTexture() {
  if (!paperTexturePromise) {
    paperTexturePromise = fetch(PAPER_TEXTURE_URL)
      .then((response) => {
        if (!response.ok) throw new Error("Не удалось загрузить текстуру пергамента.");
        return response.blob();
      })
      .then((blob) => new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => (
          typeof reader.result === "string"
            ? resolve(reader.result)
            : reject(new Error("Не удалось подготовить текстуру пергамента."))
        );
        reader.onerror = () => reject(new Error("Не удалось подготовить текстуру пергамента."));
        reader.readAsDataURL(blob);
      }));
  }
  return paperTexturePromise;
}

async function waitForImages(node: HTMLElement) {
  const images = [...node.querySelectorAll("img")];
  await Promise.all(images.map((image) => (
    image.complete
      ? Promise.resolve()
      : new Promise<void>((resolve) => {
        image.addEventListener("load", () => resolve(), { once: true });
        image.addEventListener("error", () => resolve(), { once: true });
      })
  )));
}

function captureOptions(size: BoardSize) {
  const print = getPrintMetrics(size);
  return {
    width: size.width,
    height: size.height,
    canvasWidth: print.widthPx,
    canvasHeight: print.heightPx,
    pixelRatio: 1,
    cacheBust: false,
    backgroundColor: "transparent",
    filter: artworkFilter,
    skipFonts: true,
    skipAutoScale: true,
    style: {
      width: `${size.width}px`,
      height: `${size.height}px`,
      minWidth: "0",
      maxWidth: "none",
      animation: "none",
      background: "transparent",
      backgroundColor: "transparent",
      boxShadow: "none",
      transform: "none",
    },
  };
}

function loadImage(source: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Не удалось подготовить изображение карты."));
    image.src = source;
  });
}

function frontDrawingDataUrl(frontNode: HTMLElement, size: BoardSize) {
  const source = frontNode.querySelector<SVGSVGElement>("svg.map-lines");
  if (!source) return null;

  const drawing = source.cloneNode(true) as SVGSVGElement;
  drawing.querySelectorAll(".map-cut-layer, .draft-line, .draft-route").forEach((node) => node.remove());
  drawing.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  drawing.setAttribute("width", String(size.width));
  drawing.setAttribute("height", String(size.height));
  drawing.setAttribute("viewBox", `0 0 ${size.width} ${size.height}`);
  drawing.removeAttribute("style");

  const style = document.createElementNS("http://www.w3.org/2000/svg", "style");
  style.textContent = FRONT_DRAWING_STYLES;
  drawing.prepend(style);

  const serialized = new XMLSerializer().serializeToString(drawing);
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(serialized)}`;
}

async function clearCaptureBackground(source: string) {
  const image = await loadImage(source);
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Не удалось подготовить прозрачный слой карты.");

  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  for (let index = 0; index < pixels.data.length; index += 4) {
    if (
      pixels.data[index] <= 8
      && pixels.data[index + 1] <= 8
      && pixels.data[index + 2] <= 8
    ) {
      pixels.data[index + 3] = 0;
    }
  }
  context.putImageData(pixels, 0, 0);
  return canvas.toDataURL("image/png");
}

function drawImageCover(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  width: number,
  height: number,
) {
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
  const drawWidth = image.naturalWidth * scale;
  const drawHeight = image.naturalHeight * scale;
  context.drawImage(
    image,
    (width - drawWidth) / 2,
    (height - drawHeight) / 2,
    drawWidth,
    drawHeight,
  );
}

async function addRasterCutLines(
  artwork: string,
  paperTexture: string,
  frontDrawing: string | null,
  fragments: MapFragment[],
  size: BoardSize,
  mirrored: boolean,
) {
  const [image, paper, drawing] = await Promise.all([
    loadImage(artwork),
    loadImage(paperTexture),
    frontDrawing ? loadImage(frontDrawing) : Promise.resolve(null),
  ]);
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Не удалось подготовить растровый макет.");

  const scaleX = canvas.width / size.width;
  const scaleY = canvas.height / size.height;
  context.fillStyle = PAPER_COLOR;
  context.fillRect(0, 0, canvas.width, canvas.height);
  drawImageCover(context, paper, canvas.width, canvas.height);
  if (drawing) context.drawImage(drawing, 0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0);
  context.beginPath();
  uniqueCutSegments(fragments).forEach(({ start, end }) => {
    const startX = (mirrored ? 100 - start.x : start.x) * size.width / 100;
    const endX = (mirrored ? 100 - end.x : end.x) * size.width / 100;
    context.moveTo(startX * scaleX, start.y * size.height / 100 * scaleY);
    context.lineTo(endX * scaleX, end.y * size.height / 100 * scaleY);
  });
  context.strokeStyle = "rgba(119, 117, 111, 0.48)";
  context.lineWidth = 1.2 * Math.max(scaleX, scaleY);
  context.lineCap = "round";
  context.lineJoin = "round";
  context.stroke();
  return canvas.toDataURL("image/png");
}

export async function downloadMapArchive({
  frontNode,
  backNode,
  size,
  fragments,
}: ExportOptions) {
  await document.fonts.ready;
  await Promise.all([waitForImages(frontNode), waitForImages(backNode)]);
  await nextPaint();

  const paperTexture = await loadPaperTexture();
  const frontDrawing = frontDrawingDataUrl(frontNode, size);
  const frontCapture = await toPng(frontNode, captureOptions(size));
  const frontArtwork = await clearCaptureBackground(frontCapture);
  await nextPaint();
  const backCapture = await toPng(backNode, captureOptions(size));
  const backArtwork = await clearCaptureBackground(backCapture);
  const [frontPngSource, backPngSource] = await Promise.all([
    addRasterCutLines(frontArtwork, paperTexture, frontDrawing, fragments, size, false),
    addRasterCutLines(backArtwork, paperTexture, null, fragments, size, true),
  ]);
  const frontPng = withPngDpi(frontPngSource, PRINT_DPI);
  const backPng = withPngDpi(backPngSource, PRINT_DPI);
  const frontSvg = vectorSvg({
    artwork: frontArtwork,
    paperTexture,
    frontDrawing: frontDrawing ?? undefined,
    fragments,
    size,
    mirrored: false,
    title: "Treasure map front",
  });
  const backSvg = vectorSvg({
    artwork: backArtwork,
    paperTexture,
    fragments,
    size,
    mirrored: true,
    title: "Treasure map back",
  });

  const archive = new JSZip();
  archive.file("front-raster.png", pngBase64(frontPng), { base64: true });
  archive.file("back-raster.png", pngBase64(backPng), { base64: true });
  archive.file("front-vector.svg", frontSvg);
  archive.file("back-vector.svg", backSvg);
  const blob = await archive.generateAsync({
    type: "blob",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });

  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = "treasure-map-layout.zip";
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(href), 30_000);
}
