import "./style.css";
import { mountAdmin } from "./admin";
import {
  createChannel,
  exchangeOAuthCode,
  fetchAuthStatus,
  fetchDesktopHandoff,
  fetchMe,
  fetchSession,
  logout,
  updateChannel,
  type AuthUser,
  type OAuthProvider,
  type UserChannel,
} from "./auth-api";
import {
  fetchQueue,
  fetchSongs,
  fetchStatus,
  setChannelSlug,
  submitRequest,
} from "./api";
import { $, escapeHtml } from "./dom";
import { icons } from "./icons";
import {
  bindLoginPicker,
  loginButtonHtml,
  loginPickerOverlayHtml,
} from "./login-picker";
import {
  bindProfileEditor,
  profileEditorFieldsHtml,
} from "./profile-editor";
import type { Song, SongRequest, StatusResponse } from "./types";

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

function parseChannelPath(): { slug: string; admin: boolean } | null {
  const match = /^\/c\/([^/]+)(?:\/(admin))?\/?$/i.exec(location.pathname);
  if (!match) return null;
  const slug = match[1]!.toLowerCase();
  if (!SLUG_RE.test(slug)) return null;
  return { slug, admin: (match[2] ?? "").toLowerCase() === "admin" };
}

function authErrorNotice(reason: string): string {
  const messages: Record<string, string> = {
    not_configured: "지금은 로그인을 사용할 수 없습니다. 잠시 후 다시 시도해 주세요.",
    invalid_state: "로그인 세션이 만료되었습니다. 다시 시도해 주세요.",
    missing_code: "로그인 정보가 없습니다. 다시 시도해 주세요.",
    token_exchange: "로그인에 실패했습니다. 다시 시도해 주세요.",
    userinfo: "프로필을 가져오지 못했습니다. 다시 시도해 주세요.",
    access_denied: "로그인이 취소되었거나 접근이 거부되었습니다.",
    redirect_uri_mismatch: "로그인 설정에 문제가 있습니다. 관리자에게 문의해 주세요.",
    server: "서버 오류로 로그인에 실패했습니다. 잠시 후 다시 시도해 주세요.",
  };
  return messages[reason] ?? "로그인에 실패했습니다. 다시 시도해 주세요.";
}

function consumeAuthQuery(): { toast: string; errorNotice: string } {
  const params = new URLSearchParams(location.search);
  const authStatus = params.get("auth");
  let toast = "";
  let errorNotice = "";
  if (authStatus === "ok") {
    toast = "로그인되었습니다.";
  } else if (authStatus === "error") {
    errorNotice = authErrorNotice(params.get("reason") ?? "unknown");
  }
  if (authStatus) {
    history.replaceState({}, "", location.pathname);
  }
  return { toast, errorNotice };
}

