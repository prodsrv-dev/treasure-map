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

async function ensureJobsTable(db: D1Database) {
  await db.prepare(createJobsTable).run();
  await db.prepare("CREATE INDEX IF NOT EXISTS riddle_jobs_status_created_idx ON riddle_jobs (status, created_at)").run();
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
