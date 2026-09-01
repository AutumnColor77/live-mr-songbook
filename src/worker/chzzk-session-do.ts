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
import { hasRequestCommandPrefix } from "./request-command";
import { ingestChzzkRequest } from "./request-ingest";
import { loadRequestCommandSettings } from "./request-settings";
import type { Bindings } from "./types";

const PING_ALARM_MS = 20_000;
const RECONNECT_BASE_MS = 15_000;
const RECONNECT_CAP_MS = 5 * 60 * 1000;
const CONNECT_TIMEOUT_MS = 25_000;

function reconnectDelayMs(attempt: number): number {
  const exp = Math.min(attempt, 10);
  return Math.min(RECONNECT_CAP_MS, RECONNECT_BASE_MS * 2 ** exp);
}

/**
 * Convert Chzzk session URL to Engine.IO websocket upgrade URL (Socket.IO 2.x / EIO3).
 * Workers fetch() requires http(s):// even for Upgrade: websocket — runtime maps to ws(s).
 */
function toEngineIoHttpsUrl(sessionUrl: string): string {
  const u = new URL(sessionUrl);
  const proto = u.protocol === "http:" || u.protocol === "ws:" ? "http:" : "https:";
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
 * Hibernation only works for incoming sockets — use ws.accept() + listeners,
 * and DO alarms for Engine.IO client pings / reconnect (setInterval is unreliable).
 */
export class ChzzkSessionDO extends DurableObject<Bindings> {
  private channelId = "";
  private sessionKey = "";
  private connecting = false;
  private socket: WebSocket | null = null;
  private wantRunning = false;

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
      this.wantRunning = true;
      await this.ctx.storage.put("wantRunning", true);
      await this.ctx.storage.put("reconnectAttempt", 0);
      try {
        await this.startSession();
        return Response.json({
          ok: true,
          sessionKey: this.sessionKey || null,
          live: socketOpen(this.socket),
        });
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        await this.setStatus("error", detail);
        await this.scheduleReconnect();
        console.error("[ChzzkSessionDO] start failed", detail);
        return Response.json({ error: "session start failed" }, { status: 500 });
      }
    }

    if (request.method === "POST" && (path === "/stop" || path.endsWith("/stop"))) {
      this.channelId =
        (await this.ctx.storage.get<string>("channelId")) ?? this.channelId;
      this.wantRunning = false;
      await this.ctx.storage.put("wantRunning", false);
      await this.stopSession("stopped");
      return Response.json({ ok: true });
    }

    if (request.method === "GET" && (path === "/status" || path.endsWith("/status"))) {
      this.channelId =
        (await this.ctx.storage.get<string>("channelId")) ?? this.channelId;
      this.wantRunning =
        (await this.ctx.storage.get<boolean>("wantRunning")) ?? this.wantRunning;
      this.sessionKey =
        (await this.ctx.storage.get<string>("sessionKey")) ?? this.sessionKey;
      return Response.json({
        channelId: this.channelId || null,
        sessionKey: this.sessionKey || null,
        live: socketOpen(this.socket),
        wantRunning: this.wantRunning,
        sockets: socketOpen(this.socket) ? 1 : 0,
      });
    }

    // Heal: if DB thinks we're connected but socket is dead, restart.
    if (request.method === "POST" && (path === "/ensure" || path.endsWith("/ensure"))) {
      this.channelId =
        (await this.ctx.storage.get<string>("channelId")) ?? this.channelId;
      this.wantRunning =
        (await this.ctx.storage.get<boolean>("wantRunning")) ?? true;
      if (!this.channelId) {
        return Response.json({ error: "channelId required" }, { status: 400 });
      }
      await this.ctx.storage.put("wantRunning", true);
      this.wantRunning = true;
      if (!socketOpen(this.socket)) {
        try {
          await this.startSession();
        } catch (err) {
          const detail = err instanceof Error ? err.message : String(err);
          await this.setStatus("error", detail);
          console.error("[ChzzkSessionDO] ensure failed", detail);
          return Response.json({ error: "session start failed", live: false }, { status: 500 });
        }
      }
      return Response.json({
        ok: true,
        live: socketOpen(this.socket),
        sessionKey: this.sessionKey || null,
      });
    }

    return new Response("Not found", { status: 404 });
  }

  async alarm(): Promise<void> {
    this.channelId =
      (await this.ctx.storage.get<string>("channelId")) ?? this.channelId;
    this.wantRunning =
      (await this.ctx.storage.get<boolean>("wantRunning")) ?? false;
    this.sessionKey =
      (await this.ctx.storage.get<string>("sessionKey")) ?? this.sessionKey;
    if (!this.channelId || !this.wantRunning) return;

    try {
      const link = await getChzzkLink(this.env.DB, this.channelId, this.env);

      if (link?.session_status === "connecting") {
        const startedAt =
          (await this.ctx.storage.get<number>("connectingSince")) ?? 0;
        if (!socketOpen(this.socket)) {
          await this.setStatus("error", "socket closed while connecting");
          await this.startSession();
          return;
        }
        if (startedAt && Date.now() - startedAt > CONNECT_TIMEOUT_MS) {
          await this.setStatus(
            "error",
            "no SYSTEM connected (check scopes / socket packets)",
          );
          this.closeSocket("connect timeout");
          await this.scheduleReconnect();
          return;
        }
        // Still connecting — Engine.IO client ping
        this.sendPing();
        this.ctx.storage.setAlarm(Date.now() + PING_ALARM_MS);
        return;
      }

      await this.ensureFreshToken();

      if (!socketOpen(this.socket)) {
        await this.setStatus("disconnected", "socket missing — reconnecting");
        await this.startSession();
        return;
      }

      this.sendPing();
      this.ctx.storage.setAlarm(Date.now() + PING_ALARM_MS);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[ChzzkSessionDO] alarm", msg);
      await this.setStatus("error", msg);
      await this.scheduleReconnect();
    }
  }

  private async scheduleReconnect() {
    this.wantRunning =
      (await this.ctx.storage.get<boolean>("wantRunning")) ?? this.wantRunning;
    if (!this.wantRunning) {
      await this.ctx.storage.deleteAlarm();
      return;
    }
    const attempt =
      (await this.ctx.storage.get<number>("reconnectAttempt")) ?? 0;
    const delay = reconnectDelayMs(attempt);
    await this.ctx.storage.put("reconnectAttempt", attempt + 1);
    this.ctx.storage.setAlarm(Date.now() + delay);
  }

  private sendPing() {
    const ws = this.socket;
    if (!socketOpen(ws)) return;
    try {
      // Engine.IO v3: client sends ping ("2"), server replies pong ("3")
      ws!.send("2");
    } catch {
      /* ignore */
    }
  }

  private async setStatus(status: string, detail = "") {
    if (!this.channelId) return;
    await updateChzzkSessionStatus(this.env.DB, this.channelId, status, detail);
  }

  private async ensureFreshToken(): Promise<string> {
    const link = await getChzzkLink(this.env.DB, this.channelId, this.env);
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
    await updateChzzkTokens(this.env.DB, this.env, this.channelId, {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      accessExpiresAt: expiresAt,
      scopes: tokens.scope,
    });
    return tokens.accessToken;
  }

  private closeSocket(reason: string) {
    const ws = this.socket;
    this.socket = null;
    if (!ws) return;
    try {
      ws.close(1000, reason.slice(0, 120));
    } catch {
      /* ignore */
    }
  }

  private bindSocket(ws: WebSocket) {
    this.socket = ws;

    // Listeners MUST be registered before accept() or early packets are missed.
    ws.addEventListener("message", (event) => {
      void this.onSocketMessage(ws, event.data as string | ArrayBuffer | Blob);
    });
    ws.addEventListener("close", (event) => {
      if (this.socket === ws) this.socket = null;
      void this.onSocketClose(event.code, event.reason);
    });
    ws.addEventListener("error", () => {
      if (this.socket === ws) this.socket = null;
      void this.onSocketError();
    });
    ws.accept();
  }

  private async startSession(): Promise<void> {
    if (this.connecting) return;
    this.connecting = true;
    try {
      this.closeSocket("restart");
      this.sessionKey = "";
      await this.ctx.storage.delete("sessionKey");
      await this.ctx.storage.put("connectingSince", Date.now());
      await this.setStatus("connecting", "starting");
      const token = await this.ensureFreshToken();
      const sessionUrl = await createUserSessionUrl(token);
      const wsUrl = toEngineIoHttpsUrl(sessionUrl);

      const res = await fetch(wsUrl, {
        headers: { Upgrade: "websocket" },
      });
      const ws = res.webSocket;
      if (!ws) {
        throw new Error(`WebSocket upgrade failed (${res.status})`);
      }
      this.bindSocket(ws);
      await this.setStatus("connecting", `upgraded ${new URL(wsUrl).host}`);

      // Keep this DO invocation alive until the outbound socket closes.
      this.ctx.waitUntil(
        new Promise<void>((resolve) => {
          const done = () => resolve();
          ws.addEventListener("close", done, { once: true });
          ws.addEventListener("error", done, { once: true });
        }),
      );

      this.ctx.storage.setAlarm(Date.now() + PING_ALARM_MS);
    } finally {
      this.connecting = false;
    }
  }

  private async stopSession(reason: string) {
    this.closeSocket(reason);
    this.sessionKey = "";
    await this.ctx.storage.delete("sessionKey");
    await this.ctx.storage.put("reconnectAttempt", 0);
    await this.setStatus("disconnected", reason);
    await this.ctx.storage.deleteAlarm();
  }

  private async onSocketMessage(
    _ws: WebSocket,
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

    if (!this.sessionKey) {
      const crumb = text.length > 80 ? `${text.slice(0, 80)}…` : text;
      await this.setStatus("connecting", `pkt ${crumb}`);
    }

    // Engine.IO open — do NOT send Socket.IO CONNECT ("40") on root `/`
    if (text.startsWith("0")) {
      // Ping is driven by DO alarm (setInterval is unreliable across DO suspend).
      this.ctx.storage.setAlarm(Date.now() + PING_ALARM_MS);
      return;
    }

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

  private async onSocketClose(code = 0, reason = "") {
    this.channelId =
      (await this.ctx.storage.get<string>("channelId")) ?? this.channelId;
    this.wantRunning =
      (await this.ctx.storage.get<boolean>("wantRunning")) ?? false;
    if (!this.channelId) return;
    const detail = reason
      ? `socket closed ${code} ${reason}`.slice(0, 200)
      : `socket closed ${code}`;
    await this.setStatus("disconnected", detail);
    if (this.wantRunning) {
      await this.scheduleReconnect();
    }
  }

  private async onSocketError() {
    this.channelId =
      (await this.ctx.storage.get<string>("channelId")) ?? this.channelId;
    this.wantRunning =
      (await this.ctx.storage.get<boolean>("wantRunning")) ?? false;
    if (!this.channelId) return;
    await this.setStatus("error", "socket error");
    if (this.wantRunning) {
      await this.scheduleReconnect();
    }
  }

  private async onSystem(data: unknown) {
    const body = (typeof data === "object" && data !== null ? data : {}) as {
      type?: string;
      data?: { sessionKey?: string; eventType?: string } | string;
      sessionKey?: string;
    };

    if (body.type === "subscribed") {
      const ev =
        typeof body.data === "object" && body.data
          ? body.data.eventType
          : undefined;
      console.log("[ChzzkSessionDO] subscribed", ev);
      return;
    }

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
    await this.ctx.storage.put("sessionKey", sessionKey);
    await this.ctx.storage.delete("connectingSince");
    try {
      const token = await this.ensureFreshToken();
      await subscribeSessionEvent(token, "donation", this.sessionKey);
      await subscribeSessionEvent(token, "chat", this.sessionKey);
      await this.ctx.storage.put("reconnectAttempt", 0);
      await this.setStatus("connected", this.sessionKey);
      this.ctx.storage.setAlarm(Date.now() + PING_ALARM_MS);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await this.setStatus("error", msg);
      await this.scheduleReconnect();
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

    // Drop non-commands before any D1 work (prefix is a fixed product default).
    const settings = await loadRequestCommandSettings(
      this.env.DB,
      this.channelId,
    );
    if (!hasRequestCommandPrefix(text, settings.prefix)) return;

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
