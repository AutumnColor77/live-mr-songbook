import { Hono } from "hono";
import { requireChannelAdmin } from "../../auth";
import type { AppEnv } from "../../types";
import queue from "./queue";
import requests from "./requests";
import settings from "./settings";
import songs from "./songs";

const admin = new Hono<AppEnv>();
admin.use("*", requireChannelAdmin);
admin.route("/", songs);
admin.route("/", settings);
admin.route("/", requests);
admin.route("/", queue);

export default admin;
