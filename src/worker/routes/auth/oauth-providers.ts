import { Hono } from "hono";
import type { Context } from "hono";
import { signOAuthState, verifyOAuthState, type OAuthProvider } from "../../crypto";
import { createSession, setOAuthStateCookie, upsertOAuthUser } from "../../session";
import type { AppEnv } from "../../types";
import { desktopDoneHtml } from "./desktop-html";
import {
  DESKTOP_SCHEME,
  GOOGLE_AUTH_URL,
  GOOGLE_TOKEN_URL,
  GOOGLE_USERINFO_URL,
  NAVER_AUTH_URL,
  NAVER_TOKEN_URL,
  NAVER_USERINFO_URL,
  callbackPath,
  errorRedirect,
  oauthStateSecret,
  originFromRequest,
  parseClient,
  providerConfigured,
  safeNextPath,
  successRedirect,
} from "./helpers";

export async function beginOAuth(
  c: Context<AppEnv>,
  provider: OAuthProvider,
  nextPath: string,
  client: "web" | "desktop",
): Promise<{ url: string }> {
  const state = await signOAuthState(oauthStateSecret(c.env), nextPath, client, provider);
  setOAuthStateCookie(c, state);
  const redirectUri = `${originFromRequest(c.req.url)}${callbackPath(provider)}`;

  if (provider === "naver") {
    const params = new URLSearchParams({
      response_type: "code",
      client_id: c.env.NAVER_CLIENT_ID!,
      redirect_uri: redirectUri,
      state,
    });
    console.log("[auth] begin Naver OAuth", { redirectUri, nextPath, client });
    return { url: `${NAVER_AUTH_URL}?${params.toString()}` };
  }

  const params = new URLSearchParams({
    client_id: c.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account",
  });
  console.log("[auth] begin Google OAuth", { redirectUri, nextPath, client });
  return { url: `${GOOGLE_AUTH_URL}?${params.toString()}` };
}

type FinishResult =
  | { ok: true; mode: "web"; redirect: string }
  | { ok: true; mode: "desktop"; token: string }
  | { ok: true; mode: "desktop-setup"; redirect: string }
  | { ok: false; reason: string };

