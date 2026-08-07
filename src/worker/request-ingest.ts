import {
  findDuplicateConflict,
  loadDuplicatePolicy,
} from "./duplicate-policy";
import { newId } from "./id";
import {
  findMatchingSongs,
  parseRequestCommand,
} from "./request-command";
import {
  loadRequestCommandSettings,
  type RequestMode,
} from "./request-settings";
import { mapRequest, type RequestRow, type SongRow } from "./types";

export type IngestSource = "chat" | "donation";

export type IngestInput = {
  source: IngestSource;
  text: string;
  externalId: string;
  payAmount?: number;
  nickname?: string;
  comment?: string;
};

export type IngestResult =
  | { ok: true; request: ReturnType<typeof mapRequest>; duplicate: boolean }
  | { ok: false; status: 400 | 403 | 404 | 409; error: string };

function sourceAllowed(mode: RequestMode, source: IngestSource): boolean {
  if (mode === "both") return true;
  if (mode === "free") return source === "chat";
  return source === "donation";
}

/** Per-song donation floor; null/missing falls back to channel default (now always 0). */
export function requiredPayAmount(song: SongRow, channelPriceKrw: number): number {
  if (
    typeof song.donation_amount === "number" &&
    Number.isFinite(song.donation_amount) &&
    song.donation_amount >= 0
  ) {
    return Math.round(song.donation_amount);
  }
  return channelPriceKrw;
}

export function songRequiresDonation(song: SongRow, channelPriceKrw = 0): boolean {
  return requiredPayAmount(song, channelPriceKrw) > 0;
}

