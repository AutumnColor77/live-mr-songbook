import { safeNextPath } from "../auth-feedback";
import { logout, type AuthUser } from "../auth-api";
import { $, escapeHtml } from "../dom";
import { icons } from "../icons";
import {
  bindLoginPicker,
  loginButtonHtml,
  loginPickerOverlayHtml,
} from "../login-picker";
import { applyTheme, currentTheme, cycleTheme, logoLinkHtml } from "../theme";
import { createToast } from "../toast";

function isSongbookNext(path: string): boolean {
  return /^\/c\/[^/]+\/?$/i.test(path);
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

  const loginNext = safeNextPath("/me") || "/me";
  const viewerLogin = isSongbookNext(loginNext);
  const loginLabel = viewerLogin ? "로그인" : "내 채널 시작";
  const loginHint = viewerLogin
    ? "로그인하면 노래책으로 바로 돌아갑니다. 신청은 비로그인으로도 가능합니다."
    : "로그인하면 내 노래책을 만들고 운영할 수 있습니다.";

  const authBlock = user
    ? viewerLogin
      ? `<a href="${escapeHtml(loginNext)}" class="primary-btn w-full">노래책으로</a>
         <a href="/me" class="secondary-btn w-full">내 채널</a>`
      : `<a href="/me" class="primary-btn w-full">내 채널로</a>`
    : `
      ${loginButtonHtml(providers, loginLabel)}
      <p class="text-xs text-dim text-center leading-relaxed">
        ${escapeHtml(loginHint)}
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
    cycleTheme();
  });

  const logoutBtn = document.querySelector("#logout-btn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      await logout();
      mountLanding(root, null, providers, { toast: "로그아웃되었습니다." });
    });
  }

  bindLoginPicker({ next: loginNext, onToast: (msg) => toast.show(msg) });

  if (feedback.toast) {
    toast.show(feedback.toast);
  }
}
