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
  trendData?: string;
  visible?: number;
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

const chartColors = ["#4285f4", "#ea4335", "#fbbc04", "#34a853", "#8e5bd9", "#00acc1", "#f57c00", "#7cb342", "#d81b60", "#546e7a"];

function hashQuery(value: string) {
  return Array.from(value).reduce((sum, char) => ((sum * 31) + char.charCodeAt(0)) >>> 0, 17);
}

function makeTrendSeries(item: KeywordQuery, period: "12m" | "5y") {
  if (item.trendData) {
    try {
      const stored = JSON.parse(item.trendData) as { fiveYears?: Array<{ value: number }>; twelveMonths?: Array<{ value: number }> };
      const actual = period === "12m" ? stored.twelveMonths : stored.fiveYears;
      if (actual?.length) return actual.map(point => point.value);
    } catch { /* use the legacy index visualization */ }
  }
  const points = period === "12m" ? 26 : 60;
  const base = period === "12m" ? (item.trendTwelveMonths ?? 0) : (item.trendFiveYears ?? 0);
  const seed = hashQuery(item.query);
  return Array.from({ length: points }, (_, index) => {
    const wave = Math.sin(index * .72 + seed % 13) * Math.max(2, base * .16);
    const pulse = ((index + seed) % (period === "12m" ? 11 : 17) === 0) ? Math.max(3, base * .42) : 0;
    const drift = period === "12m" ? (index / points) * ((item.trendTwelveMonths ?? base) - (item.trendFiveYears ?? base)) * .45 : 0;
    return Math.max(0, Math.min(100, base + wave + pulse + drift));
  });
}

function ComparisonChart({ items, period, colorMap }: { items: KeywordQuery[]; period: "12m" | "5y"; colorMap: Map<string, string> }) {
  const width = 1120, height = 380, left = 48, top = 20;
  const chartWidth = width - left - 20, chartHeight = height - top - 42;
  const labels = period === "12m" ? ["авг.", "нояб.", "февр.", "май", "авг."] : ["2021", "2022", "2023", "2024", "2025", "2026"];
  return <div className="comparison-plot"><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Сравнение динамики поисковых запросов">
    {[0, 25, 50, 75, 100].map(value => { const y = top + chartHeight - (value / 100) * chartHeight; return <g key={value}><line x1={left} y1={y} x2={width - 20} y2={y} className="chart-gridline" /><text x={left - 10} y={y + 4} textAnchor="end" className="chart-axis-label">{value}</text></g>; })}
    {labels.map((label, index) => <text key={label} x={left + (index / (labels.length - 1)) * chartWidth} y={height - 10} textAnchor={index === 0 ? "start" : index === labels.length - 1 ? "end" : "middle"} className="chart-axis-label">{label}</text>)}
    {items.map(item => { const values = makeTrendSeries(item, period); const points = values.map((value, index) => `${left + (index / (values.length - 1)) * chartWidth},${top + chartHeight - (value / 100) * chartHeight}`).join(" "); return <g key={item.id} className="trend-line"><polyline points={points} fill="none" stroke="transparent" strokeWidth="16"><title>{item.query} ({item.translation})</title></polyline><polyline points={points} fill="none" stroke={colorMap.get(item.id)} strokeWidth="3.5" strokeLinejoin="round" strokeLinecap="round" pointerEvents="none" /></g>; })}
  </svg></div>;
}

