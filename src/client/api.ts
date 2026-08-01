import type { Song, SongRequest, StatusResponse } from "./types";

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export async function fetchSongs(search: string, category: string): Promise<Song[]> {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  if (category && category !== "ALL") params.set("category", category);
  const qs = params.toString();
  const data = await getJson<{ songs: Song[] }>(`/api/songs${qs ? `?${qs}` : ""}`);
  return data.songs;
}

export async function fetchStatus(): Promise<StatusResponse> {
  return getJson<StatusResponse>("/api/status");
}

export async function fetchQueue(): Promise<SongRequest[]> {
  const data = await getJson<{ queue: SongRequest[] }>("/api/queue");
  return data.queue;
}

export async function submitRequest(input: {
  songId: string;
  nickname?: string;
  comment?: string;
}): Promise<SongRequest> {
  const res = await fetch("/api/requests", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = (await res.json().catch(() => ({}))) as {
    request?: SongRequest;
    error?: string;
  };
  if (!res.ok) {
    throw new Error(data.error ?? `Request failed (${res.status})`);
  }
  return data.request!;
}
