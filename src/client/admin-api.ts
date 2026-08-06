import type { SongRequest, StatusResponse } from "./types";

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
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(`${adminBase(slug)}${path}`, {
    ...init,
    headers,
    credentials: "include",
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };

  if (res.status === 401) {
    throw new AdminAuthError(data.error ?? "Unauthorized");
  }
  if (!res.ok) {
    throw new Error(data.error ?? `Request failed (${res.status})`);
  }
  return data;
}

/** Verify Google session has channel admin access. */
export async function verifyAdminAccess(slug: string): Promise<void> {
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

export async function reorderQueue(slug: string, ids: string[]): Promise<void> {
  await adminFetch<{ ok: boolean }>(slug, "/queue/reorder", {
    method: "POST",
    body: JSON.stringify({ ids }),
  });
}

export async function patchAdminSettings(
  slug: string,
  body: {
    acceptingRequests?: boolean;
    allowDuplicateRequests?: boolean;
    duplicatePolicy?: "allow" | "queue" | "played";
    nowPlayingId?: string | null;
  },
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

export type ChzzkAdminStatus = {
  configured: boolean;
  linked: boolean;
  chzzkChannelId: string | null;
  chzzkChannelName: string | null;
  sessionStatus: string;
  sessionDetail: string;
  connectedAt: number | null;
  live?: boolean;
};

export async function fetchChzzkStatus(slug: string): Promise<ChzzkAdminStatus> {
  return adminFetch<ChzzkAdminStatus>(slug, "/chzzk");
}

export async function unlinkChzzk(slug: string): Promise<void> {
  await adminFetch<{ ok: boolean }>(slug, "/chzzk", { method: "DELETE" });
}

export async function restartChzzkSession(slug: string): Promise<void> {
  await adminFetch<{ ok?: boolean }>(slug, "/chzzk/session", {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export function chzzkConnectUrl(slug: string): string {
  return `${adminBase(slug)}/chzzk/connect`;
}
