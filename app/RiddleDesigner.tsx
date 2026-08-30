"use client";

type LocationType = "apartment" | "dacha" | "yard";

type RiddlePlace = {
  id: number;
  first: string;
  second: string;
};

export type MarkerKind = "tentacles" | "steam" | "fangs" | "eye" | "faucet";

export type AdventureEntry = {
  marker: MarkerKind;
  monster: string;
  riddle: string;
};

export const markerCatalog: Array<{ id: MarkerKind; image: string; label: string; scale: number }> = [
  { id: "steam", image: "/monsters/steam-horror.png", label: "Паровой ревун", scale: 1.08 },
  { id: "tentacles", image: "/monsters/tentacle-dryer-horror.png", label: "Щупальчатый ловец", scale: 1.18 },
  { id: "faucet", image: "/monsters/brass-faucet-horror.png", label: "Латунный длиннонос", scale: 1.08 },
  { id: "eye", image: "/monsters/deep-eye-horror.png", label: "Глубинный глаз", scale: 1.08 },
  { id: "fangs", image: "/monsters/piano-predator-horror.png", label: "Клавишный пожиратель", scale: 1.14 },
];

const genericMonsters: Array<Pick<AdventureEntry, "marker" | "monster">> = [
  { marker: "steam", monster: "Паровой Ревун" },
  { marker: "tentacles", monster: "Щупальчатый Ловец" },
  { marker: "faucet", monster: "Латунный Длиннонос" },
  { marker: "eye", monster: "Глубинный Глаз" },
  { marker: "fangs", monster: "Клавишный Пожиратель" },
];

const legacyRiddleFragments = [
  "В части лабиринта",
  "В одной из комнат лабиринта",
  "Там, где подходит примета",
  "В одном из дальних уголков",
  "В обычном мире он притворяется предметом",
];

export function isLegacyRiddle(riddle: string) {
  return legacyRiddleFragments.some((fragment) => riddle.includes(fragment));
}

function placeDetails(place: RiddlePlace, locationType: LocationType) {
  if (locationType === "apartment") {
    return { object: place.second.trim(), location: place.first.trim() };
  }

  return { object: place.first.trim(), location: place.second.trim() };
}

export function createDefaultAdventure(
  place: RiddlePlace,
  index: number,
  locationType: LocationType,
): AdventureEntry {
  const { object } = placeDetails(place, locationType);
  const normalized = object.toLocaleLowerCase("ru-RU");

  if (normalized.includes("кран") || normalized.includes("смесител")) {
    return {
      marker: "faucet",
      monster: "Латунный Длиннонос",
      riddle: `Два круглых глаза: то холод, то жар,
А нос между ними — латунный кинжал.
Повернешь ему глаз — побежит водопад.
Найди, где таится водяной пират.`,
    };
  }

  if (normalized.includes("чайник")) {
    return {
      marker: "steam",
      monster: "Паровой Ревун",
      riddle: `В железном брюхе вскипает вода,
Из носа взлетает седая гряда.
Он крышкой гремит, раздувая бока —
Найди, где Ревун выпускает облака.`,
    };
  }

  if (normalized.includes("сушил")) {
    return {
      marker: "tentacles",
      monster: "Щупальчатый Ловец",
      riddle: `Раскинул он лапы, костляв и высок,
На каждой добыче оставил крючок.
Он мокрых пленников держит весь день,
Пока не иссушит последнюю тень.`,
    };
  }

  if (normalized.includes("холодиль") || normalized.includes("мороз")) {
    return {
      marker: "eye",
      monster: "Ледяной Наблюдатель",
      riddle: `За толстой дверью он прячет мороз
И пищу крадет у беспечных матрос.
В холодном животе не теплеет рассвет —
Найди Наблюдателя, что стережет обед.`,
    };
  }

  if (normalized.includes("шкаф") || normalized.includes("комод")) {
    return {
      marker: "tentacles",
      monster: "Шкафной Ловец",
      riddle: `Раскроются створки — разинется пасть,
Одежда бесследно уходит во власть.
Он куртки и платья уводит в свой плен —
Найди, где Ловец притаился у стен.`,
    };
  }

  if (normalized.includes("фен")) {
    return {
      marker: "steam",
      monster: "Горячий Ветрокрик",
      riddle: `Проснется — завоет, как ветер в трубе,
Горячее дыханье направит к тебе.
В ладони скрывается яростный крик —
Найди, где уснул огневой Ветрокрик.`,
    };
  }

  if (normalized.includes("аквари")) {
    return {
      marker: "eye",
      monster: "Глубинный Глаз",
      riddle: `За стеклянной стеной колыхается свет,
Безмолвные слуги танцуют балет.
Из темной воды наблюдает глазок —
Найди, где он прячет заветный клочок.`,
    };
  }

  if (normalized.includes("пиани") || normalized.includes("роял")) {
    return {
      marker: "fangs",
      monster: "Клавишный Пожиратель",
      riddle: `Белые, черные зубы подряд,
Коснись — и они то поют, то рычат.
Внутри деревянного брюха струна —
Найди Пожирателя: песня слышна.`,
    };
  }

  const generic = genericMonsters[index % genericMonsters.length];
  return {
    ...generic,
    riddle: `Под видом привычной вещи он спит,
Но ночью оскалится и зашуршит.
Присмотрись к силуэту, найди тайный след —
Там страж притаился и спрятал секрет.`,
  };
}

