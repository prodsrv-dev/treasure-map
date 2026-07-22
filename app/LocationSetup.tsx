"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import MapPlanner from "./MapPlanner";

type LocationType = "apartment" | "dacha" | "yard";

type PlaceItem = {
  id: number;
  first: string;
  second: string;
  photoName: string;
};

type LocationDraft = {
  locationType: LocationType | null;
  places: PlaceItem[];
  drafts: Partial<Record<LocationType, PlaceItem[]>>;
  confirmed: boolean;
};

const DRAFT_STORAGE_KEY = "treasure-map:location-draft:v1";

const locationOptions: Array<{ value: LocationType; label: string }> = [
  { value: "apartment", label: "Квартира" },
  { value: "dacha", label: "Дача" },
  { value: "yard", label: "Двор" },
];

const locationCopy = {
  apartment: {
    label: "Квартира",
    firstLabel: "Комната или зона",
    firstPlaceholder: "Например, кухня",
    secondLabel: "Объект",
    secondPlaceholder: "Например, холодильник",
    description: "Добавьте комнаты и объекты, которые легко узнать.",
  },
  dacha: {
    label: "Дача",
    firstLabel: "Объект",
    firstPlaceholder: "Например, яблоня",
    secondLabel: "Как его узнать",
    secondPlaceholder: "Самая высокая, у забора",
    description: "Добавьте заметные объекты и их отличительные признаки.",
  },
  yard: {
    label: "Двор",
    firstLabel: "Объект",
    firstPlaceholder: "Например, качели",
    secondLabel: "Как его узнать",
    secondPlaceholder: "Рядом с песочницей",
    description: "Добавьте заметные объекты и их отличительные признаки.",
  },
} satisfies Record<LocationType, {
  label: string;
  firstLabel: string;
  firstPlaceholder: string;
  secondLabel: string;
  secondPlaceholder: string;
  description: string;
}>;

function blankPlaces(): PlaceItem[] {
  return [1, 2, 3].map((id) => ({ id, first: "", second: "", photoName: "" }));
}

function normalizePlaces(value: unknown): PlaceItem[] | null {
  if (!Array.isArray(value)) return null;

  const places = value.flatMap((place) => {
      if (
        !place
        || !Number.isInteger(place.id)
        || typeof place.first !== "string"
        || typeof place.second !== "string"
        || typeof place.photoName !== "string"
      ) return [];

      return [{
        id: place.id,
        first: place.first,
        second: place.second,
        photoName: place.photoName,
      }];
  });

  let nextAvailableId = Math.max(0, ...places.map((place) => place.id)) + 1;
  while (places.length < 3) {
    places.push({
      id: nextAvailableId,
      first: "",
      second: "",
      photoName: "",
    });
    nextAvailableId += 1;
  }

  return places;
}

function restoreDraft(value: string | null): LocationDraft | null {
  if (!value) return null;

  try {
    const draft = JSON.parse(value) as {
      locationType?: unknown;
      places?: unknown;
      drafts?: Partial<Record<LocationType, unknown>>;
      confirmed?: unknown;
    };
    const validLocation = draft.locationType === "apartment"
      || draft.locationType === "dacha"
      || draft.locationType === "yard";

    if (!validLocation) return null;

    const drafts: Partial<Record<LocationType, PlaceItem[]>> = {};
    locationOptions.forEach(({ value: location }) => {
      const places = normalizePlaces(draft.drafts?.[location]);
      if (places) drafts[location] = places;
    });

    const locationType = draft.locationType as LocationType;
    const legacyPlaces = normalizePlaces(draft.places);
    if (!drafts[locationType] && legacyPlaces) drafts[locationType] = legacyPlaces;

    const places = drafts[locationType] ?? blankPlaces();
    const confirmed = draft.confirmed === true
      && places.filter((place) => place.first.trim() && place.second.trim()).length >= 3;

    return { locationType, places, drafts, confirmed };
  } catch {
    return null;
  }
}

