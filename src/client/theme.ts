export const THEMES = ["dark", "light", "pink", "sky"] as const;
export type Theme = (typeof THEMES)[number];

export const THEME_LABELS: Record<Theme, string> = {
  dark: "다크",
  light: "라이트",
  pink: "핑크",
  sky: "스카이",
};

const THEME_STORAGE_KEY = "songbook-theme";

export function currentTheme(): Theme {
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  return THEMES.find((t) => t === stored) ?? "dark";
}

export function logoSrc(theme: Theme): string {
  return theme === "dark" ? "/logo-on-dark.webp" : "/logo-on-light.webp";
}

export function logoLinkHtml(options?: { fetchpriority?: boolean }): string {
  const fetchpriority = options?.fetchpriority ? ' fetchpriority="high"' : "";
  return `<a href="/" class="min-w-0 shrink-0 block">
    <img id="logo-lockup" class="logo-lockup" src="${logoSrc(currentTheme())}" width="480" height="120" alt="Live MR Songbook 홈"${fetchpriority} />
  </a>`;
}

export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem(THEME_STORAGE_KEY, theme);
  document.querySelectorAll<HTMLImageElement>("#logo-lockup").forEach((logo) => {
    logo.src = logoSrc(theme);
  });
}

export function cycleTheme(): Theme {
  const next = THEMES[(THEMES.indexOf(currentTheme()) + 1) % THEMES.length]!;
  applyTheme(next);
  return next;
}
