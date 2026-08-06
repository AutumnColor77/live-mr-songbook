import { logout, type AuthUser } from "../auth-api";
import {
  fetchDirectoryChannels,
  type DirectoryChannel,
} from "../directory-api";
import { $, escapeHtml } from "../dom";
import { icons } from "../icons";
import {
  bindLoginPicker,
  loginButtonHtml,
  loginPickerOverlayHtml,
} from "../login-picker";
import { applyTheme, currentTheme, cycleTheme, logoLinkHtml } from "../theme";
import { createToast } from "../toast";

function channelCardHtml(ch: DirectoryChannel): string {
  const initial = escapeHtml(
    (ch.ownerName || ch.name || "?").trim().slice(0, 1).toUpperCase() || "?",
  );
  const photo = ch.picture
    ? `<img
         src="${escapeHtml(ch.picture)}"
         alt=""
         class="absolute inset-0 w-full h-full object-cover"
         referrerpolicy="no-referrer"
         loading="lazy"
       />`
    : `<span class="absolute inset-0 flex items-center justify-center text-3xl font-extrabold text-main bg-[var(--surface-3)]">${initial}</span>`;

  return `
    <a
      href="/c/${escapeHtml(ch.slug)}"
      class="directory-card group flex flex-col flex-[1_1_140px] w-full max-w-[200px] rounded-2xl border border-glass-border bg-[var(--surface-2)] overflow-hidden hover:border-[var(--accent)] transition-colors text-left"
    >
      <div class="relative aspect-square w-full max-h-[200px] overflow-hidden bg-[var(--surface-3)]">
        ${photo}
      </div>
      <div class="p-2.5 space-y-0.5 min-w-0">
        <p class="text-sm font-extrabold text-main truncate">${escapeHtml(ch.name)}</p>
        <p class="text-xs text-dim truncate">${ch.songCount}곡 · /c/${escapeHtml(ch.slug)}</p>
      </div>
    </a>
  `;
}

function renderChannelList(listEl: HTMLElement, channels: DirectoryChannel[]) {
  if (channels.length === 0) {
    listEl.innerHTML = `<p class="text-sm text-dim text-center py-6 w-full">맞는 노래책이 없습니다.</p>`;
    return;
  }
  listEl.innerHTML = channels.map(channelCardHtml).join("");
}

export function mountLanding(
  root: HTMLElement,
  user: AuthUser | null = null,
  providers: { googleEnabled: boolean; naverEnabled: boolean } = {
    googleEnabled: false,
    naverEnabled: false,
  },
  feedback: { toast?: string; errorNotice?: string } = {},
) {
  applyTheme(currentTheme());
  const toast = createToast(root);

  const authBlock = user
    ? `
      <div class="flex flex-col sm:flex-row gap-2.5">
        <a href="#directory" class="primary-btn flex-1 text-center">노래책 둘러보기</a>
        <a href="/me" class="secondary-btn flex-1 text-center">내 채널</a>
      </div>
    `
    : `
      <div class="flex flex-col sm:flex-row gap-2.5">
        ${loginButtonHtml(providers, "시청자로 로그인", {
          className: "primary-btn flex-1",
          id: "login-viewer",
          next: "/",
        })}
        ${loginButtonHtml(providers, "내 채널 시작", {
          className: "secondary-btn flex-1",
          id: "login-streamer",
          next: "/me",
        })}
      </div>
      <p class="text-xs text-dim text-center leading-relaxed">
        로그인 없이도 아래 노래책을 둘러보고 신청할 수 있어요.
      </p>
    `;

  root.innerHTML = `
    <div class="relative z-10 min-h-screen flex flex-col">
      <header class="topbar sticky top-0 z-30">
        <div class="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
          ${logoLinkHtml({ fetchpriority: true })}
          <div class="flex items-center gap-2 shrink-0">
            ${
              user
                ? `<span class="hidden sm:inline text-xs font-semibold text-dim max-w-[8rem] truncate">${escapeHtml(user.name || user.email)}</span>
                   <button id="logout-btn" type="button" class="secondary-btn btn-sm">로그아웃</button>`
                : ""
            }
            <button id="theme-btn" type="button" class="icon-btn" title="테마 변경" aria-label="테마 변경">
            ${icons.palette(18)}
          </button>
          </div>
        </div>
      </header>
      <main class="flex-1 w-full max-w-3xl mx-auto px-4 sm:px-6 py-10 space-y-8">
        <section class="panel p-8 text-center space-y-5">
          <div>
            <h1 class="text-xl font-extrabold text-main mb-2">Live MR Songbook</h1>
            <p class="text-sm font-medium text-muted">
              스트리머 노래책을 찾고, 방송 중 바로 신청하세요.
            </p>
          </div>
          ${
            feedback.errorNotice
              ? `<p class="text-sm font-semibold" style="color:#f87171">${escapeHtml(feedback.errorNotice)}</p>`
              : ""
          }
          ${authBlock}
        </section>

        <section id="directory" class="panel p-6 space-y-4 scroll-mt-24">
          <div class="flex items-end justify-between gap-3">
            <div class="text-left">
              <h2 class="text-sm font-extrabold text-main">노래책 찾기</h2>
              <p class="text-xs text-dim mt-0.5">등록된 스트리머 노래책 목록입니다.</p>
            </div>
            <span id="directory-count" class="text-xs font-semibold text-dim shrink-0"></span>
          </div>
          <div class="search-box">
            ${icons.search(18)}
            <input
              id="directory-search"
              type="search"
              class="search-input"
              autocomplete="off"
              placeholder="이름 또는 주소 검색..."
            />
          </div>
          <div id="directory-list" class="flex flex-wrap gap-3 justify-start">
            <p class="text-sm text-dim text-center py-6 w-full">불러오는 중…</p>
          </div>
        </section>
      </main>
      ${loginPickerOverlayHtml(providers)}
      <div id="toast" class="toast" hidden></div>
    </div>
  `;

  $("#theme-btn").addEventListener("click", () => {
    cycleTheme();
  });

  const logoutBtn = document.querySelector("#logout-btn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      await logout();
      mountLanding(root, null, providers, { toast: "로그아웃되었습니다." });
    });
  }

  bindLoginPicker({ next: "/", onToast: (msg) => toast.show(msg) });

  if (feedback.toast) {
    toast.show(feedback.toast);
  }

  const listEl = $("#directory-list");
  const countEl = $("#directory-count");
  const searchInput = $("#directory-search") as HTMLInputElement;
  let searchTimer: number | undefined;
  let latestQuery = "";

  async function loadDirectory(q: string) {
    latestQuery = q;
    try {
      const channels = await fetchDirectoryChannels(q);
      if (latestQuery !== q) return;
      renderChannelList(listEl, channels);
      countEl.textContent = `${channels.length}개`;
    } catch (err) {
      console.error(err);
      if (latestQuery !== q) return;
      listEl.innerHTML = `<p class="text-sm text-center py-6 w-full" style="color:#f87171">목록을 불러오지 못했습니다.</p>`;
      countEl.textContent = "";
    }
  }

  searchInput.addEventListener("input", () => {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => {
      void loadDirectory(searchInput.value.trim());
    }, 200);
  });

  void loadDirectory("");
}
