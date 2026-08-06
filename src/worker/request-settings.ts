import { upsertSetting } from "./channel-settings";

export type RequestMode = "free" | "paid" | "both";

export type RequestCommandSettings = {
  mode: RequestMode;
  priceKrw: number;
  prefix: string;
  separator: string;
};

const DEFAULTS: RequestCommandSettings = {
  mode: "both",
  priceKrw: 0,
  prefix: "!신청",
  separator: "-",
};

export function isRequestMode(raw: unknown): raw is RequestMode {
  return raw === "free" || raw === "paid" || raw === "both";
}

export async function loadRequestCommandSettings(
  db: D1Database,
  channelId: string,
): Promise<RequestCommandSettings> {
  const { results } = await db
    .prepare(
      `SELECT key, value FROM settings
       WHERE channel_id = ? AND key IN (
         'request_mode', 'request_price_krw',
         'request_command_prefix', 'request_command_separator'
       )`,
    )
    .bind(channelId)
    .all<{ key: string; value: string }>();

  const map = new Map((results ?? []).map((r) => [r.key, r.value]));
  const modeRaw = map.get("request_mode");
  const priceRaw = Number(map.get("request_price_krw") ?? DEFAULTS.priceKrw);
  const prefix = (map.get("request_command_prefix") ?? DEFAULTS.prefix).trim() || DEFAULTS.prefix;
  const separator =
    (map.get("request_command_separator") ?? DEFAULTS.separator).trim() || DEFAULTS.separator;

  return {
    mode: isRequestMode(modeRaw) ? modeRaw : DEFAULTS.mode,
    priceKrw:
      Number.isFinite(priceRaw) && priceRaw >= 0
        ? Math.min(Math.round(priceRaw), 100_000_000)
        : 0,
    prefix,
    separator,
  };
}

export function seedRequestCommandSettings(
  db: D1Database,
  channelId: string,
): D1PreparedStatement[] {
  return [
    upsertSetting(db, channelId, "request_mode", DEFAULTS.mode),
    upsertSetting(db, channelId, "request_price_krw", String(DEFAULTS.priceKrw)),
    upsertSetting(db, channelId, "request_command_prefix", DEFAULTS.prefix),
    upsertSetting(db, channelId, "request_command_separator", DEFAULTS.separator),
  ];
}
