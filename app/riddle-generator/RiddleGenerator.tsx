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
  const [answer, setAnswer] = useState("bookshelf");
  const [detail, setDetail] = useState("your favorite dragon story lives there");
  const [age, setAge] = useState("6–8");
  const [language, setLanguage] = useState<Language>("English");
  const [format, setFormat] = useState<Format>("Rhyming couplet");
  const [tone, setTone] = useState<Tone>("Mysterious");
  const [results, setResults] = useState<string[]>([]);
  const [records, setRecords] = useState<RecordItem[]>(starters);
  const [query, setQuery] = useState("");
  const [formatFilter, setFormatFilter] = useState("All formats");
  const [copied, setCopied] = useState("");

  useEffect(() => {
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      try { setRecords(JSON.parse(saved)); } catch { /* keep samples */ }
    }
  }, []);

  const filtered = useMemo(() => records.filter((item) => {
    const matchText = `${item.clue} ${item.answer} ${item.detail}`.toLowerCase().includes(query.toLowerCase());
    return matchText && (formatFilter === "All formats" || item.format === formatFilter);
  }), [records, query, formatFilter]);

  function generate(event: FormEvent) {
    event.preventDefault();
    setResults(buildClues(answer, detail, format, language));
    document.querySelector("#sphinx-results")?.scrollIntoView({ behavior: "smooth", block: "start" });
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
        <div><a href="#generator">Generator</a><a href="#library">Clue library</a><a className="nav-cta" href="/">Build a treasure map</a></div>
      </nav>

      <header className="sphinx-hero">
        <div className="hero-copy">
          <p className="eyebrow">THE ANCIENT KEEPER OF CLEVER CLUES</p>
          <h1>Turn any hiding place into a <em>riddle.</em></h1>
          <p className="hero-lede">Create child-friendly scavenger hunt clues in seconds. Choose a simple hint, a mystery, a rhyming couplet, or a full poem.</p>
          <a className="gold-button" href="#generator">Ask the Sphinx <span>↓</span></a>
          <p className="hero-note">Free to use · English, Spanish & Russian · Saved in your browser</p>
        </div>
        <div className="hero-art" role="img" aria-label="A wise Sphinx beneath the moon">
          <img src="/riddle-sphinx-hero.png" alt="A wise golden Sphinx guarding riddles beneath a moonlit sky" />
        </div>
      </header>

      <section className="generator-section" id="generator">
        <div className="section-heading">
          <p className="eyebrow">ENTER THE CHAMBER</p>
          <h2>What must the seeker find?</h2>
          <p>Give the Sphinx a few details. The more personal the clue, the more magical the hunt feels.</p>
        </div>
        <div className="generator-grid">
          <form className="papyrus-card" onSubmit={generate}>
            <div className="step-title"><span>1</span><div><b>The hidden answer</b><small>What place or object should the player find?</small></div></div>
            <label>Answer or hiding place<input value={answer} onChange={(e) => setAnswer(e.target.value)} required placeholder="e.g. bookshelf" /></label>
            <label>A personal detail<textarea value={detail} onChange={(e) => setDetail(e.target.value)} placeholder="e.g. your favorite dragon story lives there" /></label>
            <div className="form-row">
              <label>Child&apos;s age<select value={age} onChange={(e) => setAge(e.target.value)}><option>3–5</option><option>6–8</option><option>9–12</option><option>13+</option></select></label>
              <label>Language<select value={language} onChange={(e) => setLanguage(e.target.value as Language)}><option>English</option><option>Español</option><option>Русский</option></select></label>
            </div>
            <fieldset><legend><span>2</span> Choose a clue style</legend><div className="choice-grid">
              {formats.map((item) => <button type="button" key={item} className={format === item ? "selected" : ""} onClick={() => setFormat(item)}>{item.includes("Rhyming") && <i>RHYME</i>}<b>{item}</b><small>{item === "Rhyming poem" ? "Four musical lines" : item === "Rhyming couplet" ? "Two lines that rhyme" : item === "Riddle" ? "A question to solve" : "Clear and quick"}</small></button>)}
            </div></fieldset>
            <fieldset><legend><span>3</span> Pick the mood</legend><div className="tone-row">{tones.map((item) => <button type="button" key={item} className={tone === item ? "selected" : ""} onClick={() => setTone(item)}>{item}</button>)}</div></fieldset>
            <button className="consult-button" type="submit">✦ Consult the Sphinx</button>
            <p className="prototype-note">Working page prototype: clues are created on-device; a live AI model can be connected to the same interface next.</p>
          </form>

          <aside className="results-card" id="sphinx-results">
            <p className="eyebrow">THE SPHINX ANSWERS</p>
            <h3>{results.length ? "Three clues for your quest" : "Your clues will appear here"}</h3>
            {!results.length && <div className="empty-oracle"><span>𓂀</span><p>Complete the scroll and consult the Sphinx.</p></div>}
            {results.map((clue, index) => <article className="clue-result" key={clue}>
              <div><span>VARIANT {index + 1}</span>{format.includes("Rhyming") && <i>RHYMED</i>}</div>
              <p>{clue}</p>
              <footer><button onClick={() => copy(clue, `result-${index}`)}>{copied === `result-${index}` ? "Copied!" : "Copy"}</button><button onClick={() => save(clue)}>Save to library</button></footer>
            </article>)}
          </aside>
        </div>
      </section>

      <section className="library-section" id="library">
        <div className="section-heading light"><p className="eyebrow">THE ARCHIVE OF ANSWERS</p><h2>Your growing clue library</h2><p>Every saved clue becomes reusable content for future hunts.</p></div>
        <div className="library-tools"><label><span className="sr-only">Search clues</span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search clues, answers, or details…" /></label><select aria-label="Filter by format" value={formatFilter} onChange={(e) => setFormatFilter(e.target.value)}><option>All formats</option>{formats.map((item) => <option key={item}>{item}</option>)}</select></div>
        <div className="clue-table">
          {filtered.map((item) => <article key={item.id}>
            <div className="clue-main"><span>{item.format}</span><p>{item.clue}</p></div>
            <div><small>ANSWER</small><b>{item.answer}</b></div>
            <div><small>LANGUAGE</small><b>{item.language}</b></div>
            <button onClick={() => copy(item.clue, item.id)}>{copied === item.id ? "Copied!" : "Copy"}</button>
          </article>)}
          {!filtered.length && <p className="no-results">No clues match these filters.</p>}
        </div>
      </section>

      <section className="map-upsell">
        <div><p className="eyebrow">A RIDDLE NEEDS A WORLD</p><h2>Turn your clues into a treasure map.</h2><p>Place every challenge on a beautiful printable adventure map and make the birthday quest unforgettable.</p><a className="gold-button" href="/">Create the full treasure map <span>→</span></a></div>
        <div className="map-symbol" aria-hidden="true"><span>✕</span><i>⌁</i><b>◉</b></div>
      </section>
    </main>
  );
}
