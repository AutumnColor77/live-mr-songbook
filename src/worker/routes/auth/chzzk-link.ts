import { Hono } from "hono";
import {
  buildChzzkAuthorizeUrl,
  chzzkConfigured,
  exchangeChzzkCode,
  fetchChzzkMe,
} from "../../chzzk/api";
import { signChzzkLinkState, verifyChzzkLinkState } from "../../chzzk/link-state";
import { upsertChzzkLink } from "../../chzzk/links";
import { loadUserFromSession } from "../../session";
import type { AppEnv } from "../../types";
import { chzzkStateSecret, originFromRequest } from "./helpers";

const chzzkAuth = new Hono<AppEnv>();

chzzkAuth.get("/chzzk/callback", async (c) => {
  if (!chzzkConfigured(c.env)) {
    return c.redirect("/?auth=error&reason=chzzk_not_configured");
  }

  const url = new URL(c.req.url);
  if (url.searchParams.get("error")) {
    return c.redirect(
      `/?auth=error&reason=${encodeURIComponent(url.searchParams.get("error") || "access_denied")}`,
    );
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) {
    return c.redirect("/?auth=error&reason=missing_code");
  }

  const secret = chzzkStateSecret(c.env);
  if (!secret) {
    return c.redirect("/?auth=error&reason=chzzk_not_configured");
  }

  const payload = await verifyChzzkLinkState(secret, state);
  if (!payload) {
    return c.redirect("/?auth=error&reason=invalid_state");
  }

  const user = await loadUserFromSession(c);
  if (!user || user.id !== payload.userId) {
    return c.redirect(
      `/me?chzzk=error&reason=session`,
    );
  }

  try {
    const tokens = await exchangeChzzkCode({
      clientId: c.env.CHZZK_CLIENT_ID!,
      clientSecret: c.env.CHZZK_CLIENT_SECRET!,
      code,
      state,
    });
    const me = await fetchChzzkMe(tokens.accessToken);
    await upsertChzzkLink(c.env.DB, c.env, {
      channelId: payload.channelId,
      chzzkChannelId: me.channelId,
      chzzkChannelName: me.channelName,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      accessExpiresAt: Date.now() + tokens.expiresIn * 1000,
      scopes: tokens.scope,
    });

    if (c.env.CHZZK_SESSION) {
      const id = c.env.CHZZK_SESSION.idFromName(payload.channelId);
      const stub = c.env.CHZZK_SESSION.get(id);
      await stub.fetch("https://do/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelId: payload.channelId }),
      });
    }

    return c.redirect(`/me?chzzk=ok`);
  } catch (err) {
    console.error("[chzzk] oauth callback failed", err instanceof Error ? err.name : "error");
    return c.redirect(`/me?chzzk=error&reason=token`);
  }
});

export async function beginChzzkLink(
  env: AppEnv["Bindings"],
  opts: { channelId: string; slug: string; userId: string; origin: string },
): Promise<{ url: string }> {
  if (!chzzkConfigured(env)) {
    throw new Error("Chzzk OAuth is not configured");
  }
  const secret = chzzkStateSecret(env);
  if (!secret) {
    throw new Error("Chzzk OAuth is not configured");
  }
  const state = await signChzzkLinkState(secret, {
    channelId: opts.channelId,
    slug: opts.slug,
    userId: opts.userId,
  });
  const redirectUri = `${opts.origin}/api/auth/chzzk/callback`;
  return {
    url: buildChzzkAuthorizeUrl({
      clientId: env.CHZZK_CLIENT_ID!,
      redirectUri,
      state,
    }),
  };
}

export { originFromRequest };
export default chzzkAuth;
