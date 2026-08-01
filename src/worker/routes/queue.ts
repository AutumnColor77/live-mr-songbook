import { Hono } from "hono";
import { mapRequest, type Bindings, type RequestRow } from "../types";

const queue = new Hono<{ Bindings: Bindings }>();

queue.get("/", async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT * FROM requests WHERE status IN ('pending', 'playing') ORDER BY CASE status WHEN 'playing' THEN 0 ELSE 1 END, created_at ASC",
  ).all<RequestRow>();

  return c.json({ queue: (results ?? []).map(mapRequest) });
});

export default queue;
