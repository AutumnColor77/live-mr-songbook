import { $, escapeHtml } from "../dom";
import { icons } from "../icons";
import type { Song } from "../types";
import type { RequestGate } from "./request-gate";
import type { SongbookState } from "./types";

function songGenreLabel(song: Song): string {
  return String(song.genre || "").trim() || "미분류";
}

function difficultyStarsHtml(level: number | null | undefined): string {
  const n =
    typeof level === "number" && level >= 1 && level <= 5 ? Math.round(level) : 0;
  const stars = Array.from({ length: 5 }, (_, i) => {
    const on = i < n;
    return `<span class="${on ? "on" : ""}">${on ? "★" : "☆"}</span>`;
  }).join("");
  const title = n ? `난이도 ${n}` : "난이도 미설정";
  return `<span class="diff-stars${n ? "" : " is-empty"}" title="${title}" aria-label="${title}">${stars}</span>`;
}

function donationBadgeHtml(amount: number | null | undefined): string {
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) return "";
  const won = Math.round(amount).toLocaleString("ko-KR");
  return `<span class="donation-badge" title="후원금액 ${won}원">₩${won}</span>`;
}

export function renderSongs(state: SongbookState, gate: RequestGate) {
  const list = $("#song-list");
  $("#song-count").textContent = String(state.songs.length);

  if (state.songs.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="flex justify-center mb-3 text-dim">${icons.slash(26)}</div>
        검색 결과가 없습니다.
      </div>`;
    return;
  }

  const accepting = gate.isAccepting();
  const isButton = state.viewMode === "button";
  const blocked = gate.blockedSongIds();
  const queued = gate.queuedSongIds();

  list.innerHTML = state.songs
    .map((song) => {
      const inBlocked = blocked.has(song.id);
      const inQueue = queued.has(song.id);
      const requestBlocked = !accepting || inBlocked;
      const title = gate.songRequestTitle(song.id, blocked);
      const btnLabel = !accepting
        ? "신청"
        : inQueue
          ? "대기중"
          : inBlocked
            ? "완료됨"
            : "신청";
      const thumb = typeof song.thumbnail === "string" ? song.thumbnail.trim() : "";
      const thumbInner = thumb
        ? `<img src="${escapeHtml(thumb)}" alt="" loading="lazy" referrerpolicy="no-referrer" />`
        : `<span class="song-thumb--empty">${icons.disc(isButton ? 22 : 28)}</span>`;

      const tags = Array.isArray(song.tags) ? song.tags : [];
      const hasMr = tags.some((t) => String(t).toUpperCase() === "MR");
      const otherTags = tags.filter((t) => String(t).toUpperCase() !== "MR");
      const mrBadge = hasMr ? `<span class="status-badge mr">MR</span>` : "";
      const mrBadgeSm = hasMr ? `<span class="status-badge mr sm">MR</span>` : "";
      const genreLabel = songGenreLabel(song);
      const genreBadge =
        genreLabel && genreLabel !== "미분류"
          ? `<span class="genre-badge">${escapeHtml(genreLabel)}</span>`
          : "";
      const diffStars = difficultyStarsHtml(song.difficulty);
      const donationBadge = donationBadgeHtml(song.donationAmount);
      const tagHtml = otherTags
        .map((t) => `<span class="tag-badge">${escapeHtml(t)}</span>`)
        .join("");
      const hasGenreCol = Boolean(mrBadge || genreBadge);
      const hasTagsCol = otherTags.length > 0;
      const mobileMeta = [mrBadge, genreBadge].filter(Boolean).join("");

      if (isButton) {
        return `
        <article
          class="song-card button-row${requestBlocked ? " is-disabled" : ""}"
          data-song-id="${escapeHtml(song.id)}"
          role="button"
          tabindex="0"
          title="${title}"
        >
          <div class="thumbnail">${thumbInner}</div>
          <div class="song-info-content button-layout">
            <div class="col col-info">
              <div class="song-name" title="${escapeHtml(song.title)}">${escapeHtml(song.title)}</div>
              <div class="song-artist">${escapeHtml(song.artist)}</div>
              <div class="button-meta-row">
                ${diffStars}
                ${donationBadge}
                ${mrBadgeSm}
                ${genreBadge}
              </div>
            </div>
          </div>
        </article>`;
      }

      return `
        <article class="song-card list-row">
          <div class="thumbnail">${thumbInner}</div>
          <div class="col col-info">
            <div class="song-name" title="${escapeHtml(song.title)}">${escapeHtml(song.title)}</div>
            <div class="song-artist-badge">${escapeHtml(song.artist)}</div>
            ${
              mobileMeta
                ? `<div class="list-mobile-meta">${mobileMeta}</div>`
                : ""
            }
          </div>
          ${
            hasGenreCol
              ? `<div class="col col-genre">
            ${mrBadge ? `<div class="status-badge-wrapper">${mrBadge}</div>` : ""}
            ${genreBadge}
          </div>`
              : `<div class="col col-genre"></div>`
          }
          ${
            hasTagsCol
              ? `<div class="col col-tags">
            <div class="tag-container">${tagHtml}</div>
          </div>`
              : `<div class="col col-tags"></div>`
          }
          <div class="col col-action">
            ${diffStars}
            ${donationBadge}
            <button
              type="button"
              class="request-btn primary-btn btn-sm"
              data-song-id="${escapeHtml(song.id)}"
              title="${title}"
              ${requestBlocked ? "disabled" : ""}
            >${icons.mic(15)}${btnLabel}</button>
          </div>
        </article>`;
    })
    .join("");
}
