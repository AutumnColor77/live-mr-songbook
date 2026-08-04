import type { Song, SongRequest, StatusResponse } from "./types";

let channelSlug = "";

export function setChannelSlug(slug: string) {
  channelSlug = slug;
}

export function getChannelSlug(): string {
  return channelSlug;
}

function apiBase(): string {
  if (!channelSlug) throw new Error("Channel slug is not set");
  return `/api/c/${encodeURIComponent(channelSlug)}`;
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export async function fetchSongs(
  search: string,
  genre: string,
  artist = "ALL",
): Promise<{ songs: Song[]; genres: string[]; artists: string[] }> {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  if (genre && genre !== "ALL") params.set("genre", genre);
  if (artist && artist !== "ALL") params.set("artist", artist);
  const qs = params.toString();
  const data = await getJson<{
    songs: Song[];
    genres?: string[];
    artists?: string[];
    categories?: string[];
  }>(`${apiBase()}/songs${qs ? `?${qs}` : ""}`);
  const genres = Array.isArray(data.genres)
    ? data.genres
    : Array.isArray(data.categories)
      ? data.categories
      : [];
  return {
    songs: Array.isArray(data.songs) ? data.songs : [],
    genres,
    artists: Array.isArray(data.artists) ? data.artists : [],
  };
}

export async function fetchStatus(): Promise<StatusResponse> {
  return getJson<StatusResponse>(`${apiBase()}/status`);
}

export async function fetchQueue(): Promise<SongRequest[]> {
  const data = await getJson<{ queue: SongRequest[] }>(`${apiBase()}/queue`);
  return data.queue;
}

export async function submitRequest(input: {
  songId: string;
  nickname?: string;
  comment?: string;
}): Promise<SongRequest> {
  const res = await fetch(`${apiBase()}/requests`, {
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
