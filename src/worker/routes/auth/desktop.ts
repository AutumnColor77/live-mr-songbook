import { Hono } from "hono";
import {
  createDesktopHandoffCode,
  exchangeDesktopHandoffAppState,
  exchangeDesktopHandoffCode,
  sanitizeDesktopAppState,
} from "../../desktop-handoff";
import { type OAuthProvider } from "../../crypto";
import { createSession, loadUserFromSession } from "../../session";
import type { AppEnv } from "../../types";
import { desktopDeepLink, desktopDoneHtml } from "./desktop-html";
import {
  errorRedirect,
  providerConfigured,
  safeNextPath,
} from "./helpers";
import { beginOAuth } from "./oauth-providers";

const desktop = new Hono<AppEnv>();

/** After profile setup on desktop browser, hand one-time code back to the app. */
desktop.get("/desktop-handoff", async (c) => {
  const user = await loadUserFromSession(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const appState = sanitizeDesktopAppState(c.req.query("state"));
  const code = await createDesktopHandoffCode(c.env.DB, user.id, appState);
  return c.json({
    ok: true,
    deepLink: desktopDeepLink(code),
    user,
  });
});

/** Exchange a one-time desktop handoff code (or Manager `state`) for a session token. */
desktop.post("/desktop-exchange", async (c) => {
  let body: { code?: string; state?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid request" }, 400);
  }

  const code = typeof body.code === "string" ? body.code.trim() : "";
  const appState = sanitizeDesktopAppState(
    typeof body.state === "string" ? body.state : null,
  );

  if (code) {
    const userId = await exchangeDesktopHandoffCode(c.env.DB, code);
    if (!userId) {
      return c.json({ error: "Invalid or expired code" }, 400);
    }
    const token = await createSession(c, userId);
    return c.json({ ok: true, token });
  }

  if (appState) {
    const userId = await exchangeDesktopHandoffAppState(c.env.DB, appState);
    if (!userId) {
      return c.json({ pending: true }, 404);
    }
    const token = await createSession(c, userId);
    return c.json({ ok: true, token });
  }

  return c.json({ error: "Missing code" }, 400);
});

/**
 * Desktop app login entry: reuse existing browser Songbook session when present,
 * otherwise start OAuth for the requested provider.
 * Query: ?provider=google|naver&next=/me
 */
desktop.get("/desktop-connect", async (c) => {
  const nextPath = safeNextPath(c.req.query("next"));
  const providerRaw = (c.req.query("provider") || "").toLowerCase();
  const provider: OAuthProvider | null =
    providerRaw === "google" || providerRaw === "naver" ? providerRaw : null;
  const appState = sanitizeDesktopAppState(c.req.query("state"));

  const user = await loadUserFromSession(c);
  if (user) {
    if (user.needsProfileSetup) {
      const q = new URLSearchParams({
        next: nextPath,
        client: "desktop",
      });
      if (appState) q.set("state", appState);
      return c.redirect(`/me/setup?${q}`);
    }
    const code = await createDesktopHandoffCode(c.env.DB, user.id, appState);
    console.log("[auth] desktop-connect reused browser session", { userId: user.id });
    return c.html(desktopDoneHtml(code));
  }

  if (!provider) {
    const q = new URLSearchParams({ client: "desktop", next: nextPath });
    if (appState) q.set("state", appState);
    return c.redirect(`/?${q}`);
  }
  if (!providerConfigured(c, provider)) {
    return c.redirect(errorRedirect("not_configured"));
  }

  const { url } = await beginOAuth(c, provider, nextPath, "desktop", appState);
  return c.redirect(url);
});

export default desktop;
