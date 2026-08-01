import "./style.css";
import { fetchQueue, fetchSongs, fetchStatus, submitRequest } from "./api";
import { $, escapeHtml } from "./dom";
import type { Song, SongRequest, StatusResponse } from "./types";

const CATEGORIES = ["ALL", "KPOP", "POP", "JPOP", "OST"] as const;

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("#app missing");

app.innerHTML = `
  <div class="min-h-screen flex flex-col">
    <header class="sticky top-0 z-30 border-b border-slate-800/80 bg-slate-900/90 backdrop-blur-md">
      <div class="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
        <div class="flex items-center gap-3 min-w-0">
          <div class="w-9 h-9 rounded-lg bg-indigo-600 flex items-center justify-center shrink-0">
            <i class="fa-solid fa-music text-white text-sm"></i>
          </div>
          <div class="min-w-0">
            <h1 class="text-base sm:text-lg font-bold tracking-wide bg-gradient-to-r from-indigo-400 to-cyan-400 bg-clip-text text-transparent truncate">
              LIVE MR SONGBOOK
            </h1>
            <p class="text-[11px] text-slate-500 hidden sm:block">시청자 신청 · 실시간 대기열</p>
          </div>
        </div>
        <div class="flex items-center gap-2 sm:gap-3 shrink-0">
          <div id="live-status" class="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
            <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
            <span id="live-status-text">신청 가능</span>
          </div>
          <div class="hidden sm:flex items-center gap-1 text-xs text-slate-400">
            대기 <span id="header-pending" class="text-indigo-300 font-semibold">0</span>
          </div>
        </div>
      </div>
    </header>

    <main class="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-4 sm:py-6 pb-28 lg:pb-6">
      <div class="lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-6 lg:items-start">
        <section class="space-y-4">
          <div class="relative">
            <i class="fa-solid fa-magnifying-glass absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 text-sm"></i>
            <input
              id="search-input"
              type="search"
              autocomplete="off"
              placeholder="곡 제목 또는 아티스트 검색..."
              class="w-full h-12 pl-10 pr-10 rounded-xl bg-slate-800/90 border border-slate-700/70 text-sm placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/60 focus:border-indigo-500/50"
            />
            <button
              id="search-clear"
              type="button"
              class="hidden absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 w-8 h-8"
              aria-label="검색 지우기"
            >
              <i class="fa-solid fa-circle-xmark"></i>
            </button>
          </div>

          <div id="category-container" class="flex gap-2 overflow-x-auto scrollbar-none pb-1">
            ${CATEGORIES.map(
              (cat, i) => `
              <button
                type="button"
                class="cat-btn shrink-0 h-10 px-3.5 rounded-lg text-xs font-medium border transition-colors ${
                  i === 0
                    ? "bg-indigo-600 text-white border-indigo-500"
                    : "bg-slate-800 text-slate-300 border-slate-700/70 hover:border-slate-500"
                }"
                data-category="${cat}"
              >${cat}</button>`,
            ).join("")}
          </div>

          <div class="flex items-center justify-between text-xs text-slate-500 px-0.5">
            <span>등록곡 <span id="song-count" class="text-slate-300 font-medium">0</span>곡</span>
            <span id="sync-label" class="text-indigo-300/80">연동 중…</span>
          </div>

          <div id="song-list" class="space-y-2"></div>
        </section>

        <aside class="hidden lg:block sticky top-20 space-y-4">
          <div class="rounded-2xl border border-slate-800 bg-slate-800/50 p-4">
            <div class="flex items-center gap-3 mb-3">
              <div class="w-10 h-10 rounded-xl bg-indigo-600/80 flex items-center justify-center">
                <i class="fa-solid fa-compact-disc text-white animate-spin-slow"></i>
              </div>
              <div class="min-w-0">
                <p class="text-[10px] font-bold tracking-wider text-indigo-300 uppercase">Now Playing</p>
                <p id="aside-now-playing" class="text-sm font-medium text-slate-100 truncate">현재 재생 중인 곡이 없습니다.</p>
              </div>
            </div>
            <div class="flex items-center justify-between text-xs text-slate-400 mb-2">
              <span>실시간 대기열</span>
              <span id="aside-queue-count" class="text-indigo-300 font-semibold">0</span>
            </div>
            <div id="aside-queue-list" class="space-y-2 max-h-[60vh] overflow-y-auto"></div>
          </div>
        </aside>
      </div>
    </main>

    <footer class="lg:hidden fixed bottom-0 inset-x-0 z-30 border-t border-slate-800/80 bg-slate-900/95 backdrop-blur-md pb-[env(safe-area-inset-bottom)]">
      <div class="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
        <div class="flex items-center gap-3 min-w-0">
          <div class="w-9 h-9 rounded-lg bg-indigo-600/80 flex items-center justify-center shrink-0">
            <i class="fa-solid fa-compact-disc text-white text-sm animate-spin-slow"></i>
          </div>
          <div class="min-w-0">
            <p class="text-[10px] font-bold tracking-wider text-indigo-300 uppercase">Now Playing</p>
            <p id="now-playing-text" class="text-sm text-slate-100 truncate">현재 재생 중인 곡이 없습니다.</p>
          </div>
        </div>
        <button
          id="open-queue-btn"
          type="button"
          class="shrink-0 inline-flex items-center gap-2 h-11 px-3 rounded-xl bg-indigo-600/20 border border-indigo-500/30 text-sm text-indigo-200"
        >
          <i class="fa-solid fa-list-ul"></i>
          대기열
          <span id="queue-badge" class="min-w-5 h-5 px-1 rounded-full bg-indigo-600 text-[11px] font-bold text-white flex items-center justify-center">0</span>
        </button>
      </div>
    </footer>

    <div id="request-modal" class="hidden fixed inset-0 z-40">
      <div id="request-modal-overlay" class="absolute inset-0 bg-black/60 backdrop-blur-sm"></div>
      <div class="absolute bottom-0 left-0 right-0 sm:bottom-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-full sm:max-w-md mx-auto bg-slate-800 border border-slate-700/80 rounded-t-2xl sm:rounded-2xl p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl">
        <div class="w-10 h-1 rounded-full bg-slate-600 mx-auto mb-4 sm:hidden"></div>
        <p class="text-xs font-semibold text-indigo-400 mb-1">Song Request</p>
        <h2 id="modal-song-title" class="text-lg font-semibold text-slate-100"></h2>
        <p id="modal-song-artist" class="text-sm text-slate-400 mb-4"></p>
        <div class="space-y-3 mb-5">
          <input
            id="req-nickname"
            type="text"
            maxlength="40"
            placeholder="신청자 닉네임 (선택)"
            class="w-full h-12 px-3 rounded-xl bg-slate-900/80 border border-slate-700/70 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/60"
          />
          <input
            id="req-comment"
            type="text"
            maxlength="200"
            placeholder="방송 전달 메시지 (선택)"
            class="w-full h-12 px-3 rounded-xl bg-slate-900/80 border border-slate-700/70 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/60"
          />
        </div>
        <div class="flex gap-2">
          <button id="close-request-modal" type="button" class="flex-1 h-12 rounded-xl bg-slate-700 text-sm font-medium text-slate-200">취소</button>
          <button id="submit-request-btn" type="button" class="flex-1 h-12 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-sm font-medium text-white">신청하기</button>
        </div>
      </div>
    </div>

    <div id="queue-modal" class="hidden fixed inset-0 z-40 lg:hidden">
      <div id="queue-modal-overlay" class="absolute inset-0 bg-black/60 backdrop-blur-sm"></div>
      <div class="absolute bottom-0 left-0 right-0 max-h-[75vh] bg-slate-800 border-t border-slate-700/80 rounded-t-2xl p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] flex flex-col">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-sm font-semibold text-slate-100 flex items-center gap-2">
            <i class="fa-solid fa-list-ul text-indigo-400"></i>
            실시간 대기열 목록
          </h2>
          <button id="close-queue-modal" type="button" class="w-10 h-10 rounded-lg text-slate-400 hover:text-white" aria-label="닫기">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>
        <div id="queue-list" class="overflow-y-auto space-y-2"></div>
      </div>
    </div>

    <div id="toast" class="hidden fixed top-4 left-1/2 -translate-x-1/2 z-50 max-w-sm w-[calc(100%-2rem)] px-4 py-3 rounded-xl bg-indigo-600 text-white text-sm font-medium shadow-lg text-center"></div>
  </div>
`;

