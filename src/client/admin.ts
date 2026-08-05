import {
  AdminAuthError,
  clearQueue,
  fetchAdminRequests,
  fetchPublicStatus,
  patchAdminSettings,
  patchRequestStatus,
  verifyAdminAccess,
} from "./admin-api";
import {
  fetchAuthStatus,
  fetchMe,
  logout,
  type AuthUser,
} from "./auth-api";
import { $, escapeHtml } from "./dom";
import { icons } from "./icons";
import {
  bindLoginPicker,
  loginButtonHtml,
  loginPickerOverlayHtml,
} from "./login-picker";
import type { SongRequest, StatusResponse } from "./types";

type Theme = "dark" | "light" | "pink" | "sky";
const THEMES: Theme[] = ["dark", "light", "pink", "sky"];
const THEME_STORAGE_KEY = "songbook-theme";
let adminPollTimer: number | undefined;

function stopAdminPolling() {
  if (adminPollTimer !== undefined) {
    window.clearInterval(adminPollTimer);
    adminPollTimer = undefined;
  }
}

function currentTheme(): Theme {
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  return THEMES.find((t) => t === stored) ?? "dark";
}

function logoSrc(theme: Theme): string {
  return theme === "dark" ? "/logo-on-dark.webp" : "/logo-on-light.webp";
}

function logoLinkHtml(options?: { fetchpriority?: boolean }): string {
  const fetchpriority = options?.fetchpriority
    ? " fetchpriority=\"high\""
    : "";
  return `<a href="/" class="min-w-0 shrink-0 block">
    <img id="logo-lockup" class="logo-lockup" src="${logoSrc(currentTheme())}" width="480" height="120" alt="Live MR Songbook 홈"${fetchpriority} />
  </a>`;
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
  return np ? `${np.title} - ${np.artist}` : "재생 중인 곡이 없습니다.";
}

function consumeAuthRedirect(): { toast: string; errorNotice: string } {
  const params = new URLSearchParams(location.search);
  const auth = params.get("auth");
  if (!auth) return { toast: "", errorNotice: "" };
  history.replaceState({}, "", location.pathname);
  if (auth === "ok") return { toast: "로그인되었습니다.", errorNotice: "" };
  if (auth === "error") {
    return { toast: "", errorNotice: "로그인에 실패했습니다. 다시 시도해 주세요." };
  }
  return { toast: "", errorNotice: "" };
}

export async function mountAdmin(root: HTMLElement, slug: string): Promise<void> {
  applyTheme(currentTheme());
  document.title = `운영 · Live MR Songbook`;

  const { toast, errorNotice } = consumeAuthRedirect();
  const [user, status] = await Promise.all([fetchMe(), fetchAuthStatus()]);
  if (!user) {
    mountLogin(root, slug, errorNotice, null, status);
    return;
  }

  try {
    await verifyAdminAccess(slug);
  } catch {
    mountLogin(
      root,
      slug,
      "이 채널 운영 권한이 없습니다. 다른 계정으로 다시 로그인해 주세요.",
      user,
      status,
    );
    return;
  }

  await mountDashboard(root, slug, user, "", toast);
}

function mountLogin(
  root: HTMLElement,
  slug: string,
  errorMsg = "",
  user: AuthUser | null = null,
  providers: { googleEnabled: boolean; naverEnabled: boolean } = {
    googleEnabled: true,
    naverEnabled: true,
  },
): void {
  stopAdminPolling();
  root.innerHTML = `
    <div class="relative z-10 min-h-screen flex flex-col">
      <header class="topbar sticky top-0 z-30">
        <div class="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
          ${logoLinkHtml()}
          <a href="/c/${escapeHtml(slug)}" class="secondary-btn btn-sm">노래책 보기</a>
        </div>
      </header>
      <main class="flex-1 flex items-center justify-center px-4 py-12">
        <div class="panel max-w-md w-full p-8 space-y-5 text-center">
          <div class="space-y-1">
            <h1 class="text-xl font-extrabold text-main">채널 운영</h1>
            <p class="text-sm text-muted">이 채널을 운영하려면 로그인해 주세요.</p>
          </div>
          ${
            errorMsg
              ? `<p class="text-sm font-semibold" style="color:#f87171">${escapeHtml(errorMsg)}</p>`
              : ""
          }
          ${
            user
              ? `<p class="text-xs text-dim">${escapeHtml(user.email)} 로 로그인됨</p>
                 <button id="admin-logout" type="button" class="secondary-btn w-full">다른 계정으로</button>`
              : ""
          }
          ${loginButtonHtml(providers, "로그인")}
          <p class="text-xs text-dim leading-relaxed">
            로그인하면 대기열을 관리할 수 있습니다.
          </p>
        </div>
      </main>
      ${loginPickerOverlayHtml(providers)}
      <div id="toast" class="toast" hidden></div>
    </div>
  `;

  const toast = $("#toast");
  function showToast(message: string) {
    toast.textContent = message;
    toast.hidden = false;
    window.setTimeout(() => {
      toast.hidden = true;
    }, 2400);
  }

  bindLoginPicker({ next: `/c/${slug}/admin`, onToast: showToast });

  const logoutBtn = document.querySelector("#admin-logout");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      await logout();
      mountLogin(root, slug, "", null, providers);
    });
  }
}

