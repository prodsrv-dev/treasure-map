"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type KeywordQuery = {
  id: string;
  query: string;
  translation: string;
  language: string;
  country: string;
  category: string;
  intent: string;
  trendFiveYears: number | null;
  trendTwelveMonths: number | null;
  season: string;
  status: string;
  priority: string;
  notes: string;
  sourceUrl: string;
};

const initialKeywords = [
  ["scavenger hunt for kids", "поисковый квест для детей", "Общий спрос", "Информационный", 36, 44, "Круглый год", "Высокий"],
  ["scavenger hunt clues", "подсказки для поискового квеста", "Карточки", "Информационный", 16, 18, "Пасха и Рождество", "Высокий"],
  ["printable scavenger hunt", "печатный поисковый квест", "Карточки", "Коммерческий", 10, 17, "Круглый год", "Высокий"],
  ["birthday scavenger hunt", "поисковый квест ко дню рождения", "День рождения", "Коммерческий", 6, 8, "Круглый год", "Высокий"],
  ["christmas scavenger hunt", "рождественский поисковый квест", "Сезонный набор", "Коммерческий", 5, 6, "Ноябрь–декабрь", "Высокий"],
  ["easter scavenger hunt", "пасхальный поисковый квест", "Сезонный набор", "Коммерческий", 3, 4, "Февраль–апрель", "Высокий"],
  ["outdoor scavenger hunt", "уличный поисковый квест", "Карточки", "Смешанный", 3, 4, "Весна–лето", "Средний"],
  ["indoor scavenger hunt", "домашний поисковый квест", "Карточки", "Смешанный", 2, 2, "Круглый год", "Средний"],
  ["personalized treasure hunt", "персонализированный квест по поиску сокровищ", "Персональный комплект", "Коммерческий", 0, 0, "Круглый год", "Низкий"],
  ["custom treasure map", "индивидуальная карта сокровищ", "Персональная карта", "Коммерческий", null, null, "Круглый год", "Средний"],
] as const;

const blankForm = {
  query: "", translation: "", language: "EN", country: "US", category: "Карточки",
  intent: "Коммерческий", trendFiveYears: "", trendTwelveMonths: "", season: "Круглый год",
  status: "К проверке", priority: "Средний", notes: "", sourceUrl: "",
};

