import { $, escapeHtml } from "../dom";
import { clampNickname, NICKNAME_MAX_LENGTH } from "../limits";
import type { SongbookState, ViewMode } from "./types";

export type { ViewMode };

const VIEW_MODE_KEY = "sb_viewMode";
const FILTER_OPEN_KEY = "sb_filterOpen";
const NICKNAME_KEY = "sb_nickname";

export function readViewMode(): ViewMode {
  try {
    const raw = localStorage.getItem(VIEW_MODE_KEY);
    if (raw === "button" || raw === "list") return raw;
  } catch {
    /* ignore */
  }
  return "list";
}

export function readFilterOpen(): { genre: boolean; artist: boolean } {
  try {
    const raw = localStorage.getItem(FILTER_OPEN_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { genre?: boolean; artist?: boolean };
      return {
        genre: parsed.genre === true,
        artist: parsed.artist === true,
      };
    }
  } catch {
    /* ignore */
  }
  return { genre: false, artist: false };
}

export function readStoredNickname(): string {
  try {
    return clampNickname(localStorage.getItem(NICKNAME_KEY) ?? "");
  } catch {
    return "";
  }
}

export function storeNickname(value: string) {
  try {
    const next = clampNickname(value);
    if (next) localStorage.setItem(NICKNAME_KEY, next.slice(0, NICKNAME_MAX_LENGTH));
    else localStorage.removeItem(NICKNAME_KEY);
  } catch {
    /* ignore */
  }
}

export function applyViewMode(state: SongbookState, mode: ViewMode) {
  state.viewMode = mode;
  try {
    localStorage.setItem(VIEW_MODE_KEY, mode);
  } catch {
    /* ignore */
  }
  const list = $("#song-list");
  list.classList.toggle("list-mode", mode === "list");
  list.classList.toggle("button-mode", mode === "button");
  $("#view-list-btn").classList.toggle("active", mode === "list");
  $("#view-button-btn").classList.toggle("active", mode === "button");
}

export function applyFilterPanelOpen(state: SongbookState) {
  const genrePanel = $("#genre-filter-panel");
  const artistPanel = $("#artist-filter-panel");
  genrePanel.classList.toggle("is-collapsed", !state.filterOpen.genre);
  artistPanel.classList.toggle("is-collapsed", !state.filterOpen.artist);
  $("#genre-filter-toggle").setAttribute(
    "aria-expanded",
    state.filterOpen.genre ? "true" : "false",
  );
  $("#artist-filter-toggle").setAttribute(
    "aria-expanded",
    state.filterOpen.artist ? "true" : "false",
  );
}

export function persistFilterOpen(state: SongbookState) {
  try {
    localStorage.setItem(FILTER_OPEN_KEY, JSON.stringify(state.filterOpen));
  } catch {
    /* ignore */
  }
}

function renderFilterChips(
  containerId: string,
  metaId: string,
  items: string[],
  current: string,
  dataAttr: "genre" | "artist",
  onResetCurrent: () => void,
) {
  const container = $(`#${containerId}`);
  const meta = $(`#${metaId}`);
  const known = new Set(items.map((v) => v.toLowerCase()));
  if (current !== "ALL" && !known.has(current.toLowerCase())) {
    onResetCurrent();
    current = "ALL";
  }
  const chips = [
    `<button type="button" class="chip${current === "ALL" ? " active" : ""}" data-${dataAttr}="ALL">전체</button>`,
    ...items.map((item) => {
      const selected = current.toLowerCase() === item.toLowerCase();
      return `<button type="button" class="chip${selected ? " active" : ""}" data-${dataAttr}="${escapeHtml(item)}">${escapeHtml(item)}</button>`;
    }),
  ];
  container.innerHTML = chips.join("");
  const selectedLabel = current === "ALL" ? "" : current;
  meta.textContent = selectedLabel;
  meta.classList.toggle("has-selection", Boolean(selectedLabel));
  meta.title = selectedLabel;
}

export function renderFilterPanels(state: SongbookState) {
  renderFilterChips(
    "genre-chips",
    "genre-filter-meta",
    state.genres,
    state.currentGenre,
    "genre",
    () => {
      state.currentGenre = "ALL";
    },
  );
  renderFilterChips(
    "artist-chips",
    "artist-filter-meta",
    state.artists,
    state.currentArtist,
    "artist",
    () => {
      state.currentArtist = "ALL";
    },
  );
  applyFilterPanelOpen(state);
}
