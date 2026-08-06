import { startOAuthLogin, type OAuthProvider } from "./auth-api";
import { escapeHtml } from "./dom";
import { icons } from "./icons";

export type LoginProviders = {
  googleEnabled: boolean;
  naverEnabled: boolean;
};

/** Single "로그인" button + provider picker modal. */
export function loginButtonHtml(
  providers: LoginProviders,
  label = "내 채널 시작",
  className = "primary-btn w-full",
): string {
  const any = providers.googleEnabled || providers.naverEnabled;
  if (!any) {
    return `<button type="button" class="${className}" disabled>로그인 불가</button>`;
  }
  return `<button id="login-btn" type="button" class="${className}">${escapeHtml(label)}</button>`;
}

export function loginPickerOverlayHtml(providers: LoginProviders): string {
  const options = [
    providers.googleEnabled
      ? `<button type="button" class="primary-btn w-full login-provider-btn" data-provider="google">${icons.google(18)} Google</button>`
      : "",
    providers.naverEnabled
      ? `<button type="button" class="primary-btn w-full login-provider-btn" data-provider="naver" style="background:#03C75A;box-shadow:none">${icons.naver(18)} 네이버</button>`
      : "",
  ]
    .filter(Boolean)
    .join("");

  return `
    <div id="login-picker" class="modal-overlay" hidden>
      <div class="modal-content space-y-4" role="dialog" aria-modal="true" aria-labelledby="login-picker-title">
        <div class="modal-grip" aria-hidden="true"></div>
        <div class="text-center space-y-1">
          <p class="modal-eyebrow">로그인</p>
          <h2 id="login-picker-title" class="text-lg font-extrabold text-main">로그인 방법 선택</h2>
          <p class="text-xs text-dim">사용할 계정을 골라 주세요.</p>
        </div>
        <div class="space-y-2.5">${options}</div>
        <button type="button" id="login-picker-close" class="secondary-btn w-full">취소</button>
      </div>
    </div>
  `;
}

export function bindLoginPicker(opts: {
  next: string;
  onToast?: (msg: string) => void;
}): void {
  const overlay = document.querySelector<HTMLElement>("#login-picker");
  const openBtn = document.querySelector<HTMLButtonElement>("#login-btn");
  if (!overlay || !openBtn) return;

  const close = () => {
    overlay.hidden = true;
  };
  const open = () => {
    overlay.hidden = false;
  };

  openBtn.addEventListener("click", open);
  overlay.querySelector("#login-picker-close")?.addEventListener("click", close);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });

  overlay.querySelectorAll<HTMLButtonElement>(".login-provider-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const provider = btn.dataset.provider as OAuthProvider | undefined;
      if (!provider) return;
      const label = provider === "naver" ? "네이버" : "Google";
      btn.disabled = true;
      openBtn.disabled = true;
      opts.onToast?.(`${label} 로그인으로 이동 중…`);
      try {
        const url = await startOAuthLogin(provider, opts.next);
        window.location.assign(url);
      } catch (err) {
        opts.onToast?.(err instanceof Error ? err.message : "로그인 시작에 실패했습니다.");
        btn.disabled = false;
        openBtn.disabled = false;
      }
    });
  });
}
