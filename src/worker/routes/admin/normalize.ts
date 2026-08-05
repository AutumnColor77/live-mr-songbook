export function normalizeCategory(raw: unknown, fallback = ""): string {
  if (typeof raw !== "string") return fallback;
  const value = raw.trim().slice(0, 40);
  return value || fallback;
}

export function normalizeGenre(raw: unknown, fallback = "미분류"): string {
  if (typeof raw !== "string") return fallback;
  const value = raw.trim().slice(0, 40);
  return value || fallback;
}

export function normalizeDifficulty(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return null;
  const rounded = Math.round(n);
  if (rounded < 1 || rounded > 5) return null;
  return rounded;
}
