/** Signed state for Chzzk channel-link OAuth (not login). */

function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string): Uint8Array {
  const pad = "=".repeat((4 - (value.length % 4)) % 4);
  const b64 = (value + pad).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmacSha256Base64Url(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return bytesToBase64Url(new Uint8Array(sig));
}

export type ChzzkLinkOAuthState = {
  kind: "chzzk_link";
  channelId: string;
  slug: string;
  userId: string;
  exp: number;
  nonce: string;
};

export async function signChzzkLinkState(
  secret: string,
  payload: Omit<ChzzkLinkOAuthState, "kind" | "exp" | "nonce">,
  ttlMs = 1000 * 60 * 15,
): Promise<string> {
  const full: ChzzkLinkOAuthState = {
    kind: "chzzk_link",
    ...payload,
    exp: Date.now() + ttlMs,
    nonce: crypto.randomUUID().replace(/-/g, "").slice(0, 16),
  };
  const body = bytesToBase64Url(new TextEncoder().encode(JSON.stringify(full)));
  const sig = await hmacSha256Base64Url(secret, body);
  return `${body}.${sig}`;
}

export async function verifyChzzkLinkState(
  secret: string,
  state: string,
): Promise<ChzzkLinkOAuthState | null> {
  const dot = state.indexOf(".");
  if (dot <= 0) return null;
  const body = state.slice(0, dot);
  const sig = state.slice(dot + 1);
  if (!body || !sig) return null;
  const expect = await hmacSha256Base64Url(secret, body);
  if (expect !== sig) return null;
  try {
    const json = JSON.parse(
      new TextDecoder().decode(base64UrlToBytes(body)),
    ) as ChzzkLinkOAuthState;
    if (json.kind !== "chzzk_link") return null;
    if (typeof json.exp !== "number" || json.exp < Date.now()) return null;
    if (!json.channelId || !json.slug || !json.userId) return null;
    return json;
  } catch {
    return null;
  }
}
