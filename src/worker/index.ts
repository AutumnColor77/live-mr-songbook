import { Hono } from "hono";
import { cors } from "hono/cors";
import { loadChannel } from "./auth";
import type { AppEnv } from "./types";
import songs from "./routes/songs";
import status from "./routes/status";
import queue from "./routes/queue";
import requests from "./routes/requests";
import chzzk from "./routes/chzzk";
import admin from "./routes/admin";
import platform from "./routes/platform";
import authRoutes from "./routes/auth";
import meRoutes from "./routes/me";
import directory from "./routes/directory";
import legacyGone from "./routes/legacy-gone";

const app = new Hono<AppEnv>();

app.use(
  "/api/*",
  cors({
    origin: (origin, c) => origin || new URL(c.req.url).origin,
    credentials: true,
  }),
);

app.get("/api/health", (c) => c.json({ ok: true, service: "live-mr-songbook" }));

app.route("/api/auth", authRoutes);
app.route("/api/me", meRoutes);
app.route("/api/directory", directory);
app.route("/api/platform", platform);

const channelApi = new Hono<AppEnv>();
channelApi.use("*", loadChannel);
channelApi.route("/songs", songs);
channelApi.route("/status", status);
channelApi.route("/queue", queue);
channelApi.route("/requests", requests);
channelApi.route("/chzzk", chzzk);
channelApi.route("/admin", admin);

app.route("/api/c/:slug", channelApi);

app.route("/api", legacyGone);

app.notFound((c) => {
  if (c.req.path.startsWith("/api/")) {
    return c.json({ error: "Not found" }, 404);
  }
  return c.env.ASSETS.fetch(c.req.raw);
});

export default app;
export { ChzzkSessionDO } from "./chzzk-session-do";
