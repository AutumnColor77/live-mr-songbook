import { AdminAuthError, verifyAdminAccess } from "./admin-api";
import { mountDashboard } from "./admin/dashboard";
import { mountLogin } from "./admin/login";
import {
  fetchAuthStatus,
  fetchSession,
} from "./auth-api";
import { consumeAuthQuery } from "./auth-feedback";
import { applyTheme, currentTheme } from "./theme";

export async function mountAdmin(root: HTMLElement, slug: string): Promise<void> {
  applyTheme(currentTheme());
  document.title = `운영 · Live MR Songbook`;

  const { toast, errorNotice } = consumeAuthQuery();
  const [session, status] = await Promise.all([fetchSession(), fetchAuthStatus()]);
  const user = session?.user ?? null;
  if (!user) {
    mountLogin(root, slug, errorNotice, null, [], status);
    return;
  }

  try {
    await verifyAdminAccess(slug);
  } catch (err) {
    const channels = session?.channels ?? [];
    const own = channels.find((ch) => ch.slug !== "demo") ?? null;
    let message = "이 채널 운영 권한이 없습니다. 다른 계정으로 다시 로그인해 주세요.";
    if (err instanceof AdminAuthError) {
      if (own && own.slug !== slug) {
        message = `이 채널(/c/${slug}) 운영 권한이 없습니다. 내 채널은 /c/${own.slug} 입니다.`;
      } else if (!own && slug !== "demo") {
        message =
          "이 채널 운영 권한이 없습니다. /me 에서 채널을 만든 뒤 운영해 주세요.";
      }
    } else if (err instanceof Error && /not found|Channel not found/i.test(err.message)) {
      message = "채널을 찾을 수 없습니다. 주소를 확인해 주세요.";
    } else {
      message = err instanceof Error ? err.message : "운영 페이지를 불러오지 못했습니다.";
    }
    mountLogin(root, slug, message, user, channels, status);
    return;
  }

  await mountDashboard(root, slug, user, "", toast);
}