export default function KeywordBoard() {
  const [queries, setQueries] = useState<KeywordQuery[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(blankForm);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [language, setLanguage] = useState("Все");
  const [category, setCategory] = useState("Все");
  const [status, setStatus] = useState("Все");

  const load = useCallback(async () => {
    const response = await fetch("/api/keyword-board", { cache: "no-store" });
    if (!response.ok) throw new Error("Не удалось загрузить доску");
    const data = await response.json() as { queries: KeywordQuery[] };
    setQueries(data.queries);
    return data.queries;
  }, []);

  const addSeedData = useCallback(async () => {
    await Promise.all(initialKeywords.map(([query, translation, categoryName, intent, five, twelve, seasonName, priority]) =>
      fetch("/api/keyword-board", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query, translation, language: "EN", country: "US", category: categoryName, intent,
          trendFiveYears: five, trendTwelveMonths: twelve, season: seasonName,
          status: five === null ? "К проверке" : "Проверено", priority,
          notes: "Стартовая семантика исследования, август 2026",
          sourceUrl: `https://trends.google.com/trends/explore?geo=US&q=${encodeURIComponent(query)}`,
        }),
      })
    ));
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const rows = await load();
        if (alive && rows.length === 0) {
          await addSeedData();
          await load();
        }
      } catch {
        if (alive) setMessage("Доска временно недоступна. Обновите страницу.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [addSeedData, load]);

  const categories = useMemo(() => ["Все", ...Array.from(new Set(queries.map(item => item.category)))], [queries]);
  const filtered = useMemo(() => queries.filter(item => {
    const needle = search.trim().toLowerCase();
    return (language === "Все" || item.language === language)
      && (category === "Все" || item.category === category)
      && (status === "Все" || item.status === status)
      && (!needle || `${item.query} ${item.translation} ${item.notes}`.toLowerCase().includes(needle));
  }), [queries, search, language, category, status]);

  const stats = useMemo(() => ({
    total: queries.length,
    checked: queries.filter(item => item.status === "Проверено").length,
    priority: queries.filter(item => item.priority === "Высокий").length,
    pending: queries.filter(item => item.status === "К проверке").length,
  }), [queries]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    const response = await fetch("/api/keyword-board", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
    });
    const data = await response.json() as { error?: string };
    if (!response.ok) return setMessage(data.error || "Не удалось сохранить запрос");
    setForm(blankForm);
    setFormOpen(false);
    setMessage("Запрос добавлен на доску");
    await load();
  }

  async function update(id: string, changes: Partial<KeywordQuery>) {
    setQueries(current => current.map(item => item.id === id ? { ...item, ...changes } : item));
    const response = await fetch(`/api/keyword-board/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(changes),
    });
    if (!response.ok) { setMessage("Изменение не сохранилось"); await load(); }
  }

  async function remove(id: string) {
    await fetch(`/api/keyword-board/${id}`, { method: "DELETE" });
    setQueries(current => current.filter(item => item.id !== id));
  }

  return (
    <main className="keyword-board-shell">
      <header className="keyword-board-header">
        <div>
          <a href="/" className="board-brand">TREASURE MAP / RESEARCH</a>
          <p className="board-kicker">Семантическое исследование</p>
          <h1>Доска поисковых запросов</h1>
          <p className="board-lead">Проверяем спрос, фиксируем перевод, сезонность и коммерческий потенциал каждого запроса.</p>
        </div>
        <button className="board-primary" onClick={() => setFormOpen(value => !value)}>
          {formOpen ? "Закрыть форму" : "+ Добавить запрос"}
        </button>
      </header>

      <section className="board-stats" aria-label="Сводка доски">
        <article><strong>{stats.total}</strong><span>всего запросов</span></article>
        <article><strong>{stats.checked}</strong><span>проверено</span></article>
        <article><strong>{stats.priority}</strong><span>высокий приоритет</span></article>
        <article><strong>{stats.pending}</strong><span>ждут проверки</span></article>
      </section>

      {formOpen && (
        <form className="keyword-form" onSubmit={submit}>
          <div className="form-heading"><div><span>НОВАЯ КАРТОЧКА</span><h2>Добавить поисковый запрос</h2></div><p>Английский запрос обязательно сопровождаем русским переводом.</p></div>
          <label className="wide"><span>Запрос</span><input required value={form.query} onChange={e => setForm({ ...form, query: e.target.value })} placeholder="birthday scavenger hunt" /></label>
          <label className="wide"><span>Перевод</span><input required value={form.translation} onChange={e => setForm({ ...form, translation: e.target.value })} placeholder="поисковый квест ко дню рождения" /></label>
          <label><span>Язык</span><select value={form.language} onChange={e => setForm({ ...form, language: e.target.value })}><option>EN</option><option>ES</option><option>RU</option></select></label>
          <label><span>Страна</span><input value={form.country} onChange={e => setForm({ ...form, country: e.target.value.toUpperCase() })} /></label>
          <label><span>Тип продукта</span><select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}><option>Карточки</option><option>День рождения</option><option>Сезонный набор</option><option>Персональный комплект</option><option>Персональная карта</option><option>Общий спрос</option></select></label>
          <label><span>Намерение</span><select value={form.intent} onChange={e => setForm({ ...form, intent: e.target.value })}><option>Коммерческий</option><option>Информационный</option><option>Смешанный</option></select></label>
          <label><span>Индекс за 5 лет</span><input type="number" min="0" max="100" value={form.trendFiveYears} onChange={e => setForm({ ...form, trendFiveYears: e.target.value })} /></label>
          <label><span>Индекс за 12 месяцев</span><input type="number" min="0" max="100" value={form.trendTwelveMonths} onChange={e => setForm({ ...form, trendTwelveMonths: e.target.value })} /></label>
          <label><span>Сезонность</span><input value={form.season} onChange={e => setForm({ ...form, season: e.target.value })} /></label>
          <label><span>Приоритет</span><select value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })}><option>Высокий</option><option>Средний</option><option>Низкий</option></select></label>
          <label className="wide"><span>Ссылка Google Trends</span><input type="url" value={form.sourceUrl} onChange={e => setForm({ ...form, sourceUrl: e.target.value })} placeholder="https://trends.google.com/..." /></label>
          <label className="wide"><span>Заметки</span><textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Что показывает график, конкуренция, гипотеза страницы…" /></label>
          <div className="wide form-actions"><button type="submit">Сохранить на доску</button><span>{message}</span></div>
        </form>
      )}

      <section className="board-toolbar" aria-label="Фильтры">
        <input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Найти запрос или перевод" aria-label="Найти запрос" />
        <select value={language} onChange={e => setLanguage(e.target.value)} aria-label="Фильтр по языку"><option>Все</option><option>EN</option><option>ES</option><option>RU</option></select>
        <select value={category} onChange={e => setCategory(e.target.value)} aria-label="Фильтр по продукту">{categories.map(value => <option key={value}>{value}</option>)}</select>
        <select value={status} onChange={e => setStatus(e.target.value)} aria-label="Фильтр по статусу"><option>Все</option><option>К проверке</option><option>Проверено</option><option>Приоритет</option><option>Архив</option></select>
        <span className="result-count">Показано {filtered.length} из {queries.length}</span>
      </section>

      {message && !formOpen && <p className="board-message">{message}</p>}
      {loading ? <div className="board-empty">Загружаем исследование…</div> : filtered.length === 0 ? <div className="board-empty">По выбранным фильтрам запросов нет.</div> : (
        <section className="keyword-grid" aria-label="Карточки поисковых запросов">
          {filtered.map(item => (
            <article className={`keyword-card priority-${item.priority.toLowerCase()}`} key={item.id}>
              <div className="card-topline"><span>{item.language} · {item.country}</span><span>{item.category}</span></div>
              <h2>{item.query}</h2>
              <p className="translation">({item.translation})</p>
              <div className="trend-pair">
                <div><span>5 лет</span><strong>{item.trendFiveYears ?? "—"}</strong></div>
                <div><span>12 мес.</span><strong>{item.trendTwelveMonths ?? "—"}</strong></div>
                <div className="trend-change"><span>Изменение</span><strong>{item.trendFiveYears !== null && item.trendTwelveMonths !== null ? `${item.trendTwelveMonths - item.trendFiveYears >= 0 ? "+" : ""}${item.trendTwelveMonths - item.trendFiveYears}` : "—"}</strong></div>
              </div>
              <dl><div><dt>Намерение</dt><dd>{item.intent}</dd></div><div><dt>Сезон</dt><dd>{item.season}</dd></div></dl>
              {item.notes && <p className="card-notes">{item.notes}</p>}
              <div className="card-controls">
                <select value={item.status} onChange={e => update(item.id, { status: e.target.value })} aria-label={`Статус ${item.query}`}><option>К проверке</option><option>Проверено</option><option>Приоритет</option><option>Архив</option></select>
                <select value={item.priority} onChange={e => update(item.id, { priority: e.target.value })} aria-label={`Приоритет ${item.query}`}><option>Высокий</option><option>Средний</option><option>Низкий</option></select>
              </div>
              <div className="card-actions">
                {item.sourceUrl ? <a href={item.sourceUrl} target="_blank" rel="noreferrer">Открыть Trends ↗</a> : <span>Ссылка не добавлена</span>}
                <button onClick={() => remove(item.id)} aria-label={`Удалить ${item.query}`}>Удалить</button>
              </div>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}
