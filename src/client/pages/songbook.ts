import {
  fetchQueue,
  fetchSongs,
  fetchStatus,
  setChannelSlug,
} from "../api";
import { $ } from "../dom";
import {
  applyFilterPanelOpen,
  applyViewMode,
  persistFilterOpen,
  readFilterOpen,
  readViewMode,
  renderFilterPanels,
} from "../songbook/filters";
import { updateStatusUI } from "../songbook/queue-ui";
import { createRequestGate } from "../songbook/request-gate";
import {
  closeRequestModal,
  handleSubmitRequest,
  openRequestModal,
} from "../songbook/request-modal";
import { renderSongs } from "../songbook/render";
import { songbookShellHtml } from "../songbook/shell";
import type { SongbookState } from "../songbook/types";
import {
  THEME_LABELS,
  applyTheme,
  currentTheme,
  cycleTheme,
} from "../theme";
import { createToast } from "../toast";

export async function mountSongbook(root: HTMLElement, slug: string) {
  setChannelSlug(slug);
  applyTheme(currentTheme());
  root.innerHTML = songbookShellHtml();

  const state: SongbookState = {
    currentGenre: "ALL",
    currentArtist: "ALL",
    searchQuery: "",
    songs: [],
    genres: [],
    artists: [],
    queue: [],
    status: null,
    selectedSong: null,
    submitting: false,
    viewMode: readViewMode(),
    filterOpen: readFilterOpen(),
  };

  const toast = createToast(root);
  const gate = createRequestGate(state);

  async function refreshSongs() {
    try {
      const data = await fetchSongs(
        state.searchQuery,
        state.currentGenre,
        state.currentArtist,
      );
      state.songs = data.songs;
      state.genres = data.genres;
      state.artists = data.artists;
      renderFilterPanels(state);
      renderSongs(state, gate);
    } catch (err) {
      console.error(err);
      if (err instanceof Error && err.message.includes("Channel not found")) {
        toast.show("존재하지 않는 채널입니다.");
      }
    }
  }

  async function refreshQueueAndStatus() {
    try {
      const [status, queue] = await Promise.all([fetchStatus(), fetchQueue()]);
      state.status = status;
      state.queue = queue;
      updateStatusUI(state, gate, slug);
      renderSongs(state, gate);
    } catch (err) {
      console.error(err);
    }
  }

  const searchInput = $("#search-input") as HTMLInputElement;
  const searchClear = $("#search-clear");
  let searchTimer: number | undefined;

  searchInput.addEventListener("input", () => {
    state.searchQuery = searchInput.value.trim();
    searchClear.hidden = !searchInput.value;
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => void refreshSongs(), 180);
  });

  searchClear.addEventListener("click", () => {
    searchInput.value = "";
    state.searchQuery = "";
    searchClear.hidden = true;
    void refreshSongs();
  });

  $("#genre-filter-toggle").addEventListener("click", () => {
    state.filterOpen.genre = !state.filterOpen.genre;
    persistFilterOpen(state);
    applyFilterPanelOpen(state);
  });
  $("#artist-filter-toggle").addEventListener("click", () => {
    state.filterOpen.artist = !state.filterOpen.artist;
    persistFilterOpen(state);
    applyFilterPanelOpen(state);
  });

  $("#genre-chips").addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>(".chip");
    if (!btn) return;
    $("#genre-chips")
      .querySelectorAll(".chip")
      .forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    state.currentGenre = btn.dataset.genre ?? "ALL";
    void refreshSongs();
  });

  $("#artist-chips").addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>(".chip");
    if (!btn) return;
    $("#artist-chips")
      .querySelectorAll(".chip")
      .forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    state.currentArtist = btn.dataset.artist ?? "ALL";
    void refreshSongs();
  });

  applyFilterPanelOpen(state);
  applyViewMode(state, state.viewMode);

  $("#view-list-btn").addEventListener("click", () => {
    if (state.viewMode === "list") return;
    applyViewMode(state, "list");
    renderSongs(state, gate);
  });
  $("#view-button-btn").addEventListener("click", () => {
    if (state.viewMode === "button") return;
    applyViewMode(state, "button");
    renderSongs(state, gate);
  });

  $("#song-list").addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>(".request-btn");
    if (btn) {
      if (btn.disabled) return;
      openRequestModal(state, gate, toast, btn.dataset.songId ?? "");
      return;
    }
    const card = (e.target as HTMLElement).closest<HTMLElement>(".song-card.button-row");
    if (!card) return;
    const songId = card.dataset.songId ?? "";
    if (card.classList.contains("is-disabled") || gate.isSongRequestBlocked(songId)) {
      toast.show(gate.songRequestToast(songId));
      return;
    }
    openRequestModal(state, gate, toast, songId);
  });

  $("#song-list").addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const card = (e.target as HTMLElement).closest<HTMLElement>(".song-card.button-row");
    if (!card) return;
    e.preventDefault();
    card.click();
  });

  $("#close-request-modal").addEventListener("click", () => closeRequestModal(state));
  $("#request-modal-overlay").addEventListener("click", () => closeRequestModal(state));
  $("#submit-request-btn").addEventListener("click", () =>
    void handleSubmitRequest(state, toast, refreshQueueAndStatus),
  );

  const queueModal = $("#queue-modal");
  $("#open-queue-btn").addEventListener("click", () => {
    queueModal.hidden = false;
  });
  $("#close-queue-modal").addEventListener("click", () => {
    queueModal.hidden = true;
  });
  $("#queue-modal-overlay").addEventListener("click", () => {
    queueModal.hidden = true;
  });

  $("#theme-btn").addEventListener("click", () => {
    const next = cycleTheme();
    toast.show(`${THEME_LABELS[next]} 테마`);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    closeRequestModal(state);
    queueModal.hidden = true;
  });

  await Promise.all([refreshSongs(), refreshQueueAndStatus()]);
  window.setInterval(() => void refreshQueueAndStatus(), 5000);
}
