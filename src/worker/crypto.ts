export async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function bearerToken(header: string | undefined): string {
  const match = /^Bearer\s+(.+)$/i.exec(header ?? "");
  return match?.[1]?.trim() ?? "";
}

export const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

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

export type OAuthProvider = "google" | "naver";

export type SignedOAuthState = {
  nonce: string;
  exp: number;
  next: string;
  client: "web" | "desktop";
  provider: OAuthProvider;
  appState?: string;
};

/** Self-contained OAuth state (no D1 required to validate). */
export async function signOAuthState(
  secret: string,
  next: string,
  client: "web" | "desktop" = "web",
  provider: OAuthProvider = "google",
  appState?: string | null,
  ttlMs = 1000 * 60 * 10,
): Promise<string> {
  const payload: SignedOAuthState = {
    nonce: crypto.randomUUID().replace(/-/g, "").slice(0, 16),
    exp: Date.now() + ttlMs,
    next,
    client,
    provider,
  };
  if (appState && /^[a-zA-Z0-9]{16,64}$/.test(appState)) {
    payload.appState = appState;
  }
  const body = bytesToBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const sig = await hmacSha256Base64Url(secret, body);
  return `${body}.${sig}`;
}

export async function verifyOAuthState(
  secret: string,
  state: string,
): Promise<SignedOAuthState | null> {
  const dot = state.indexOf(".");
  if (dot <= 0) return null;
  const body = state.slice(0, dot);
  const sig = state.slice(dot + 1);
  if (!body || !sig) return null;

  const expected = await hmacSha256Base64Url(secret, body);
  if (expected !== sig) return null;

  try {
    const json = new TextDecoder().decode(base64UrlToBytes(body));
    const payload = JSON.parse(json) as SignedOAuthState;
    if (!payload?.nonce || !payload.exp || payload.exp < Date.now()) return null;
    if (typeof payload.next !== "string") return null;
    if (payload.client !== "desktop") payload.client = "web";
    if (payload.provider !== "naver") payload.provider = "google";
    if (
      typeof payload.appState === "string" &&
      /^[a-zA-Z0-9]{16,64}$/.test(payload.appState)
    ) {
      /* keep */
    } else {
      delete payload.appState;
    }
    return payload;
  } catch {
    return null;
  }
}
