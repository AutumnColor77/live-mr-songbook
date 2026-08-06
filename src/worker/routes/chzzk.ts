import { Hono } from "hono";
import { requireChannelAdmin } from "../auth";
import { ingestChzzkRequest, type IngestSource } from "../request-ingest";
import type { AppEnv } from "../types";

const chzzk = new Hono<AppEnv>();

chzzk.use("*", requireChannelAdmin);

chzzk.post("/ingest", async (c) => {
  const channelId = c.get("channel").id;
  let body: {
    source?: string;
    text?: string;
    externalId?: string;
    payAmount?: number;
    nickname?: string;
    comment?: string;
  };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const source = body.source as IngestSource;
  const result = await ingestChzzkRequest(c.env.DB, channelId, {
    source,
    text: typeof body.text === "string" ? body.text : "",
    externalId: typeof body.externalId === "string" ? body.externalId : "",
    payAmount: body.payAmount,
    nickname: body.nickname,
    comment: body.comment,
  });

  if (!result.ok) {
    return c.json({ error: result.error }, result.status);
  }

  return c.json(
    { request: result.request, duplicate: result.duplicate },
    result.duplicate ? 200 : 201,
  );
});

export default chzzk;
