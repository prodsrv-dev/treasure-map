"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Format = "Simple clue" | "Riddle" | "Rhyming couplet" | "Rhyming poem";
type Language = "English" | "Español" | "Русский";
type Tone = "Mysterious" | "Funny" | "Pirate" | "Fairy-tale";

type RecordItem = {
  id: string;
  clue: string;
  answer: string;
  detail: string;
  format: Format;
  language: Language;
  createdAt: string;
};

const formats: Format[] = ["Simple clue", "Riddle", "Rhyming couplet", "Rhyming poem"];
const tones: Tone[] = ["Mysterious", "Funny", "Pirate", "Fairy-tale"];
const storageKey = "riddle-sphinx-registry-v1";

const interfaceText = {
  English: {
    pageTitle: "Riddle Generator",
    generator: "Generator", library: "Clue library", map: "Build a treasure map",
    eyebrow: "THE ANCIENT KEEPER OF CLEVER CLUES", headlineA: "Turn any hiding place into a", headlineB: "riddle.",
    intro: "Create child-friendly scavenger hunt clues in seconds. Choose a simple hint, a mystery, a rhyming couplet, or a full poem.",
    ask: "Ask the Sphinx", note: "Free to use · English, Spanish & Russian · Saved in your browser",
    chamber: "ENTER THE CHAMBER", find: "What must the seeker find?", findNote: "Give the Sphinx a few details. The more personal the clue, the more magical the hunt feels.",
    hidden: "The hidden answer", hiddenNote: "What place or object should the player find?", answer: "Answer or hiding place",
    detail: "Object properties", age: "Child's age", language: "Interface & clue language",
    style: "Choose a clue style", mood: "Pick the mood", consult: "Consult the Sphinx",
    prototype: "Working prototype: clues are created on-device; a live AI model can be connected next.",
    answers: "THE SPHINX ANSWERS", three: "Three clues for your quest", waiting: "Your clues will appear here",
    complete: "Complete the scroll and consult the Sphinx.", variant: "VARIANT", rhymed: "RHYMED",
    copy: "Copy", copied: "Copied!", save: "Save to library",
    archive: "THE ARCHIVE OF ANSWERS", growing: "Your growing clue library", archiveNote: "Every saved clue becomes reusable content for future hunts.",
    search: "Search clues, answers, or details…", all: "All formats", answerHead: "ANSWER", languageHead: "LANGUAGE", empty: "No clues match these filters.",
    world: "A RIDDLE NEEDS A WORLD", mapTitle: "Turn your clues into a treasure map.",
    mapNote: "Place every challenge on a beautiful printable adventure map and make the birthday quest unforgettable.", mapCta: "Create the full treasure map",
  },
  Español: {
    pageTitle: "Generador de acertijos",
    generator: "Generador", library: "Biblioteca de pistas", map: "Crear mapa del tesoro",
    eyebrow: "EL ANTIGUO GUARDIÁN DE LOS ENIGMAS", headlineA: "Convierte cualquier escondite en un", headlineB: "enigma.",
    intro: "Crea pistas infantiles para una búsqueda del tesoro en segundos. Elige una pista sencilla, un acertijo, un pareado o un poema.",
    ask: "Pregunta a la Esfinge", note: "Gratis · Inglés, español y ruso · Guardado en tu navegador",
    chamber: "ENTRA EN LA CÁMARA", find: "¿Qué debe encontrar el buscador?", findNote: "Dale algunos detalles a la Esfinge. Cuanto más personal sea la pista, más mágica será la aventura.",
    hidden: "La respuesta oculta", hiddenNote: "¿Qué lugar u objeto debe encontrar el jugador?", answer: "Respuesta o escondite",
    detail: "Propiedades del objeto", age: "Edad del niño", language: "Idioma de la interfaz y la pista",
    style: "Elige el estilo de pista", mood: "Elige el ambiente", consult: "Consultar a la Esfinge",
    prototype: "Prototipo funcional: las pistas se crean en el dispositivo; después se puede conectar un modelo de IA.",
    answers: "LA ESFINGE RESPONDE", three: "Tres pistas para tu aventura", waiting: "Tus pistas aparecerán aquí",
    complete: "Completa el pergamino y consulta a la Esfinge.", variant: "VARIANTE", rhymed: "CON RIMA",
    copy: "Copiar", copied: "¡Copiado!", save: "Guardar",
    archive: "EL ARCHIVO DE RESPUESTAS", growing: "Tu biblioteca de pistas", archiveNote: "Cada pista guardada puede reutilizarse en futuras aventuras.",
    search: "Buscar pistas, respuestas o detalles…", all: "Todos los formatos", answerHead: "RESPUESTA", languageHead: "IDIOMA", empty: "Ninguna pista coincide con los filtros.",
    world: "UN ENIGMA NECESITA UN MUNDO", mapTitle: "Convierte tus pistas en un mapa del tesoro.",
    mapNote: "Coloca cada desafío en un bonito mapa imprimible y crea una aventura de cumpleaños inolvidable.", mapCta: "Crear el mapa completo",
  },
  Русский: {
    pageTitle: "Генератор загадок",
    generator: "Генератор", library: "Библиотека", map: "Создать карту сокровищ",
    eyebrow: "ДРЕВНИЙ ХРАНИТЕЛЬ МУДРЫХ ЗАГАДОК", headlineA: "Превратите любое тайное место в", headlineB: "загадку.",
    intro: "Создавайте детские подсказки для поиска сокровищ за секунды. Выберите простую подсказку, загадку, двустишие или стихотворение.",
    ask: "Спросить Сфинкса", note: "Бесплатно · Английский, испанский и русский · Сохраняется в браузере",
    chamber: "ВОЙДИТЕ В ЗАЛ", find: "Что должен найти искатель?", findNote: "Дайте Сфинксу несколько деталей. Чем личнее подсказка, тем волшебнее приключение.",
    hidden: "Скрытый ответ", hiddenNote: "Какое место или предмет должен найти игрок?", answer: "Ответ или тайное место",
    detail: "Свойства объекта", age: "Возраст ребёнка", language: "Язык интерфейса и загадки",
    style: "Выберите формат", mood: "Выберите настроение", consult: "Спросить Сфинкса",
    prototype: "Рабочий прототип: подсказки создаются на устройстве; следующим шагом можно подключить AI-модель.",
    answers: "СФИНКС ОТВЕЧАЕТ", three: "Три подсказки для вашего квеста", waiting: "Здесь появятся загадки",
    complete: "Заполните свиток и спросите Сфинкса.", variant: "ВАРИАНТ", rhymed: "В РИФМУ",
    copy: "Копировать", copied: "Скопировано!", save: "Сохранить",
    archive: "АРХИВ ОТВЕТОВ", growing: "Ваша библиотека загадок", archiveNote: "Каждую сохранённую загадку можно использовать в будущих квестах.",
    search: "Поиск по загадкам, ответам и деталям…", all: "Все форматы", answerHead: "ОТВЕТ", languageHead: "ЯЗЫК", empty: "По этим фильтрам ничего не найдено.",
    world: "ЗАГАДКЕ НУЖЕН ЦЕЛЫЙ МИР", mapTitle: "Превратите загадки в карту сокровищ.",
    mapNote: "Разместите все испытания на красивой печатной карте и создайте незабываемое приключение.", mapCta: "Создать полную карту",
  },
} satisfies Record<Language, Record<string, string>>;