type State = {
  currentCategory: string;
  searchQuery: string;
  songs: Song[];
  queue: SongRequest[];
  status: StatusResponse | null;
  selectedSong: Song | null;
  submitting: boolean;
};

const state: State = {
  currentCategory: "ALL",
  searchQuery: "",
  songs: [],
  queue: [],
  status: null,
  selectedSong: null,
  submitting: false,
};

function showToast(message: string) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.remove("hidden");
  window.setTimeout(() => toast.classList.add("hidden"), 2200);
}

function nowPlayingLabel(status: StatusResponse | null): string {
  const np = status?.nowPlaying;
  if (!np) return "현재 재생 중인 곡이 없습니다.";
  return `${np.title} - ${np.artist}`;
}

function renderQueueItems(container: HTMLElement, items: SongRequest[]) {
  const pendingOrPlaying = items.filter((q) => q.status === "pending" || q.status === "playing");
  if (pendingOrPlaying.length === 0) {
    container.innerHTML = `
      <div class="py-8 text-center text-slate-500 text-sm">
        <i class="fa-solid fa-music-slash mb-2 block text-lg"></i>
        대기 중인 곡이 없습니다.
      </div>`;
    return;
  }

  container.innerHTML = pendingOrPlaying
    .map((item, index) => {
      const playingBadge =
        item.status === "playing"
          ? `<span class="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">재생중</span>`
          : "";
      const comment = item.comment
        ? `<p class="text-[11px] text-slate-500 mt-0.5 truncate">${escapeHtml(item.comment)}</p>`
        : "";
      return `
        <div class="rounded-xl bg-slate-900/80 border border-slate-700/50 px-3 py-2.5">
          <div class="flex items-start gap-2">
            <span class="text-xs text-slate-500 font-mono w-5 shrink-0 pt-0.5">${index + 1}</span>
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2">
                <p class="text-sm font-semibold text-slate-100 truncate">${escapeHtml(item.title)}</p>
                ${playingBadge}
              </div>
              <p class="text-xs text-slate-400 truncate">${escapeHtml(item.artist)} · ${escapeHtml(item.nickname)}</p>
              ${comment}
            </div>
          </div>
        </div>`;
    })
    .join("");
}

