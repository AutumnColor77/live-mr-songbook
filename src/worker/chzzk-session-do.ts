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
 * Convert Chzzk session URL to Engine.IO websocket URL (Socket.IO 2.x / EIO3).
 * `new WebSocket()` wants ws(s)://; fetch Upgrade wants http(s)://.
 */
function toEngineIoUrl(sessionUrl: string, forFetchUpgrade: boolean): string {
  const u = new URL(sessionUrl);
  const secure = u.protocol !== "http:" && u.protocol !== "ws:";
  const proto = forFetchUpgrade
    ? secure
      ? "https:"
      : "http:"
    : secure
      ? "wss:"
      : "ws:";
  const q = new URLSearchParams({
    EIO: "3",
    transport: "websocket",
  });
  for (const [k, v] of u.searchParams) {
    q.set(k, v);
  }
  return `${proto}//${u.host}/socket.io/?${q.toString()}`;
}

/** Chzzk wraps Socket.IO event args as a JSON string (double-encoded). */
function unwrapEventData(data: unknown): unknown {
  if (typeof data !== "string") return data;
  try {
    return JSON.parse(data);
  } catch {
    return data;
  }
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
    return { event: String(arr[0]), data: unwrapEventData(arr[1]) };
  } catch {
    return null;
  }
}

function socketOpen(ws: WebSocket | null): boolean {
  return Boolean(ws && ws.readyState === WebSocket.OPEN);
}

/**
 * Outbound Chzzk Session socket.
 * Hibernation (`ctx.acceptWebSocket`) only works for *incoming* sockets — use `ws.accept()` + listeners.
 */
