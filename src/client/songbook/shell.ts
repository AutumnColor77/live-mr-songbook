import { icons } from "../icons";
import { logoLinkHtml } from "../theme";

export function songbookShellHtml(opts: {
  authSlotHtml: string;
  loginPickerHtml: string;
}): string {
  return `
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
          <div id="songbook-auth-slot" class="flex items-center gap-2 shrink-0">
            ${opts.authSlotHtml}
          </div>
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

        <div id="req-command-panel" class="mb-5 space-y-2">
          <p id="req-command-hint" class="text-xs font-medium text-muted"></p>
          <div class="flex gap-2 items-stretch">
            <code id="req-command-text" class="cm-input flex-1 text-xs font-semibold break-all whitespace-pre-wrap min-h-[2.75rem]"></code>
            <button id="copy-request-cmd" type="button" class="secondary-btn btn-sm shrink-0 self-start">복사</button>
          </div>
          <p id="req-paid-hint" class="text-xs font-semibold text-accent" hidden></p>
        </div>

        <div id="req-web-fields" class="space-y-3 mb-6">
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

    ${opts.loginPickerHtml}
    <div id="toast" class="toast" hidden></div>
  </div>
`;
}
