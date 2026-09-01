import { cors } from "hono/cors";
import type { Context, MiddlewareHandler, Next } from "hono";
import type { AppEnv } from "./types";

const PRODUCTION_ORIGINS = new Set([
  "https://livemrsongbook.com",
  "https://www.livemrsongbook.com",
]);

function isAllowedOrigin(origin: string): boolean {
  if (PRODUCTION_ORIGINS.has(origin)) return true;
  try {
    const u = new URL(origin);
    if (u.hostname === "localhost" || u.hostname === "127.0.0.1") return true;
    if (u.hostname.endsWith(".workers.dev")) return true;
  } catch {
    return false;
  }
  return false;
}

export function apiCors() {
  return cors({
    origin: (origin, c) => {
      if (!origin) return new URL(c.req.url).origin;
      return isAllowedOrigin(origin) ? origin : "";
    },
    credentials: true,
  });
}

const CSP =
  "default-src 'self'; " +
  "script-src 'self'; " +
  "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; " +
  "font-src 'self' https://cdn.jsdelivr.net data:; " +
  "img-src 'self' data: https: blob:; " +
  "connect-src 'self' https:; " +
  "frame-ancestors 'none'; " +
  "base-uri 'self'; " +
  "form-action 'self'";

/** Workers Assets responses have immutable headers; copy before mutating. */
export function withMutableHeaders(res: Response): Response {
  return new Response(res.body, res);
}

export function patchResponseHeaders(c: Context, patch: (headers: Headers) => void): void {
  const headers = new Headers(c.res.headers);
  patch(headers);
  c.res = new Response(c.res.body, {
    status: c.res.status,
    statusText: c.res.statusText,
    headers,
  });
}

export const securityHeaders: MiddlewareHandler<AppEnv> = async (c, next) => {
  await next();
  patchResponseHeaders(c, (headers) => {
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("X-Frame-Options", "DENY");
    headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    headers.set("Content-Security-Policy", CSP);
    if (new URL(c.req.url).protocol === "https:") {
      headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    }
  });
};

export function rateLimitByIp(
  prefix: string,
  limit: number,
  windowMs: number,
): MiddlewareHandler<AppEnv> {
  return async (c: Context<AppEnv>, next: Next) => {
    const { clientIp, consumeRateLimit, rateLimitedResponse } = await import("./rate-limit");
    const ip = clientIp(c);
    const limited = await consumeRateLimit(c.env.DB, `${prefix}:${ip}`, limit, windowMs);
    if (!limited.ok) {
      const res = rateLimitedResponse(limited.retryAfterSec);
      return c.json(res.body, res.status, res.headers);
    }
    await next();
  };
}
