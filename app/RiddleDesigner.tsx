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
  const { object, location } = placeDetails(place, locationType);
  const normalized = object.toLocaleLowerCase("ru-RU");
  const placePhrase = locationType === "apartment"
    ? location
      ? `В части лабиринта «${location}»`
      : "В одной из комнат лабиринта"
    : location
      ? `Там, где подходит примета «${location}»`
      : "В одном из дальних уголков";

  if (normalized.includes("кран") || normalized.includes("смесител")) {
    return {
      marker: "faucet",
      monster: "Латунный Длиннонос",
      riddle: `${placePhrase} караулит Латунный Длиннонос. Два круглых глаза-крутилки смотрят в разные стороны: один сердится холодом, другой пышет жаром. Между ними торчит длинный нос, из которого по команде льётся вода. Найди этого водяного стража и загляни рядом с ним.`,
    };
  }

  if (normalized.includes("чайник")) {
    return {
      marker: "steam",
      monster: "Паровой Ревун",
      riddle: `${placePhrase} притаился Паровой Ревун. Под треснувшей крышкой у него прячется пасть, в железном брюхе бурлит вода, а из длинного носа вырывается обжигающий пар. Найди чудовище до того, как оно снова заревёт.`,
    };
  }

  if (normalized.includes("сушил")) {
    return {
      marker: "tentacles",
      monster: "Щупальчатый Ловец",
      riddle: `${placePhrase} раскинулось костлявое чудище из металлических лап. Оно цепляет добычу длинными крюками и держит её, пока та не высохнет. Найди логово Щупальчатого Ловца.`,
    };
  }

  if (normalized.includes("холодиль") || normalized.includes("мороз")) {
    return {
      marker: "eye",
      monster: "Ледяной Наблюдатель",
      riddle: `${placePhrase} не мигает Ледяной Наблюдатель. За толстой дверью у него морозное брюхо, в котором бесследно исчезает еда. Отыщи холодного стража и загляни рядом с ним.`,
    };
  }

  if (normalized.includes("шкаф") || normalized.includes("комод")) {
    return {
      marker: "tentacles",
      monster: "Шкафной Ловец",
      riddle: `${placePhrase} притаился Шкафной Ловец. Он распахивает тёмную пасть, хватает одежду длинными лапами и прячет добычу внутри. Найди место, где он хранит свой плен.`,
    };
  }

  if (normalized.includes("фен")) {
    return {
      marker: "steam",
      monster: "Горячий Ветрокрик",
      riddle: `${placePhrase} скрывается Горячий Ветрокрик. Стоит его разбудить, как он начинает реветь и выдыхать сильный тёплый ветер. Найди его, пока он снова не уснул.`,
    };
  }

  if (normalized.includes("аквари")) {
    return {
      marker: "eye",
      monster: "Глубинный Глаз",
      riddle: `${placePhrase} мерцает прозрачное логово Глубинного Глаза. За стеклом колышется вода, а его маленькие слуги бесшумно плавают кругами. Ищи подсказку у водяного чудища.`,
    };
  }

  if (normalized.includes("пиани") || normalized.includes("роял")) {
    return {
      marker: "fangs",
      monster: "Клавишный Пожиратель",
      riddle: `${placePhrase} скалит белые и чёрные зубы Клавишный Пожиратель. Стоит прикоснуться к его пасти, как старое дерево начинает стонать разными голосами. Разыщи чудовище и проверь тайник.`,
    };
  }

  const generic = genericMonsters[index % genericMonsters.length];
  return {
    ...generic,
    riddle: `${placePhrase} сторожит путь ${generic.monster}. В обычном мире он притворяется предметом «${object || "безымянный предмет"}», но в лабиринте оживает. Найди его по этому облику и забери спрятанную рядом подсказку.`,
  };
}

export default function RiddleDesigner({
  locationType,
  places,
  adventures,
  onChange,
}: {
  locationType: LocationType;
  places: RiddlePlace[];
  adventures: Record<string, AdventureEntry>;
  onChange: (next: Record<string, AdventureEntry>) => void;
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

          return (
            <article className="riddle-item" key={place.id}>
              <div className="riddle-place">
                <span>{String(index + 1).padStart(2, "0")}</span>
                <strong>{details.object}</strong>
                <small>{details.location}</small>
              </div>

              <div className="monster-art">
                <div className="monster-portrait">
                  <img src={selectedMarker.image} alt={`${entry.monster}. ${selectedMarker.label}`} />
                </div>
                <div className="marker-picker" role="group" aria-label={`Образ чудовища для ${details.object}`}>
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
    </section>
  );
}
