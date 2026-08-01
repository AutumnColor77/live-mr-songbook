import "./style.css";
import {
  fetchQueue,
  fetchSongs,
  fetchStatus,
  setChannelSlug,
  submitRequest,
} from "./api";
import { $, escapeHtml } from "./dom";
import { icons } from "./icons";
import type { Song, SongRequest, StatusResponse } from "./types";

const CATEGORIES = ["ALL", "KPOP", "POP", "JPOP", "OST"] as const;
const THEMES = ["dark", "light", "pink", "sky"] as const;
type Theme = (typeof THEMES)[number];
const THEME_LABELS: Record<Theme, string> = {
  dark: "다크",
  light: "라이트",
  pink: "핑크",
  sky: "스카이",
};
const THEME_STORAGE_KEY = "songbook-theme";
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("#app missing");

function currentTheme(): Theme {
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  return THEMES.find((t) => t === stored) ?? "dark";
}

function logoSrc(theme: Theme): string {
  return theme === "dark" ? "/logo-on-dark.webp" : "/logo-on-light.webp";
}

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem(THEME_STORAGE_KEY, theme);
  document.querySelectorAll<HTMLImageElement>("#logo-lockup").forEach((logo) => {
    logo.src = logoSrc(theme);
  });
}

function parseChannelSlug(): string | null {
  const match = /^\/c\/([^/]+)\/?$/i.exec(location.pathname);
  if (!match) return null;
  const slug = match[1]!.toLowerCase();
  return SLUG_RE.test(slug) ? slug : null;
}

function mountLanding() {
  applyTheme(currentTheme());
  app!.innerHTML = `
    <div class="relative z-10 min-h-screen flex flex-col">
      <header class="topbar sticky top-0 z-30">
        <div class="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
          <img
            id="logo-lockup"
            class="logo-lockup"
            src="${logoSrc(currentTheme())}"
            width="480"
            height="120"
            alt="Live MR SongBook"
            fetchpriority="high"
          />
          <button id="theme-btn" type="button" class="icon-btn" title="테마 변경" aria-label="테마 변경">
            ${icons.palette(18)}
          </button>
        </div>
      </header>
      <main class="flex-1 flex items-center justify-center px-4 py-12">
        <div class="panel max-w-md w-full p-8 text-center space-y-5">
          <div>
            <h1 class="text-xl font-extrabold text-main mb-2">Live MR Songbook</h1>
            <p class="text-sm font-medium text-muted">
              스트리머별 노래책 URL로 접속해 신청하세요.
            </p>
          </div>
          <a href="/c/demo" class="primary-btn w-full">데모 노래책 열기</a>
          <p class="text-xs text-dim leading-relaxed">
            시청자용 주소 형식<br />
            <code class="text-accent">/c/채널슬러그</code>
          </p>
        </div>
      </main>
    </div>
  `;

  $("#theme-btn").addEventListener("click", () => {
    const next = THEMES[(THEMES.indexOf(currentTheme()) + 1) % THEMES.length]!;
    applyTheme(next);
  });
}

function mountInvalidSlug() {
  applyTheme(currentTheme());
  app!.innerHTML = `
    <div class="relative z-10 min-h-screen flex items-center justify-center px-4">
      <div class="panel max-w-md w-full p-8 text-center space-y-4">
        <h1 class="text-lg font-extrabold text-main">잘못된 채널 주소</h1>
        <p class="text-sm text-muted">슬러그 형식을 확인해 주세요.</p>
        <a href="/" class="secondary-btn w-full">홈으로</a>
      </div>
    </div>
  `;
}

type State = {
  currentCategory: string;
  searchQuery: string;
  songs: Song[];
  queue: SongRequest[];
  status: StatusResponse | null;
  selectedSong: Song | null;
  submitting: boolean;
};

