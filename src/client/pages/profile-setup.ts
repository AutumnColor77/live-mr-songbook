import { safeNextPath } from "../auth-feedback";
import { fetchDesktopHandoff, type AuthUser } from "../auth-api";
import { $ } from "../dom";
import { bindProfileEditor, profileEditorFieldsHtml } from "../profile-editor";
import { applyTheme, currentTheme, logoLinkHtml } from "../theme";

export async function mountProfileSetup(root: HTMLElement, user: AuthUser): Promise<void> {
  applyTheme(currentTheme());
  document.title = "프로필 설정 · Live MR Songbook";

  const params = new URLSearchParams(location.search);
  const nextPath = safeNextPath("/me");
  const isDesktop = params.get("client") === "desktop";
  const desktopState = params.get("state");

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
        const { deepLink } = await fetchDesktopHandoff(desktopState);
        location.replace(deepLink);
        return;
      }
      const sep = nextPath.includes("?") ? "&" : "?";
      location.replace(`${nextPath}${sep}auth=ok`);
    },
  });
}
