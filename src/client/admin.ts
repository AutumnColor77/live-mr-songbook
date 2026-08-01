import {
  AdminAuthError,
  clearAdminToken,
  fetchAdminRequests,
  fetchPublicStatus,
  getAdminToken,
  patchAdminSettings,
  patchRequestStatus,
  setAdminToken,
  verifyAdminToken,
} from "./admin-api";
import { $, escapeHtml } from "./dom";
import { icons } from "./icons";
import type { SongRequest, StatusResponse } from "./types";

type Theme = "dark" | "light" | "pink" | "sky";
const THEMES: Theme[] = ["dark", "light", "pink", "sky"];
const THEME_STORAGE_KEY = "songbook-theme";

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

function nowPlayingLabel(status: StatusResponse | null): string {
  const np = status?.nowPlaying;
  return np ? `${np.title} - ${np.artist}` : "현재 재생 중인 곡이 없습니다.";
}

export async function mountAdmin(root: HTMLElement, slug: string): Promise<void> {
  applyTheme(currentTheme());
  document.title = `운영 · ${slug} · Live MR Songbook`;

  const token = getAdminToken(slug);
  if (!token) {
    mountLogin(root, slug);
    return;
  }

  try {
    await verifyAdminToken(slug);
  } catch {
    clearAdminToken(slug);
    mountLogin(root, slug, "토큰이 유효하지 않습니다. 다시 입력해 주세요.");
    return;
  }

  await mountDashboard(root, slug);
}

function mountLogin(root: HTMLElement, slug: string, errorMsg = ""): void {
  root.innerHTML = `
    <div class="relative z-10 min-h-screen flex flex-col">
      <header class="topbar sticky top-0 z-30">
        <div class="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
          <img id="logo-lockup" class="logo-lockup" src="${logoSrc(currentTheme())}" width="480" height="120" alt="Live MR SongBook" />
          <a href="/c/${escapeHtml(slug)}" class="secondary-btn btn-sm">시청자 페이지</a>
        </div>
      </header>
      <main class="flex-1 flex items-center justify-center px-4 py-12">
        <form id="admin-login-form" class="panel max-w-md w-full p-8 space-y-5">
          <div class="text-center space-y-1">
            <p class="modal-eyebrow">Streamer Admin</p>
            <h1 class="text-xl font-extrabold text-main">채널 운영 로그인</h1>
            <p class="text-sm text-muted">/c/${escapeHtml(slug)}</p>
          </div>
          ${
            errorMsg
              ? `<p class="text-sm font-semibold text-center" style="color:#f87171">${escapeHtml(errorMsg)}</p>`
              : ""
          }
          <div class="space-y-2">
            <label class="text-xs font-extrabold text-dim tracking-wide" for="admin-token">채널 Admin Token</label>
            <input id="admin-token" type="password" class="cm-input" autocomplete="current-password" placeholder="채널 관리 토큰" required />
          </div>
          <button type="submit" class="primary-btn w-full" id="admin-login-btn">로그인</button>
          <p class="text-xs text-dim text-center leading-relaxed">
            토큰은 이 브라우저 탭 세션에만 저장됩니다.
          </p>
        </form>
      </main>
      <div id="toast" class="toast" hidden></div>
    </div>
  `;

  const form = $("#admin-login-form") as HTMLFormElement;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = $("#admin-token") as HTMLInputElement;
    const btn = $("#admin-login-btn") as HTMLButtonElement;
    const value = input.value.trim();
    if (!value) return;
    btn.disabled = true;
    setAdminToken(slug, value);
    try {
      await verifyAdminToken(slug);
      await mountAdmin(root, slug);
    } catch (err) {
      clearAdminToken(slug);
      const msg = err instanceof Error ? err.message : "로그인 실패";
      mountLogin(root, slug, msg);
    }
  });
}

