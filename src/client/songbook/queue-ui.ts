import { $, escapeHtml } from "../dom";
import { icons } from "../icons";
import { nowPlayingLabel } from "../now-playing";
import type { SongRequest } from "../types";
import type { RequestGate } from "./request-gate";
import type { SongbookState } from "./types";

export function renderQueueItems(container: HTMLElement, items: SongRequest[]) {
  const active = items.filter((q) => q.status === "pending" || q.status === "playing");
  if (active.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="padding: 32px 16px">
        대기 중인 곡이 없습니다.
      </div>`;
    return;
  }

  container.innerHTML = active
    .map((item, index) => {
      const playing =
        item.status === "playing" ? `<span class="status-badge playing">재생중</span>` : "";
      const pay =
        typeof item.payAmount === "number" && item.payAmount > 0
          ? `<span class="status-badge">${escapeHtml(item.payAmount.toLocaleString("ko-KR"))}원</span>`
          : "";
      const comment = item.comment
        ? `<p class="text-[11px] font-medium text-dim truncate mt-0.5">${escapeHtml(item.comment)}</p>`
        : "";
      return `
        <div class="queue-row">
          <span class="queue-index">${index + 1}</span>
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2 min-w-0 flex-wrap">
              <p class="song-name text-sm">${escapeHtml(item.title)}</p>
              ${playing}
              ${pay}
            </div>
            <p class="song-artist text-xs">${escapeHtml(item.artist)} · ${escapeHtml(item.nickname)}</p>
            ${comment}
          </div>
        </div>`;
    })
    .join("");
}

export function updateStatusUI(state: SongbookState, gate: RequestGate, slug: string) {
  const accepting = gate.isAccepting();
  const pending =
    state.status?.pendingCount ?? state.queue.filter((q) => q.status === "pending").length;

  const pill = $("#live-pill");
  pill.classList.toggle("is-closed", !accepting);
  $("#live-pill-text").textContent = accepting ? "신청 가능" : "신청 마감";

  const channelName = state.status?.channel?.name ?? slug;
  $("#channel-name").textContent = channelName;
  document.title = `${channelName} · Live MR Songbook`;

  const label = nowPlayingLabel(state.status);
  $("#now-playing-text").textContent = label;
  $("#aside-now-playing").textContent = label;
  $("#queue-badge").textContent = String(pending);
  $("#aside-queue-count").textContent = String(pending);

  renderQueueItems($("#queue-list"), state.queue);
  renderQueueItems($("#aside-queue-list"), state.queue);

  const blocked = gate.blockedSongIds();
  const queued = gate.queuedSongIds();
  document.querySelectorAll<HTMLButtonElement>(".request-btn").forEach((btn) => {
    const songId = btn.dataset.songId ?? "";
    const requestBlocked = gate.isSongRequestBlocked(songId, blocked);
    btn.disabled = requestBlocked;
    btn.title = gate.songRequestTitle(songId, blocked);
    const inQueue = queued.has(songId);
    const inBlocked = blocked.has(songId);
    const labelText = !gate.isAccepting()
      ? "신청"
      : inQueue
        ? "대기중"
        : inBlocked
          ? "완료됨"
          : "신청";
    btn.innerHTML = `${icons.mic(15)}${labelText}`;
  });
  document.querySelectorAll<HTMLElement>(".song-card.button-row").forEach((card) => {
    const songId = card.dataset.songId ?? "";
    const requestBlocked = gate.isSongRequestBlocked(songId, blocked);
    card.classList.toggle("is-disabled", requestBlocked);
    card.title = gate.songRequestTitle(songId, blocked);
  });
}
