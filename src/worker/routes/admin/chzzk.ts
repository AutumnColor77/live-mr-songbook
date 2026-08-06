import { Hono } from "hono";
import { chzzkConfigured, revokeChzzkToken } from "../../chzzk/api";
import {
  deleteChzzkLink,
  getChzzkLink,
  publicChzzkStatus,
} from "../../chzzk/links";
import { loadUserFromSession } from "../../session";
import type { AppEnv } from "../../types";
import {
  beginChzzkLink,
  originFromRequest,
} from "../auth/chzzk-link";

const chzzkAdmin = new Hono<AppEnv>();

function sessionStub(env: AppEnv["Bindings"], channelId: string) {
  if (!env.CHZZK_SESSION) return null;
  const id = env.CHZZK_SESSION.idFromName(channelId);
  return env.CHZZK_SESSION.get(id);
}

chzzkAdmin.get("/chzzk", async (c) => {
  const channelId = c.get("channel").id;
  const link = await getChzzkLink(c.env.DB, channelId);
  const stub = sessionStub(c.env, channelId);
  let live = false;
  if (stub && link) {
    try {
      const statusRes = await stub.fetch("https://do/status");
      const status = (await statusRes.json().catch(() => ({}))) as {
        live?: boolean;
        sockets?: number;
      };
      live = Boolean(status.live || (status.sockets && status.sockets > 0));
      // Stale "connected" in DB while socket is dead — heal in background.
      if (!live && link.session_status === "connected") {
        c.executionCtx.waitUntil(
          stub
            .fetch("https://do/ensure", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ channelId }),
            })
            .catch(() => undefined),
        );
      }
    } catch {
      live = false;
    }
  }
  return c.json({
    configured: chzzkConfigured(c.env),
    ...publicChzzkStatus(link),
    live,
  });
});

chzzkAdmin.get("/chzzk/connect", async (c) => {
  if (!chzzkConfigured(c.env)) {
    return c.json({ error: "Chzzk OAuth is not configured" }, 503);
  }
  const user = await loadUserFromSession(c);
  if (!user) {
    return c.json({ error: "Login required to link Chzzk" }, 401);
  }
  const channel = c.get("channel");
  try {
    const { url } = await beginChzzkLink(c.env, {
      channelId: channel.id,
      slug: channel.slug,
      userId: user.id,
      origin: originFromRequest(c.req.url),
    });
    const wantsJson = c.req.query("format") === "json";
    if (wantsJson) return c.json({ url });
    return c.redirect(url);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "connect failed";
    return c.json({ error: msg }, 500);
  }
});

chzzkAdmin.delete("/chzzk", async (c) => {
  const channelId = c.get("channel").id;
  const link = await getChzzkLink(c.env.DB, channelId);
  const stub = sessionStub(c.env, channelId);
  if (stub) {
    await stub.fetch("https://do/stop", { method: "POST" }).catch(() => undefined);
  }
  if (link && chzzkConfigured(c.env)) {
    await revokeChzzkToken({
      clientId: c.env.CHZZK_CLIENT_ID!,
      clientSecret: c.env.CHZZK_CLIENT_SECRET!,
      token: link.refresh_token,
      tokenTypeHint: "refresh_token",
    });
  }
  await deleteChzzkLink(c.env.DB, channelId);
  return c.json({ ok: true });
});

chzzkAdmin.post("/chzzk/session", async (c) => {
  const channelId = c.get("channel").id;
  const link = await getChzzkLink(c.env.DB, channelId);
  if (!link) return c.json({ error: "Chzzk not linked" }, 400);
  const stub = sessionStub(c.env, channelId);
  if (!stub) return c.json({ error: "CHZZK_SESSION binding missing" }, 503);
  const res = await stub.fetch("https://do/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ channelId }),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string; ok?: boolean };
  if (!res.ok) {
    return c.json({ error: data.error ?? "session start failed" }, 500);
  }
  return c.json(data);
});

chzzkAdmin.post("/chzzk/session/stop", async (c) => {
  const channelId = c.get("channel").id;
  const stub = sessionStub(c.env, channelId);
  if (!stub) return c.json({ error: "CHZZK_SESSION binding missing" }, 503);
  await stub.fetch("https://do/stop", { method: "POST" });
  return c.json({ ok: true });
});

export default chzzkAdmin;
