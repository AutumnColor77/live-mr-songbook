import { Hono } from "hono";
import { readThumbnailBlob } from "../thumbnails";
import type { AppEnv } from "../types";

const media = new Hono<AppEnv>();

media.get("/thumbs/:channelId/:songId", async (c) => {
  const channelId = c.req.param("channelId");
  const songId = c.req.param("songId");

  const row = await c.env.DB.prepare(
    "SELECT id FROM songs WHERE id = ? AND channel_id = ?",
  )
    .bind(songId, channelId)
    .first();
  if (!row) return c.json({ error: "Not found" }, 404);

  const blob = await readThumbnailBlob(c.env, channelId, songId);
  if (!blob) return c.json({ error: "Not found" }, 404);

  return new Response(blob.bytes, {
    headers: {
      "Content-Type": blob.contentType,
      "Cache-Control": "public, max-age=86400, immutable",
    },
  });
});

export default media;
