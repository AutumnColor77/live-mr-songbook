import { startOAuthLogin, type OAuthProvider } from "./auth-api";
import { escapeHtml } from "./dom";
import { icons } from "./icons";

export type LoginProviders = {
  googleEnabled: boolean;
  naverEnabled: boolean;
};

type LoginButtonOpts = {
  className?: string;
  id?: string;
  /** OAuth 완료 후 이동 경로. bindLoginPicker가 data-login-next로 읽음 */
  next?: string;
};

/** Login trigger button. Use `next` when multiple triggers share one picker. */
export function loginButtonHtml(
  providers: LoginProviders,
  label = "내 채널 시작",
  classNameOrOpts: string | LoginButtonOpts = "primary-btn w-full",
): string {
  const opts: LoginButtonOpts =
    typeof classNameOrOpts === "string"
      ? { className: classNameOrOpts }
      : classNameOrOpts;
  const className = opts.className ?? "primary-btn w-full";
  const idAttr = opts.id ? ` id="${escapeHtml(opts.id)}"` : "";
  const nextAttr = opts.next
    ? ` data-login-next="${escapeHtml(opts.next)}"`
    : "";
  const any = providers.googleEnabled || providers.naverEnabled;
  if (!any) {
    return `<button type="button" class="${className}" disabled>로그인 불가</button>`;
  }
  return `<button type="button"${idAttr}${nextAttr} class="login-trigger ${className}">${escapeHtml(label)}</button>`;
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
  /** Used when a trigger has no data-login-next */
  next?: string;
  onToast?: (msg: string) => void;
}): void {
  const overlay = document.querySelector<HTMLElement>("#login-picker");
  if (!overlay) return;

  const triggers = [
    ...document.querySelectorAll<HTMLButtonElement>(".login-trigger"),
    ...document.querySelectorAll<HTMLButtonElement>("#login-btn"),
  ];
  // Deduplicate if a button has both id and class
  const uniqueTriggers = [...new Set(triggers)];
  if (uniqueTriggers.length === 0) return;

  let pendingNext = opts.next || "/me";

  const close = () => {
    overlay.hidden = true;
  };
  const open = (next: string) => {
    pendingNext = next;
    overlay.hidden = false;
  };

  for (const openBtn of uniqueTriggers) {
    openBtn.addEventListener("click", () => {
      open(openBtn.dataset.loginNext || opts.next || "/me");
    });
  }

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
      uniqueTriggers.forEach((t) => {
        t.disabled = true;
      });
      opts.onToast?.(`${label} 로그인으로 이동 중…`);
      try {
        const url = await startOAuthLogin(provider, pendingNext);
        window.location.assign(url);
      } catch (err) {
        opts.onToast?.(err instanceof Error ? err.message : "로그인 시작에 실패했습니다.");
        btn.disabled = false;
        uniqueTriggers.forEach((t) => {
          t.disabled = false;
        });
      }
    });
  });
}