const starters: RecordItem[] = [
  {
    id: "starter-1",
    clue: "I keep things cold from dusk till light. Open my door—the next clue is in sight.",
    answer: "refrigerator",
    detail: "the birthday cake stays cold",
    format: "Rhyming couplet",
    language: "English",
    createdAt: "Sample",
  },
  {
    id: "starter-2",
    clue: "No need to hurry, no need to race. Where stories sleep is your next place.",
    answer: "bookshelf",
    detail: "your favorite dragon story lives there",
    format: "Rhyming couplet",
    language: "English",
    createdAt: "Sample",
  },
];

function buildClues(answer: string, detail: string, format: Format, language: Language) {
  const place = answer.trim() || "the secret place";
  const fact = detail.trim() || "a familiar secret is waiting";

  if (language === "Русский") {
    if (format === "Simple clue") return [
      `Следующая подсказка ждёт там, где ${fact}: ищи у ${place}.`,
      `Сфинкс велит заглянуть к ${place}. Там скрыт следующий знак.`,
      `Вспомни место, где ${fact}. У ${place} тебя ждёт подсказка.`,
    ];
    if (format === "Riddle") return [
      `Я молчу, но тайну храню. Там, где ${fact}, меня отыщи. Что это?`,
      `Не зверь и не птица, но путь продолжит. Ищи у ${place}.`,
      `Сфинкс загадал место: там ${fact}. Назови его и найди знак.`,
    ];
    if (format === "Rhyming poem") return [
      `Не бойся тайны, сделай шаг,\nТебя уже заждался знак.\nГде ${fact}, держи путь смелей,\nУ ${place} ищи поскорей.`,
      `Сфинкс оставил тайный след,\nОн приведёт тебя к победе.\nГде ${fact}, ищи смелей:\nУ ${place} найдёшь скорей.`,
      `Не нужно бегать и спешить,\nЗагадку надо разрешить.\nГде ${fact}, лежит ответ —\nУ ${place} найдёшь секрет.`,
    ];
    return [
      `Где ${fact}, держи путь смелей,\nУ ${place} ищи поскорей.`,
      `Не бойся тайны, сделай шаг:\nУ ${place} спрятан добрый знак.`,
      `Туда, где ${fact}, ведёт колея,\nУ ${place} ждёт подсказка твоя.`,
    ];
  }

  if (language === "Español") {
    if (format === "Simple clue") return [
      `La siguiente pista espera donde ${fact}: busca cerca de ${place}.`,
      `La Esfinge dice que mires junto a ${place}. Allí hay una pista.`,
      `Recuerda el lugar donde ${fact}. Cerca de ${place} sigue la aventura.`,
    ];
    if (format === "Riddle") return [
      `Guardo un secreto sin hablar. Donde ${fact}, me debes buscar. ¿Qué soy?`,
      `No soy un mapa, pero marco el camino. Busca junto a ${place}.`,
      `La Esfinge piensa en un lugar donde ${fact}. Nómbralo y encuentra la pista.`,
    ];
    if (format === "Rhyming poem") return [
      `Camina despacio, presta atención,\nLa Esfinge te deja una nueva misión.\nDonde ${fact}, busca con ilusión,\nCerca de ${place} hallarás la solución.`,
      `No corras deprisa, escucha la canción,\nEl rastro se esconde con gran discreción.\nDonde ${fact}, sigue la dirección,\nJunto a ${place} espera la solución.`,
      `La arena susurra una indicación,\nResuelve con calma esta adivinación.\nDonde ${fact}, busca con emoción,\nCerca de ${place} duerme la solución.`,
    ];
    return [
      `Donde ${fact}, avanza con ilusión,\nCerca de ${place} hallarás la solución.`,
      `Sigue el misterio con gran atención,\nJunto a ${place} duerme la indicación.`,
      `La Esfinge te entrega una nueva misión:\nBusca en ${place} la próxima solución.`,
    ];
  }

  if (format === "Simple clue") return [
    `Your next clue is where ${fact}. Look near ${place}.`,
    `The Sphinx says to check ${place}. A secret message is waiting there.`,
    `Think of the place where ${fact}. Your next clue is close to ${place}.`,
  ];
  if (format === "Riddle") return [
    `I say no words, yet secrets I keep. Where ${fact}, look for me. What am I?`,
    `I am not a map, but I show where to go. Search near ${place}. What am I?`,
    `The Sphinx thinks of a place where ${fact}. Name it, then find the hidden sign.`,
  ];
  if (format === "Rhyming poem") return [
    `Where ${place} waits in quiet light,\nA secret hides just out of sight.\nRemember: ${fact} is true,\nLook closely there to find your clue.`,
    `The Sphinx has marked a hidden place,\nGo softly now and search with grace.\nWhere ${fact} is true,\nNear ${place} you'll find the clue.`,
    `No need to hurry, no need to race,\nThe answer sleeps in one known place.\nWhere ${fact}, look through—\nBeside ${place} there waits a clue.`,
  ];
  return [
    `Where ${fact} is true,\nBeside ${place}, you'll find your clue.`,
    `Where ${place} stands in quiet light,\nYour hidden message waits in sight.`,
    `Go where ${fact}, then see—\nNear ${place}, a clue waits for thee.`,
  ];
}

