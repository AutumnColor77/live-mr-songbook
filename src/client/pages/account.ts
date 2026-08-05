import { safeNextPath } from "../auth-feedback";
import {
  createChannel,
  fetchSession,
  logout,
  updateChannel,
  type AuthUser,
  type UserChannel,
} from "../auth-api";
import { $, escapeHtml } from "../dom";
import { icons } from "../icons";
import { bindProfileEditor, profileEditorFieldsHtml } from "../profile-editor";
import { applyTheme, currentTheme, cycleTheme, logoLinkHtml } from "../theme";
import { createToast } from "../toast";

export async function mountAccount(
  root: HTMLElement,
  user: AuthUser,
  channels: UserChannel[],
  inlineNotice = "",
  toastMsg = "",
): Promise<void> {
  applyTheme(currentTheme());
  document.title = "내 채널 · Live MR Songbook";

  const nextPath = safeNextPath("");
  const ownChannels = channels.filter((ch) => ch.slug !== "demo");
  const own = ownChannels[0] ?? null;
  const publicUrl = own ? `${location.origin}/c/${own.slug}` : "";

  const channelCardHtml = own
    ? `
        <div class="rounded-xl border border-glass-border bg-[var(--surface-2)] px-3 py-3 space-y-3">
          <div class="text-center">
            <p class="text-base font-extrabold text-main">${escapeHtml(own.name)}</p>
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

  const toast = createToast(root);

  $("#theme-btn").addEventListener("click", () => {
    cycleTheme();
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
        toast.show("노래책 주소를 복사했습니다.");
      } catch {
        toast.show("복사에 실패했습니다.");
      }
    });
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
      await mountAccount(root, saved, session?.channels ?? channels, "저장되었습니다.");
    },
  });

  if (toastMsg) {
    toast.show(toastMsg);
  }
}
