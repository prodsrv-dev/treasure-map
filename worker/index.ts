/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

const createJobsTable = `CREATE TABLE IF NOT EXISTS riddle_jobs (
  id TEXT PRIMARY KEY NOT NULL,
  answer TEXT NOT NULL,
  properties TEXT NOT NULL,
  age TEXT NOT NULL,
  language TEXT NOT NULL,
  format TEXT NOT NULL,
  tone TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  result TEXT,
  error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
)`;

const createKeywordQueriesTable = `CREATE TABLE IF NOT EXISTS keyword_queries (
  id TEXT PRIMARY KEY NOT NULL,
  query TEXT NOT NULL,
  translation TEXT NOT NULL,
  language TEXT NOT NULL,
  country TEXT NOT NULL,
  category TEXT NOT NULL,
  intent TEXT NOT NULL,
  trend_five_years INTEGER,
  trend_twelve_months INTEGER,
  season TEXT NOT NULL DEFAULT 'Круглый год',
  status TEXT NOT NULL DEFAULT 'К проверке',
  priority TEXT NOT NULL DEFAULT 'Средний',
  notes TEXT NOT NULL DEFAULT '',
  source_url TEXT NOT NULL DEFAULT '',
  trend_data TEXT NOT NULL DEFAULT '',
  visible INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
)`;

async function ensureJobsTable(db: D1Database) {
  await db.prepare(createJobsTable).run();
  await db.prepare("CREATE INDEX IF NOT EXISTS riddle_jobs_status_created_idx ON riddle_jobs (status, created_at)").run();
}

async function ensureKeywordQueriesTable(db: D1Database) {
  await db.batch([
    db.prepare(createKeywordQueriesTable),
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS keyword_queries_scope_idx ON keyword_queries (query, language, country)"),
    db.prepare("CREATE INDEX IF NOT EXISTS keyword_queries_status_priority_idx ON keyword_queries (status, priority)"),
    db.prepare("CREATE INDEX IF NOT EXISTS keyword_queries_category_idx ON keyword_queries (category)"),
  ]);
  try { await db.prepare("ALTER TABLE keyword_queries ADD COLUMN trend_data TEXT NOT NULL DEFAULT ''").run(); } catch { /* already added */ }
  try { await db.prepare("ALTER TABLE keyword_queries ADD COLUMN visible INTEGER NOT NULL DEFAULT 1").run(); } catch { /* already added */ }
}

async function fetchTrendSeries(query: string, country: string, time: string) {
  const req = { comparisonItem: [{ keyword: query, geo: country, time }], category: 0, property: "" };
  const exploreUrl = `https://trends.google.com/trends/api/explore?hl=en-US&tz=0&req=${encodeURIComponent(JSON.stringify(req))}`;
  const exploreResponse = await fetch(exploreUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!exploreResponse.ok) throw new Error("Google Trends did not return comparison data");
  const explore = JSON.parse((await exploreResponse.text()).replace(/^\)\]\}',?\s*/, ""));
  const widget = explore.widgets?.find((item: { id?: string }) => item.id === "TIMESERIES");
  if (!widget) throw new Error("Google Trends timeline is unavailable");
  const dataUrl = `https://trends.google.com/trends/api/widgetdata/multiline?hl=en-US&tz=0&req=${encodeURIComponent(JSON.stringify(widget.request))}&token=${encodeURIComponent(widget.token)}`;
  const dataResponse = await fetch(dataUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!dataResponse.ok) throw new Error("Google Trends did not return timeline values");
  const data = JSON.parse((await dataResponse.text()).replace(/^\)\]\}',?\s*/, ""));
  return (data.default?.timelineData || []).map((point: { time: string; value: number[]; formattedTime?: string }) => ({ time: Number(point.time), value: Number(point.value?.[0] || 0), label: point.formattedTime || "" }));
}

