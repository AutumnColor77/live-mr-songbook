import { Hono } from "hono";
import type { Context } from "hono";
import { getCookie } from "hono/cookie";
import { ensureDemoMembership } from "../auth";
import { bearerToken, signOAuthState, verifyOAuthState, type OAuthProvider } from "../crypto";
import {
  createSession,
  destroySession,
  loadUserFromSession,
  SESSION_COOKIE,
  setOAuthStateCookie,
  updateUserProfile,
  upsertOAuthUser,
} from "../session";
import type { AppEnv } from "../types";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";

const NAVER_AUTH_URL = "https://nid.naver.com/oauth2.0/authorize";
const NAVER_TOKEN_URL = "https://nid.naver.com/oauth2.0/token";
const NAVER_USERINFO_URL = "https://openapi.naver.com/v1/nid/me";

const DEFAULT_NEXT = "/c/demo/admin";
const DESKTOP_SCHEME = "live-mr-manager";

const auth = new Hono<AppEnv>();

function originFromRequest(url: string): string {
  const u = new URL(url);
  return u.origin;
}

function oauthStateSecret(env: AppEnv["Bindings"]): string {
  return [env.GOOGLE_CLIENT_SECRET, env.NAVER_CLIENT_SECRET].filter(Boolean).join("|") || "dev";
}

function googleConfigured(c: { env: AppEnv["Bindings"] }): boolean {
  return Boolean(c.env.GOOGLE_CLIENT_ID && c.env.GOOGLE_CLIENT_SECRET);
}

function naverConfigured(c: { env: AppEnv["Bindings"] }): boolean {
  return Boolean(c.env.NAVER_CLIENT_ID && c.env.NAVER_CLIENT_SECRET);
}

function providerConfigured(c: { env: AppEnv["Bindings"] }, provider: OAuthProvider): boolean {
  return provider === "naver" ? naverConfigured(c) : googleConfigured(c);
}

export function safeNextPath(raw: string | null | undefined): string {
  if (!raw) return DEFAULT_NEXT;
  const path = raw.trim();
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("://")) {
    return DEFAULT_NEXT;
  }
  return path;
}

function parseClient(raw: string | null | undefined): "web" | "desktop" {
  return raw === "desktop" ? "desktop" : "web";
}

function errorRedirect(reason: string): string {
  return `/?auth=error&reason=${encodeURIComponent(reason)}`;
}

function successRedirect(nextPath: string): string {
  const sep = nextPath.includes("?") ? "&" : "?";
  return `${nextPath}${sep}auth=ok`;
}

function callbackPath(provider: OAuthProvider): string {
  return `/api/auth/${provider}/callback`;
}

function desktopDoneHtml(token: string): string {
  const deepLink = `${DESKTOP_SCHEME}://oauth/callback?token=${encodeURIComponent(token)}`;
  const safeLink = deepLink
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Live MR Manager 로그인</title>
  <style>
    body { font-family: system-ui, sans-serif; background:#0b0b10; color:#f8fafc;
      display:flex; min-height:100vh; align-items:center; justify-content:center; margin:0; }
    .card { max-width:420px; padding:28px; border-radius:16px; background:rgba(255,255,255,.04);
      border:1px solid rgba(255,255,255,.1); text-align:center; }
    a { color:#93c5fd; }
    button { margin-top:16px; padding:10px 16px; border-radius:10px; border:0;
      background:#334155; color:#f8fafc; font:inherit; cursor:pointer; }
  </style>
</head>
<body>
  <div class="card">
    <h1 style="font-size:1.1rem;margin:0 0 8px">앱으로 돌아가는 중…</h1>
    <p style="color:#94a3b8;font-size:.9rem;line-height:1.5;margin:0 0 16px">
      브라우저에서 “Live MR Manager 열기”를 허용해 주세요.<br />
      앱이 열리면 이 창을 닫아도 됩니다.
    </p>
    <p style="font-size:.85rem;margin:0">
      <a id="deep" href="${safeLink}">앱이 안 열리면 여기를 클릭</a>
    </p>
    <button type="button" id="close-btn">창 닫기</button>
  </div>
  <script>
    (function () {
      var link = ${JSON.stringify(deepLink)};
      // Trigger custom-protocol handoff once — retries open duplicate OS prompts.
      try { window.location.replace(link); } catch (e) {
        try { window.location.href = link; } catch (e2) {}
      }
      var btn = document.getElementById("close-btn");
      if (btn) btn.addEventListener("click", function () {
        try { window.close(); } catch (e) {}
      });
    })();
  </script>
</body>
</html>`;
}

async function beginOAuth(
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
    await ensureDemoMembership(c.env.DB, user.id);

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

    if (needsSetup) {
      if (client === "desktop") {
        return { ok: true, mode: "desktop-setup", redirect: setupPath };
      }
      return { ok: true, mode: "web", redirect: setupPath };
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

function registerProviderRoutes(provider: OAuthProvider) {
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

auth.get("/me", async (c) => {
  const user = await loadUserFromSession(c);
  return c.json({ user });
});

auth.patch("/profile", async (c) => {
  const sessionUser = await loadUserFromSession(c);
  if (!sessionUser) return c.json({ error: "Unauthorized" }, 401);

  let body: { name?: string; picture?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }

  const name = typeof body.name === "string" ? body.name : "";
  const picture = typeof body.picture === "string" ? body.picture : "";
  const row = await updateUserProfile(c.env.DB, sessionUser.id, { name, picture });
  if (!row) {
    return c.json(
      { error: "닉네임(1–32자)과 올바른 프로필 이미지를 확인해 주세요." },
      400,
    );
  }
  return c.json({ user: {
    id: row.id,
    email: row.email,
    name: row.name,
    picture: row.picture,
    needsProfileSetup: !row.profile_setup_done,
  }});
});

/** After profile setup on desktop browser, hand session token back to the app. */
auth.get("/desktop-handoff", async (c) => {
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

auth.get("/status", (c) => {
  const origin = originFromRequest(c.req.url);
  return c.json({
    googleEnabled: googleConfigured(c),
    naverEnabled: naverConfigured(c),
    origin,
    googleCallback: `${origin}/api/auth/google/callback`,
    naverCallback: `${origin}/api/auth/naver/callback`,
  });
});

auth.post("/logout", async (c) => {
  await destroySession(c);
  return c.json({ ok: true });
});

registerProviderRoutes("google");
registerProviderRoutes("naver");

export default auth;
