/* Feather-style line icons matching the desktop app's inline SVG set
   (24x24, no fill, currentColor stroke, round caps). */
function svg(paths: string, size = 18, fill = false): string {
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="${
    fill ? "currentColor" : "none"
  }" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
}

export const icons = {
  search: (size = 18) =>
    svg('<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>', size),
  close: (size = 18) => svg('<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>', size),
  disc: (size = 18) => svg('<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/>', size),
  list: (size = 18) =>
    svg(
      '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>',
      size,
    ),
  mic: (size = 18) =>
    svg(
      '<path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>',
      size,
    ),
  palette: (size = 18) =>
    svg(
      '<circle cx="13.5" cy="6.5" r="1.5"/><circle cx="17.5" cy="10.5" r="1.5"/><circle cx="8.5" cy="7.5" r="1.5"/><circle cx="6.5" cy="12.5" r="1.5"/><path d="M12 2a10 10 0 0 0 0 20 2 2 0 0 0 2-2v-1a2 2 0 0 1 2-2h1a4 4 0 0 0 4-4 10 10 0 0 0-9-11z"/>',
      size,
    ),
  slash: (size = 22) =>
    svg(
      '<path d="M9 18V5l12-2v6"/><circle cx="6" cy="18" r="3"/><line x1="2" y1="2" x2="22" y2="22"/>',
      size,
    ),
  google: (size = 18) =>
    `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true"><path fill="#EA4335" d="M12 10.2v3.6h5.1c-.2 1.2-.9 2.3-1.9 3l3.1 2.4c1.8-1.7 2.9-4.1 2.9-7 0-.7-.1-1.3-.2-1.9H12z"/><path fill="#34A853" d="M6.6 14.3l-.5.4-2.2 1.7C5.6 19.1 8.6 21 12 21c2.4 0 4.4-.8 5.9-2.2l-3.1-2.4c-.8.6-1.9.9-2.8.9-2.2 0-4-1.5-4.7-3.5z"/><path fill="#4A90E2" d="M4 7.6C3.4 8.8 3 10.1 3 11.5s.4 2.7 1 3.9c0 .1 2.6-2 2.6-2-.2-.5-.3-1-.3-1.5s.1-1 .3-1.5L4 7.6z"/><path fill="#FBBC05" d="M12 5.7c1.3 0 2.5.5 3.4 1.3l2.6-2.6C16.4 2.9 14.4 2 12 2 8.6 2 5.6 3.9 4 6.9l2.7 2.1C7.9 7.1 9.8 5.7 12 5.7z"/></svg>`,
  naver: (size = 18) =>
    `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true"><rect width="24" height="24" rx="4" fill="#03C75A"/><path fill="#fff" d="M7 6.5h3.2l3.1 5.1V6.5H17v11h-3.2l-3.1-5.1v5.1H7V6.5z"/></svg>`,
};
