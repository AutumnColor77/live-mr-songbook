import type { SongRequest, StatusResponse } from "./types";

function tokenKey(slug: string): string {
  return `songbook-admin-token:${slug}`;
}

export function getAdminToken(slug: string): string | null {
  return sessionStorage.getItem(tokenKey(slug));
}

export function setAdminToken(slug: string, token: string): void {
  sessionStorage.setItem(tokenKey(slug), token);
}

export function clearAdminToken(slug: string): void {
  sessionStorage.removeItem(tokenKey(slug));
}

export class AdminAuthError extends Error {
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "AdminAuthError";
  }
}

function adminBase(slug: string): string {
  return `/api/c/${encodeURIComponent(slug)}/admin`;
}

async function adminFetch<T>(
  slug: string,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const token = getAdminToken(slug);
  if (!token) throw new AdminAuthError("Admin token missing");

  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(`${adminBase(slug)}${path}`, { ...init, headers });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };

  if (res.status === 401) {
    clearAdminToken(slug);
    throw new AdminAuthError(data.error ?? "Unauthorized");
  }
  if (!res.ok) {
    throw new Error(data.error ?? `Request failed (${res.status})`);
  }
  return data;
}

/** Verify token by hitting a cheap admin endpoint. */
export async function verifyAdminToken(slug: string): Promise<void> {
  await adminFetch<{ requests: SongRequest[] }>(slug, "/requests");
}

export async function fetchAdminRequests(slug: string): Promise<SongRequest[]> {
  const data = await adminFetch<{ requests: SongRequest[] }>(slug, "/requests");
  return data.requests;
}

export async function patchRequestStatus(
  slug: string,
  id: string,
  status: "pending" | "playing" | "done" | "rejected",
): Promise<SongRequest> {
  const data = await adminFetch<{ request: SongRequest }>(slug, `/requests/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
  return data.request;
}

export async function clearQueue(slug: string): Promise<number> {
  const data = await adminFetch<{ ok: boolean; cleared: number }>(slug, "/queue/clear", {
    method: "POST",
    body: JSON.stringify({}),
  });
  return data.cleared;
}

export async function patchAdminSettings(
  slug: string,
  body: { acceptingRequests?: boolean; nowPlayingId?: string | null },
): Promise<void> {
  await adminFetch<{ ok: boolean }>(slug, "/settings", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export async function fetchPublicStatus(slug: string): Promise<StatusResponse> {
  const res = await fetch(`/api/c/${encodeURIComponent(slug)}/status`);
  const data = (await res.json().catch(() => ({}))) as StatusResponse & {
    error?: string;
  };
  if (!res.ok) {
    throw new Error(data.error ?? `Request failed (${res.status})`);
  }
  return data;
}
