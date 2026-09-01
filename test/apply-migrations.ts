import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";

type TestEnv = typeof env & {
  TEST_MIGRATIONS: Array<{ name: string; queries: string[] }>;
};

/** 0001_init already includes genre/difficulty; 0010/0011 would fail on a fresh DB. */
const SKIP = new Set(["0010_song_genre.sql", "0011_song_difficulty.sql"]);

const migrations = (env as TestEnv).TEST_MIGRATIONS.filter((m) => !SKIP.has(m.name));
await applyD1Migrations(env.DB, migrations);