function renderSongs() {
  const list = $("#song-list");
  const count = $("#song-count");
  count.textContent = String(state.songs.length);

  if (state.songs.length === 0) {
    list.innerHTML = `
      <div class="rounded-2xl border border-slate-800 bg-slate-800/40 py-16 text-center text-slate-500">
        <i class="fa-solid fa-music-slash text-2xl mb-3 block"></i>
        <p class="text-sm">검색 결과가 없습니다.</p>
      </div>`;
    return;
  }

  const accepting = state.status?.acceptingRequests !== false;

  list.innerHTML = state.songs
    .map((song) => {
      const tags = song.tags
        .map(
          (tag) =>
            `<span class="px-1.5 py-0.5 text-[10px] font-medium bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 rounded">${escapeHtml(tag)}</span>`,
        )
        .join("");
      const btnClass = accepting
        ? "bg-indigo-600 hover:bg-indigo-500 text-white"
        : "bg-slate-700 text-slate-400 cursor-not-allowed";
      return `
        <div class="rounded-xl bg-slate-800/80 border border-slate-700/60 px-3.5 py-3.5 flex items-center justify-between gap-3 shadow-sm">
          <div class="space-y-1 min-w-0 pr-2">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="font-semibold text-slate-100 truncate text-sm">${escapeHtml(song.title)}</span>
              ${tags}
            </div>
            <p class="text-xs text-slate-400 truncate">${escapeHtml(song.artist)}</p>
          </div>
          <button
            type="button"
            class="request-btn shrink-0 h-11 min-w-[4.5rem] px-3 rounded-lg text-xs font-medium transition-colors ${btnClass}"
            data-song-id="${escapeHtml(song.id)}"
            ${accepting ? "" : "disabled"}
          >
            <i class="fa-solid fa-microphone mr-1"></i>신청
          </button>
        </div>`;
    })
    .join("");
}

function updateStatusUI() {
  const accepting = state.status?.acceptingRequests !== false;
  const pending = state.status?.pendingCount ?? state.queue.filter((q) => q.status === "pending").length;
  const label = nowPlayingLabel(state.status);

  const live = $("#live-status");
  const liveText = $("#live-status-text");
  if (accepting) {
    live.className =
      "inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium bg-emerald-500/15 text-emerald-300 border border-emerald-500/30";
    liveText.textContent = "신청 가능";
  } else {
    live.className =
      "inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium bg-slate-700/60 text-slate-300 border border-slate-600/50";
    liveText.textContent = "신청 마감";
  }

  $("#header-pending").textContent = String(pending);
  $("#queue-badge").textContent = String(pending);
  $("#aside-queue-count").textContent = String(pending);
  $("#now-playing-text").textContent = label;
  $("#aside-now-playing").textContent = label;

  renderQueueItems($("#queue-list"), state.queue);
  renderQueueItems($("#aside-queue-list"), state.queue);
}