async function mountDashboard(
  root: HTMLElement,
  slug: string,
  user: AuthUser,
  inlineNotice = "",
  toast = "",
): Promise<void> {
  stopAdminPolling();
  root.innerHTML = `
    <div class="relative z-10 min-h-screen flex flex-col">
      <header class="topbar sticky top-0 z-30">
        <div class="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
          <div class="flex items-center gap-3 min-w-0">
            ${logoLinkHtml()}
            <div class="min-w-0">
              <p id="admin-channel-name" class="text-sm font-extrabold text-main truncate">…</p>
              <p class="text-xs font-medium text-dim">운영</p>
            </div>
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <a href="/me?next=${encodeURIComponent(`/c/${slug}/admin`)}" class="flex items-center gap-2 min-w-0 rounded-lg px-1.5 py-1 hover:bg-[var(--surface-3)] transition-colors" title="프로필 수정">
              ${
                user.picture
                  ? `<img src="${escapeHtml(user.picture)}" alt="" class="w-8 h-8 rounded-full border border-glass-border object-cover shrink-0" referrerpolicy="no-referrer" />`
                  : `<span class="w-8 h-8 rounded-full bg-[var(--surface-3)] flex items-center justify-center text-xs font-extrabold text-main shrink-0">${escapeHtml((user.name || user.email).slice(0, 1).toUpperCase())}</span>`
              }
              <span class="text-xs text-dim hidden md:inline truncate max-w-[140px]" title="${escapeHtml(user.email)}">${escapeHtml(user.name || user.email)}</span>
            </a>
            <a href="/c/${escapeHtml(slug)}" class="secondary-btn btn-sm hidden sm:inline-flex" target="_blank" rel="noopener">노래책 열기</a>
            <button id="theme-btn" type="button" class="icon-btn" title="테마 변경" aria-label="테마 변경">${icons.palette(18)}</button>
            <button id="admin-logout" type="button" class="secondary-btn btn-sm">로그아웃</button>
          </div>
        </div>
      </header>

      <main class="flex-1 w-full max-w-3xl mx-auto px-4 sm:px-6 py-5 space-y-4 pb-10">
        ${
          inlineNotice
            ? `<p class="text-sm font-semibold text-center" style="color:#4ade80">${escapeHtml(inlineNotice)}</p>`
            : ""
        }
        <section class="panel p-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p class="text-xs font-extrabold text-dim tracking-wide mb-1">신청 접수</p>
            <p id="accepting-label" class="text-sm font-bold text-main">…</p>
          </div>
          <button id="accepting-toggle" type="button" class="primary-btn btn-sm">신청 마감하기</button>
        </section>

        <section class="panel p-5">
          <div class="flex items-center gap-3">
            <span class="dock-art">${icons.disc(22)}</span>
            <div class="min-w-0 flex-1">
              <p class="dock-label">지금 재생</p>
              <p id="admin-now-playing" class="song-name text-sm">재생 중인 곡이 없습니다.</p>
            </div>
          </div>
        </section>

        <section class="panel p-5">
          <div class="flex items-center justify-between gap-3 mb-4">
            <div class="flex items-center gap-2">
              <h2 class="text-sm font-extrabold text-main">대기열</h2>
              <span id="admin-queue-count" class="count-badge">0</span>
            </div>
            <div class="flex items-center gap-2 flex-wrap justify-end">
              <button id="dup-toggle" type="button" class="secondary-btn btn-sm">중복 신청 차단</button>
              <button id="queue-clear" type="button" class="secondary-btn btn-sm">대기열 비우기</button>
            </div>
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
    }, 2400);
  }

  function queueActionsHtml(item: SongRequest): string {
    const id = escapeHtml(item.id);
    if (item.status === "playing") {
      return `
        <div class="admin-queue-actions">
          <button type="button" class="admin-act primary-btn btn-sm" data-act="done" data-id="${id}">완료</button>
          <button type="button" class="admin-act secondary-btn btn-sm" data-act="rejected" data-id="${id}">거절</button>
        </div>`;
    }
    return `
      <div class="admin-queue-actions">
        <button type="button" class="admin-act primary-btn btn-sm" data-act="playing" data-id="${id}">재생</button>
        <button type="button" class="admin-act secondary-btn btn-sm" data-act="done" data-id="${id}">완료</button>
        <button type="button" class="admin-act secondary-btn btn-sm" data-act="rejected" data-id="${id}">거절</button>
      </div>`;
  }

  function render() {
    const channelName = status?.channel?.name ?? slug;
    $("#admin-channel-name").textContent = channelName;
    document.title = `${channelName} · 운영 · Live MR Songbook`;

    const accepting = Boolean(status?.acceptingRequests);
    $("#accepting-label").textContent = accepting ? "신청 받는 중" : "신청 마감";
    const toggle = $("#accepting-toggle") as HTMLButtonElement;
    toggle.textContent = accepting ? "신청 마감하기" : "신청 다시 열기";
    toggle.classList.toggle("primary-btn", accepting);
    toggle.classList.toggle("secondary-btn", !accepting);

    const allowDup = status?.allowDuplicateRequests !== false;
    const dupToggle = $("#dup-toggle") as HTMLButtonElement;
    dupToggle.textContent = allowDup ? "중복 신청 차단" : "중복 신청 허용";
    dupToggle.classList.toggle("primary-btn", !allowDup);
    dupToggle.classList.toggle("secondary-btn", allowDup);

    $("#admin-now-playing").textContent = nowPlayingLabel(status);

    const active = requests
      .filter((r) => r.status === "pending" || r.status === "playing")
      .sort((a, b) => {
        if (a.status === "playing" && b.status !== "playing") return -1;
        if (b.status === "playing" && a.status !== "playing") return 1;
        return a.createdAt - b.createdAt;
      });
    $("#admin-queue-count").textContent = String(active.length);
    ($("#queue-clear") as HTMLButtonElement).disabled = active.length === 0;
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
            ${queueActionsHtml(item)}
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
        mountLogin(root, slug, "세션이 만료되었습니다. 다시 로그인해 주세요.");
        return;
      }
      console.error(err);
    }
  }

  $("#admin-logout").addEventListener("click", async () => {
    stopAdminPolling();
    await logout();
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
      if (err instanceof AdminAuthError) {
        mountLogin(root, slug, "세션이 만료되었습니다. 다시 로그인해 주세요.");
        return;
      }
      showToast(err instanceof Error ? err.message : "설정 변경 실패");
    } finally {
      busy = false;
    }
  });

  $("#dup-toggle").addEventListener("click", async () => {
    if (busy || !status) return;
    busy = true;
    try {
      const next = status.allowDuplicateRequests === false;
      await patchAdminSettings(slug, { allowDuplicateRequests: next });
      showToast(next ? "중복 신청을 허용합니다." : "중복 신청을 차단합니다.");
      await refresh();
    } catch (err) {
      if (err instanceof AdminAuthError) {
        mountLogin(root, slug, "세션이 만료되었습니다. 다시 로그인해 주세요.");
        return;
      }
      showToast(err instanceof Error ? err.message : "설정 변경 실패");
    } finally {
      busy = false;
    }
  });

  $("#queue-clear").addEventListener("click", async () => {
    if (busy) return;
    const count = requests.filter(
      (r) => r.status === "pending" || r.status === "playing",
    ).length;
    if (count === 0) return;
    if (!window.confirm(`대기열 ${count}곡을 모두 비웁니다. 계속할까요?`)) return;

    busy = true;
    try {
      const cleared = await clearQueue(slug);
      showToast(`대기열 ${cleared}곡을 비웠습니다.`);
      await refresh();
    } catch (err) {
      if (err instanceof AdminAuthError) {
        mountLogin(root, slug, "세션이 만료되었습니다. 다시 로그인해 주세요.");
        return;
      }
      showToast(err instanceof Error ? err.message : "초기화 실패");
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
      if (err instanceof AdminAuthError) {
        mountLogin(root, slug, "세션이 만료되었습니다. 다시 로그인해 주세요.");
        return;
      }
      showToast(err instanceof Error ? err.message : "처리 실패");
    } finally {
      busy = false;
    }
  });

  await refresh();
  adminPollTimer = window.setInterval(() => void refresh(), 4000);

  if (toast) {
    showToast(toast);
  }
}
