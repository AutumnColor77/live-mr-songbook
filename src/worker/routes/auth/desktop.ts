import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import { bearerToken, type OAuthProvider } from "../../crypto";
import { loadUserFromSession, SESSION_COOKIE } from "../../session";
import type { AppEnv } from "../../types";
import { desktopDoneHtml } from "./desktop-html";
import {
  DESKTOP_SCHEME,
  errorRedirect,
  providerConfigured,
  safeNextPath,
} from "./helpers";
import { beginOAuth } from "./oauth-providers";

const desktop = new Hono<AppEnv>();

/** After profile setup on desktop browser, hand session token back to the app. */
desktop.get("/desktop-handoff", async (c) => {
  const user = await loadUserFromSession(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const handoff =
    getCookie(c, SESSION_COOKIE) || bearerToken(c.req.header("Authorization"));
  if (!handoff) return c.json({ error: "Unauthorized" }, 401);

  return c.json({
    ok: true,
    deepLink: `${DESKTOP_SCHEME}://oauth/callback?token=${encodeURIComponent(handoff)}`,
    user,
  });
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

  const user = await loadUserFromSession(c);
  if (user) {
    if (user.needsProfileSetup) {
      const q = new URLSearchParams({
        next: nextPath,
        client: "desktop",
      });
      return c.redirect(`/me/setup?${q}`);
    }
    const token =
      getCookie(c, SESSION_COOKIE) || bearerToken(c.req.header("Authorization"));
    if (token) {
      console.log("[auth] desktop-connect reused browser session", { userId: user.id });
      return c.html(desktopDoneHtml(token));
    }
  }

  if (!provider) {
    return c.redirect(`/?client=desktop&next=${encodeURIComponent(nextPath)}`);
  }
  if (!providerConfigured(c, provider)) {
    return c.redirect(errorRedirect("not_configured"));
  }

  const { url } = await beginOAuth(c, provider, nextPath, "desktop");
  return c.redirect(url);
});

export default desktop;
