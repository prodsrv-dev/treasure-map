"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import MapPlanner from "./MapPlanner";

type LocationType = "apartment" | "dacha" | "yard";

type PlaceItem = {
  id: number;
  first: string;
  second: string;
  photoName: string;
  photoDataUrl: string;
  monsterJobId: string;
  monsterSignature: string;
};

type PrizeItem = {
  name: string;
  photoName: string;
  photoDataUrl: string;
  imageJobId: string;
  imageSignature: string;
};

type LocationDraft = {
  locationType: LocationType | null;
  seekerName: string;
  places: PlaceItem[];
  drafts: Partial<Record<LocationType, PlaceItem[]>>;
  prize: PrizeItem;
  confirmed: boolean;
};

function contentFingerprint(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function placeImageSignature(locationType: LocationType, place: PlaceItem) {
  return `content-v1|${locationType}|${place.first.trim()}|${place.second.trim()}|${place.photoName}|${contentFingerprint(place.photoDataUrl)}`;
}

function reusablePlaceSignature(locationType: LocationType, place: PlaceItem, signature: string) {
  const legacy = `${locationType}|${place.first.trim()}|${place.second.trim()}|${place.photoName}|${place.photoDataUrl.length}`;
  return signature === placeImageSignature(locationType, place)
    || signature === legacy
    || signature === `transparent-cutout-v2|${legacy}`;
}

function prizeImageSignature(prize: PrizeItem) {
  return `content-v1|${prize.name.trim()}|${prize.photoName}|${contentFingerprint(prize.photoDataUrl)}`;
}

function reusablePrizeSignature(prize: PrizeItem) {
  const legacy = `${prize.name.trim()}|${prize.photoName}|${prize.photoDataUrl.length}`;
  return prize.imageSignature === prizeImageSignature(prize)
    || prize.imageSignature === legacy
    || prize.imageSignature === `transparent-cutout-v2|${legacy}`;
}

const DRAFT_STORAGE_KEY = "treasure-map:location-draft:v1";
const SCROLL_STORAGE_KEY = "treasure-map:scroll-position:v1";

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
  return [1, 2, 3].map((id) => ({
    id,
    first: "",
    second: "",
    photoName: "",
    photoDataUrl: "",
    monsterJobId: "",
    monsterSignature: "",
  }));
}

function blankPrize(): PrizeItem {
  return {
    name: "",
    photoName: "",
    photoDataUrl: "",
    imageJobId: "",
    imageSignature: "",
  };
}

function prepareMapPhoto(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Не удалось прочитать фотографию"));
    reader.onload = () => {
      const source = typeof reader.result === "string" ? reader.result : "";
      if (!source) {
        reject(new Error("Фотография пуста"));
        return;
      }

      const image = new Image();
      image.onerror = () => reject(new Error("Не удалось открыть фотографию"));
      image.onload = () => {
        const maxSide = 420;
        const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        const context = canvas.getContext("2d");
        if (!context) {
          resolve(source);
          return;
        }
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.76));
      };
      image.src = source;
    };
    reader.readAsDataURL(file);
  });
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
        photoDataUrl: typeof place.photoDataUrl === "string"
          && place.photoDataUrl.startsWith("data:image/")
          ? place.photoDataUrl
          : "",
        monsterJobId: typeof place.monsterJobId === "string" ? place.monsterJobId : "",
        monsterSignature: typeof place.monsterSignature === "string" ? place.monsterSignature : "",
      }];
  });

  let nextAvailableId = Math.max(0, ...places.map((place) => place.id)) + 1;
  while (places.length < 3) {
    places.push({
      id: nextAvailableId,
      first: "",
      second: "",
      photoName: "",
      photoDataUrl: "",
      monsterJobId: "",
      monsterSignature: "",
    });
    nextAvailableId += 1;
  }

  return places;
}

function normalizePrize(value: unknown): PrizeItem {
  if (!value || typeof value !== "object") return blankPrize();
  const prize = value as Partial<PrizeItem>;
  return {
    name: typeof prize.name === "string" ? prize.name.slice(0, 120) : "",
    photoName: typeof prize.photoName === "string" ? prize.photoName.slice(0, 180) : "",
    photoDataUrl: typeof prize.photoDataUrl === "string"
      && prize.photoDataUrl.startsWith("data:image/")
      ? prize.photoDataUrl
      : "",
    imageJobId: typeof prize.imageJobId === "string" ? prize.imageJobId : "",
    imageSignature: typeof prize.imageSignature === "string" ? prize.imageSignature : "",
  };
}

