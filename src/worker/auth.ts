import type { Context, Next } from "hono";
import type { Bindings } from "./types";

export async function requireAdmin(c: Context<{ Bindings: Bindings }>, next: Next) {
  const token = c.env.ADMIN_TOKEN;
  if (!token) {
    return c.json({ error: "Admin token not configured" }, 500);
  }

  const header = c.req.header("Authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  const provided = match?.[1]?.trim() ?? "";

  if (!provided || provided !== token) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  await next();
}
