import { escapeHtml } from "./dom";
import { icons } from "./icons";
import type { Song, StatusResponse } from "./types";

export function nowPlayingLabel(status: StatusResponse | null | undefined): string {
  const np = status?.nowPlaying;
  return np ? `${np.title} - ${np.artist}` : "재생 중인 곡이 없습니다.";
}

export function setDockArt(
  el: HTMLElement,
  thumbnail: string | null | undefined,
  iconSize: number,
) {
  const thumb = typeof thumbnail === "string" ? thumbnail.trim() : "";
  if (thumb) {
    el.classList.add("has-image");
    el.innerHTML = `<img src="${escapeHtml(thumb)}" alt="" loading="lazy" referrerpolicy="no-referrer" />`;
  } else {
    el.classList.remove("has-image");
    el.innerHTML = icons.disc(iconSize);
  }
}

export function thumbnailFromSongs(
  songId: string | null | undefined,
  songs: Song[],
): string {
  if (!songId) return "";
  const song = songs.find((s) => s.id === songId);
  return typeof song?.thumbnail === "string" ? song.thumbnail.trim() : "";
}

/** Cache now-playing art by songId so status polls don't refetch. */
export function createNowPlayingArtCache(
  fetchThumb: (songId: string) => Promise<string>,
) {
  let cached: { songId: string; url: string } | null = null;

  return async function resolve(
    status: StatusResponse | null | undefined,
    songs: Song[] = [],
  ): Promise<string> {
    const songId = status?.nowPlaying?.songId ?? null;
    if (!songId) {
      cached = null;
      return "";
    }

    const local = thumbnailFromSongs(songId, songs);
    if (local) {
      cached = { songId, url: local };
      return local;
    }

    if (cached?.songId === songId) return cached.url;

    try {
      const url = (await fetchThumb(songId)).trim();
      cached = { songId, url };
      return url;
    } catch {
      cached = { songId, url: "" };
      return "";
    }
  };
}
