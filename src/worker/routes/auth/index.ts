import { Hono } from "hono";
import type { AppEnv } from "../../types";
import desktop from "./desktop";
import { registerProviderRoutes } from "./oauth-providers";
import sessionRoutes from "./session-routes";

export { safeNextPath } from "./helpers";

const auth = new Hono<AppEnv>();
auth.route("/", sessionRoutes);
auth.route("/", desktop);
registerProviderRoutes(auth, "google");
registerProviderRoutes(auth, "naver");

export default auth;
