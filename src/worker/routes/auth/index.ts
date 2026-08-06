import { Hono } from "hono";
import type { AppEnv } from "../../types";
import desktop from "./desktop";
import chzzkAuth from "./chzzk-link";
import { registerProviderRoutes } from "./oauth-providers";
import sessionRoutes from "./session-routes";

export { safeNextPath } from "./helpers";

const auth = new Hono<AppEnv>();
auth.route("/", sessionRoutes);
auth.route("/", desktop);
auth.route("/", chzzkAuth);
registerProviderRoutes(auth, "google");
registerProviderRoutes(auth, "naver");

export default auth;