export default function RiddleGenerator() {
  const [answer, setAnswer] = useState("книжная полка");
  const [detail, setDetail] = useState("стоит на кухне, белого цвета, с круглой ручкой");
  const [age, setAge] = useState("6–8");
  const [language, setLanguage] = useState<Language>("Русский");
  const [format, setFormat] = useState<Format>("Rhyming couplet");
  const [tone, setTone] = useState<Tone>("Mysterious");
  const [results, setResults] = useState<string[]>([]);
  const [jobId, setJobId] = useState("");
  const [generationStatus, setGenerationStatus] = useState<"idle" | "pending" | "failed">("idle");
  const [generationError, setGenerationError] = useState("");
  const [records, setRecords] = useState<RecordItem[]>(starters);
  const [query, setQuery] = useState("");
  const [formatFilter, setFormatFilter] = useState("All formats");
  const [copied, setCopied] = useState("");
  const t = interfaceText[language];
  const formatLabel = (item: Format) => language === "Русский"
    ? ({ "Simple clue": "Простая подсказка", Riddle: "Загадка", "Rhyming couplet": "Двустишие", "Rhyming poem": "Стихотворение" }[item])
    : language === "Español"
      ? ({ "Simple clue": "Pista sencilla", Riddle: "Acertijo", "Rhyming couplet": "Pareado", "Rhyming poem": "Poema" }[item])
      : item;
  const toneLabel = (item: Tone) => language === "Русский"
    ? ({ Mysterious: "Таинственное", Funny: "Весёлое", Pirate: "Пиратское", "Fairy-tale": "Сказочное" }[item])
    : language === "Español"
      ? ({ Mysterious: "Misterioso", Funny: "Divertido", Pirate: "Pirata", "Fairy-tale": "De cuento" }[item])
      : item;
  const formatNote = (item: Format) => {
    if (language === "Русский") return { "Simple clue": "Просто и понятно", Riddle: "Нужно разгадать", "Rhyming couplet": "Две строки в рифму", "Rhyming poem": "Четыре музыкальные строки" }[item];
    if (language === "Español") return { "Simple clue": "Clara y rápida", Riddle: "Una pregunta por resolver", "Rhyming couplet": "Dos versos con rima", "Rhyming poem": "Cuatro versos musicales" }[item];
    return item === "Rhyming poem" ? "Four musical lines" : item === "Rhyming couplet" ? "Two lines that rhyme" : item === "Riddle" ? "A question to solve" : "Clear and quick";
  };

  useEffect(() => {
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      try { setRecords(JSON.parse(saved)); } catch { /* keep samples */ }
    }
  }, []);

  useEffect(() => {
    if (!jobId || generationStatus !== "pending") return;
    const timer = window.setInterval(async () => {
      try {
        const response = await fetch(`/api/riddle-jobs/${jobId}`, { cache: "no-store" });
        const job = await response.json();
        if (job.status === "completed") {
          const generated = JSON.parse(job.result || "[]");
          setResults(generated);
          setGenerationStatus("idle");
          setJobId("");
        } else if (job.status === "failed") {
          setGenerationError(job.error || "Generation failed");
          setGenerationStatus("failed");
          setJobId("");
        }
      } catch {
        setGenerationError(language === "Русский" ? "Не удалось проверить очередь." : "Could not check the queue.");
      }
    }, 3000);
    return () => window.clearInterval(timer);
  }, [jobId, generationStatus, language]);

  const filtered = useMemo(() => records.filter((item) => {
    const matchText = `${item.clue} ${item.answer} ${item.detail}`.toLowerCase().includes(query.toLowerCase());
    return matchText && (formatFilter === "All formats" || item.format === formatFilter);
  }), [records, query, formatFilter]);

  async function generate(event: FormEvent) {
    event.preventDefault();
    setResults([]);
    setGenerationError("");
    setGenerationStatus("pending");
    try {
      const response = await fetch("/api/riddle-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answer, properties: detail, age, language, format, tone }),
      });
      const job = await response.json();
      if (!response.ok) throw new Error(job.error || "Could not create job");
      setJobId(job.id);
      document.querySelector("#sphinx-results")?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
      setGenerationStatus("failed");
      setGenerationError(error instanceof Error ? error.message : "Could not create job");
    }
  }

  function save(clue: string) {
    const next: RecordItem[] = [{
      id: crypto.randomUUID(),
      clue,
      answer,
      detail: `${detail} · age ${age} · ${tone}`,
      format,
      language,
      createdAt: new Date().toLocaleDateString(),
    }, ...records.filter((item) => item.clue !== clue)];
    setRecords(next);
    localStorage.setItem(storageKey, JSON.stringify(next));
  }

  async function copy(text: string, id: string) {
    await navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(""), 1200);
  }

  return (
    <main className="sphinx-page">
      <nav className="sphinx-nav" aria-label="Main navigation">
        <a className="sphinx-brand" href="/"><span>𓂀</span> RIDDLE SPHINX</a>
        <div className="nav-links"><a href="#generator">{t.generator}</a><a href="#library">{t.library}</a><div className="language-switch" aria-label={t.language}>
          {(["English", "Español", "Русский"] as Language[]).map((item) => <button key={item} className={language === item ? "active" : ""} onClick={() => setLanguage(item)} aria-label={`Switch to ${item}`}>{item === "English" ? "EN" : item === "Español" ? "ES" : "RU"}</button>)}
        </div><a className="nav-cta" href="/">{t.map}</a></div>
      </nav>

      <section className="generator-section" id="generator">
        <div className="tool-heading">
          <div className="tool-title"><span aria-hidden="true">𓂀</span><div><p className="eyebrow">{t.eyebrow}</p><h1>{t.pageTitle}</h1></div></div>
          <p>{t.intro}</p>
        </div>
        <div className="generator-grid">
          <form className="papyrus-card" onSubmit={generate}>
            <div className="step-title"><span>1</span><div><b>{t.hidden}</b><small>{t.hiddenNote}</small></div></div>
            <label>{t.answer}<input value={answer} onChange={(e) => setAnswer(e.target.value)} required placeholder={language === "Русский" ? "например, книжная полка" : language === "Español" ? "por ejemplo, estantería" : "e.g. bookshelf"} /></label>
            <label>{t.detail}<textarea value={detail} onChange={(e) => setDetail(e.target.value)} placeholder={language === "Русский" ? "например: стоит на кухне, белого цвета, с круглой ручкой" : language === "Español" ? "por ejemplo: está en la cocina, es blanco y tiene un asa redonda" : "e.g. it is in the kitchen, white, with a round handle"} /></label>
            <div className="form-row">
              <label>{t.age}<select value={age} onChange={(e) => setAge(e.target.value)}><option>3–5</option><option>6–8</option><option>9–12</option><option>13+</option></select></label>
              <label>{t.language}<select value={language} onChange={(e) => setLanguage(e.target.value as Language)}><option>English</option><option>Español</option><option>Русский</option></select></label>
            </div>
            <fieldset><legend><span>2</span> {t.style}</legend><div className="choice-grid">
              {formats.map((item) => <button type="button" key={item} className={format === item ? "selected" : ""} onClick={() => setFormat(item)}>{item.includes("Rhyming") && <i>{language === "Русский" ? "РИФМА" : language === "Español" ? "RIMA" : "RHYME"}</i>}<b>{formatLabel(item)}</b><small>{formatNote(item)}</small></button>)}
            </div></fieldset>
            <fieldset><legend><span>3</span> {t.mood}</legend><div className="tone-row">{tones.map((item) => <button type="button" key={item} className={tone === item ? "selected" : ""} onClick={() => setTone(item)}>{toneLabel(item)}</button>)}</div></fieldset>
            <button className="consult-button" type="submit" disabled={generationStatus === "pending"}>✦ {generationStatus === "pending" ? (language === "Русский" ? "Сфинкс размышляет…" : language === "Español" ? "La Esfinge está pensando…" : "The Sphinx is thinking…") : t.consult}</button>
            <p className="prototype-note">{language === "Русский" ? "Тестовый режим: запрос сохраняется в очередь и обрабатывается Codex." : language === "Español" ? "Modo de prueba: la solicitud se guarda en una cola y Codex la procesa." : "Test mode: the request is queued and processed by Codex."}</p>
          </form>

          <aside className="results-card" id="sphinx-results">
            <p className="eyebrow">{t.answers}</p>
            <h3>{results.length ? t.three : t.waiting}</h3>
            {!results.length && <div className="empty-oracle"><span>𓂀</span><p>{generationStatus === "pending" ? (language === "Русский" ? "Запрос в очереди. Обычно ответ появляется в течение минуты." : language === "Español" ? "Solicitud en cola. La respuesta suele aparecer en un minuto." : "Request queued. The answer usually appears within a minute.") : generationError || t.complete}</p></div>}
            {results.map((clue, index) => <article className="clue-result" key={clue}>
              <div><span>{t.variant} {index + 1}</span>{format.includes("Rhyming") && <i>{t.rhymed}</i>}</div>
              <p>{clue}</p>
              <footer><button onClick={() => copy(clue, `result-${index}`)}>{copied === `result-${index}` ? t.copied : t.copy}</button><button onClick={() => save(clue)}>{t.save}</button></footer>
            </article>)}
          </aside>
        </div>
      </section>

      <section className="library-section" id="library">
        <div className="section-heading light"><p className="eyebrow">{t.archive}</p><h2>{t.growing}</h2><p>{t.archiveNote}</p></div>
        <div className="library-tools"><label><span className="sr-only">{t.search}</span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t.search} /></label><select aria-label={t.all} value={formatFilter} onChange={(e) => setFormatFilter(e.target.value)}><option value="All formats">{t.all}</option>{formats.map((item) => <option value={item} key={item}>{formatLabel(item)}</option>)}</select></div>
        <div className="clue-table">
          {filtered.map((item) => <article key={item.id}>
            <div className="clue-main"><span>{formatLabel(item.format)}</span><p>{item.clue}</p></div>
            <div><small>{t.answerHead}</small><b>{item.answer}</b></div>
            <div><small>{t.languageHead}</small><b>{item.language}</b></div>
            <button onClick={() => copy(item.clue, item.id)}>{copied === item.id ? t.copied : t.copy}</button>
          </article>)}
          {!filtered.length && <p className="no-results">{t.empty}</p>}
        </div>
      </section>

      <section className="map-upsell">
        <div><p className="eyebrow">{t.world}</p><h2>{t.mapTitle}</h2><p>{t.mapNote}</p><a className="gold-button" href="/">{t.mapCta} <span>→</span></a></div>
        <div className="map-symbol" aria-hidden="true"><span>✕</span><i>⌁</i><b>◉</b></div>
      </section>
    </main>
  );
}