async function mountDashboard(root: HTMLElement, slug: string): Promise<void> {
  root.innerHTML = `
    <div class="relative z-10 min-h-screen flex flex-col">
      <header class="topbar sticky top-0 z-30">
        <div class="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
          <div class="flex items-center gap-3 min-w-0">
            <img id="logo-lockup" class="logo-lockup" src="${logoSrc(currentTheme())}" width="480" height="120" alt="Live MR SongBook" />
            <div class="min-w-0 hidden sm:block">
              <p id="admin-channel-name" class="text-sm font-extrabold text-main truncate">…</p>
              <p class="text-xs font-medium text-dim">운영 · /c/${escapeHtml(slug)}</p>
            </div>
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <a href="/c/${escapeHtml(slug)}" class="secondary-btn btn-sm hidden sm:inline-flex" target="_blank" rel="noopener">공개 페이지</a>
            <button id="theme-btn" type="button" class="icon-btn" title="테마 변경" aria-label="테마 변경">${icons.palette(18)}</button>
            <button id="admin-logout" type="button" class="secondary-btn btn-sm">로그아웃</button>
          </div>
        </div>
      </header>

      <main class="flex-1 w-full max-w-3xl mx-auto px-4 sm:px-6 py-5 space-y-4 pb-10">
        <section class="panel p-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p class="text-xs font-extrabold text-dim tracking-wide mb-1">신청 접수</p>
            <p id="accepting-label" class="text-sm font-bold text-main">…</p>
          </div>
          <button id="accepting-toggle" type="button" class="primary-btn btn-sm">전환</button>
        </section>

        <section class="panel p-5">
          <div class="flex items-center gap-3">
            <span class="dock-art">${icons.disc(22)}</span>
            <div class="min-w-0">
              <p class="dock-label">Now Playing</p>
              <p id="admin-now-playing" class="song-name text-sm">현재 재생 중인 곡이 없습니다.</p>
            </div>
          </div>
        </section>

        <section class="space-y-3">
          <div class="flex items-center justify-between px-1">
            <h2 class="text-sm font-extrabold text-muted tracking-wide">대기열</h2>
            <span id="admin-queue-count" class="count-badge">0</span>
          </div>
          <div id="admin-queue-list" class="space-y-2"></div>
        </section>
      </main>

      <div id="toast" class="toast" hidden></div>
    </div>
  `;

  let status: StatusResponse | null = null;
  let requests: SongRequest[] = [];
  let busy = false;
  let toastTimer: number | undefined;

  function showToast(message: string) {
    const toast = $("#toast");
    toast.textContent = message;
    toast.hidden = false;
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      toast.hidden = true;
    }, 2200);
  }

  function render() {
    const accepting = status?.acceptingRequests !== false;
    $("#admin-channel-name").textContent = status?.channel?.name ?? slug;
    $("#accepting-label").textContent = accepting ? "신청 가능" : "신청 마감";
    const toggle = $("#accepting-toggle") as HTMLButtonElement;
    toggle.textContent = accepting ? "마감하기" : "열기";
    toggle.className = accepting ? "secondary-btn btn-sm" : "primary-btn btn-sm";

    $("#admin-now-playing").textContent = nowPlayingLabel(status);

    const active = requests.filter((r) => r.status === "pending" || r.status === "playing");
    $("#admin-queue-count").textContent = String(active.length);
    const list = $("#admin-queue-list");

    if (active.length === 0) {
      list.innerHTML = `<div class="empty-state" style="padding:32px 16px">대기 중인 곡이 없습니다.</div>`;
      return;
    }

    list.innerHTML = active
      .map((item, index) => {
        const playingBadge =
          item.status === "playing"
            ? `<span class="status-badge playing">재생중</span>`
            : "";
        const comment = item.comment
          ? `<p class="text-[11px] font-medium text-dim mt-0.5">${escapeHtml(item.comment)}</p>`
          : "";
        const playDisabled = item.status === "playing" ? "disabled" : "";
        return `
          <div class="queue-row !items-center" data-id="${escapeHtml(item.id)}">
            <span class="queue-index">${index + 1}</span>
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2 flex-wrap">
                <p class="song-name text-sm">${escapeHtml(item.title)}</p>
                ${playingBadge}
              </div>
              <p class="song-artist text-xs">${escapeHtml(item.artist)} · ${escapeHtml(item.nickname)}</p>
              ${comment}
            </div>
            <div class="flex flex-col sm:flex-row gap-1.5 shrink-0">
              <button type="button" class="admin-act primary-btn btn-sm" data-act="playing" data-id="${escapeHtml(item.id)}" ${playDisabled}>재생</button>
              <button type="button" class="admin-act secondary-btn btn-sm" data-act="done" data-id="${escapeHtml(item.id)}">완료</button>
              <button type="button" class="admin-act secondary-btn btn-sm" data-act="rejected" data-id="${escapeHtml(item.id)}">거절</button>
            </div>
          </div>`;
      })
      .join("");
  }

  async function refresh() {
    try {
      const [s, reqs] = await Promise.all([
        fetchPublicStatus(slug),
        fetchAdminRequests(slug),
      ]);
      status = s;
      requests = reqs;
      render();
    } catch (err) {
      if (err instanceof AdminAuthError) {
        clearAdminToken(slug);
        mountLogin(root, slug, "세션이 만료되었습니다. 다시 로그인해 주세요.");
        return;
      }
      console.error(err);
    }
  }

  $("#admin-logout").addEventListener("click", () => {
    clearAdminToken(slug);
    mountLogin(root, slug);
  });

  $("#theme-btn").addEventListener("click", () => {
    const next = THEMES[(THEMES.indexOf(currentTheme()) + 1) % THEMES.length]!;
    applyTheme(next);
  });

  $("#accepting-toggle").addEventListener("click", async () => {
    if (busy || !status) return;
    busy = true;
    try {
      const next = !status.acceptingRequests;
      await patchAdminSettings(slug, { acceptingRequests: next });
      showToast(next ? "신청을 열었습니다." : "신청을 마감했습니다.");
      await refresh();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "설정 변경 실패");
    } finally {
      busy = false;
    }
  });

  $("#admin-queue-list").addEventListener("click", async (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>(".admin-act");
    if (!btn || btn.disabled || busy) return;
    const id = btn.dataset.id ?? "";
    const act = btn.dataset.act as "playing" | "done" | "rejected" | undefined;
    if (!id || !act) return;

    busy = true;
    try {
      await patchRequestStatus(slug, id, act);
      const labels = { playing: "재생 중으로 표시", done: "완료 처리", rejected: "거절 처리" };
      showToast(labels[act]);
      await refresh();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "처리 실패");
    } finally {
      busy = false;
    }
  });

  await refresh();
  window.setInterval(() => void refresh(), 4000);
}