async function exchangeGoogleProfile(
  c: Context<AppEnv>,
  code: string,
  redirectUri: string,
): Promise<{ sub: string; email: string; name: string; picture: string } | { error: string }> {
  const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: c.env.GOOGLE_CLIENT_ID!,
      client_secret: c.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!tokenRes.ok) {
    console.error("[auth] google token failed", await tokenRes.text());
    return { error: "token_exchange" };
  }
  const tokenJson = (await tokenRes.json()) as { access_token?: string };
  if (!tokenJson.access_token) return { error: "token_exchange" };

  const profileRes = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${tokenJson.access_token}` },
  });
  if (!profileRes.ok) {
    console.error("[auth] google userinfo failed", await profileRes.text());
    return { error: "userinfo" };
  }
  const profile = (await profileRes.json()) as {
    sub?: string;
    email?: string;
    name?: string;
    picture?: string;
  };
  if (!profile.sub || !profile.email) return { error: "userinfo" };
  return {
    sub: profile.sub,
    email: profile.email,
    name: profile.name?.trim() || profile.email.split("@")[0] || "User",
    picture: profile.picture ?? "",
  };
}

async function exchangeNaverProfile(
  c: Context<AppEnv>,
  code: string,
  state: string,
  redirectUri: string,
): Promise<{ sub: string; email: string; name: string; picture: string } | { error: string }> {
  const tokenUrl = new URL(NAVER_TOKEN_URL);
  tokenUrl.searchParams.set("grant_type", "authorization_code");
  tokenUrl.searchParams.set("client_id", c.env.NAVER_CLIENT_ID!);
  tokenUrl.searchParams.set("client_secret", c.env.NAVER_CLIENT_SECRET!);
  tokenUrl.searchParams.set("code", code);
  tokenUrl.searchParams.set("state", state);
  // redirect_uri is not always required for Naver token, but include when supported
  tokenUrl.searchParams.set("redirect_uri", redirectUri);

  const tokenRes = await fetch(tokenUrl.toString(), { method: "GET" });
  if (!tokenRes.ok) {
    console.error("[auth] naver token failed", await tokenRes.text());
    return { error: "token_exchange" };
  }
  const tokenJson = (await tokenRes.json()) as {
    access_token?: string;
    error?: string;
    error_description?: string;
  };
  if (!tokenJson.access_token) {
    console.error("[auth] naver token missing", tokenJson);
    return { error: "token_exchange" };
  }

  const profileRes = await fetch(NAVER_USERINFO_URL, {
    headers: { Authorization: `Bearer ${tokenJson.access_token}` },
  });
  if (!profileRes.ok) {
    console.error("[auth] naver userinfo failed", await profileRes.text());
    return { error: "userinfo" };
  }
  const body = (await profileRes.json()) as {
    resultcode?: string;
    response?: {
      id?: string;
      email?: string;
      name?: string;
      nickname?: string;
      profile_image?: string;
    };
  };
  const profile = body.response;
  if (!profile?.id) return { error: "userinfo" };
  const email = profile.email?.trim() || `${profile.id}@naver.local`;
  return {
    sub: profile.id,
    email,
    name: profile.name?.trim() || profile.nickname?.trim() || email.split("@")[0] || "User",
    picture: profile.profile_image ?? "",
  };
}

async function finishOAuthLogin(
  c: Context<AppEnv>,
  provider: OAuthProvider,
  code: string,
  state: string,
): Promise<FinishResult> {
  const payload = await verifyOAuthState(oauthStateSecret(c.env), state);
  if (!payload || payload.provider !== provider) {
    console.error("[auth] invalid signed state", { provider, payloadProvider: payload?.provider });
    return { ok: false, reason: "invalid_state" };
  }

  const nextPath = safeNextPath(payload.next);
  const client = payload.client === "desktop" ? "desktop" : "web";
  const redirectUri = `${originFromRequest(c.req.url)}${callbackPath(provider)}`;

  let profile: { sub: string; email: string; name: string; picture: string };
  try {
    const exchanged =
      provider === "naver"
        ? await exchangeNaverProfile(c, code, state, redirectUri)
        : await exchangeGoogleProfile(c, code, redirectUri);
    if ("error" in exchanged) return { ok: false, reason: exchanged.error };
    profile = exchanged;
  } catch (err) {
    console.error("[auth] token/profile exception", err);
    return { ok: false, reason: "token_exchange" };
  }

  try {
    const { user } = await upsertOAuthUser(c.env.DB, {
      provider,
      sub: profile.sub,
      email: profile.email,
      name: profile.name,
      picture: profile.picture,
    });

    const sessionToken = await createSession(c, user.id);

    const needsSetup = !user.profile_setup_done;
    const setupPath = `/me/setup?next=${encodeURIComponent(nextPath)}${
      client === "desktop" ? "&client=desktop" : ""
    }`;

    console.log("[auth] login ok", {
      userId: user.id,
      provider,
      nextPath,
      client,
      needsSetup,
    });

    // Web: skip forced profile setup so viewers land on next (e.g. /c/:slug).
    // Desktop Manager still requires setup before handoff.
    if (needsSetup && client === "desktop") {
      return { ok: true, mode: "desktop-setup", redirect: setupPath };
    }

    if (client === "desktop") {
      return { ok: true, mode: "desktop", token: sessionToken };
    }
    return { ok: true, mode: "web", redirect: successRedirect(nextPath) };
  } catch (err) {
    console.error("[auth] post-token failure", err);
    return { ok: false, reason: "server" };
  }
}

export function registerProviderRoutes(auth: Hono<AppEnv>, provider: OAuthProvider) {
  const label = provider === "naver" ? "Naver" : "Google";

  auth.get(`/${provider}`, async (c) => {
    if (!providerConfigured(c, provider)) {
      return c.json(
        { error: `${label} OAuth is not configured.` },
        503,
      );
    }
    const nextPath = safeNextPath(c.req.query("next"));
    const client = parseClient(c.req.query("client"));
    const { url } = await beginOAuth(c, provider, nextPath, client);
    return c.redirect(url);
  });

  auth.get(`/${provider}/start`, async (c) => {
    if (!providerConfigured(c, provider)) {
      return c.json({ error: `${label} OAuth is not configured.` }, 503);
    }
    const nextPath = safeNextPath(c.req.query("next"));
    const client = parseClient(c.req.query("client"));
    return c.json(await beginOAuth(c, provider, nextPath, client));
  });

  auth.get(`/${provider}/callback`, async (c) => {
    if (!providerConfigured(c, provider)) {
      return c.redirect(errorRedirect("not_configured"));
    }

    const url = new URL(c.req.url);
    const error = url.searchParams.get("error") || url.searchParams.get("error_description");
    if (url.searchParams.get("error")) {
      console.error(`[auth] ${provider} error param:`, error);
      return c.redirect(errorRedirect(url.searchParams.get("error") || "access_denied"));
    }

    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    if (!code || !state) {
      return c.redirect(errorRedirect("missing_code"));
    }

    const result = await finishOAuthLogin(c, provider, code, state);
    if (!result.ok) return c.redirect(errorRedirect(result.reason));
    if (result.mode === "desktop") {
      return c.html(desktopDoneHtml(result.token));
    }
    return c.redirect(result.redirect);
  });

  auth.post(`/${provider}/exchange`, async (c) => {
    if (!providerConfigured(c, provider)) {
      return c.json({ ok: false, reason: "not_configured" }, 503);
    }

    let body: { code?: string; state?: string };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ ok: false, reason: "missing_code" }, 400);
    }

    const code = typeof body.code === "string" ? body.code : "";
    const state = typeof body.state === "string" ? body.state : "";
    if (!code || !state) {
      return c.json({ ok: false, reason: "missing_code" }, 400);
    }

    const result = await finishOAuthLogin(c, provider, code, state);
    if (!result.ok) {
      return c.json({ ok: false, reason: result.reason }, 400);
    }
    if (result.mode === "desktop") {
      return c.json({
        ok: true,
        mode: "desktop",
        deepLink: `${DESKTOP_SCHEME}://oauth/callback?token=${encodeURIComponent(result.token)}`,
      });
    }
    return c.json({
      ok: true,
      mode: result.mode,
      redirect: result.redirect,
    });
  });
}


