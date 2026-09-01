import { Hono } from "hono";
import { loadChannel } from "./auth";
import { runMaintenance } from "./maintenance";
import { apiCors, rateLimitByIp, securityHeaders } from "./security";
import type { AppEnv, Bindings } from "./types";
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
import media from "./routes/media";
import sitemap from "./routes/sitemap";

const app = new Hono<AppEnv>();

app.use("*", securityHeaders);
app.use("/api/*", apiCors());

app.get("/api/health", (c) => c.json({ ok: true, service: "live-mr-songbook" }));
app.route("/sitemap.xml", sitemap);

app.use("/api/auth/*", rateLimitByIp("auth", 30, 60_000));
app.route("/api/auth", authRoutes);

app.use("/api/me/*", rateLimitByIp("me", 30, 60_000));
app.route("/api/me", meRoutes);

app.use("/api/directory/*", rateLimitByIp("directory", 60, 60_000));
app.route("/api/directory", directory);

app.use("/api/platform/*", rateLimitByIp("platform", 30, 60_000));
app.route("/api/platform", platform);
app.route("/api/media", media);

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

async function scheduled(
  _controller: ScheduledController,
  env: Bindings,
  ctx: ExecutionContext,
): Promise<void> {
  ctx.waitUntil(
    runMaintenance(env)
      .then((summary) => {
        console.log("[maintenance]", summary);
      })
      .catch((err) => {
        console.error("[maintenance]", err);
      }),
  );
}

export default {
  fetch: app.fetch.bind(app),
  scheduled,
};
export { ChzzkSessionDO } from "./chzzk-session-do";