async function translateToRussian(query: string) {
  try {
    const response = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=ru&dt=t&q=${encodeURIComponent(query)}`);
    const data = await response.json() as unknown[][];
    const chunks = Array.isArray(data[0]) ? (data[0] as unknown[][]).map(part => String(part[0] || "")).join("") : query;
    return { translation: chunks || query, language: String(data[2] || "EN").toUpperCase() };
  } catch { return { translation: query, language: "EN" }; }
}

function averageTrend(points: Array<{ value: number }>) {
  return points.length ? Math.round(points.reduce((sum, point) => sum + point.value, 0) / points.length) : 0;
}

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

function isLocalRequest(url: URL) {
  return url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "::1";
}

async function handleRiddleQueue(request: Request, env: Env, url: URL) {
  if (!env.DB) return json({ error: "Database is unavailable" }, 503);
  await ensureJobsTable(env.DB);

  if (url.pathname === "/api/riddle-jobs" && request.method === "POST") {
    const body = await request.json<Record<string, string>>();
    if (!body.answer?.trim() || !body.properties?.trim()) return json({ error: "Answer and object properties are required" }, 400);
    const id = crypto.randomUUID();
    const now = Date.now();
    await env.DB.prepare(`INSERT INTO riddle_jobs
      (id, answer, properties, age, language, format, tone, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`)
      .bind(id, body.answer.trim(), body.properties.trim(), body.age || "", body.language || "Русский", body.format || "Riddle", body.tone || "Mysterious", now, now).run();
    return json({ id, status: "pending" }, 202);
  }

  if (url.pathname === "/api/riddle-jobs/latest" && request.method === "GET") {
    const job = await env.DB.prepare(`SELECT id, status, result, error
      FROM riddle_jobs WHERE status IN ('completed', 'pending')
      ORDER BY created_at DESC LIMIT 1`).first();
    return job ? json(job) : json({ status: "empty" });
  }

  if (url.pathname.startsWith("/api/riddle-jobs/") && request.method === "GET") {
    const id = url.pathname.split("/").pop();
    const job = await env.DB.prepare("SELECT id, status, result, error FROM riddle_jobs WHERE id = ?").bind(id).first();
    return job ? json(job) : json({ error: "Job not found" }, 404);
  }

  // The Codex queue worker is deliberately local-only during the prototype.
  if (url.pathname === "/api/riddle-worker/pending" && request.method === "GET") {
    if (!isLocalRequest(url)) return json({ error: "Local prototype worker only" }, 403);
    const rows = await env.DB.prepare(`SELECT id, answer, properties, age, language, format, tone
      FROM riddle_jobs WHERE status = 'pending' ORDER BY created_at ASC LIMIT 3`).all();
    return json({ jobs: rows.results });
  }

  if (url.pathname.startsWith("/api/riddle-worker/jobs/") && request.method === "PATCH") {
    if (!isLocalRequest(url)) return json({ error: "Local prototype worker only" }, 403);
    const id = url.pathname.split("/").pop();
    const body = await request.json<{ results?: string[]; error?: string }>();
    const status = body.error ? "failed" : "completed";
    await env.DB.prepare("UPDATE riddle_jobs SET status = ?, result = ?, error = ?, updated_at = ? WHERE id = ?")
      .bind(status, body.results ? JSON.stringify(body.results) : null, body.error || null, Date.now(), id).run();
    return json({ id, status });
  }

  return null;
}

async function handleKeywordBoard(request: Request, env: Env, url: URL) {
  if (!env.DB) return json({ error: "Database is unavailable" }, 503);
  await ensureKeywordQueriesTable(env.DB);

  if (url.pathname === "/api/keyword-board" && request.method === "GET") {
    const rows = await env.DB.prepare(`SELECT id, query, translation, language, country, category, intent,
      trend_five_years AS trendFiveYears, trend_twelve_months AS trendTwelveMonths, season, status,
      priority, notes, source_url AS sourceUrl, trend_data AS trendData, visible, created_at AS createdAt, updated_at AS updatedAt
      FROM keyword_queries ORDER BY
      CASE priority WHEN 'Высокий' THEN 1 WHEN 'Средний' THEN 2 ELSE 3 END,
      COALESCE(trend_twelve_months, -1) DESC, created_at DESC`).all();
    return json({ queries: rows.results });
  }

  if (url.pathname === "/api/keyword-board/research" && request.method === "POST") {
    const body = await request.json<{ query?: string; country?: string }>();
    const query = String(body.query || "").trim();
    const country = String(body.country || "US").trim().toUpperCase();
    if (!query) return json({ error: "Укажите поисковый запрос" }, 400);
    try {
      const [fiveYears, twelveMonths, translated] = await Promise.all([
        fetchTrendSeries(query, country, "today 5-y"), fetchTrendSeries(query, country, "today 12-m"), translateToRussian(query),
      ]);
      const lower = query.toLowerCase();
      const category = lower.includes("birthday") ? "День рождения" : lower.includes("christmas") || lower.includes("easter") ? "Сезонный набор" : lower.includes("map") ? "Персональная карта" : lower.includes("print") || lower.includes("clue") ? "Карточки" : "Общий спрос";
      const season = lower.includes("christmas") ? "Ноябрь–декабрь" : lower.includes("easter") ? "Февраль–апрель" : "Круглый год";
      const indexFive = averageTrend(fiveYears), indexTwelve = averageTrend(twelveMonths);
      const priority = indexTwelve >= 15 ? "Высокий" : indexTwelve >= 3 ? "Средний" : "Низкий";
      const id = crypto.randomUUID(), now = Date.now();
      const sourceUrl = `https://trends.google.com/trends/explore?date=today%205-y&geo=${encodeURIComponent(country)}&q=${encodeURIComponent(query)}`;
      await env.DB.prepare(`INSERT INTO keyword_queries
        (id, query, translation, language, country, category, intent, trend_five_years, trend_twelve_months, season, status, priority, notes, source_url, trend_data, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(id, query, translated.translation, translated.language, country, category, "Автоматически", indexFive, indexTwelve, season, "Проверено", priority, "Данные загружены автоматически из Google Trends", sourceUrl, JSON.stringify({ fiveYears, twelveMonths }), now, now).run();
      return json({ id }, 201);
    } catch (error) {
      try {
        const translated = await translateToRussian(query);
        const id = crypto.randomUUID(), now = Date.now();
        const sourceUrl = `https://trends.google.com/trends/explore?date=today%205-y&geo=${encodeURIComponent(country)}&q=${encodeURIComponent(query)}`;
        await env.DB.prepare(`INSERT INTO keyword_queries
          (id, query, translation, language, country, category, intent, trend_five_years, trend_twelve_months, season, status, priority, notes, source_url, trend_data, visible, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, 'Общий спрос', 'Автоматически', NULL, NULL, 'Круглый год', 'К проверке', 'Средний', ?, ?, '', 1, ?, ?)`)
          .bind(id, query, translated.translation, translated.language, country, `Запрос сохранён; Google Trends временно не вернул данные: ${error instanceof Error ? error.message : "ошибка источника"}`, sourceUrl, now, now).run();
        return json({ id, warning: "Запрос добавлен без графика: Google Trends заблокировал автоматическую выгрузку. Данные требуют ручного снятия." }, 202);
      } catch { return json({ error: "Запрос уже существует или база временно недоступна" }, 409); }
    }
  }

  if (url.pathname === "/api/keyword-board" && request.method === "POST") {
    const body = await request.json<Record<string, unknown>>();
    const query = String(body.query || "").trim();
    const translation = String(body.translation || "").trim();
    if (!query || !translation) return json({ error: "Query and translation are required" }, 400);
    const id = crypto.randomUUID();
    const now = Date.now();
    try {
      await env.DB.prepare(`INSERT INTO keyword_queries
        (id, query, translation, language, country, category, intent, trend_five_years,
         trend_twelve_months, season, status, priority, notes, source_url, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
          id, query, translation, String(body.language || "EN"), String(body.country || "US"),
          String(body.category || "Карточки"), String(body.intent || "Информационный"),
          body.trendFiveYears === null || body.trendFiveYears === "" ? null : Number(body.trendFiveYears),
          body.trendTwelveMonths === null || body.trendTwelveMonths === "" ? null : Number(body.trendTwelveMonths),
          String(body.season || "Круглый год"), String(body.status || "К проверке"),
          String(body.priority || "Средний"), String(body.notes || ""), String(body.sourceUrl || ""), now, now
        ).run();
      return json({ id }, 201);
    } catch (error) {
      const message = error instanceof Error && error.message.includes("UNIQUE")
        ? "Такой запрос уже есть для выбранного языка и страны"
        : "Не удалось сохранить запрос";
      return json({ error: message }, 409);
    }
  }

  if (url.pathname.startsWith("/api/keyword-board/") && request.method === "PATCH") {
    const id = url.pathname.split("/").pop();
    const body = await request.json<Record<string, unknown>>();
    const allowed = new Map([
      ["status", "status"], ["priority", "priority"], ["notes", "notes"],
      ["trendFiveYears", "trend_five_years"], ["trendTwelveMonths", "trend_twelve_months"],
      ["season", "season"], ["sourceUrl", "source_url"],
      ["visible", "visible"],
      ["trendData", "trend_data"], ["translation", "translation"], ["category", "category"], ["intent", "intent"],
    ]);
    const sets: string[] = [];
    const values: unknown[] = [];
    for (const [key, column] of allowed) {
      if (Object.prototype.hasOwnProperty.call(body, key)) {
        sets.push(`${column} = ?`);
        const value = body[key];
        values.push((key.startsWith("trend") && (value === "" || value === null)) ? null : value);
      }
    }
    if (!sets.length) return json({ error: "Nothing to update" }, 400);
    sets.push("updated_at = ?");
    values.push(Date.now(), id);
    await env.DB.prepare(`UPDATE keyword_queries SET ${sets.join(", ")} WHERE id = ?`).bind(...values).run();
    return json({ id, updated: true });
  }

  if (url.pathname.startsWith("/api/keyword-board/") && request.method === "DELETE") {
    const id = url.pathname.split("/").pop();
    await env.DB.prepare("DELETE FROM keyword_queries WHERE id = ?").bind(id).run();
    return json({ id, deleted: true });
  }

  return null;
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/keyword-board")) {
      const response = await handleKeywordBoard(request, env, url);
      if (response) return response;
    }

    if (url.pathname.startsWith("/api/riddle-")) {
      const response = await handleRiddleQueue(request, env, url);
      if (response) return response;
    }

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    return handler.fetch(request, env, ctx);
  },
};

export default worker;
