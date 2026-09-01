import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the treasure map constructor", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Карта сокровищ для детей от 5 до 85<\/title>/i);
  assert.match(html, /Где проводим приключение\?/);
  assert.match(html, />Квартира</);
  assert.match(html, />Дача</);
  assert.match(html, />Двор</);
  assert.doesNotMatch(html, /codex-preview|Building your site/);
});

test("keeps apartment and outdoor map-building flows separate", async () => {
  const [locationSetup, planner, outdoorLayer, packageJson] = await Promise.all([
    readFile(new URL("../app/LocationSetup.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/MapPlanner.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/OutdoorMapLayer.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(locationSetup, /type LocationType = "apartment" \| "dacha" \| "yard"/);
  assert.match(locationSetup, /locationDrafts/);
  assert.match(planner, /const isOutdoor = locationType !== "apartment"/);
  assert.match(planner, /Расставить объекты/);
  assert.match(planner, /Нарисовать стены/);
  assert.match(planner, /Стилизовать карту/);
  assert.match(planner, /isOutdoor && !styled/);
  assert.match(outdoorLayer, /tile\.openstreetmap\.org/);
  assert.match(outdoorLayer, /overpass-api\.de/);
  assert.match(outdoorLayer, /nominatim\.openstreetmap\.org/);
  assert.match(packageJson, /"leaflet"/);
});

test("keeps the prize separate and rejects opaque generated images", async () => {
  const [locationSetup, planner, worker] = await Promise.all([
    readFile(new URL("../app/LocationSetup.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/MapPlanner.tsx", import.meta.url), "utf8"),
    readFile(new URL("../worker/index.ts", import.meta.url), "utf8"),
  ]);

  assert.match(locationSetup, /Что будет искать ребёнок\?/);
  assert.match(locationSetup, /assetKind: "prize"/);
  assert.match(planner, /onPointerDown=\{\(event\) => startPointDrag\(event, "prize"\)\}/);
  assert.match(planner, /DEFAULT_START_POSITION: PointPosition = \{ x: 10, y: 14 \}/);
  assert.match(planner, /start: \{ \.\.\.DEFAULT_START_POSITION \}/);
  assert.match(planner, /<span className="map-start-label">Старт<\/span>/);
  assert.match(planner, /if \(id === "start"\)/);
  assert.match(planner, /map-prize-image/);
  assert.match(planner, /map-prize-placeholder/);
  assert.doesNotMatch(planner, /prizeImage \|\| "\/treasure-chest-map\.png"/);
  assert.doesNotMatch(planner, /final-monster final-composite/);
  assert.match(worker, /PNG must contain a real alpha channel/);
  assert.match(worker, /PNG is too large for map rendering/);
  assert.match(worker, /dimensions\.width > 800 \|\| dimensions\.height > 800/);
  assert.match(planner, /map-monster-image[^>]+decoding="async"/);
  assert.match(planner, /map-prize-image[^>]+decoding="async"/);
  assert.match(worker, /asset_kind AS assetKind/);
  assert.match(worker, /findReusableMonsterJob/);
  assert.match(worker, /reuseCompletedMonsterJob/);
  assert.match(worker, /!pngHasAlphaChannel\(await result\.arrayBuffer\(\)\)/);
  assert.match(worker, /source_hash/);
});

test("reuses unchanged generated references and isolates newly added places", async () => {
  const [locationSetup, planner, styles] = await Promise.all([
    readFile(new URL("../app/LocationSetup.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/MapPlanner.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(locationSetup, /function contentFingerprint/);
  assert.match(locationSetup, /reusablePlaceSignature/);
  assert.match(locationSetup, /return \{ \.\.\.place, monsterSignature: signature \}/);
  assert.doesNotMatch(locationSetup, /IMAGE_GENERATION_VERSION/);
  assert.match(planner, /const marker = place\.monsterJobId \? null : configuredMarker/);
  assert.match(styles, /\.map-point\.generated-monster\s*\{[\s\S]*?width:\s*101px;[\s\S]*?height:\s*101px;/);
});

test("never draws a route through a wall when automatic pathfinding is blocked", async () => {
  const planner = await readFile(new URL("../app/MapPlanner.tsx", import.meta.url), "utf8");

  assert.match(planner, /if \(!strictRoute\) return \{\s*path: "", arrows: \[\], footprints: \[\], cross: null, blocked: true/);
  assert.doesNotMatch(planner, /: \[points\[index\], points\[index \+ 1\]\]/);
  assert.match(planner, /crossings\.length > 0 \|\| \(nearWall && !nearRouteEndpoint\)/);
  assert.match(planner, /function wallSafeRoutePath/);
  assert.match(planner, /path: wallSafeRoutePath\(pixels\)/);
  assert.match(planner, /const path = wallSafeRoutePath\(pixels\)/);
  assert.match(planner, /Стены полностью перекрывают один из переходов/);
  assert.match(planner, /Маршрут построен автоматически/);
  assert.match(planner, /зажмите левую кнопку мыши/);
});
