import { Hono } from "hono";
import { cors } from "hono/cors";
import { loadChannel } from "./auth";
import type { AppEnv } from "./types";
import songs from "./routes/songs";
import status from "./routes/status";
import queue from "./routes/queue";
import requests from "./routes/requests";
import admin from "./routes/admin";
import platform from "./routes/platform";

const app = new Hono<AppEnv>();

app.use("/api/*", cors());

app.get("/api/health", (c) => c.json({ ok: true, service: "live-mr-songbook" }));

app.route("/api/platform", platform);

const channelApi = new Hono<AppEnv>();
channelApi.use("*", loadChannel);
channelApi.route("/songs", songs);
channelApi.route("/status", status);
channelApi.route("/queue", queue);
channelApi.route("/requests", requests);
channelApi.route("/admin", admin);

app.route("/api/c/:slug", channelApi);

// Legacy global routes — removed after multi-tenant cutover
app.all("/api/songs", (c) => c.json({ error: "Gone. Use /api/c/:slug/songs" }, 410));
app.all("/api/songs/*", (c) => c.json({ error: "Gone. Use /api/c/:slug/songs" }, 410));
app.all("/api/status", (c) => c.json({ error: "Gone. Use /api/c/:slug/status" }, 410));
app.all("/api/queue", (c) => c.json({ error: "Gone. Use /api/c/:slug/queue" }, 410));
app.all("/api/requests", (c) => c.json({ error: "Gone. Use /api/c/:slug/requests" }, 410));
app.all("/api/admin", (c) => c.json({ error: "Gone. Use /api/c/:slug/admin" }, 410));
app.all("/api/admin/*", (c) => c.json({ error: "Gone. Use /api/c/:slug/admin" }, 410));

app.notFound((c) => {
  if (c.req.path.startsWith("/api/")) {
    return c.json({ error: "Not found" }, 404);
  }
  return c.env.ASSETS.fetch(c.req.raw);
});

export default app;