export async function ingestChzzkRequest(
  db: D1Database,
  channelId: string,
  input: IngestInput,
): Promise<IngestResult> {
  const source = input.source;
  if (source !== "chat" && source !== "donation") {
    return { ok: false, status: 400, error: "source must be chat or donation" };
  }

  const externalId =
    typeof input.externalId === "string" ? input.externalId.trim() : "";
  if (!externalId) {
    return { ok: false, status: 400, error: "externalId is required" };
  }
  if (externalId.length > 200) {
    return { ok: false, status: 400, error: "externalId is too long" };
  }

  const text = typeof input.text === "string" ? input.text : "";
  if (!text.trim()) {
    return { ok: false, status: 400, error: "text is required" };
  }

  const settings = await loadRequestCommandSettings(db, channelId);
  if (!sourceAllowed(settings.mode, source)) {
    return {
      ok: false,
      status: 403,
      error:
        source === "chat"
          ? "Chat requests are disabled for this channel"
          : "Donation requests are disabled for this channel",
    };
  }

  // Parse before accepting / idempotency queries so non-commands exit after 1 read.
  const parsed = parseRequestCommand(text, settings.prefix, settings.separator);
  if (!parsed) {
    return {
      ok: false,
      status: 400,
      error: `Message must look like: ${settings.prefix} artist-title`,
    };
  }

  const accepting = await db
    .prepare(
      "SELECT value FROM settings WHERE channel_id = ? AND key = 'accepting_requests'",
    )
    .bind(channelId)
    .first<{ value: string }>();
  if ((accepting?.value ?? "true") !== "true") {
    return { ok: false, status: 403, error: "Currently not accepting requests" };
  }

  // Idempotency: return existing row if ref already seen
  if (source === "donation") {
    const existing = await db
      .prepare(
        `SELECT * FROM requests
         WHERE channel_id = ? AND donation_ref = ? LIMIT 1`,
      )
      .bind(channelId, externalId)
      .first<RequestRow>();
    if (existing) {
      return { ok: true, request: mapRequest(existing), duplicate: true };
    }
  } else {
    const existing = await db
      .prepare(
        `SELECT * FROM requests
         WHERE channel_id = ? AND chat_message_ref = ? LIMIT 1`,
      )
      .bind(channelId, externalId)
      .first<RequestRow>();
    if (existing) {
      return { ok: true, request: mapRequest(existing), duplicate: true };
    }
  }

  const { results: songRows } = await db
    .prepare("SELECT * FROM songs WHERE channel_id = ?")
    .bind(channelId)
    .all<SongRow>();
  const matches = findMatchingSongs(songRows ?? [], parsed.artist, parsed.title);
  if (matches.length === 0) {
    return { ok: false, status: 404, error: "No matching song" };
  }
  if (matches.length > 1) {
    return {
      ok: false,
      status: 409,
      error: "Multiple songs match; refine artist/title",
    };
  }
  const song = matches[0]!;
  const required = requiredPayAmount(song, settings.priceKrw);

  // Paid songs: donation only (no free chat / web path).
  if (source === "chat" && required > 0) {
    return {
      ok: false,
      status: 403,
      error: `이 곡은 후원(${required.toLocaleString("ko-KR")}원 이상)으로만 신청할 수 있습니다.`,
    };
  }

  let payAmount: number | null = null;
  if (source === "donation") {
    const raw =
      typeof input.payAmount === "number"
        ? input.payAmount
        : Number(input.payAmount);
    if (!Number.isFinite(raw) || raw < 0) {
      return { ok: false, status: 400, error: "payAmount is required for donations" };
    }
    payAmount = Math.min(Math.round(raw), 100_000_000);
    if (payAmount < required) {
      return {
        ok: false,
        status: 400,
        error: `payAmount must be at least ${required}`,
      };
    }
  }

  const { policy, sessionStartedAt } = await loadDuplicatePolicy(db, channelId);
  const conflict = await findDuplicateConflict(
    db,
    channelId,
    song.id,
    policy,
    sessionStartedAt,
  );
  if (conflict === "queue") {
    return { ok: false, status: 409, error: "이미 대기열에 있는 곡입니다." };
  }
  if (conflict === "played") {
    return { ok: false, status: 409, error: "이미 부른 곡입니다." };
  }

  const nicknameRaw =
    typeof input.nickname === "string" ? input.nickname.trim() : "";
  const commentRaw =
    typeof input.comment === "string" ? input.comment.trim() : "";
  const nickname = nicknameRaw.slice(0, 40) || "익명";
  const comment = commentRaw.slice(0, 200);

  const id = newId("req");
  const createdAt = Date.now();
  const maxSort = await db
    .prepare(
      `SELECT MAX(sort_order) AS maxSort FROM requests
       WHERE channel_id = ? AND status IN ('pending', 'playing')`,
    )
    .bind(channelId)
    .first<{ maxSort: number | null }>();
  const sortOrder =
    typeof maxSort?.maxSort === "number" ? maxSort.maxSort + 1 : createdAt;

  const donationRef = source === "donation" ? externalId : null;
  const chatRef = source === "chat" ? externalId : null;

  try {
    await db
      .prepare(
        `INSERT INTO requests (
           id, channel_id, song_id, title, artist, nickname, comment,
           status, created_at, sort_order, pay_amount, donation_ref, chat_message_ref
         ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        channelId,
        song.id,
        song.title,
        song.artist,
        nickname,
        comment,
        createdAt,
        sortOrder,
        payAmount,
        donationRef,
        chatRef,
      )
      .run();
  } catch (err) {
    // Race on unique ref → treat as idempotent success
    const msg = err instanceof Error ? err.message : String(err);
    if (/UNIQUE|constraint/i.test(msg)) {
      const existing = await db
        .prepare(
          source === "donation"
            ? `SELECT * FROM requests WHERE channel_id = ? AND donation_ref = ? LIMIT 1`
            : `SELECT * FROM requests WHERE channel_id = ? AND chat_message_ref = ? LIMIT 1`,
        )
        .bind(channelId, externalId)
        .first<RequestRow>();
      if (existing) {
        return { ok: true, request: mapRequest(existing), duplicate: true };
      }
    }
    throw err;
  }

  const row = await db
    .prepare("SELECT * FROM requests WHERE id = ?")
    .bind(id)
    .first<RequestRow>();

  return { ok: true, request: mapRequest(row!), duplicate: false };
}