export class ChzzkSessionDO extends DurableObject<Bindings> {
  private channelId = "";
  private sessionKey = "";
  private connecting = false;
  private socket: WebSocket | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;

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
        sockets: socketOpen(this.socket) ? 1 : 0,
      });
    }

    return new Response("Not found", { status: 404 });
  }

  async alarm(): Promise<void> {
    this.channelId =
      (await this.ctx.storage.get<string>("channelId")) ?? this.channelId;
    if (!this.channelId) return;
    try {
      const link = await getChzzkLink(this.env.DB, this.channelId);
      // Stuck after WS upgrade but before SYSTEM connected
      if (link?.session_status === "connecting") {
        if (!socketOpen(this.socket)) {
          await this.setStatus("error", "socket closed while connecting");
          await this.startSession();
          return;
        }
        await this.setStatus(
          "error",
          "no SYSTEM connected (check scopes / socket packets)",
        );
        this.closeSocket("connect timeout");
        this.ctx.storage.setAlarm(Date.now() + 15_000);
        return;
      }

      await this.ensureFreshToken();
      if (!socketOpen(this.socket)) {
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

  private clearPing() {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private startPing(ws: WebSocket, intervalMs: number) {
    this.clearPing();
    const ms = Math.max(5_000, intervalMs || 25_000);
    this.pingTimer = setInterval(() => {
      if (ws.readyState !== WebSocket.OPEN) {
        this.clearPing();
        return;
      }
      try {
        // Engine.IO v3: client sends ping ("2"), server replies pong ("3")
        ws.send("2");
      } catch {
        this.clearPing();
      }
    }, ms);
  }

  private closeSocket(reason: string) {
    this.clearPing();
    const ws = this.socket;
    this.socket = null;
    if (!ws) return;
    try {
      ws.close(1000, reason.slice(0, 120));
    } catch {
      /* ignore */
    }
  }

  private bindSocket(ws: WebSocket, alreadyAccepted = false) {
    this.socket = ws;

    ws.addEventListener("message", (event) => {
      void this.onSocketMessage(ws, event.data as string | ArrayBuffer | Blob);
    });
    ws.addEventListener("close", () => {
      if (this.socket === ws) this.socket = null;
      this.clearPing();
      void this.onSocketClose();
    });
    ws.addEventListener("error", () => {
      if (this.socket === ws) this.socket = null;
      this.clearPing();
      void this.onSocketError();
    });
    if (!alreadyAccepted && typeof (ws as WebSocket & { accept?: () => void }).accept === "function") {
      // fetch()-upgrade sockets need accept(); new WebSocket() does not.
      try {
        (ws as WebSocket & { accept: () => void }).accept();
      } catch {
        /* already accepted / client socket */
      }
    }
  }

  private async startSession(): Promise<void> {
    if (this.connecting) return;
    this.connecting = true;
    try {
      this.closeSocket("restart");
      this.sessionKey = "";
      await this.setStatus("connecting", "");
      const token = await this.ensureFreshToken();
      const sessionUrl = await createUserSessionUrl(token);
      const wssUrl = toEngineIoUrl(sessionUrl, false);

      const ws = new WebSocket(wssUrl);
      this.bindSocket(ws, true);

      await new Promise<void>((resolve, reject) => {
        if (ws.readyState === WebSocket.OPEN) {
          resolve();
          return;
        }
        if (ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
          reject(new Error("WebSocket closed before open"));
          return;
        }
        const timer = setTimeout(() => reject(new Error("WebSocket open timeout")), 12_000);
        const onOpen = () => {
          clearTimeout(timer);
          resolve();
        };
        const onErr = () => {
          clearTimeout(timer);
          reject(new Error("WebSocket open failed"));
        };
        ws.addEventListener("open", onOpen, { once: true });
        ws.addEventListener("error", onErr, { once: true });
      });

      await this.setStatus("connecting", `open ${new URL(wssUrl).host}`);
      this.ctx.storage.setAlarm(Date.now() + 20_000);
    } finally {
      this.connecting = false;
    }
  }

  private async stopSession(reason: string) {
    this.closeSocket(reason);
    this.sessionKey = "";
    await this.setStatus("disconnected", reason);
    await this.ctx.storage.deleteAlarm();
  }

  private async onSocketMessage(
    ws: WebSocket,
    message: string | ArrayBuffer | Blob,
  ) {
    this.channelId =
      (await this.ctx.storage.get<string>("channelId")) ?? this.channelId;

    let text: string;
    if (typeof message === "string") {
      text = message;
    } else if (message instanceof ArrayBuffer) {
      text = new TextDecoder().decode(message);
    } else if (ArrayBuffer.isView(message)) {
      text = new TextDecoder().decode(message);
    } else if (typeof Blob !== "undefined" && message instanceof Blob) {
      text = await message.text();
    } else {
      text = String(message);
    }
    if (!text) return;

    // Breadcrumb for admin UI while waiting for SYSTEM connected
    if (!this.sessionKey) {
      const crumb = text.length > 80 ? `${text.slice(0, 80)}…` : text;
      await this.setStatus("connecting", `pkt ${crumb}`);
    }

    // Engine.IO open — do NOT send Socket.IO CONNECT ("40") on root `/`
    if (text.startsWith("0")) {
      try {
        const handshake = JSON.parse(text.slice(1)) as { pingInterval?: number };
        this.startPing(ws, handshake.pingInterval ?? 25_000);
      } catch {
        this.startPing(ws, 25_000);
      }
      return;
    }

    // Engine.IO pong (reply to our ping) — ignore
    if (text === "3") return;

    const parsed = parseSocketIoPayload(text);
    if (!parsed) return;

    if (parsed.event === "error") {
      const detail =
        typeof parsed.data === "string" ? parsed.data : JSON.stringify(parsed.data);
      await this.setStatus("error", detail.slice(0, 200));
      return;
    }
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

  private async onSocketClose() {
    this.channelId =
      (await this.ctx.storage.get<string>("channelId")) ?? this.channelId;
    if (this.channelId) {
      await this.setStatus("disconnected", "socket closed");
      this.ctx.storage.setAlarm(Date.now() + 15_000);
    }
  }

  private async onSocketError() {
    this.channelId =
      (await this.ctx.storage.get<string>("channelId")) ?? this.channelId;
    if (this.channelId) {
      await this.setStatus("error", "socket error");
      this.ctx.storage.setAlarm(Date.now() + 15_000);
    }
  }

  private async onSystem(data: unknown) {
    const body = (typeof data === "object" && data !== null ? data : {}) as {
      type?: string;
      data?: { sessionKey?: string } | string;
      sessionKey?: string;
    };

    let sessionKey: string | undefined;
    if (body.type === "connected") {
      if (typeof body.data === "string") {
        try {
          sessionKey = (JSON.parse(body.data) as { sessionKey?: string }).sessionKey;
        } catch {
          sessionKey = undefined;
        }
      } else {
        sessionKey = body.data?.sessionKey;
      }
    }
    if (!sessionKey && typeof body.sessionKey === "string") {
      sessionKey = body.sessionKey;
    }

    if (!sessionKey) {
      await this.setStatus(
        "connecting",
        `SYSTEM ${JSON.stringify(data).slice(0, 120)}`,
      );
      return;
    }

    this.sessionKey = sessionKey;
    try {
      const token = await this.ensureFreshToken();
      await subscribeSessionEvent(token, "donation", this.sessionKey);
      await subscribeSessionEvent(token, "chat", this.sessionKey);
      await this.setStatus("connected", this.sessionKey);
      this.ctx.storage.setAlarm(Date.now() + 50 * 60 * 1000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await this.setStatus("error", msg);
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
