import { upsertSetting } from "./channel-settings";

export type RequestMode = "free" | "paid" | "both";

export type RequestCommandSettings = {
  mode: RequestMode;
  priceKrw: number;
  prefix: string;
  separator: string;
};

/** Fixed product defaults — not user-configurable. */
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
  _db: D1Database,
  _channelId: string,
): Promise<RequestCommandSettings> {
  return { ...DEFAULTS };
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
