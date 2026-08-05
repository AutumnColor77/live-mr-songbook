import { applyTheme, currentTheme } from "../theme";

export function mountInvalidSlug(root: HTMLElement) {
  applyTheme(currentTheme());
  root.innerHTML = `
    <div class="relative z-10 min-h-screen flex items-center justify-center px-4">
      <div class="panel max-w-md w-full p-8 text-center space-y-4">
        <h1 class="text-lg font-extrabold text-main">잘못된 채널 주소</h1>
        <p class="text-sm text-muted">주소를 확인해 주세요.</p>
        <a href="/" class="secondary-btn w-full">홈으로</a>
      </div>
    </div>
  `;
}