async function mountSongbook(slug: string) {
  setChannelSlug(slug);
  applyTheme(currentTheme());

  app!.innerHTML = `
  <div class="relative z-10 min-h-screen flex flex-col">
    <header class="topbar sticky top-0 z-30">
      <div class="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
        <div class="flex items-center gap-3 min-w-0">
          <img
            id="logo-lockup"
            class="logo-lockup"
            src="${logoSrc(currentTheme())}"
            width="480"
            height="120"
            alt="Live MR SongBook"
            fetchpriority="high"
          />
          <div class="min-w-0 hidden md:block">
            <p id="channel-name" class="text-sm font-extrabold text-main truncate">…</p>
            <p class="text-xs font-medium text-dim">/c/${escapeHtml(slug)} · 시청자 신청</p>
          </div>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <span id="live-pill" class="live-pill">
            <span class="live-dot"></span>
            <span id="live-pill-text">신청 가능</span>
          </span>
          <button id="theme-btn" type="button" class="icon-btn" title="테마 변경" aria-label="테마 변경">
            ${icons.palette(18)}
          </button>
        </div>
      </div>
    </header>

    <main class="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 py-5 pb-32 lg:pb-8">
      <div class="lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-6 lg:items-start">
        <section class="space-y-4">
          <div class="search-box">
            ${icons.search(18)}
            <input
              id="search-input"
              type="search"
              class="search-input"
              autocomplete="off"
              placeholder="곡 제목 또는 아티스트 검색..."
            />
            <button id="search-clear" type="button" class="search-clear" hidden aria-label="검색 지우기">
              ${icons.close(16)}
            </button>
          </div>

          <div id="category-container" class="flex gap-2 overflow-x-auto scrollbar-none pb-0.5">
            ${CATEGORIES.map(
              (cat, i) =>
                `<button type="button" class="chip${i === 0 ? " active" : ""}" data-category="${cat}">${cat}</button>`,
            ).join("")}
          </div>

          <div class="flex items-center justify-between px-1 text-xs font-semibold">
            <span class="text-dim">
              등록곡 <span id="song-count" class="text-main font-extrabold">0</span>곡
            </span>
            <span id="sync-label" class="text-dim">연동 중…</span>
          </div>

          <div id="song-list" class="space-y-2.5"></div>
        </section>

        <aside class="hidden lg:block sticky top-24">
          <div class="panel p-5">
            <div class="flex items-center gap-3 pb-4 mb-4 border-b border-glass-border">
              <span class="dock-art">${icons.disc(22)}</span>
              <div class="min-w-0">
                <p class="dock-label">Now Playing</p>
                <p id="aside-now-playing" class="song-name text-sm">현재 재생 중인 곡이 없습니다.</p>
              </div>
            </div>
            <div class="flex items-center justify-between mb-3">
              <span class="text-xs font-extrabold tracking-wide text-muted">실시간 대기열</span>
              <span id="aside-queue-count" class="count-badge">0</span>
            </div>
            <div id="aside-queue-list" class="space-y-2 max-h-[55vh] overflow-y-auto pr-0.5"></div>
          </div>
        </aside>
      </div>
    </main>

    <div class="dock lg:hidden fixed bottom-0 inset-x-0 z-30 pb-[env(safe-area-inset-bottom)]">
      <div class="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
        <div class="flex items-center gap-3 min-w-0">
          <span class="dock-art">${icons.disc(20)}</span>
          <div class="min-w-0">
            <p class="dock-label">Now Playing</p>
            <p id="now-playing-text" class="song-name text-sm">현재 재생 중인 곡이 없습니다.</p>
          </div>
        </div>
        <button id="open-queue-btn" type="button" class="secondary-btn btn-sm">
          ${icons.list(16)}
          대기열
          <span id="queue-badge" class="count-badge">0</span>
        </button>
      </div>
    </div>

    <div id="request-modal" class="modal-overlay" hidden>
      <div id="request-modal-overlay" class="absolute inset-0"></div>
      <div class="modal-content relative">
        <div class="modal-grip"></div>
        <p class="modal-eyebrow mb-1.5">Song Request</p>
        <h2 id="modal-song-title" class="text-lg font-extrabold text-main truncate"></h2>
        <p id="modal-song-artist" class="text-sm font-medium text-muted truncate mb-5"></p>
        <div class="space-y-3 mb-6">
          <input id="req-nickname" type="text" maxlength="40" class="cm-input" placeholder="신청자 닉네임 (선택)" />
          <input id="req-comment" type="text" maxlength="200" class="cm-input" placeholder="방송 전달 메시지 (선택)" />
        </div>
        <div class="flex gap-2.5">
          <button id="close-request-modal" type="button" class="secondary-btn flex-1">취소</button>
          <button id="submit-request-btn" type="button" class="primary-btn flex-1">
            ${icons.mic(16)}
            신청하기
          </button>
        </div>
      </div>
    </div>

    <div id="queue-modal" class="modal-overlay lg:hidden" hidden>
      <div id="queue-modal-overlay" class="absolute inset-0"></div>
      <div class="modal-content relative flex flex-col max-h-[78vh]">
        <div class="modal-grip"></div>
        <div class="flex items-center justify-between mb-4">
          <h2 class="flex items-center gap-2 text-sm font-extrabold text-main">
            <span class="text-accent">${icons.list(16)}</span>
            실시간 대기열 목록
          </h2>
          <button id="close-queue-modal" type="button" class="icon-btn" aria-label="닫기">${icons.close(16)}</button>
        </div>
        <div id="queue-list" class="space-y-2 overflow-y-auto pr-0.5"></div>
      </div>
    </div>

    <div id="toast" class="toast" hidden></div>
  </div>
`;

  const state: State = {
    currentCategory: "ALL",
    searchQuery: "",
    songs: [],
    queue: [],
    status: null,
    selectedSong: null,
    submitting: false,
  };

  let toastTimer: number | undefined;

  function showToast(message: string) {
    const toast = $("#toast");
    toast.textContent = message;
    toast.hidden = false;
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      toast.hidden = true;
    }, 2400);
  }

  function isAccepting(): boolean {
    return state.status?.acceptingRequests !== false;
  }

  function nowPlayingLabel(): string {
    const np = state.status?.nowPlaying;
    return np ? `${np.title} - ${np.artist}` : "현재 재생 중인 곡이 없습니다.";
  }

  function songBadges(song: Song): string {
    const tags = song.tags
      .map((tag) =>
        tag.toUpperCase() === "MR"
          ? `<span class="status-badge mr">MR</span>`
          : `<span class="tag-badge">${escapeHtml(tag)}</span>`,
      )
      .join("");
    return `<span class="category-badge">${escapeHtml(song.category)}</span>${tags}`;
  }

  function renderSongs() {
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

    const accepting = isAccepting();
    list.innerHTML = state.songs
      .map(
        (song) => `
          <div class="song-card">
            <div class="min-w-0 space-y-1.5">
              <p class="song-name">${escapeHtml(song.title)}</p>
              <p class="song-artist">${escapeHtml(song.artist)}</p>
              <div class="badge-row flex items-center gap-1.5 flex-wrap pt-0.5">${songBadges(song)}</div>
            </div>
            <button
              type="button"
              class="request-btn primary-btn btn-sm shrink-0"
              data-song-id="${escapeHtml(song.id)}"
              ${accepting ? "" : "disabled"}
            >${icons.mic(15)}신청</button>
          </div>`,
      )
      .join("");
  }

  function renderQueueItems(container: HTMLElement, items: SongRequest[]) {
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
        const comment = item.comment
          ? `<p class="text-[11px] font-medium text-dim truncate mt-0.5">${escapeHtml(item.comment)}</p>`
          : "";
        return `
          <div class="queue-row">
            <span class="queue-index">${index + 1}</span>
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2 min-w-0">
                <p class="song-name text-sm">${escapeHtml(item.title)}</p>
                ${playing}
              </div>
              <p class="song-artist text-xs">${escapeHtml(item.artist)} · ${escapeHtml(item.nickname)}</p>
              ${comment}
            </div>
          </div>`;
      })
      .join("");
  }

  function updateStatusUI() {
    const accepting = isAccepting();
    const pending =
      state.status?.pendingCount ?? state.queue.filter((q) => q.status === "pending").length;

    const pill = $("#live-pill");
    pill.classList.toggle("is-closed", !accepting);
    $("#live-pill-text").textContent = accepting ? "신청 가능" : "신청 마감";

    const channelName = state.status?.channel?.name ?? slug;
    $("#channel-name").textContent = channelName;
    document.title = `${channelName} · Live MR Songbook`;

    const label = nowPlayingLabel();
    $("#now-playing-text").textContent = label;
    $("#aside-now-playing").textContent = label;
    $("#queue-badge").textContent = String(pending);
    $("#aside-queue-count").textContent = String(pending);

    renderQueueItems($("#queue-list"), state.queue);
    renderQueueItems($("#aside-queue-list"), state.queue);
  }

  function openRequestModal(songId: string) {
    const song = state.songs.find((s) => s.id === songId);
    if (!song) return;
    if (!isAccepting()) {
      showToast("지금은 신청을 받지 않습니다.");
      return;
    }
    state.selectedSong = song;
    $("#modal-song-title").textContent = song.title;
    $("#modal-song-artist").textContent = song.artist;
    ($("#req-nickname") as HTMLInputElement).value = "";
    ($("#req-comment") as HTMLInputElement).value = "";
    $("#request-modal").hidden = false;
  }

  function closeRequestModal() {
    $("#request-modal").hidden = true;
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
      if (err instanceof Error && err.message.includes("Channel not found")) {
        showToast("존재하지 않는 채널입니다.");
      }
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

  $("#category-container").addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>(".chip");
    if (!btn) return;
    document.querySelectorAll(".chip").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    state.currentCategory = btn.dataset.category ?? "ALL";
    void refreshSongs();
  });

  $("#song-list").addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>(".request-btn");
    if (!btn || btn.disabled) return;
    openRequestModal(btn.dataset.songId ?? "");
  });

  $("#close-request-modal").addEventListener("click", closeRequestModal);
  $("#request-modal-overlay").addEventListener("click", closeRequestModal);
  $("#submit-request-btn").addEventListener("click", () => void handleSubmitRequest());

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
    const next = THEMES[(THEMES.indexOf(currentTheme()) + 1) % THEMES.length]!;
    applyTheme(next);
    showToast(`${THEME_LABELS[next]} 테마`);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    closeRequestModal();
    queueModal.hidden = true;
  });

  await Promise.all([refreshSongs(), refreshQueueAndStatus()]);
  window.setInterval(() => void refreshQueueAndStatus(), 5000);
}

async function boot() {
  if (location.pathname === "/" || location.pathname === "") {
    mountLanding();
    return;
  }

  if (location.pathname.startsWith("/c/")) {
    const slug = parseChannelSlug();
    if (!slug) {
      mountInvalidSlug();
      return;
    }
    await mountSongbook(slug);
    return;
  }

  // Unknown path → landing
  mountLanding();
}

void boot();