export default function RiddleDesigner({
  locationType,
  places,
  adventures,
  monsterImages,
  onChange,
  onDistribute,
  canDistribute,
}: {
  locationType: LocationType;
  places: RiddlePlace[];
  adventures: Record<string, AdventureEntry>;
  monsterImages: Record<string, string>;
  onChange: (next: Record<string, AdventureEntry>) => void;
  onDistribute: () => void;
  canDistribute: boolean;
}) {
  const themeTitle = locationType === "apartment"
    ? "Лабиринт, полный чудовищ"
    : locationType === "dacha"
      ? "Заколдованные земли"
      : "Двор таинственных стражей";

  function updateEntry(id: number, patch: Partial<AdventureEntry>) {
    const key = String(id);
    const current = adventures[key];
    if (!current) return;
    onChange({ ...adventures, [key]: { ...current, ...patch } });
  }

  function regenerateAll() {
    onChange(Object.fromEntries(
      places.map((place, index) => [
        String(place.id),
        createDefaultAdventure(place, index, locationType),
      ]),
    ));
  }

  return (
    <section className="riddle-section" id="riddles" aria-labelledby="riddles-title">
      <header className="riddle-heading">
        <p className="step-number">04</p>
        <div>
          <p className="eyebrow">Легенда и загадки</p>
          <h2 id="riddles-title">{themeTitle}</h2>
        </div>
        <button className="regenerate-riddles" type="button" onClick={regenerateAll}>
          <span aria-hidden="true">✦</span>
          Придумать заново
        </button>
      </header>

      <div className="riddle-list">
        {places.map((place, index) => {
          const entry = adventures[String(place.id)]
            ?? createDefaultAdventure(place, index, locationType);
          const details = placeDetails(place, locationType);
          const selectedMarker = markerCatalog.find((marker) => marker.id === entry.marker)
            ?? markerCatalog[0];
          const generatedMonster = monsterImages[String(place.id)];

          return (
            <article className="riddle-item" key={place.id}>
              <div className="riddle-place">
                <span>{String(index + 1).padStart(2, "0")}</span>
                <strong>{details.object}</strong>
                <small>{details.location}</small>
              </div>

              <div className="monster-art">
                <div className="monster-portrait">
                  <img
                    className={generatedMonster ? "generated-monster-image" : undefined}
                    src={generatedMonster || selectedMarker.image}
                    alt={`${entry.monster}. ${generatedMonster ? "Образ создан по фотографии" : selectedMarker.label}`}
                  />
                </div>
                {generatedMonster ? (
                  <p className="generated-monster-note">Образ создан по фотографии-референсу</p>
                ) : null}
                <div className="marker-picker" role="group" aria-label={`Базовый образ чудовища для ${details.object}`}>
                  {markerCatalog.map((marker) => (
                    <button
                      className={`marker-choice${entry.marker === marker.id ? " active" : ""}`}
                      type="button"
                      aria-label={marker.label}
                      aria-pressed={entry.marker === marker.id}
                      title={marker.label}
                      onClick={() => updateEntry(place.id, { marker: marker.id })}
                      key={marker.id}
                    >
                      <img src={marker.image} alt="" />
                    </button>
                  ))}
                </div>
              </div>

              <label className="monster-name">
                <span>Чудище</span>
                <input
                  value={entry.monster}
                  onChange={(event) => updateEntry(place.id, { monster: event.target.value })}
                />
              </label>

              <label className="riddle-text">
                <span>Загадка</span>
                <textarea
                  rows={4}
                  value={entry.riddle}
                  onChange={(event) => updateEntry(place.id, { riddle: event.target.value })}
                />
              </label>
            </article>
          );
        })}
      </div>
      <div className="riddle-actions">
        <button
          className="distribute-riddles"
          type="button"
          disabled={!canDistribute}
          onClick={onDistribute}
        >
          Распределить загадки на обратной стороне карты
          <span aria-hidden="true">→</span>
        </button>
        {!canDistribute ? (
          <p>Сначала расставьте точки и разбейте карту на части.</p>
        ) : null}
      </div>
    </section>
  );
}
