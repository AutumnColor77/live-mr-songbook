import type { SongbookState } from "./types";

export type RequestGate = {
  isAccepting: () => boolean;
  blockedSongIds: () => Set<string>;
  queuedSongIds: () => Set<string>;
  isSongRequestBlocked: (songId: string, blocked?: Set<string>) => boolean;
  songRequestTitle: (songId: string, blocked?: Set<string>) => string;
  songRequestToast: (songId: string) => string;
};

export function createRequestGate(state: SongbookState): RequestGate {
  function isAccepting(): boolean {
    return state.status?.acceptingRequests !== false;
  }

  function blockedSongIds(): Set<string> {
    const fromStatus = state.status?.blockedSongIds;
    if (Array.isArray(fromStatus)) {
      return new Set(fromStatus.filter((id): id is string => typeof id === "string" && id.length > 0));
    }
    const ids = new Set<string>();
    if (state.status?.allowDuplicateRequests === false) {
      for (const q of state.queue) {
        if (
          (q.status === "pending" || q.status === "playing") &&
          typeof q.songId === "string" &&
          q.songId
        ) {
          ids.add(q.songId);
        }
      }
    }
    return ids;
  }

  function queuedSongIds(): Set<string> {
    const ids = new Set<string>();
    for (const q of state.queue) {
      if (
        (q.status === "pending" || q.status === "playing") &&
        typeof q.songId === "string" &&
        q.songId
      ) {
        ids.add(q.songId);
      }
    }
    return ids;
  }

  function isSongRequestBlocked(songId: string, blocked?: Set<string>): boolean {
    if (!isAccepting()) return true;
    return (blocked ?? blockedSongIds()).has(songId);
  }

  function songRequestTitle(songId: string, blocked?: Set<string>): string {
    if (!isAccepting()) return "신청 마감";
    if (!(blocked ?? blockedSongIds()).has(songId)) return "신청하기";
    if (queuedSongIds().has(songId)) return "이미 대기열에 있음";
    return "이미 부른 곡";
  }

  function songRequestToast(songId: string): string {
    const title = songRequestTitle(songId);
    if (title === "이미 대기열에 있음") return "이미 대기열에 있는 곡입니다.";
    if (title === "이미 부른 곡") return "이미 부른 곡입니다.";
    return "지금은 신청을 받지 않습니다.";
  }

  return {
    isAccepting,
    blockedSongIds,
    queuedSongIds,
    isSongRequestBlocked,
    songRequestTitle,
    songRequestToast,
  };
}
