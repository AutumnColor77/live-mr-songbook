import { logout, type AuthUser, type UserChannel } from "../auth-api";
import { escapeHtml } from "../dom";
import {
  bindLoginPicker,
  loginButtonHtml,
  loginPickerOverlayHtml,
} from "../login-picker";
import { logoLinkHtml } from "../theme";
import { createToast } from "../toast";
import { stopAdminPolling } from "./polling";

export function mountLogin(
  root: HTMLElement,
  slug: string,
  errorMsg = "",
  user: AuthUser | null = null,
  channels: UserChannel[] = [],
  providers: { googleEnabled: boolean; naverEnabled: boolean } = {
    googleEnabled: true,
    naverEnabled: true,
  },
): void {
  stopAdminPolling();
  const own = channels.find((ch) => ch.slug !== "demo") ?? null;
  const ownAdminLink =
    user && own && own.slug !== slug
      ? `<a href="/c/${escapeHtml(own.slug)}/admin" class="primary-btn w-full">내 채널 운영하기</a>
         <a href="/me" class="secondary-btn w-full">내 채널로 이동</a>`
      : user
        ? `<a href="/me" class="secondary-btn w-full">내 채널로 이동</a>`
        : "";

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
                 <div class="space-y-2">${ownAdminLink}
                 <button id="admin-logout" type="button" class="secondary-btn w-full">다른 계정으로</button></div>`
              : ""
          }
          ${user ? "" : loginButtonHtml(providers, "로그인", { next: `/c/${slug}/admin` })}
          <p class="text-xs text-dim leading-relaxed">
            ${user ? "이 채널의 운영 멤버만 대기열을 관리할 수 있습니다." : "로그인하면 대기열을 관리할 수 있습니다."}
          </p>
        </div>
      </main>
      ${loginPickerOverlayHtml(providers)}
      <div id="toast" class="toast" hidden></div>
    </div>
  `;

  const toastCtrl = createToast(root);

  bindLoginPicker({ next: `/c/${slug}/admin`, onToast: (msg) => toastCtrl.show(msg) });

  const logoutBtn = document.querySelector("#admin-logout");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      await logout();
      mountLogin(root, slug, "", null, [], providers);
    });
  }
}

