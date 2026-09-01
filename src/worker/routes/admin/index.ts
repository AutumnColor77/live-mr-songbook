import { Hono } from "hono";
import { requireChannelAdmin } from "../../auth";
import { rateLimitByIp } from "../../security";
import type { AppEnv } from "../../types";
import chzzkAdmin from "./chzzk";
import queue from "./queue";
import requests from "./requests";
import settings from "./settings";
import songs from "./songs";

const admin = new Hono<AppEnv>();
admin.use("*", requireChannelAdmin);
admin.use("*", rateLimitByIp("admin", 120, 60_000));
admin.route("/", songs);
admin.route("/", settings);
admin.route("/", requests);
admin.route("/", queue);
admin.route("/", chzzkAdmin);

export default admin;
