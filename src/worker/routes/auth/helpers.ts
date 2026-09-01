import type { OAuthProvider } from "../../crypto";
import type { AppEnv } from "../../types";

export const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";

export const NAVER_AUTH_URL = "https://nid.naver.com/oauth2.0/authorize";
export const NAVER_TOKEN_URL = "https://nid.naver.com/oauth2.0/token";
export const NAVER_USERINFO_URL = "https://openapi.naver.com/v1/nid/me";

export const DEFAULT_NEXT = "/me";
export const DESKTOP_SCHEME = "live-mr-manager";

export function originFromRequest(url: string): string {
  const u = new URL(url);
  return u.origin;
}

export function oauthStateSecretForProvider(
  env: AppEnv["Bindings"],
  provider: OAuthProvider,
): string | null {
  if (provider === "naver") {
    return env.NAVER_CLIENT_SECRET?.trim() || null;
  }
  return env.GOOGLE_CLIENT_SECRET?.trim() || null;
}

export function chzzkStateSecret(env: AppEnv["Bindings"]): string | null {
  return env.CHZZK_CLIENT_SECRET?.trim() || null;
}

export function googleConfigured(c: { env: AppEnv["Bindings"] }): boolean {
  return Boolean(c.env.GOOGLE_CLIENT_ID && c.env.GOOGLE_CLIENT_SECRET);
}

export function naverConfigured(c: { env: AppEnv["Bindings"] }): boolean {
  return Boolean(c.env.NAVER_CLIENT_ID && c.env.NAVER_CLIENT_SECRET);
}

export function providerConfigured(c: { env: AppEnv["Bindings"] }, provider: OAuthProvider): boolean {
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

export function parseClient(raw: string | null | undefined): "web" | "desktop" {
  return raw === "desktop" ? "desktop" : "web";
}

export function errorRedirect(reason: string): string {
  return `/?auth=error&reason=${encodeURIComponent(reason)}`;
}

export function successRedirect(nextPath: string): string {
  const sep = nextPath.includes("?") ? "&" : "?";
  return `${nextPath}${sep}auth=ok`;
}

export function callbackPath(provider: OAuthProvider): string {
  return `/api/auth/${provider}/callback`;
}
