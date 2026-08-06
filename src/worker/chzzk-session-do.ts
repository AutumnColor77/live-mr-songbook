import { DurableObject } from "cloudflare:workers";
import {
  createUserSessionUrl,
  refreshChzzkToken,
  subscribeSessionEvent,
} from "./chzzk/api";
import {
  getChzzkLink,
  updateChzzkSessionStatus,
  updateChzzkTokens,
} from "./chzzk/links";
import { ingestChzzkRequest } from "./request-ingest";
import type { Bindings } from "./types";

/**
 * Convert Chzzk session URL to Engine.IO websocket upgrade URL (Socket.IO 2.x / EIO3).
 * Workers fetch() requires http(s):// even for Upgrade: websocket — runtime maps to ws(s).
 */
function toEngineIoWsUrl(sessionUrl: string): string {
  const u = new URL(sessionUrl);
  const proto = u.protocol === "http:" ? "http:" : "https:";
  const q = new URLSearchParams({
    EIO: "3",
    transport: "websocket",
  });
  for (const [k, v] of u.searchParams) {
    q.set(k, v);
  }
  return `${proto}//${u.host}/socket.io/?${q.toString()}`;
}

function parseSocketIoPayload(raw: string): { event: string; data: unknown } | null {
  const idx = raw.indexOf("42");
  if (idx < 0) return null;
  let jsonPart = raw.slice(idx + 2);
  if (jsonPart.startsWith("/")) {
    const comma = jsonPart.indexOf(",");
    if (comma < 0) return null;
    jsonPart = jsonPart.slice(comma + 1);
  }
  try {
    const arr = JSON.parse(jsonPart) as unknown;
    if (!Array.isArray(arr) || arr.length < 1) return null;
    return { event: String(arr[0]), data: arr[1] };
  } catch {
    return null;
  }
}

