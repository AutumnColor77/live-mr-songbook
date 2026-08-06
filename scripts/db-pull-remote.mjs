/**
 * Pull production D1 into the local Miniflare DB used by `npm run dev`.
 *
 * Requires: `npx wrangler login` (가을색밤 Cloudflare account).
 * Usage: `npm run db:pull`
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const DB_NAME = "live-mr-songbook";
const OUT_DIR = "tmp";
const OUT_FILE = path.join(OUT_DIR, "remote-dump.sql");
const LOCAL_D1 = path.join(".wrangler", "state", "v3", "d1");

function run(cmd) {
  console.log(`\n> ${cmd}\n`);
  execSync(cmd, { stdio: "inherit", shell: true });
}

fs.mkdirSync(OUT_DIR, { recursive: true });

console.log("1/3 Exporting remote D1…");
run(`npx wrangler d1 export ${DB_NAME} --remote --output=${OUT_FILE}`);

if (!fs.existsSync(OUT_FILE) || fs.statSync(OUT_FILE).size === 0) {
  console.error(`Export failed or empty: ${OUT_FILE}`);
  process.exit(1);
}

// Remote dumps sometimes include BEGIN TRANSACTION which breaks local execute.
let sql = fs.readFileSync(OUT_FILE, "utf8");
sql = sql
  .replace(/^\s*BEGIN(?:\s+TRANSACTION)?\s*;\s*$/gim, "")
  .replace(/^\s*COMMIT\s*;\s*$/gim, "");
if (!sql.includes("PRAGMA foreign_keys")) {
  sql = `PRAGMA foreign_keys = OFF;\n${sql}\nPRAGMA foreign_keys = ON;\n`;
}
fs.writeFileSync(OUT_FILE, sql, "utf8");

console.log("2/3 Clearing local D1 state…");
if (fs.existsSync(LOCAL_D1)) {
  fs.rmSync(LOCAL_D1, { recursive: true, force: true });
}

console.log("3/3 Importing dump into local D1…");
run(`npx wrangler d1 execute ${DB_NAME} --local --file=${OUT_FILE}`);

console.log(`
Done.
- Dump: ${OUT_FILE} (gitignored)
- Start local app: npm run dev
- Local DB is a copy; production is unchanged.
`);