function openRequestModal(songId: string) {
  const song = state.songs.find((s) => s.id === songId);
  if (!song) return;
  if (state.status?.acceptingRequests === false) {
    showToast("지금은 신청을 받지 않습니다.");
    return;
  }
  state.selectedSong = song;
  $("#modal-song-title").textContent = song.title;
  $("#modal-song-artist").textContent = song.artist;
  ($("#req-nickname") as HTMLInputElement).value = "";
  ($("#req-comment") as HTMLInputElement).value = "";
  $("#request-modal").classList.remove("hidden");
}

function closeRequestModal() {
  $("#request-modal").classList.add("hidden");
  state.selectedSong = null;
}

async function handleSubmitRequest() {
  if (!state.selectedSong || state.submitting) return;
  state.submitting = true;
  const btn = $("#submit-request-btn") as HTMLButtonElement;
  btn.disabled = true;
  try {
    const nickname = ($("#req-nickname") as HTMLInputElement).value.trim();
    const comment = ($("#req-comment") as HTMLInputElement).value.trim();
    const title = state.selectedSong.title;
    await submitRequest({
      songId: state.selectedSong.id,
      nickname: nickname || undefined,
      comment: comment || undefined,
    });
    closeRequestModal();
    showToast(`${title} 신청이 완료되었습니다!`);
    await refreshQueueAndStatus();
  } catch (err) {
    showToast(err instanceof Error ? err.message : "신청에 실패했습니다.");
  } finally {
    state.submitting = false;
    btn.disabled = false;
  }
}

async function refreshSongs() {
  try {
    state.songs = await fetchSongs(state.searchQuery, state.currentCategory);
    $("#sync-label").textContent = "실시간 연동 중";
    renderSongs();
  } catch (err) {
    $("#sync-label").textContent = "연동 오류";
    console.error(err);
  }
}

async function refreshQueueAndStatus() {
  try {
    const [status, queue] = await Promise.all([fetchStatus(), fetchQueue()]);
    state.status = status;
    state.queue = queue;
    updateStatusUI();
    renderSongs();
  } catch (err) {
    console.error(err);
  }
}

function setupEventListeners() {
  const searchInput = $("#search-input") as HTMLInputElement;
  const searchClear = $("#search-clear");

  let searchTimer: number | undefined;
  searchInput.addEventListener("input", () => {
    state.searchQuery = searchInput.value.trim();
    searchClear.classList.toggle("hidden", !searchInput.value);
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => {
      void refreshSongs();
    }, 180);
  });

  searchClear.addEventListener("click", () => {
    searchInput.value = "";
    state.searchQuery = "";
    searchClear.classList.add("hidden");
    void refreshSongs();
  });

  $("#category-container").addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>(".cat-btn");
    if (!btn) return;
    document.querySelectorAll(".cat-btn").forEach((b) => {
      b.classList.remove("bg-indigo-600", "text-white", "border-indigo-500");
      b.classList.add("bg-slate-800", "text-slate-300", "border-slate-700/70");
    });
    btn.classList.remove("bg-slate-800", "text-slate-300", "border-slate-700/70");
    btn.classList.add("bg-indigo-600", "text-white", "border-indigo-500");
    state.currentCategory = btn.dataset.category ?? "ALL";
    void refreshSongs();
  });

  $("#song-list").addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>(".request-btn");
    if (!btn || btn.hasAttribute("disabled")) return;
    openRequestModal(btn.dataset.songId ?? "");
  });

  $("#close-request-modal").addEventListener("click", closeRequestModal);
  $("#request-modal-overlay").addEventListener("click", closeRequestModal);
  $("#submit-request-btn").addEventListener("click", () => {
    void handleSubmitRequest();
  });

  const queueModal = $("#queue-modal");
  $("#open-queue-btn").addEventListener("click", () => queueModal.classList.remove("hidden"));
  $("#close-queue-modal").addEventListener("click", () => queueModal.classList.add("hidden"));
  $("#queue-modal-overlay").addEventListener("click", () => queueModal.classList.add("hidden"));
}

async function init() {
  setupEventListeners();
  await Promise.all([refreshSongs(), refreshQueueAndStatus()]);
  window.setInterval(() => {
    void refreshQueueAndStatus();
  }, 5000);
}

void init();