export class ChzzkSessionDO extends DurableObject<Bindings> {
  private channelId = "";
  private sessionKey = "";
  private connecting = false;

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === "POST" && (path === "/start" || path.endsWith("/start"))) {
      let body: { channelId?: string } = {};
      try {
        body = (await request.json()) as { channelId?: string };
      } catch {
        /* empty */
      }
      if (typeof body.channelId === "string" && body.channelId) {
        this.channelId = body.channelId;
        await this.ctx.storage.put("channelId", this.channelId);
      } else {
        this.channelId =
          (await this.ctx.storage.get<string>("channelId")) ?? this.channelId;
      }
      if (!this.channelId) {
        return Response.json({ error: "channelId required" }, { status: 400 });
      }
      try {
        await this.startSession();
        return Response.json({ ok: true, sessionKey: this.sessionKey || null });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await this.setStatus("error", msg);
        return Response.json({ error: msg }, { status: 500 });
      }
    }

    if (request.method === "POST" && (path === "/stop" || path.endsWith("/stop"))) {
      this.channelId =
        (await this.ctx.storage.get<string>("channelId")) ?? this.channelId;
      await this.stopSession("stopped");
      return Response.json({ ok: true });
    }

    if (request.method === "GET" && (path === "/status" || path.endsWith("/status"))) {
      this.channelId =
        (await this.ctx.storage.get<string>("channelId")) ?? this.channelId;
      return Response.json({
        channelId: this.channelId || null,
        sessionKey: this.sessionKey || null,
        sockets: this.ctx.getWebSockets().length,
      });
    }

    return new Response("Not found", { status: 404 });
  }

  async alarm(): Promise<void> {
    this.channelId =
      (await this.ctx.storage.get<string>("channelId")) ?? this.channelId;
    if (!this.channelId) return;
    try {
      await this.ensureFreshToken();
      if (this.ctx.getWebSockets().length === 0) {
        await this.startSession();
      } else {
        this.ctx.storage.setAlarm(Date.now() + 50 * 60 * 1000);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[ChzzkSessionDO] alarm", msg);
      await this.setStatus("error", msg);
      this.ctx.storage.setAlarm(Date.now() + 60_000);
    }
  }

  private async setStatus(status: string, detail = "") {
    if (!this.channelId) return;
    await updateChzzkSessionStatus(this.env.DB, this.channelId, status, detail);
  }

  private async ensureFreshToken(): Promise<string> {
    const link = await getChzzkLink(this.env.DB, this.channelId);
    if (!link) throw new Error("Chzzk not linked");

    const skew = 5 * 60 * 1000;
    if (link.access_expires_at > Date.now() + skew) {
      return link.access_token;
    }

    if (!this.env.CHZZK_CLIENT_ID || !this.env.CHZZK_CLIENT_SECRET) {
      throw new Error("CHZZK_CLIENT_* not configured");
    }

    const tokens = await refreshChzzkToken({
      clientId: this.env.CHZZK_CLIENT_ID,
      clientSecret: this.env.CHZZK_CLIENT_SECRET,
      refreshToken: link.refresh_token,
    });
    const expiresAt = Date.now() + tokens.expiresIn * 1000;
    await updateChzzkTokens(this.env.DB, this.channelId, {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      accessExpiresAt: expiresAt,
      scopes: tokens.scope,
    });
    return tokens.accessToken;
  }

  private async startSession(): Promise<void> {
    if (this.connecting) return;
    this.connecting = true;
    try {
      for (const ws of this.ctx.getWebSockets()) {
        try {
          ws.close(1000, "restart");
        } catch {
          /* ignore */
        }
      }
      this.sessionKey = "";
      await this.setStatus("connecting", "");
      const token = await this.ensureFreshToken();
      const sessionUrl = await createUserSessionUrl(token);
      const wsUrl = toEngineIoWsUrl(sessionUrl);

      const res = await fetch(wsUrl, {
        headers: { Upgrade: "websocket" },
      });
      const ws = res.webSocket;
      if (!ws) {
        throw new Error(`WebSocket upgrade failed (${res.status})`);
      }
      this.ctx.acceptWebSocket(ws);
      this.ctx.storage.setAlarm(Date.now() + 50 * 60 * 1000);
    } finally {
      this.connecting = false;
    }
  }

  private async stopSession(reason: string) {
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.close(1000, reason);
      } catch {
        /* ignore */
      }
    }
    this.sessionKey = "";
    await this.setStatus("disconnected", reason);
    await this.ctx.storage.deleteAlarm();
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    this.channelId =
      (await this.ctx.storage.get<string>("channelId")) ?? this.channelId;
    const text =
      typeof message === "string" ? message : new TextDecoder().decode(message);
    if (!text) return;

    if (text.startsWith("0")) {
      try {
        ws.send("40");
      } catch {
        /* ignore */
      }
      return;
    }

    if (text === "2") {
      try {
        ws.send("3");
      } catch {
        /* ignore */
      }
      return;
    }

    const parsed = parseSocketIoPayload(text);
    if (!parsed) return;

    if (parsed.event === "SYSTEM") {
      await this.onSystem(parsed.data);
      return;
    }
    if (parsed.event === "DONATION") {
      await this.onDonation(parsed.data);
      return;
    }
    if (parsed.event === "CHAT") {
      await this.onChat(parsed.data);
    }
  }

  async webSocketClose() {
    this.channelId =
      (await this.ctx.storage.get<string>("channelId")) ?? this.channelId;
    if (this.channelId) {
      await this.setStatus("disconnected", "socket closed");
      this.ctx.storage.setAlarm(Date.now() + 15_000);
    }
  }

  async webSocketError() {
    this.channelId =
      (await this.ctx.storage.get<string>("channelId")) ?? this.channelId;
    if (this.channelId) {
      await this.setStatus("error", "socket error");
      this.ctx.storage.setAlarm(Date.now() + 15_000);
    }
  }

  private async onSystem(data: unknown) {
    const body = data as {
      type?: string;
      data?: { sessionKey?: string };
    };
    if (body.type === "connected" && body.data?.sessionKey) {
      this.sessionKey = body.data.sessionKey;
      try {
        const token = await this.ensureFreshToken();
        await subscribeSessionEvent(token, "donation", this.sessionKey);
        await subscribeSessionEvent(token, "chat", this.sessionKey);
        await this.setStatus("connected", this.sessionKey);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await this.setStatus("error", msg);
      }
    }
  }

  private async onDonation(data: unknown) {
    const d = data as {
      donationText?: string;
      payAmount?: string | number;
      donatorNickname?: string;
      donatorChannelId?: string;
      eventSentAt?: string | number;
    };
    const text = (d.donationText ?? "").trim();
    if (!text || !this.channelId) return;
    const payAmount = Number(d.payAmount);
    const externalId = [
      "don",
      d.donatorChannelId ?? "",
      String(d.payAmount ?? ""),
      text,
      String(d.eventSentAt ?? ""),
    ].join(":");

    const result = await ingestChzzkRequest(this.env.DB, this.channelId, {
      source: "donation",
      text,
      externalId: externalId.slice(0, 200),
      payAmount: Number.isFinite(payAmount) ? payAmount : 0,
      nickname: d.donatorNickname,
    });
    if (!result.ok) {
      console.log("[ChzzkSessionDO] donation ingest skip", result.error);
    }
  }

  private async onChat(data: unknown) {
    const d = data as {
      content?: string;
      messageTime?: number;
      senderChannelId?: string;
      profile?: { nickname?: string };
    };
    const text = (d.content ?? "").trim();
    if (!text || !this.channelId) return;
    const externalId = [
      "chat",
      d.senderChannelId ?? "",
      String(d.messageTime ?? Date.now()),
      text.slice(0, 80),
    ].join(":");

    const result = await ingestChzzkRequest(this.env.DB, this.channelId, {
      source: "chat",
      text,
      externalId: externalId.slice(0, 200),
      nickname: d.profile?.nickname,
    });
    if (!result.ok) {
      console.log("[ChzzkSessionDO] chat ingest skip", result.error);
    }
  }
}
