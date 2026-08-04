import {
  fileToProfileDataUrl,
  updateProfile,
  type AuthUser,
} from "./auth-api";
import { escapeHtml } from "./dom";

export function profileEditorFieldsHtml(user: AuthUser): string {
  const picture = user.picture || "";
  return `
    <div class="flex flex-col items-center gap-3">
      <img id="profile-avatar" src="${escapeHtml(picture)}" alt="" class="w-24 h-24 rounded-full border border-glass-border object-cover bg-[var(--surface-3)]" ${picture ? "" : "hidden"} referrerpolicy="no-referrer" />
      <span id="profile-avatar-fallback" class="w-24 h-24 rounded-full bg-[var(--surface-3)] flex items-center justify-center text-2xl font-extrabold text-main" ${picture ? "hidden" : ""}>${escapeHtml((user.name || "?").slice(0, 1).toUpperCase())}</span>
      <label class="secondary-btn btn-sm cursor-pointer">
        사진 변경
        <input id="profile-picture-file" type="file" accept="image/*" class="sr-only" />
      </label>
      <p class="text-xs text-dim">정사각 권장 · 자동으로 125×125 이하로 줄입니다</p>
    </div>
    <label class="block text-left space-y-1.5">
      <span class="text-xs font-extrabold text-dim tracking-wide">닉네임</span>
      <input id="profile-name" type="text" maxlength="32" required class="w-full rounded-xl border border-glass-border bg-[var(--surface-2)] px-3 py-2.5 text-sm text-main" value="${escapeHtml(user.name || "")}" placeholder="표시할 이름" />
    </label>
    <p id="profile-error" class="text-sm font-semibold text-center" style="color:#f87171" hidden></p>
  `;
}

export function bindProfileEditor(opts: {
  initial: AuthUser;
  form: HTMLFormElement;
  onSaved: (user: AuthUser) => void | Promise<void>;
}): void {
  let picture = opts.initial.picture || "";
  const avatar = opts.form.querySelector<HTMLImageElement>("#profile-avatar");
  const fallback = opts.form.querySelector<HTMLElement>("#profile-avatar-fallback");
  const nameInput = opts.form.querySelector<HTMLInputElement>("#profile-name");
  const fileInput = opts.form.querySelector<HTMLInputElement>("#profile-picture-file");
  const errorEl = opts.form.querySelector<HTMLElement>("#profile-error");
  const submitBtn = opts.form.querySelector<HTMLButtonElement>('button[type="submit"]');

  if (!avatar || !fallback || !nameInput || !fileInput || !errorEl) return;

  function showAvatar(src: string) {
    picture = src;
    if (src) {
      avatar!.src = src;
      avatar!.hidden = false;
      fallback!.hidden = true;
    } else {
      avatar!.hidden = true;
      fallback!.hidden = false;
    }
  }

  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    try {
      errorEl.hidden = true;
      showAvatar(await fileToProfileDataUrl(file));
    } catch (err) {
      errorEl.hidden = false;
      errorEl.textContent = err instanceof Error ? err.message : "이미지 처리 실패";
    }
  });

  opts.form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorEl.hidden = true;
    if (submitBtn) submitBtn.disabled = true;
    try {
      const user = await updateProfile({ name: nameInput.value, picture });
      await opts.onSaved(user);
    } catch (err) {
      errorEl.hidden = false;
      errorEl.textContent = err instanceof Error ? err.message : "저장에 실패했습니다.";
      if (submitBtn) submitBtn.disabled = false;
    }
  });
}
