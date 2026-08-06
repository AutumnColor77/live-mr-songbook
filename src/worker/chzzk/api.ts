/** Chzzk Open API helpers. Base: https://openapi.chzzk.naver.com */

export const CHZZK_OPENAPI = "https://openapi.chzzk.naver.com";
export const CHZZK_AUTH_PAGE = "https://chzzk.naver.com/account-interlock";
export const CHZZK_TOKEN_URL = `${CHZZK_OPENAPI}/auth/v1/token`;
export const CHZZK_REVOKE_URL = `${CHZZK_OPENAPI}/auth/v1/token/revoke`;

export type ChzzkTokenSet = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  scope: string;
};

type ChzzkEnvelope<T> = {
  code?: number | string;
  message?: string | null;
  content?: T;
};

async function readEnvelope<T>(res: Response): Promise<T> {
  const json = (await res.json()) as ChzzkEnvelope<T> & Record<string, unknown>;
  if (!res.ok) {
    throw new Error(
      typeof json.message === "string" && json.message
        ? json.message
        : `Chzzk API ${res.status}`,
    );
  }
  if (json.content !== undefined) return json.content as T;
  // Some auth endpoints return body at top level
  return json as unknown as T;
}

export async function exchangeChzzkCode(opts: {
  clientId: string;
  clientSecret: string;
  code: string;
  state: string;
}): Promise<ChzzkTokenSet> {
  const res = await fetch(CHZZK_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grantType: "authorization_code",
      clientId: opts.clientId,
      clientSecret: opts.clientSecret,
      code: opts.code,
      state: opts.state,
    }),
  });
  const body = await readEnvelope<{
    accessToken?: string;
    refreshToken?: string;
    expiresIn?: string | number;
    scope?: string;
  }>(res);
  if (!body.accessToken || !body.refreshToken) {
    throw new Error("Chzzk token response missing tokens");
  }
  return {
    accessToken: body.accessToken,
    refreshToken: body.refreshToken,
    expiresIn: Number(body.expiresIn) || 86400,
    scope: body.scope ?? "",
  };
}

export async function refreshChzzkToken(opts: {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}): Promise<ChzzkTokenSet> {
  const res = await fetch(CHZZK_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grantType: "refresh_token",
      refreshToken: opts.refreshToken,
      clientId: opts.clientId,
      clientSecret: opts.clientSecret,
    }),
  });
  const body = await readEnvelope<{
    accessToken?: string;
    refreshToken?: string;
    expiresIn?: string | number;
    scope?: string;
  }>(res);
  if (!body.accessToken || !body.refreshToken) {
    throw new Error("Chzzk refresh response missing tokens");
  }
  return {
    accessToken: body.accessToken,
    refreshToken: body.refreshToken,
    expiresIn: Number(body.expiresIn) || 86400,
    scope: body.scope ?? "",
  };
}

export async function revokeChzzkToken(opts: {
  clientId: string;
  clientSecret: string;
  token: string;
  tokenTypeHint?: "access_token" | "refresh_token";
}): Promise<void> {
  await fetch(CHZZK_REVOKE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      clientId: opts.clientId,
      clientSecret: opts.clientSecret,
      token: opts.token,
      tokenTypeHint: opts.tokenTypeHint ?? "refresh_token",
    }),
  }).catch(() => undefined);
}

export async function fetchChzzkMe(accessToken: string): Promise<{
  channelId: string;
  channelName: string;
}> {
  const res = await fetch(`${CHZZK_OPENAPI}/open/v1/users/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const body = await readEnvelope<{ channelId?: string; channelName?: string }>(res);
  if (!body.channelId) throw new Error("Chzzk users/me missing channelId");
  return {
    channelId: body.channelId,
    channelName: body.channelName ?? "",
  };
}

export async function createUserSessionUrl(accessToken: string): Promise<string> {
  const res = await fetch(`${CHZZK_OPENAPI}/open/v1/sessions/auth`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const body = await readEnvelope<{ url?: string }>(res);
  if (!body.url) throw new Error("Chzzk sessions/auth missing url");
  return body.url;
}

export async function subscribeSessionEvent(
  accessToken: string,
  kind: "chat" | "donation",
  sessionKey: string,
): Promise<void> {
  const path =
    kind === "chat"
      ? "/open/v1/sessions/events/subscribe/chat"
      : "/open/v1/sessions/events/subscribe/donation";
  const url = new URL(`${CHZZK_OPENAPI}${path}`);
  url.searchParams.set("sessionKey", sessionKey);
  const res = await fetch(url.toString(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Subscribe ${kind} failed (${res.status}): ${text.slice(0, 200)}`);
  }
}

export function chzzkConfigured(env: {
  CHZZK_CLIENT_ID?: string;
  CHZZK_CLIENT_SECRET?: string;
}): boolean {
  return Boolean(env.CHZZK_CLIENT_ID?.trim() && env.CHZZK_CLIENT_SECRET?.trim());
}

export function buildChzzkAuthorizeUrl(opts: {
  clientId: string;
  redirectUri: string;
  state: string;
}): string {
  const params = new URLSearchParams({
    clientId: opts.clientId,
    redirectUri: opts.redirectUri,
    state: opts.state,
  });
  return `${CHZZK_AUTH_PAGE}?${params.toString()}`;
}
