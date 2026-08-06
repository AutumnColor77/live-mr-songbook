import "./style.css";
import { mountAdmin } from "./admin";
import { consumeAuthQuery } from "./auth-feedback";
import {
  exchangeOAuthCode,
  fetchAuthStatus,
  fetchDesktopHandoff,
  fetchMe,
  fetchSession,
  type OAuthProvider,
} from "./auth-api";
import { mountAccount } from "./pages/account";
import { mountInvalidSlug } from "./pages/invalid-slug";
import { mountLanding } from "./pages/landing";
import { mountProfileSetup } from "./pages/profile-setup";
import { mountSongbook } from "./pages/songbook";
import { applyTheme, currentTheme } from "./theme";

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("#app missing");

function parseChannelPath(): { slug: string; admin: boolean } | null {
  const match = /^\/c\/([^/]+)(?:\/(admin))?\/?$/i.exec(location.pathname);
  if (!match) return null;
  const slug = match[1]!.toLowerCase();
  if (!SLUG_RE.test(slug)) return null;
  return { slug, admin: (match[2] ?? "").toLowerCase() === "admin" };
}

async function handleOAuthCallbackFallback(): Promise<boolean> {
  const match = /^\/api\/auth\/(google|naver)\/callback\/?$/.exec(location.pathname);
  if (!match) return false;
  const provider = match[1] as OAuthProvider;

  applyTheme(currentTheme());
  const params = new URLSearchParams(location.search);
  const error = params.get("error");
  if (error) {
    location.replace(`/?auth=error&reason=${encodeURIComponent(error)}`);
    return true;
  }

  const code = params.get("code");
  const state = params.get("state");
  app!.innerHTML = `
    <div class="relative z-10 min-h-screen flex items-center justify-center px-4">
      <div class="panel max-w-md w-full p-8 text-center space-y-3">
        <h1 class="text-lg font-extrabold text-main">로그인 처리 중…</h1>
        <p class="text-sm text-muted">잠시만 기다려 주세요.</p>
      </div>
    </div>
  `;

  if (!code || !state) {
    location.replace("/?auth=error&reason=missing_code");
    return true;
  }

  const result = await exchangeOAuthCode(provider, code, state);
  if (!result.ok) {
    location.replace(`/?auth=error&reason=${encodeURIComponent(result.reason)}`);
    return true;
  }
  if ("deepLink" in result && result.deepLink) {
    location.replace(result.deepLink);
    return true;
  }
  location.replace(result.redirect);
  return true;
}

async function boot() {
  if (await handleOAuthCallbackFallback()) return;

  if (location.pathname === "/me/setup" || location.pathname === "/me/setup/") {
    const user = await fetchMe();
    if (!user) {
      location.replace("/?auth=error&reason=access_denied");
      return;
    }
    if (!user.needsProfileSetup) {
      const next = new URLSearchParams(location.search).get("next") || "/me";
      location.replace(next.startsWith("/") ? next : "/me");
      return;
    }
    await mountProfileSetup(app!, user);
    return;
  }

  if (location.pathname === "/me" || location.pathname === "/me/") {
    const { toast, errorNotice } = consumeAuthQuery();
    const session = await fetchSession();
    if (!session) {
      location.replace("/?auth=error&reason=access_denied");
      return;
    }
    await mountAccount(app!, session.user, session.channels, errorNotice, toast);
    return;
  }

  if (location.pathname === "/" || location.pathname === "") {
    const { toast, errorNotice } = consumeAuthQuery();
    const params = new URLSearchParams(location.search);
    const isDesktop = params.get("client") === "desktop";
    const [user, status] = await Promise.all([fetchMe(), fetchAuthStatus()]);
    // Desktop Manager still requires profile setup before handoff.
    if (isDesktop && user?.needsProfileSetup) {
      location.replace(`/me/setup?${new URLSearchParams({ next: "/me", client: "desktop" })}`);
      return;
    }
    if (isDesktop && user) {
      try {
        const { deepLink } = await fetchDesktopHandoff();
        location.replace(deepLink);
        return;
      } catch (err) {
        console.warn("[boot] desktop handoff failed", err);
      }
    }
    mountLanding(app!, user, { googleEnabled: status.googleEnabled, naverEnabled: status.naverEnabled }, { toast, errorNotice });
    return;
  }

  if (location.pathname.startsWith("/c/")) {
    const parsed = parseChannelPath();
    if (!parsed) {
      mountInvalidSlug(app!);
      return;
    }
    if (parsed.admin) {
      await mountAdmin(app!, parsed.slug);
      return;
    }
    await mountSongbook(app!, parsed.slug);
    return;
  }

  const [user, status] = await Promise.all([fetchMe(), fetchAuthStatus()]);
  mountLanding(app!, user, { googleEnabled: status.googleEnabled, naverEnabled: status.naverEnabled });
}

void boot();
