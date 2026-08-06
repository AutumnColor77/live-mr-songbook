const EM_DASH_SEP = " — ";

/** Build copy-paste command for a song. Uses em dash if artist/title contain `-`. */
export function buildRequestCommand(
  prefix: string,
  artist: string,
  title: string,
  separator = "-",
): string {
  const a = artist.trim();
  const t = title.trim();
  const sep =
    a.includes("-") || t.includes("-") || separator === "—"
      ? EM_DASH_SEP
      : separator || "-";
  return `${prefix.trim()} ${a}${sep}${t}`;
}

/** Chzzk cheese ≈ 100 KRW. */
export function krwToCheeseHint(krw: number): number {
  if (!Number.isFinite(krw) || krw <= 0) return 0;
  return Math.max(1, Math.ceil(krw / 100));
}

export function formatMinDonationLabel(krw: number): string {
  if (!Number.isFinite(krw) || krw <= 0) return "금액 제한 없음";
  const cheese = krwToCheeseHint(krw);
  return `최소 ${cheese.toLocaleString("ko-KR")}치즈 (${krw.toLocaleString("ko-KR")}원)`;
}