export default function LocationSetup() {
  const [locationType, setLocationType] = useState<LocationType | null>(null);
  const [places, setPlaces] = useState<PlaceItem[]>(blankPlaces);
  const [confirmed, setConfirmed] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);
  const nextId = useRef(4);
  const locationDrafts = useRef<Partial<Record<LocationType, PlaceItem[]>>>({});

  useEffect(() => {
    let draft: LocationDraft | null = null;

    try {
      draft = restoreDraft(window.localStorage.getItem(DRAFT_STORAGE_KEY));
    } catch {
      // The form remains usable when storage is unavailable.
    }

    if (draft) {
      setLocationType(draft.locationType);
      setPlaces(draft.places);
      setConfirmed(draft.confirmed);
      locationDrafts.current = draft.drafts;
      nextId.current = Math.max(0, ...draft.places.map((place) => place.id)) + 1;
    }

    setDraftRestored(true);
  }, []);

  useEffect(() => {
    if (!draftRestored) return;

    try {
      if (locationType) locationDrafts.current[locationType] = places;
      window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({
        locationType,
        drafts: locationDrafts.current,
        confirmed,
      }));
    } catch {
      // Storage can be disabled by browser privacy settings.
    }
  }, [confirmed, draftRestored, locationType, places]);

  const completedCount = useMemo(
    () => places.filter((place) => place.first.trim() && place.second.trim()).length,
    [places],
  );
  const canContinue = completedCount >= 3;
  const completedPlaces = useMemo(
    () => places.filter((place) => place.first.trim() && place.second.trim()),
    [places],
  );

  function selectLocation(nextLocation: LocationType) {
    if (nextLocation !== locationType) {
      if (locationType) locationDrafts.current[locationType] = places;

      const nextPlaces = locationDrafts.current[nextLocation] ?? blankPlaces();
      setPlaces(nextPlaces);
      nextId.current = Math.max(0, ...nextPlaces.map((place) => place.id)) + 1;
      setConfirmed(false);
    }
    setLocationType(nextLocation);
    requestAnimationFrame(() => {
      document.getElementById("places")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function updatePlace(id: number, field: "first" | "second", value: string) {
    setPlaces((current) => current.map((place) => (
      place.id === id ? { ...place, [field]: value } : place
    )));
    setConfirmed(false);
  }

  function updatePhoto(id: number, event: ChangeEvent<HTMLInputElement>) {
    const photoName = event.target.files?.[0]?.name ?? "";
    setPlaces((current) => current.map((place) => (
      place.id === id ? { ...place, photoName } : place
    )));
  }

  function addPlace() {
    const id = nextId.current;
    nextId.current += 1;
    setPlaces((current) => [...current, { id, first: "", second: "", photoName: "" }]);
    setConfirmed(false);
  }

  function removePlace(id: number) {
    setPlaces((current) => current.filter((place) => place.id !== id));
    setConfirmed(false);
  }

  function continueToMap() {
    setConfirmed(true);
    requestAnimationFrame(() => {
      document.getElementById("map-layout")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  return (
    <>
      <section className="start-section" id="start" aria-labelledby="start-title">
        <div className="start-intro">
          <p className="step-number">01</p>
          <div>
            <p className="eyebrow">Начнем с места</p>
            <h2 id="start-title">Где проводим приключение?</h2>
          </div>
        </div>
        <div className="place-options" aria-label="Выберите место приключения">
          {locationOptions.map((option) => (
            <button
              className={locationType === option.value ? "active" : ""}
              type="button"
              aria-pressed={locationType === option.value}
              onClick={() => selectLocation(option.value)}
              key={option.value}
            >
              {option.label}
            </button>
          ))}
        </div>
      </section>

      {locationType ? (
        <section className="places-section" id="places" aria-labelledby="places-title">
          <div className="places-heading">
            <p className="step-number">02</p>
            <div>
              <p className="eyebrow">{locationCopy[locationType].label}</p>
              <h2 id="places-title">Подберем места, где будем прятать подсказки</h2>
              <p>{locationCopy[locationType].description}</p>
            </div>
          </div>

          <div className="places-editor">
            <div className="places-list">
              {places.map((place, index) => (
                <article className="place-row" key={place.id}>
                  <span className="place-index">{String(index + 1).padStart(2, "0")}</span>
                  <label>
                    <span>{locationCopy[locationType].firstLabel}</span>
                    <input
                      value={place.first}
                      placeholder={locationCopy[locationType].firstPlaceholder}
                      onChange={(event) => updatePlace(place.id, "first", event.target.value)}
                    />
                  </label>
                  <label>
                    <span>{locationCopy[locationType].secondLabel}</span>
                    <input
                      value={place.second}
                      placeholder={locationCopy[locationType].secondPlaceholder}
                      onChange={(event) => updatePlace(place.id, "second", event.target.value)}
                    />
                  </label>
                  <label className="photo-control">
                    <span>Фото</span>
                    <span className="photo-button">{place.photoName || "Добавить"}</span>
                    <input type="file" accept="image/*" capture="environment" onChange={(event) => updatePhoto(place.id, event)} />
                  </label>
                  {places.length > 3 ? (
                    <button
                      className="remove-place"
                      type="button"
                      aria-label={`Удалить место ${index + 1}`}
                      title="Удалить место"
                      onClick={() => removePlace(place.id)}
                    >
                      ×
                    </button>
                  ) : <span className="remove-place-spacer" aria-hidden="true" />}
                </article>
              ))}
            </div>

            <div className="places-footer">
              <div className="places-progress" aria-live="polite">
                <strong>{canContinue ? `${completedCount} мест` : `${completedCount} из 3`}</strong>
                <span>{canContinue ? "Минимум собран" : "Минимум для маршрута"}</span>
              </div>
              <button className="add-place" type="button" onClick={addPlace}>
                <span aria-hidden="true">+</span>
                Добавить место
              </button>
              <button
                className="continue-button"
                type="button"
                disabled={!canContinue}
                onClick={continueToMap}
              >
                Продолжить
                <span aria-hidden="true">→</span>
              </button>
            </div>
            <p className="places-limit">Добавляйте столько мест, сколько нужно.</p>
          </div>
        </section>
      ) : null}

      {confirmed && locationType ? (
        <MapPlanner
          locationType={locationType}
          places={completedPlaces}
          key={locationType}
        />
      ) : null}
    </>
  );
}
