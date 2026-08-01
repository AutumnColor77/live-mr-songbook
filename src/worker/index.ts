import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Bindings } from "./types";
import songs from "./routes/songs";
import status from "./routes/status";
import queue from "./routes/queue";
import requests from "./routes/requests";
import admin from "./routes/admin";

const app = new Hono<{ Bindings: Bindings }>();

app.use("/api/*", cors());

app.get("/api/health", (c) => c.json({ ok: true, service: "live-mr-songbook" }));

app.route("/api/songs", songs);
app.route("/api/status", status);
app.route("/api/queue", queue);
app.route("/api/requests", requests);
app.route("/api/admin", admin);

app.notFound((c) => {
  if (c.req.path.startsWith("/api/")) {
    return c.json({ error: "Not found" }, 404);
  }
  return c.env.ASSETS.fetch(c.req.raw);
});

export default app;