async function mountAccount(
  root: HTMLElement,
  user: AuthUser,
  channels: UserChannel[],
  inlineNotice = "",
  toast = "",
): Promise<void> {
  applyTheme(currentTheme());
  document.title = "내 채널 · Live MR Songbook";

  const nextPath = (() => {
    const raw = new URLSearchParams(location.search).get("next") || "";
    if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("://")) return "";
    return raw;
  })();

  const ownChannels = channels.filter((ch) => ch.slug !== "demo");
  const own = ownChannels[0] ?? null;
  const publicUrl = own ? `${location.origin}/c/${own.slug}` : "";

  const channelCardHtml = own
    ? `
        <div class="rounded-xl border border-glass-border bg-[var(--surface-2)] px-3 py-3 space-y-3">
          <div class="text-center space-y-1">
            <p class="text-base font-extrabold text-main">${escapeHtml(own.name)}</p>
            <p class="text-xs text-dim truncate" id="channel-public-url" title="${escapeHtml(publicUrl)}">${escapeHtml(publicUrl)}</p>
          </div>
          <div class="flex gap-2">
            <a href="/c/${escapeHtml(own.slug)}/admin" class="primary-btn btn-sm flex-1 text-center">운영하기</a>
            <a href="/c/${escapeHtml(own.slug)}" class="secondary-btn btn-sm flex-1 text-center" target="_blank" rel="noopener">노래책 열기</a>
          </div>
          <button type="button" id="copy-channel-url" class="secondary-btn btn-sm w-full">노래책 주소 복사</button>
          <details class="border-t border-glass-border pt-3">
            <summary class="cursor-pointer text-xs font-extrabold text-dim tracking-wide text-center list-none">채널 설정</summary>
            <form id="edit-channel-form" class="mt-3 space-y-3" data-channel-id="${escapeHtml(own.id)}">
              <label class="block text-left space-y-1.5">
                <span class="text-xs font-extrabold text-dim tracking-wide">표시 이름</span>
                <input id="edit-channel-name" type="text" maxlength="80" required class="w-full rounded-xl border border-glass-border bg-[var(--surface-3)] px-3 py-2.5 text-sm text-main" value="${escapeHtml(own.name)}" />
              </label>
              <label class="block text-left space-y-1.5">
                <span class="text-xs font-extrabold text-dim tracking-wide">노래책 주소</span>
                <span class="flex items-center gap-1.5">
                  <span class="text-xs text-dim shrink-0">/c/</span>
                  <input id="edit-channel-slug" type="text" maxlength="63" required pattern="[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?" class="w-full rounded-xl border border-glass-border bg-[var(--surface-3)] px-3 py-2.5 text-sm text-main" value="${escapeHtml(own.slug)}" />
                </span>
              </label>
              <p id="edit-channel-error" class="text-sm font-semibold text-center" style="color:#f87171" hidden></p>
              <button type="submit" class="primary-btn w-full btn-sm">채널 저장</button>
            </form>
          </details>
        </div>`
    : `<p class="text-sm text-dim text-center py-2">아직 만든 채널이 없습니다.</p>`;

  root.innerHTML = `
    <div class="relative z-10 min-h-screen flex flex-col">
      <header class="topbar sticky top-0 z-30">
        <div class="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
          ${logoLinkHtml()}
          <div class="flex items-center gap-2 shrink-0">
            <button id="theme-btn" type="button" class="icon-btn" title="테마 변경" aria-label="테마 변경">${icons.palette(18)}</button>
            <button id="logout-btn" type="button" class="secondary-btn btn-sm">로그아웃</button>
          </div>
        </div>
      </header>
      <main class="flex-1 flex items-center justify-center px-4 py-12">
        <div class="panel max-w-md w-full p-8 space-y-6">
          <div class="text-center space-y-3">
            <h1 class="text-xl font-extrabold text-main">내 채널</h1>
            <div class="flex items-center gap-3 justify-center">
              ${
                user.picture
                  ? `<img src="${escapeHtml(user.picture)}" alt="" class="w-12 h-12 rounded-full border border-glass-border object-cover" referrerpolicy="no-referrer" />`
                  : `<span class="w-12 h-12 rounded-full bg-[var(--surface-3)] flex items-center justify-center text-base font-extrabold text-main">${escapeHtml((user.name || user.email).slice(0, 1).toUpperCase())}</span>`
              }
              <div class="min-w-0 text-left">
                <p class="text-sm font-extrabold text-main truncate">${escapeHtml(user.name || "사용자")}</p>
                <p class="text-xs text-dim truncate">${escapeHtml(user.email)}</p>
              </div>
            </div>
            ${
              inlineNotice
                ? `<p class="text-sm font-semibold" style="color:${inlineNotice.startsWith("저장") || inlineNotice.startsWith("채널") || inlineNotice.startsWith("노래책") ? "#4ade80" : "#f87171"}">${escapeHtml(inlineNotice)}</p>`
                : ""
            }
          </div>

          <section class="space-y-2.5">
            <div class="space-y-2">${channelCardHtml}</div>
          </section>

          ${
            ownChannels.length === 0
              ? `
          <form id="create-channel-form" class="space-y-3 border-t border-glass-border pt-5">
            <p class="text-sm font-extrabold text-main text-center">채널 만들기</p>
            <label class="block text-left space-y-1.5">
              <span class="text-xs font-extrabold text-dim tracking-wide">표시 이름</span>
              <input id="channel-name" type="text" maxlength="80" required class="w-full rounded-xl border border-glass-border bg-[var(--surface-2)] px-3 py-2.5 text-sm text-main" placeholder="예: 가을색의 노래책" value="${escapeHtml(user.name ? `${user.name}의 노래책` : "")}" />
            </label>
            <p id="channel-url-hint" class="text-xs text-dim text-left leading-relaxed">
              노래책 주소는 자동으로 만들어집니다. 나중에 바꿀 수 있어요.
            </p>
            <details id="slug-details" class="text-left">
              <summary class="cursor-pointer text-xs font-extrabold text-dim tracking-wide">주소 직접 지정</summary>
              <label class="mt-2 flex items-center gap-1.5">
                <span class="text-xs text-dim shrink-0">/c/</span>
                <input id="channel-slug" type="text" maxlength="63" pattern="[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?" class="w-full rounded-xl border border-glass-border bg-[var(--surface-2)] px-3 py-2.5 text-sm text-main" placeholder="비우면 자동 생성" />
              </label>
            </details>
            <p id="create-channel-error" class="text-sm font-semibold text-center" style="color:#f87171" hidden></p>
            <button type="submit" class="primary-btn w-full">채널 만들기</button>
          </form>`
              : ""
          }

          <details class="border-t border-glass-border pt-5">
            <summary class="cursor-pointer text-sm font-extrabold text-main text-center list-none">프로필 수정</summary>
            <form id="profile-edit-form" class="mt-4 space-y-5 text-center">
              ${profileEditorFieldsHtml(user)}
              <button type="submit" class="primary-btn w-full">프로필 저장</button>
            </form>
          </details>

          <div class="border-t border-glass-border pt-5 space-y-3">
            ${
              nextPath
                ? `<a href="${escapeHtml(nextPath)}" class="secondary-btn w-full">돌아가기</a>`
                : ""
            }
            <a href="/" class="secondary-btn w-full">홈으로</a>
          </div>
        </div>
      </main>
      <div id="toast" class="toast" hidden></div>
    </div>
  `;

  $("#theme-btn").addEventListener("click", () => {
    const next = THEMES[(THEMES.indexOf(currentTheme()) + 1) % THEMES.length]!;
    applyTheme(next);
  });

  $("#logout-btn").addEventListener("click", async () => {
    await logout();
    location.assign("/");
  });

  const copyBtn = document.querySelector<HTMLButtonElement>("#copy-channel-url");
  if (copyBtn && publicUrl) {
    copyBtn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(publicUrl);
        showAccountToast("노래책 주소를 복사했습니다.");
      } catch {
        showAccountToast("복사에 실패했습니다.");
      }
    });
  }

  function showAccountToast(message: string) {
    const toast = document.querySelector<HTMLElement>("#toast");
    if (!toast) return;
    toast.textContent = message;
    toast.hidden = false;
    window.setTimeout(() => {
      toast.hidden = true;
    }, 2400);
  }

  const createForm = document.querySelector<HTMLFormElement>("#create-channel-form");
  if (createForm) {
    const nameInput = $("#channel-name") as HTMLInputElement;
    const slugInput = $("#channel-slug") as HTMLInputElement;
    const createError = $("#create-channel-error");

    slugInput.addEventListener("input", () => {
      slugInput.value = slugInput.value.toLowerCase().replace(/[^a-z0-9-]/g, "");
    });

    createForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      createError.hidden = true;
      const submitBtn = createForm.querySelector<HTMLButtonElement>('button[type="submit"]');
      if (submitBtn) submitBtn.disabled = true;
      try {
        const customSlug = slugInput.value.trim();
        const channel = await createChannel({
          name: nameInput.value.trim(),
          ...(customSlug ? { slug: customSlug } : {}),
        });
        location.assign(`/c/${channel.slug}/admin?auth=ok`);
      } catch (err) {
        createError.hidden = false;
        createError.textContent = err instanceof Error ? err.message : "채널 생성에 실패했습니다.";
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }

  const editForm = document.querySelector<HTMLFormElement>("#edit-channel-form");
  if (editForm) {
    const channelId = editForm.dataset.channelId || "";
    const nameInput = $("#edit-channel-name") as HTMLInputElement;
    const slugInput = $("#edit-channel-slug") as HTMLInputElement;
    const editError = $("#edit-channel-error");
    const prevSlug = slugInput.value;

    slugInput.addEventListener("input", () => {
      slugInput.value = slugInput.value.toLowerCase().replace(/[^a-z0-9-]/g, "");
    });

    editForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      editError.hidden = true;
      const submitBtn = editForm.querySelector<HTMLButtonElement>('button[type="submit"]');
      if (submitBtn) submitBtn.disabled = true;
      try {
        const updated = await updateChannel(channelId, {
          name: nameInput.value.trim(),
          slug: slugInput.value.trim(),
        });
        const session = await fetchSession();
        const slugChanged = updated.slug !== prevSlug;
        await mountAccount(
          root,
          user,
          session?.channels ?? [{ ...updated }],
          slugChanged
            ? "노래책 주소가 바뀌었습니다. 새 주소를 복사해 공유하세요."
            : "채널이 저장되었습니다.",
        );
      } catch (err) {
        editError.hidden = false;
        editError.textContent = err instanceof Error ? err.message : "채널 수정에 실패했습니다.";
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }

  bindProfileEditor({
    initial: user,
    form: $("#profile-edit-form") as HTMLFormElement,
    onSaved: async (saved) => {
      const session = await fetchSession();
      await mountAccount(
        root,
        saved,
        session?.channels ?? channels,
        "저장되었습니다.",
      );
    },
  });

  if (toast) {
    showAccountToast(toast);
  }
}

function mountLanding(
  user: AuthUser | null = null,
  providers: { googleEnabled: boolean; naverEnabled: boolean } = {
    googleEnabled: false,
    naverEnabled: false,
  },
  feedback: { toast?: string; errorNotice?: string } = {},
) {
  applyTheme(currentTheme());

  function showToast(message: string) {
    const toast = document.querySelector<HTMLElement>("#toast");
    if (!toast) return;
    toast.textContent = message;
    toast.hidden = false;
    window.setTimeout(() => {
      toast.hidden = true;
    }, 2400);
  }

  const authBlock = user
    ? `<a href="/me" class="primary-btn w-full">내 채널로</a>`
    : `
      ${loginButtonHtml(providers, "내 채널 시작")}
      <p class="text-xs text-dim text-center leading-relaxed">
        로그인하면 내 노래책을 만들고 운영할 수 있습니다.
      </p>
    `;

  app!.innerHTML = `
    <div class="relative z-10 min-h-screen flex flex-col">
      <header class="topbar sticky top-0 z-30">
        <div class="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
          ${logoLinkHtml({ fetchpriority: true })}
          <div class="flex items-center gap-2 shrink-0">
            ${
              user
                ? `<button id="logout-btn" type="button" class="secondary-btn btn-sm">로그아웃</button>`
                : ""
            }
            <button id="theme-btn" type="button" class="icon-btn" title="테마 변경" aria-label="테마 변경">
            ${icons.palette(18)}
          </button>
          </div>
        </div>
      </header>
      <main class="flex-1 flex items-center justify-center px-4 py-12">
        <div class="panel max-w-md w-full p-8 text-center space-y-5">
          <div>
            <h1 class="text-xl font-extrabold text-main mb-2">Live MR Songbook</h1>
            <p class="text-sm font-medium text-muted">
              방송용 노래책을 만들고, 시청자가 바로 신청할 수 있어요.
            </p>
          </div>
          ${
            feedback.errorNotice
              ? `<p class="text-sm font-semibold" style="color:#f87171">${escapeHtml(feedback.errorNotice)}</p>`
              : ""
          }
          ${authBlock}
        </div>
      </main>
      ${loginPickerOverlayHtml(providers)}
      <div id="toast" class="toast" hidden></div>
    </div>
  `;

  $("#theme-btn").addEventListener("click", () => {
    const next = THEMES[(THEMES.indexOf(currentTheme()) + 1) % THEMES.length]!;
    applyTheme(next);
  });

  const logoutBtn = document.querySelector("#logout-btn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      await logout();
      mountLanding(null, providers, { toast: "로그아웃되었습니다." });
    });
  }

  bindLoginPicker({ next: "/me", onToast: showToast });

  if (feedback.toast) {
    showToast(feedback.toast);
  }
}

async function mountProfileSetup(root: HTMLElement, user: AuthUser): Promise<void> {
  applyTheme(currentTheme());
  document.title = "프로필 설정 · Live MR Songbook";

  const params = new URLSearchParams(location.search);
  const nextPath = (() => {
    const raw = params.get("next") || "/me";
    if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("://")) {
      return "/me";
    }
    return raw;
  })();
  const isDesktop = params.get("client") === "desktop";

  root.innerHTML = `
    <div class="relative z-10 min-h-screen flex flex-col">
      <header class="topbar sticky top-0 z-30">
        <div class="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
          ${logoLinkHtml()}
        </div>
      </header>
      <main class="flex-1 flex items-center justify-center px-4 py-12">
        <form id="profile-setup-form" class="panel max-w-md w-full p-8 space-y-5 text-center">
          <div class="space-y-1">
            <h1 class="text-xl font-extrabold text-main">프로필 설정</h1>
            <p class="text-sm text-muted">닉네임과 프로필 사진을 정해 주세요.</p>
          </div>
          ${profileEditorFieldsHtml(user)}
          <button type="submit" class="primary-btn w-full">시작하기</button>
        </form>
      </main>
      <div id="toast" class="toast" hidden></div>
    </div>
  `;

  bindProfileEditor({
    initial: user,
    form: $("#profile-setup-form") as HTMLFormElement,
    onSaved: async () => {
      if (isDesktop) {
        const { deepLink } = await fetchDesktopHandoff();
        location.replace(deepLink);
        return;
      }
      const sep = nextPath.includes("?") ? "&" : "?";
      location.replace(`${nextPath}${sep}auth=ok`);
    },
  });
}

function mountInvalidSlug() {
  applyTheme(currentTheme());
  app!.innerHTML = `
    <div class="relative z-10 min-h-screen flex items-center justify-center px-4">
      <div class="panel max-w-md w-full p-8 text-center space-y-4">
        <h1 class="text-lg font-extrabold text-main">잘못된 채널 주소</h1>
        <p class="text-sm text-muted">주소를 확인해 주세요.</p>
        <a href="/" class="secondary-btn w-full">홈으로</a>
      </div>
    </div>
  `;
}

type ViewMode = "list" | "button";
const VIEW_MODE_KEY = "sb_viewMode";
const FILTER_OPEN_KEY = "sb_filterOpen";
const NICKNAME_KEY = "sb_nickname";

function readViewMode(): ViewMode {
  try {
    const raw = localStorage.getItem(VIEW_MODE_KEY);
    if (raw === "button" || raw === "list") return raw;
  } catch {
    /* ignore */
  }
  return "list";
}

function readFilterOpen(): { genre: boolean; artist: boolean } {
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

function readStoredNickname(): string {
  try {
    return localStorage.getItem(NICKNAME_KEY) ?? "";
  } catch {
    return "";
  }
}

function storeNickname(value: string) {
  try {
    if (value) localStorage.setItem(NICKNAME_KEY, value);
    else localStorage.removeItem(NICKNAME_KEY);
  } catch {
    /* ignore */
  }
}

type State = {
  currentGenre: string;
  currentArtist: string;
  searchQuery: string;
  songs: Song[];
  genres: string[];
  artists: string[];
  queue: SongRequest[];
  status: StatusResponse | null;
  selectedSong: Song | null;
  submitting: boolean;
  viewMode: ViewMode;
  filterOpen: { genre: boolean; artist: boolean };
};

async function mountSongbook(slug: string) {
  setChannelSlug(slug);
  applyTheme(currentTheme());

  app!.innerHTML = `
  <div class="relative z-10 min-h-screen flex flex-col">
    <header class="topbar sticky top-0 z-30">
      <div class="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
        <div class="flex items-center gap-3 min-w-0">
          ${logoLinkHtml({ fetchpriority: true })}
          <div class="min-w-0">
            <p id="channel-name" class="text-sm font-extrabold text-main truncate">…</p>
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

          <div class="filter-panels">
            <section id="genre-filter-panel" class="filter-panel">
              <button type="button" class="filter-panel-toggle" id="genre-filter-toggle" aria-expanded="false">
                <span class="filter-panel-label">장르</span>
                <span class="filter-panel-rule" aria-hidden="true"></span>
                <span class="filter-panel-meta" id="genre-filter-meta"></span>
                <span class="filter-chevron">${icons.chevronDown(16)}</span>
              </button>
              <div id="genre-chips" class="category-chips filter-panel-body"></div>
            </section>
            <section id="artist-filter-panel" class="filter-panel">
              <button type="button" class="filter-panel-toggle" id="artist-filter-toggle" aria-expanded="false">
                <span class="filter-panel-label">가수</span>
                <span class="filter-panel-rule" aria-hidden="true"></span>
                <span class="filter-panel-meta" id="artist-filter-meta"></span>
                <span class="filter-chevron">${icons.chevronDown(16)}</span>
              </button>
              <div id="artist-chips" class="category-chips filter-panel-body"></div>
            </section>
          </div>

          <div class="flex items-center justify-between gap-3 px-1 text-xs font-semibold">
            <span class="text-dim">
              등록곡 <span id="song-count" class="text-main font-extrabold">0</span>곡
            </span>
            <div class="view-modes" role="group" aria-label="목록 보기">
              <button type="button" class="view-btn" id="view-list-btn" title="리스트 모드" aria-label="리스트 모드">${icons.viewList(16)}</button>
              <button type="button" class="view-btn" id="view-button-btn" title="버튼 모드" aria-label="버튼 모드">${icons.viewButton(16)}</button>
            </div>
          </div>

          <div id="song-list" class="song-list list-mode"></div>
        </section>

        <aside class="hidden lg:block sticky top-24">
          <div class="panel p-5">
            <div class="flex items-center gap-3 pb-4 mb-4 border-b border-glass-border">
              <span class="dock-art">${icons.disc(22)}</span>
              <div class="min-w-0">
                <p class="dock-label">지금 재생</p>
                <p id="aside-now-playing" class="song-name text-sm">재생 중인 곡이 없습니다.</p>
              </div>
            </div>
            <div class="flex items-center justify-between mb-3">
              <span class="text-xs font-extrabold tracking-wide text-muted">대기열</span>
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
            <p class="dock-label">지금 재생</p>
            <p id="now-playing-text" class="song-name text-sm">재생 중인 곡이 없습니다.</p>
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
        <p class="modal-eyebrow mb-1.5">노래 신청</p>
        <h2 id="modal-song-title" class="text-lg font-extrabold text-main truncate"></h2>
        <p id="modal-song-artist" class="text-sm font-medium text-muted truncate mb-5"></p>
        <div class="space-y-3 mb-6">
          <input id="req-nickname" type="text" maxlength="40" class="cm-input" placeholder="닉네임 (선택)" />
          <input id="req-comment" type="text" maxlength="200" class="cm-input" placeholder="한마디 (선택)" />
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
            대기열
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
    return np ? `${np.title} - ${np.artist}` : "재생 중인 곡이 없습니다.";
  }

  function applyViewMode(mode: ViewMode) {
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

  function applyFilterPanelOpen() {
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

  function persistFilterOpen() {
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

  function renderFilterPanels() {
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
    applyFilterPanelOpen();
  }

  function songGenreLabel(song: Song): string {
    const genre = String(song.genre || "").trim();
    if (genre) return genre;
    return String(song.category || "").trim() || "미분류";
  }

  function songCategoryLabel(song: Song): string {
    return String(song.category || "").trim();
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
    const isButton = state.viewMode === "button";

    list.innerHTML = state.songs
      .map((song) => {
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
        const categoryLabel = songCategoryLabel(song);
        const categoryBadge = categoryLabel
          ? `<span class="category-badge">${escapeHtml(categoryLabel)}</span>`
          : "";
        const genreBadge =
          genreLabel && genreLabel !== "미분류"
            ? `<span class="genre-badge">${escapeHtml(genreLabel)}</span>`
            : "";
        const diffStars = difficultyStarsHtml(song.difficulty);
        const tagHtml = otherTags
          .map((t) => `<span class="tag-badge">${escapeHtml(t)}</span>`)
          .join("");
        const hasGenreCol = Boolean(mrBadge || categoryBadge || genreBadge);
        const hasTagsCol = otherTags.length > 0;
        const mobileMeta = [mrBadge, categoryBadge, genreBadge].filter(Boolean).join("");

        if (isButton) {
          return `
          <article
            class="song-card button-row${accepting ? "" : " is-disabled"}"
            data-song-id="${escapeHtml(song.id)}"
            role="button"
            tabindex="0"
            title="${accepting ? "신청하기" : "신청 마감"}"
          >
            <div class="thumbnail">${thumbInner}</div>
            <div class="song-info-content button-layout">
              <div class="col col-info">
                <div class="song-name" title="${escapeHtml(song.title)}">${escapeHtml(song.title)}</div>
                <div class="song-artist">${escapeHtml(song.artist)}</div>
                <div class="button-meta-row">
                  ${diffStars}
                  ${mrBadgeSm}
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
              ${categoryBadge}
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
              <button
                type="button"
                class="request-btn primary-btn btn-sm"
                data-song-id="${escapeHtml(song.id)}"
                ${accepting ? "" : "disabled"}
              >${icons.mic(15)}신청</button>
            </div>
          </article>`;
      })
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

    document.querySelectorAll<HTMLButtonElement>(".request-btn").forEach((btn) => {
      btn.disabled = !accepting;
    });
    document.querySelectorAll<HTMLElement>(".song-card.button-row").forEach((card) => {
      card.classList.toggle("is-disabled", !accepting);
      card.title = accepting ? "신청하기" : "신청 마감";
    });
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
    ($("#req-nickname") as HTMLInputElement).value = readStoredNickname();
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
      storeNickname(nickname);
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
      const data = await fetchSongs(
        state.searchQuery,
        state.currentGenre,
        state.currentArtist,
      );
      state.songs = data.songs;
      state.genres = data.genres;
      state.artists = data.artists;
      renderFilterPanels();
      renderSongs();
    } catch (err) {
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

  $("#genre-filter-toggle").addEventListener("click", () => {
    state.filterOpen.genre = !state.filterOpen.genre;
    persistFilterOpen();
    applyFilterPanelOpen();
  });
  $("#artist-filter-toggle").addEventListener("click", () => {
    state.filterOpen.artist = !state.filterOpen.artist;
    persistFilterOpen();
    applyFilterPanelOpen();
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

  applyFilterPanelOpen();
  applyViewMode(state.viewMode);

  $("#view-list-btn").addEventListener("click", () => {
    if (state.viewMode === "list") return;
    applyViewMode("list");
    renderSongs();
  });
  $("#view-button-btn").addEventListener("click", () => {
    if (state.viewMode === "button") return;
    applyViewMode("button");
    renderSongs();
  });

  $("#song-list").addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>(".request-btn");
    if (btn) {
      if (btn.disabled) return;
      openRequestModal(btn.dataset.songId ?? "");
      return;
    }
    const card = (e.target as HTMLElement).closest<HTMLElement>(".song-card.button-row");
    if (!card) return;
    if (card.classList.contains("is-disabled") || !isAccepting()) {
      showToast("지금은 신청을 받지 않습니다.");
      return;
    }
    openRequestModal(card.dataset.songId ?? "");
  });

  $("#song-list").addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const card = (e.target as HTMLElement).closest<HTMLElement>(".song-card.button-row");
    if (!card) return;
    e.preventDefault();
    card.click();
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

async function handleOAuthCallbackFallback(): Promise<boolean> {
  const match = /^\/api\/auth\/(google|naver)\/callback\/?$/.exec(location.pathname);
  if (!match) return false;
  const provider = match[1] as OAuthProvider;

  applyTheme(currentTheme());
  const params = new URLSearchParams(location.search);
  const error = params.get("error");
  if (error) {
    location.replace(`/?auth=error&reason=${encodeURIComponent(error)}`);
    return true;
  }

  const code = params.get("code");
  const state = params.get("state");
  app!.innerHTML = `
    <div class="relative z-10 min-h-screen flex items-center justify-center px-4">
      <div class="panel max-w-md w-full p-8 text-center space-y-3">
        <h1 class="text-lg font-extrabold text-main">로그인 처리 중…</h1>
        <p class="text-sm text-muted">잠시만 기다려 주세요.</p>
      </div>
    </div>
  `;

  if (!code || !state) {
    location.replace("/?auth=error&reason=missing_code");
    return true;
  }

  const result = await exchangeOAuthCode(provider, code, state);
  if (!result.ok) {
    location.replace(`/?auth=error&reason=${encodeURIComponent(result.reason)}`);
    return true;
  }
  if ("deepLink" in result && result.deepLink) {
    location.replace(result.deepLink);
    return true;
  }
  location.replace(result.redirect);
  return true;
}

async function boot() {
  if (await handleOAuthCallbackFallback()) return;

  if (location.pathname === "/me/setup" || location.pathname === "/me/setup/") {
    const user = await fetchMe();
    if (!user) {
      location.replace("/?auth=error&reason=access_denied");
      return;
    }
    if (!user.needsProfileSetup) {
      const next = new URLSearchParams(location.search).get("next") || "/me";
      location.replace(next.startsWith("/") ? next : "/me");
      return;
    }
    await mountProfileSetup(app!, user);
    return;
  }

  if (location.pathname === "/me" || location.pathname === "/me/") {
    const { toast, errorNotice } = consumeAuthQuery();
    const session = await fetchSession();
    if (!session) {
      location.replace("/?auth=error&reason=access_denied");
      return;
    }
    if (session.user.needsProfileSetup) {
      location.replace("/me/setup?next=/me");
      return;
    }
    await mountAccount(app!, session.user, session.channels, errorNotice, toast);
    return;
  }

  if (location.pathname === "/" || location.pathname === "") {
    const { toast, errorNotice } = consumeAuthQuery();
    const params = new URLSearchParams(location.search);
    const isDesktop = params.get("client") === "desktop";
    const [user, status] = await Promise.all([fetchMe(), fetchAuthStatus()]);
    if (user?.needsProfileSetup) {
      const setupQ = new URLSearchParams({ next: "/me" });
      if (isDesktop) setupQ.set("client", "desktop");
      location.replace(`/me/setup?${setupQ}`);
      return;
    }
    if (isDesktop && user) {
      try {
        const { deepLink } = await fetchDesktopHandoff();
        location.replace(deepLink);
        return;
      } catch (err) {
        console.warn("[boot] desktop handoff failed", err);
      }
    }
    mountLanding(user, { googleEnabled: status.googleEnabled, naverEnabled: status.naverEnabled }, { toast, errorNotice });
    return;
  }

  if (location.pathname.startsWith("/c/")) {
    const parsed = parseChannelPath();
    if (!parsed) {
      mountInvalidSlug();
      return;
    }
    if (parsed.admin) {
      const user = await fetchMe();
      if (user?.needsProfileSetup) {
        location.replace(`/me/setup?next=${encodeURIComponent(`/c/${parsed.slug}/admin`)}`);
        return;
      }
      await mountAdmin(app!, parsed.slug);
      return;
    }
    await mountSongbook(parsed.slug);
    return;
  }

  // Unknown path → landing
  const [user, status] = await Promise.all([fetchMe(), fetchAuthStatus()]);
  if (user?.needsProfileSetup) {
    location.replace("/me/setup?next=/me");
    return;
  }
  mountLanding(user, { googleEnabled: status.googleEnabled, naverEnabled: status.naverEnabled });
}

void boot();
