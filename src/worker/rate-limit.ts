import type { Context } from "hono";
import type { AppEnv } from "./types";

export function clientIp(c: Context<AppEnv>): string {
  return (
    c.req.header("cf-connecting-ip")?.trim() ||
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

export type RateLimitResult =
  | { ok: true }
  | { ok: false; retryAfterSec: number };

/**
 * Fixed-window counter in D1. Soft limit (races possible); enough to curb abuse.
 */
export async function consumeRateLimit(
  db: D1Database,
  key: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  const now = Date.now();
  const row = await db
    .prepare("SELECT window_start, count FROM rate_buckets WHERE key = ?")
    .bind(key)
    .first<{ window_start: number; count: number }>();

  if (!row || now - row.window_start >= windowMs) {
    await db
      .prepare(
        `INSERT INTO rate_buckets (key, window_start, count) VALUES (?, ?, 1)
         ON CONFLICT(key) DO UPDATE SET window_start = excluded.window_start, count = 1`,
      )
      .bind(key, now)
      .run();
    return { ok: true };
  }

  if (row.count >= limit) {
    const retryAfterSec = Math.max(
      1,
      Math.ceil((row.window_start + windowMs - now) / 1000),
    );
    return { ok: false, retryAfterSec };
  }

  await db
    .prepare("UPDATE rate_buckets SET count = count + 1 WHERE key = ?")
    .bind(key)
    .run();
  return { ok: true };
}

export function rateLimitedResponse(retryAfterSec: number) {
  return {
    body: { error: "Too many requests. Please try again shortly." },
    status: 429 as const,
    headers: { "Retry-After": String(retryAfterSec) },
  };
}
