// ASTRODAY astroday-api-20261118-v2-r1 — loader. Source: github.com/mynameisnastasya/lizaty666 @ 6d8276a4bb74a6bc958b01e153b51b5c4c21db56 (astroday/release-v2/api.mjs)
// The code is verified by SHA-256 before it runs. A verified copy is kept in Postgres and used if GitHub is unreachable.
// Rollback: deploy the previous loader (other commit/SHA) or redeploy the previous Railway deployment.
import { SQL } from "bun";
const NAME = "api", URL_ = "https://raw.githubusercontent.com/mynameisnastasya/lizaty666/6d8276a4bb74a6bc958b01e153b51b5c4c21db56/astroday/release-v2/api.mjs", SHA = "5b3cf9dda9fde29ffb65bedba533d28770885a2f0b33c7fa707b53af91d38808";
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
    if (code) await db.unsafe("INSERT INTO astroday_release_artifacts(sha256,name,release,code) VALUES($1,$2,$3,$4) ON CONFLICT(sha256) DO NOTHING", [SHA, NAME, "astroday-api-20261118-v2-r1", code]);
    else { const row = (await db.unsafe("SELECT code FROM astroday_release_artifacts WHERE sha256=$1", [SHA]))[0]; if (row && digest(row.code) === SHA) { code = row.code; from = "database"; } }
  } catch (e) { console.error("ASTRODAY_LOADER_DB " + String(e?.message || e).slice(0, 80)); }
  finally { await db.close(); }
}
if (!code) { console.error("ASTRODAY_LOADER_NO_VERIFIED_CODE " + SHA.slice(0, 12)); process.exit(1); }
console.log("ASTRODAY_SOURCE_OK " + JSON.stringify({ release: "astroday-api-20261118-v2-r1", sha: SHA.slice(0, 12), from }));
await Bun.write("/tmp/astroday-release.mjs", code);
await import("/tmp/astroday-release.mjs");