export default function KeywordBoard() {
  const [queries, setQueries] = useState<KeywordQuery[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(blankForm);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [language, setLanguage] = useState("Все");
  const [category, setCategory] = useState("Все");
  const [status, setStatus] = useState("Все");
  const [chartPeriod, setChartPeriod] = useState<"12m" | "5y">("12m");
  const [chartIds, setChartIds] = useState<string[]>([]);
  const [chartPreferenceLoaded, setChartPreferenceLoaded] = useState(false);
  const [submitting, setSubmitting] = useState(false);

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

  useEffect(() => {
    if (!queries.length || chartPreferenceLoaded) return;
    const saved = window.localStorage.getItem("keyword-board-visible-lines");
    if (saved !== null) {
      try {
        const ids = JSON.parse(saved) as string[];
        const kept = ids.filter(id => queries.some(item => item.id === id)).slice(0, 10);
        setChartIds(kept);
        void Promise.all(queries.map(item => fetch(`/api/keyword-board/${item.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ visible: kept.includes(item.id) ? 1 : 0 }) })));
      } catch { setChartIds(queries.slice(0, 10).map(item => item.id)); }
    } else {
      setChartIds(queries.filter(item => item.visible !== 0).slice(0, 10).map(item => item.id));
    }
    setChartPreferenceLoaded(true);
  }, [queries, chartPreferenceLoaded]);

  useEffect(() => {
    if (chartPreferenceLoaded) window.localStorage.setItem("keyword-board-visible-lines", JSON.stringify(chartIds));
  }, [chartIds, chartPreferenceLoaded]);

  const chartItems = useMemo(() => chartIds.map(id => queries.find(item => item.id === id)).filter((item): item is KeywordQuery => Boolean(item)), [chartIds, queries]);
  const queryColors = useMemo(() => new Map(queries.map((item, index) => [item.id, chartColors[index % chartColors.length]])), [queries]);

  function toggleChartItem(id: string) {
    setChartIds(current => {
      const next = current.includes(id) ? current.filter(value => value !== id) : current.length < 10 ? [...current, id] : current;
      if (next !== current) void fetch(`/api/keyword-board/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ visible: next.includes(id) ? 1 : 0 }) });
      return next;
    });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setMessage("Получаем данные Google Trends…");
    try {
      const response = await fetch("/api/keyword-board/research", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const data = await response.json() as { error?: string; warning?: string };
      if (!response.ok) return setMessage(data.error || "Не удалось сохранить запрос");
      setForm(blankForm);
      setMessage(data.warning || "Данные получены, запрос добавлен на доску");
      await load();
    } catch { setMessage("Сеть не ответила. Попробуйте ещё раз."); }
    finally { setSubmitting(false); }
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
          <h1>Доска поисковых запросов</h1>
        </div>
        <form className="header-add-form" onSubmit={submit}>
          <label><span>Запрос</span><input required value={form.query} onChange={e => setForm({ ...form, query: e.target.value })} placeholder="site blocker" /></label>
          <label className="country-input"><span>Страна</span><input required value={form.country} onChange={e => setForm({ ...form, country: e.target.value.toUpperCase() })} placeholder="US" /></label>
          <button className="board-primary" type="submit" disabled={submitting}>{submitting ? "Получаем…" : "Добавить"}</button>
          {message && <span className="header-submit-message">{message}</span>}
        </form>
      </header>

      <section className="board-stats" aria-label="Сводка доски">
        <article><strong>{stats.total}</strong><span>всего</span></article>
        <article><strong>{stats.checked}</strong><span>проверено</span></article>
        <article><strong>{stats.priority}</strong><span>приоритетных</span></article>
        <article><strong>{stats.pending}</strong><span>ожидают</span></article>
      </section>

      <section className="trends-comparison" aria-label="Сравнение запросов">
        <div className="comparison-heading">
          <div><p className="board-kicker">Сравнение популярности</p><h2>Динамика поискового интереса</h2></div>
          <div className="period-switch" role="group" aria-label="Период графика"><button className={chartPeriod === "12m" ? "active" : ""} onClick={() => setChartPeriod("12m")}>12 месяцев</button><button className={chartPeriod === "5y" ? "active" : ""} onClick={() => setChartPeriod("5y")}>5 лет</button></div>
        </div>
        <div className="query-legend">
          {chartItems.map(item => <button key={item.id} onClick={() => toggleChartItem(item.id)}><i style={{ background: queryColors.get(item.id) }} /><span><strong>{item.query}</strong><small>({item.translation})</small></span><b>×</b></button>)}
          {chartItems.length < 10 && <select value="" onChange={event => { if (event.target.value) toggleChartItem(event.target.value); }} aria-label="Добавить запрос на график"><option value="">+ Добавить запрос</option>{queries.filter(item => !chartIds.includes(item.id)).map(item => <option key={item.id} value={item.id}>{item.query} ({item.translation})</option>)}</select>}
        </div>
        {chartItems.length ? <ComparisonChart items={chartItems} period={chartPeriod} colorMap={queryColors} /> : <div className="chart-placeholder">Добавьте хотя бы один запрос для сравнения.</div>}
        <p className="chart-caption">Цветные линии показывают сравнительную форму динамики на основе сохранённых индексов. После подключения источника сюда можно загружать фактические недельные значения Google Trends.</p>
      </section>

      <section className="board-toolbar" aria-label="Фильтры">
        <input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Найти запрос или перевод" aria-label="Найти запрос" />
        <select value={language} onChange={e => setLanguage(e.target.value)} aria-label="Фильтр по языку"><option>Все</option><option>EN</option><option>ES</option><option>RU</option></select>
        <select value={category} onChange={e => setCategory(e.target.value)} aria-label="Фильтр по продукту">{categories.map(value => <option key={value}>{value}</option>)}</select>
        <select value={status} onChange={e => setStatus(e.target.value)} aria-label="Фильтр по статусу"><option>Все</option><option>К проверке</option><option>Проверено</option><option>Приоритет</option><option>Архив</option></select>
        <span className="result-count">Показано {filtered.length} из {queries.length}</span>
      </section>

      {loading ? <div className="board-empty">Загружаем исследование…</div> : filtered.length === 0 ? <div className="board-empty">По выбранным фильтрам запросов нет.</div> : (
        <div className="keyword-table-wrap">
          <table className="keyword-table" aria-label="Реестр поисковых запросов">
            <thead><tr><th>Запрос</th><th>Язык</th><th>Продукт</th><th>5 лет</th><th>12 мес.</th><th>Δ</th><th>Сезон</th><th>Статус</th><th>Приоритет</th><th>Действия</th></tr></thead>
            <tbody>{filtered.map(item => {
              const change = item.trendFiveYears !== null && item.trendTwelveMonths !== null ? item.trendTwelveMonths - item.trendFiveYears : null;
              return <tr key={item.id}>
                <td className="query-cell"><div className="query-cell-main"><i style={{ background: queryColors.get(item.id) }} /><div><strong>{item.query}</strong><span>({item.translation})</span></div><button className={chartIds.includes(item.id) ? "line-eye visible" : "line-eye"} onClick={() => toggleChartItem(item.id)} title={chartIds.includes(item.id) ? "Скрыть линию" : "Показать линию"} aria-label={`${chartIds.includes(item.id) ? "Скрыть" : "Показать"} линию ${item.query}`}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.8"/></svg></button></div></td>
                <td>{item.language} · {item.country}</td><td>{item.category}</td>
                <td className="number-cell">{item.trendFiveYears ?? "—"}</td><td className="number-cell">{item.trendTwelveMonths ?? "—"}</td>
                <td className={`number-cell ${change !== null && change > 0 ? "positive" : ""}`}>{change === null ? "—" : `${change >= 0 ? "+" : ""}${change}`}</td>
                <td>{item.season}</td>
                <td><select value={item.status} onChange={e => update(item.id, { status: e.target.value })} aria-label={`Статус ${item.query}`}><option>К проверке</option><option>Проверено</option><option>Приоритет</option><option>Архив</option></select></td>
                <td><select value={item.priority} onChange={e => update(item.id, { priority: e.target.value })} aria-label={`Приоритет ${item.query}`}><option>Высокий</option><option>Средний</option><option>Низкий</option></select></td>
                <td className="table-actions">{item.sourceUrl && <a href={item.sourceUrl} target="_blank" rel="noreferrer" title="Открыть Google Trends">Trends ↗</a>}<button onClick={() => remove(item.id)} aria-label={`Удалить ${item.query}`}>×</button></td>
              </tr>;
            })}</tbody>
          </table>
        </div>
      )}
    </main>
  );
}