function restoreDraft(value: string | null): LocationDraft | null {
  if (!value) return null;

  try {
    const draft = JSON.parse(value) as {
      locationType?: unknown;
      places?: unknown;
      drafts?: Partial<Record<LocationType, unknown>>;
      prize?: unknown;
      seekerName?: unknown;
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
    const seekerName = typeof draft.seekerName === "string"
      ? draft.seekerName.slice(0, 40)
      : "";
    const confirmed = draft.confirmed === true
      && places.filter((place) => place.first.trim() && place.second.trim()).length >= 3
      && Boolean(normalizePrize(draft.prize).name.trim())
      && Boolean(normalizePrize(draft.prize).photoDataUrl);

    return { locationType, seekerName, places, drafts, prize: normalizePrize(draft.prize), confirmed };
  } catch {
    return null;
  }
}

export default function LocationSetup() {
  const [locationType, setLocationType] = useState<LocationType | null>(null);
  const [seekerName, setSeekerName] = useState("");
  const [places, setPlaces] = useState<PlaceItem[]>(blankPlaces);
  const [prize, setPrize] = useState<PrizeItem>(blankPrize);
  const [confirmed, setConfirmed] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);
  const [preparingMonsters, setPreparingMonsters] = useState(false);
  const [monsterQueueNote, setMonsterQueueNote] = useState("");
  const nextId = useRef(4);
  const locationDrafts = useRef<Partial<Record<LocationType, PlaceItem[]>>>({});
  const scrollRestored = useRef(false);

  useEffect(() => {
    const previousScrollRestoration = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";

    function saveScrollPosition() {
      if (!scrollRestored.current) return;

      try {
        window.sessionStorage.setItem(SCROLL_STORAGE_KEY, String(window.scrollY));
      } catch {
        // The page still works when session storage is unavailable.
      }
    }

    window.addEventListener("pagehide", saveScrollPosition);
    window.addEventListener("beforeunload", saveScrollPosition);

    return () => {
      saveScrollPosition();
      window.history.scrollRestoration = previousScrollRestoration;
      window.removeEventListener("pagehide", saveScrollPosition);
      window.removeEventListener("beforeunload", saveScrollPosition);
    };
  }, []);

  useEffect(() => {
    let draft: LocationDraft | null = null;

    try {
      draft = restoreDraft(window.localStorage.getItem(DRAFT_STORAGE_KEY));
    } catch {
      // The form remains usable when storage is unavailable.
    }

    if (draft) {
      let restoredSeekerName = draft.seekerName;
      if (!restoredSeekerName) {
        try {
          const legacyMap = JSON.parse(
            window.localStorage.getItem(`treasure-map:layout:${draft.locationType}:v1`) || "null",
          ) as { seekerName?: unknown } | null;
          if (typeof legacyMap?.seekerName === "string") {
            restoredSeekerName = legacyMap.seekerName.slice(0, 40);
          }
        } catch {
          // Ignore malformed legacy map data.
        }
      }

      setLocationType(draft.locationType);
      setSeekerName(restoredSeekerName);
      setPlaces(draft.places);
      setPrize(draft.prize);
      setConfirmed(draft.confirmed && Boolean(restoredSeekerName.trim()));
      locationDrafts.current = draft.drafts;
      nextId.current = Math.max(0, ...draft.places.map((place) => place.id)) + 1;
    }

    setDraftRestored(true);
  }, []);

  useEffect(() => {
    if (!draftRestored || scrollRestored.current) return;

    let savedPosition = 0;
    try {
      const storedPosition = Number(window.sessionStorage.getItem(SCROLL_STORAGE_KEY));
      if (Number.isFinite(storedPosition) && storedPosition > 0) savedPosition = storedPosition;
    } catch {
      // Keep the default top position when session storage is unavailable.
    }

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.scrollTo({ top: savedPosition, left: 0, behavior: "auto" });
        scrollRestored.current = true;
      });
    });
  }, [draftRestored]);

  useEffect(() => {
    if (!draftRestored) return;

    try {
      if (locationType) locationDrafts.current[locationType] = places;
      window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({
        locationType,
        seekerName,
        drafts: locationDrafts.current,
        prize,
        confirmed,
      }));
    } catch {
      // Storage can be disabled by browser privacy settings.
    }
  }, [confirmed, draftRestored, locationType, places, prize, seekerName]);

  const completedCount = useMemo(
    () => places.filter((place) => place.first.trim() && place.second.trim()).length,
    [places],
  );
  const hasMinimumPlaces = completedCount >= 3;
  const canContinue = hasMinimumPlaces
    && Boolean(seekerName.trim())
    && Boolean(prize.name.trim())
    && Boolean(prize.photoDataUrl);
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
      document.getElementById("seeker-name")?.focus();
    });
  }

  function updatePlace(id: number, field: "first" | "second", value: string) {
    setPlaces((current) => current.map((place) => (
      place.id === id
        ? { ...place, [field]: value }
        : place
    )));
    setConfirmed(false);
  }

  async function updatePhoto(id: number, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    const photoName = file?.name ?? "";
    setPlaces((current) => current.map((place) => (
      place.id === id
        ? { ...place, photoName, photoDataUrl: "" }
        : place
    )));
    setConfirmed(false);

    if (!file) return;
    try {
      const photoDataUrl = await prepareMapPhoto(file);
      setPlaces((current) => current.map((place) => (
        place.id === id
          ? { ...place, photoName, photoDataUrl }
          : place
      )));
    } catch {
      setPlaces((current) => current.map((place) => (
        place.id === id
          ? { ...place, photoName: "", photoDataUrl: "" }
          : place
      )));
    }
  }

  async function updatePrizePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    const photoName = file?.name ?? "";
    setPrize((current) => ({
      ...current,
      photoName,
      photoDataUrl: "",
    }));
    setConfirmed(false);

    if (!file) return;
    try {
      const photoDataUrl = await prepareMapPhoto(file);
      setPrize((current) => ({
        ...current,
        photoName,
        photoDataUrl,
      }));
    } catch {
      setPrize((current) => ({
        ...current,
        photoName: "",
        photoDataUrl: "",
      }));
    }
  }

  function addPlace() {
    const id = nextId.current;
    nextId.current += 1;
    setPlaces((current) => [...current, {
      id,
      first: "",
      second: "",
      photoName: "",
      photoDataUrl: "",
      monsterJobId: "",
      monsterSignature: "",
    }]);
    setConfirmed(false);
  }

  function removePlace(id: number) {
    setPlaces((current) => current.filter((place) => place.id !== id));
    setConfirmed(false);
  }

  async function continueToMap() {
    if (!locationType || preparingMonsters) return;
    setPreparingMonsters(true);
    setMonsterQueueNote("");

    let queuedCount = 0;
    const updatedPlaces = await Promise.all(places.map(async (place) => {
      if (!place.first.trim() || !place.second.trim() || !place.photoDataUrl) return place;

      const signature = placeImageSignature(locationType, place);
      if (place.monsterJobId && reusablePlaceSignature(locationType, place, place.monsterSignature)) {
        return { ...place, monsterSignature: signature };
      }

      try {
        const objectName = locationType === "apartment" ? place.second.trim() : place.first.trim();
        const locationName = locationType === "apartment" ? place.first.trim() : place.second.trim();
        const response = await fetch("/api/monster-jobs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            assetKind: "monster",
            objectName,
            locationName,
            referenceName: place.photoName,
            photoDataUrl: place.photoDataUrl,
          }),
        });
        if (!response.ok) throw new Error("queue failed");
        const payload = await response.json() as { id?: string };
        if (!payload.id) throw new Error("job id missing");
        queuedCount += 1;
        return { ...place, monsterJobId: payload.id, monsterSignature: signature };
      } catch {
        return place;
      }
    }));

    let updatedPrize = prize;
    if (prize.name.trim() && prize.photoDataUrl) {
      const signature = prizeImageSignature(prize);
      if (prize.imageJobId && reusablePrizeSignature(prize)) {
        updatedPrize = { ...prize, imageSignature: signature };
      } else {
        try {
          const response = await fetch("/api/monster-jobs", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              assetKind: "prize",
              objectName: prize.name.trim(),
              locationName: "Финальный приз",
              referenceName: prize.photoName,
              photoDataUrl: prize.photoDataUrl,
            }),
          });
          if (!response.ok) throw new Error("queue failed");
          const payload = await response.json() as { id?: string };
          if (!payload.id) throw new Error("job id missing");
          updatedPrize = {
            ...prize,
            imageJobId: payload.id,
            imageSignature: signature,
          };
          queuedCount += 1;
        } catch {
          updatedPrize = prize;
        }
      }
    }

    setPlaces(updatedPlaces);
    setPrize(updatedPrize);
    if (queuedCount > 0) {
      setMonsterQueueNote(
        `${queuedCount} ${queuedCount === 1 ? "фото отправлено" : "фото отправлены"} Сфинксу как референс. Чудища и отдельный образ приза появятся на карте автоматически.`,
      );
    }
    setConfirmed(true);
    setPreparingMonsters(false);
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
        <div className="start-setup">
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
          {locationType ? (
            <label className="seeker-prompt" htmlFor="seeker-name">
              <span>Персональная легенда</span>
              <strong>Как зовут искателя?</strong>
              <input
                id="seeker-name"
                type="text"
                value={seekerName}
                maxLength={40}
                autoComplete="name"
                placeholder="Например, Миша"
                onChange={(event) => setSeekerName(event.target.value)}
              />
              <small>Это имя появится в легенде и поздравлении на осколках карты.</small>
            </label>
          ) : null}
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
                    <span className={`photo-button${place.photoDataUrl ? " has-preview" : ""}`}>
                      {place.photoDataUrl ? <img src={place.photoDataUrl} alt="" /> : null}
                      <span>{place.photoName || "Добавить"}</span>
                    </span>
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

            <section className="prize-editor" aria-labelledby="prize-title">
              <div className="prize-copy">
                <span className="prize-kicker">Финал приключения</span>
                <h3 id="prize-title">Что будет искать ребёнок?</h3>
                <p>Сфотографируйте настоящий приз. По фото появится отдельная иллюстрация, которую можно свободно поставить на карте.</p>
              </div>
              <label>
                <span>Название приза</span>
                <input
                  value={prize.name}
                  maxLength={120}
                  placeholder="Например, набор LEGO"
                  onChange={(event) => {
                    setPrize((current) => ({
                      ...current,
                      name: event.target.value,
                    }));
                    setConfirmed(false);
                  }}
                />
              </label>
              <label className="photo-control prize-photo-control">
                <span>Фото приза</span>
                <span className={`photo-button${prize.photoDataUrl ? " has-preview" : ""}`}>
                  {prize.photoDataUrl ? <img src={prize.photoDataUrl} alt="" /> : null}
                  <span>{prize.photoName || "Сфотографировать"}</span>
                </span>
                <input type="file" accept="image/*" capture="environment" onChange={updatePrizePhoto} />
              </label>
            </section>

            <div className="places-footer">
              <div className="places-progress" aria-live="polite">
                <strong>{hasMinimumPlaces ? `${completedCount} мест` : `${completedCount} из 3`}</strong>
                <span>{hasMinimumPlaces ? "Минимум собран" : "Минимум для маршрута"}</span>
              </div>
              <button className="add-place" type="button" onClick={addPlace}>
                <span aria-hidden="true">+</span>
                Добавить место
              </button>
              <button
                className="continue-button"
                type="button"
                disabled={!canContinue || preparingMonsters}
                onClick={continueToMap}
              >
                {preparingMonsters ? "Готовим референсы…" : "Продолжить"}
                <span aria-hidden="true">→</span>
              </button>
            </div>
            <p className="places-limit">
              {seekerName.trim()
                ? prize.name.trim() && prize.photoDataUrl
                  ? "Добавляйте столько мест, сколько нужно."
                  : "Чтобы продолжить, укажите приз и добавьте его фотографию."
                : "Чтобы продолжить, укажите имя искателя выше."}
            </p>
            {monsterQueueNote ? <p className="monster-queue-note" role="status">{monsterQueueNote}</p> : null}
          </div>
        </section>
      ) : null}

      {confirmed && locationType ? (
        <MapPlanner
          locationType={locationType}
          places={completedPlaces}
          prize={prize}
          seekerName={seekerName.trim()}
          key={locationType}
        />
      ) : null}
    </>
  );
}
