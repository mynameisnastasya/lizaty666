// Generates tiny Railway Function loaders that fetch the release from GitHub at a pinned commit,
// verify SHA-256, keep a copy in Postgres (astroday_release_artifacts) and fall back to it if GitHub is unreachable.
// Usage: bun tools/package-git.mjs <commit-sha>
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
const root = new URL("..", import.meta.url).pathname;
const commit = process.argv[2];
if (!/^[0-9a-f]{40}$/.test(commit || "")) throw Error("usage: package-git.mjs <40-char commit sha>");
const { RELEASE } = await import(root + "tools/build-release.mjs");
const sha = (p) => createHash("sha256").update(readFileSync(root + p, "utf8"), "utf8").digest("hex");
const RAW = "https://raw.githubusercontent.com/mynameisnastasya/lizaty666/" + commit + "/astroday/";
function loader(name, file, release, tmp) {
  return `// ASTRODAY ${release} — loader. Source: github.com/mynameisnastasya/lizaty666 @ ${commit} (astroday/${file})
// The code is verified by SHA-256 before it runs. A verified copy is kept in Postgres and used if GitHub is unreachable.
// Rollback: deploy the previous loader (other commit/SHA) or redeploy the previous Railway deployment.
import { SQL } from "bun";
const NAME = ${JSON.stringify(name)}, URL_ = ${JSON.stringify(RAW + file)}, SHA = ${JSON.stringify(sha(file))};
const digest = (s) => { const h = new Bun.CryptoHasher("sha256"); h.update(s); return h.digest("hex"); };
let code = null, from = "github";
for (let i = 0; i < 3 && !code; i++) {
  try { const r = await fetch(URL_, { signal: AbortSignal.timeout(15000) }); if (r.ok) { const t = await r.text(); if (digest(t) === SHA) code = t; else console.error("ASTRODAY_LOADER_SHA_MISMATCH"); } }
  catch (e) { console.error("ASTRODAY_LOADER_FETCH_FAILED " + String(e?.message || e).slice(0, 80)); }
  if (!code && i < 2) await Bun.sleep(2000);
}
if (Bun.env.DATABASE_URL) {
  const db = new SQL(Bun.env.DATABASE_URL, { max: 1 });
  try {
    await db.unsafe("CREATE TABLE IF NOT EXISTS astroday_release_artifacts(sha256 TEXT PRIMARY KEY,name TEXT NOT NULL,release TEXT NOT NULL,code TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
    if (code) await db.unsafe("INSERT INTO astroday_release_artifacts(sha256,name,release,code) VALUES($1,$2,$3,$4) ON CONFLICT(sha256) DO NOTHING", [SHA, NAME, ${JSON.stringify(release)}, code]);
    else { const row = (await db.unsafe("SELECT code FROM astroday_release_artifacts WHERE sha256=$1", [SHA]))[0]; if (row && digest(row.code) === SHA) { code = row.code; from = "database"; } }
  } catch (e) { console.error("ASTRODAY_LOADER_DB " + String(e?.message || e).slice(0, 80)); }
  finally { await db.close(); }
}
if (!code) { console.error("ASTRODAY_LOADER_NO_VERIFIED_CODE " + SHA.slice(0, 12)); process.exit(1); }
console.log("ASTRODAY_SOURCE_OK " + JSON.stringify({ release: ${JSON.stringify(release)}, sha: SHA.slice(0, 12), from }));
await Bun.write(${JSON.stringify(tmp)}, code);
await import(${JSON.stringify(tmp)});
`;
}
mkdirSync(root + "release/deploy", { recursive: true });
writeFileSync(root + "release/deploy/api-loader.ts", loader("api", "release/api.mjs", RELEASE.api, "/tmp/astroday-release.mjs"));
writeFileSync(root + "release/deploy/scheduler-loader.ts", loader("scheduler", "release/scheduler.mjs", RELEASE.scheduler, "/tmp/astroday-scheduler.mjs"));
console.log(JSON.stringify({ commit, api: sha("release/api.mjs").slice(0, 12), scheduler: sha("release/scheduler.mjs").slice(0, 12) }));
