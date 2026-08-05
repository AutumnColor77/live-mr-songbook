import { Hono } from "hono";
import type { AppEnv } from "../types";

/** Tombstones for pre-multi-tenant global routes. */
const legacyGone = new Hono<AppEnv>();

legacyGone.all("/songs", (c) => c.json({ error: "Gone. Use /api/c/:slug/songs" }, 410));
legacyGone.all("/songs/*", (c) => c.json({ error: "Gone. Use /api/c/:slug/songs" }, 410));
legacyGone.all("/status", (c) => c.json({ error: "Gone. Use /api/c/:slug/status" }, 410));
legacyGone.all("/queue", (c) => c.json({ error: "Gone. Use /api/c/:slug/queue" }, 410));
legacyGone.all("/requests", (c) => c.json({ error: "Gone. Use /api/c/:slug/requests" }, 410));
legacyGone.all("/admin", (c) => c.json({ error: "Gone. Use /api/c/:slug/admin" }, 410));
legacyGone.all("/admin/*", (c) => c.json({ error: "Gone. Use /api/c/:slug/admin" }, 410));

export default legacyGone;
