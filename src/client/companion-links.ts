export const COMPANION_BASE = "https://lmrm.vercel.app";

export const COMPANION_TERMS_URL = `${COMPANION_BASE}/terms`;
export const COMPANION_PRIVACY_URL = `${COMPANION_BASE}/privacy`;
export const COMPANION_FAQ_URL = `${COMPANION_BASE}/faq`;

export const AUTUMN_TOOLS_DISCORD_URL = "https://discord.gg/qfJnk3VJyf";

export function externalLinkHtml(href: string, label: string, className = ""): string {
  const cls = className ? ` class="${className}"` : "";
  return `<a href="${href}" target="_blank" rel="noopener noreferrer"${cls}>${label}</a>`;
}
