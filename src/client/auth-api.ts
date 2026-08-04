export type AuthUser = {
  id: string;
  email: string;
  name: string;
  picture: string;
  needsProfileSetup: boolean;
};

export type OAuthProvider = "google" | "naver";

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: "include",
    ...init,
    signal: init?.signal ?? AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }
  return (await res.json()) as T;
}

function normalizeUser(raw: Partial<AuthUser> | null | undefined): AuthUser | null {
  if (!raw?.id) return null;
  return {
    id: raw.id,
    email: raw.email ?? "",
    name: raw.name ?? "",
    picture: raw.picture ?? "",
    needsProfileSetup: Boolean(raw.needsProfileSetup),
  };
}

export async function fetchMe(): Promise<AuthUser | null> {
  try {
    const data = await fetchJson<{ user: AuthUser | null }>("/api/auth/me");
    return normalizeUser(data.user);
  } catch {
    return null;
  }
}

export async function fetchAuthStatus(): Promise<{
  googleEnabled: boolean;
  naverEnabled: boolean;
}> {
  try {
    return await fetchJson<{ googleEnabled: boolean; naverEnabled: boolean }>(
      "/api/auth/status",
    );
  } catch {
    return { googleEnabled: false, naverEnabled: false };
  }
}

/** Sets OAuth state cookie, then returns provider authorize URL. */
export async function startOAuthLogin(
  provider: OAuthProvider,
  next = "/c/demo/admin",
): Promise<string> {
  const qs = new URLSearchParams({ next });
  const data = await fetchJson<{ url: string }>(
    `/api/auth/${provider}/start?${qs}`,
  );
  if (!data.url) throw new Error(`${provider} login URL missing`);
  return data.url;
}

export async function startGoogleLogin(next = "/c/demo/admin"): Promise<string> {
  return startOAuthLogin("google", next);
}

export async function startNaverLogin(next = "/c/demo/admin"): Promise<string> {
  return startOAuthLogin("naver", next);
}

export async function updateProfile(input: {
  name: string;
  picture: string;
}): Promise<AuthUser> {
  const data = await fetchJson<{ user: AuthUser }>("/api/auth/profile", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const user = normalizeUser(data.user);
  if (!user) throw new Error("프로필 저장에 실패했습니다.");
  return user;
}

export async function fetchDesktopHandoff(): Promise<{ deepLink: string; user: AuthUser }> {
  const data = await fetchJson<{ deepLink: string; user: AuthUser }>(
    "/api/auth/desktop-handoff",
  );
  const user = normalizeUser(data.user);
  if (!user || !data.deepLink) throw new Error("앱 연동에 실패했습니다.");
  return { deepLink: data.deepLink, user };
}

export async function logout(): Promise<void> {
  await fetch("/api/auth/logout", {
    method: "POST",
    credentials: "include",
    signal: AbortSignal.timeout(10_000),
  });
}

/** Complete OAuth when SPA accidentally received the provider callback URL. */
export async function exchangeOAuthCode(
  provider: OAuthProvider,
  code: string,
  state: string,
): Promise<
  | { ok: true; redirect: string; deepLink?: string }
  | { ok: false; reason: string }
> {
  try {
    const res = await fetch(`/api/auth/${provider}/exchange`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, state }),
      signal: AbortSignal.timeout(20_000),
    });
    const data = (await res.json()) as {
      ok?: boolean;
      redirect?: string;
      deepLink?: string;
      mode?: string;
      reason?: string;
    };
    if (!res.ok || !data.ok) {
      return { ok: false, reason: data.reason ?? "token_exchange" };
    }
    if (data.deepLink) {
      return { ok: true, redirect: data.deepLink, deepLink: data.deepLink };
    }
    if (!data.redirect) {
      return { ok: false, reason: "token_exchange" };
    }
    return { ok: true, redirect: data.redirect };
  } catch {
    return { ok: false, reason: "server" };
  }
}

export async function exchangeGoogleCode(code: string, state: string) {
  return exchangeOAuthCode("google", code, state);
}

/** Resize/compress image file to a small JPEG data URL for profile storage. */
export const PROFILE_IMAGE_MAX_SIDE = 125;
/** Max stored data-URL length (~125KB text). */
export const PROFILE_IMAGE_MAX_DATA_URL_CHARS = 125_000;

export async function fileToProfileDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("이미지 파일만 업로드할 수 있습니다.");
  }
  if (file.size > 5 * 1024 * 1024) {
    throw new Error("원본 이미지는 5MB 이하만 가능합니다.");
  }

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(
    1,
    PROFILE_IMAGE_MAX_SIDE / Math.max(bitmap.width, bitmap.height),
  );
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("이미지 처리에 실패했습니다.");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  let quality = 0.85;
  let dataUrl = canvas.toDataURL("image/jpeg", quality);
  while (dataUrl.length > PROFILE_IMAGE_MAX_DATA_URL_CHARS && quality > 0.35) {
    quality -= 0.1;
    dataUrl = canvas.toDataURL("image/jpeg", quality);
  }
  if (dataUrl.length > PROFILE_IMAGE_MAX_DATA_URL_CHARS) {
    throw new Error("이미지를 더 작게 줄이지 못했습니다. 다른 사진을 선택해 주세요.");
  }
  return dataUrl;
}
