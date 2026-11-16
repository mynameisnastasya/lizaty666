// Packs the API (with the scheduler code as a DB-published artifact) and the scheduler loader for Railway Functions.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { brotliCompressSync, constants } from "node:zlib";
const root = new URL("..", import.meta.url).pathname;
const { RELEASE } = await import(root + "tools/build-release.mjs");
const api = readFileSync(root + "release/api.mjs", "utf8"), sched = readFileSync(root + "release/scheduler.mjs", "utf8");
const sha = (s) => createHash("sha256").update(s, "utf8").digest("hex");
const SEP = "\n/*@@ASTRODAY_SCHEDULER_ARTIFACT@@*/\n";
if (api.includes(SEP) || sched.includes(SEP)) throw Error("separator collision");
const blob = Buffer.from(api + SEP + sched, "utf8");
const packed = brotliCompressSync(blob, { params: { [constants.BROTLI_PARAM_QUALITY]: 11, [constants.BROTLI_PARAM_LGWIN]: 24, [constants.BROTLI_PARAM_SIZE_HINT]: blob.length } }).toString("base64");
const A = sha(api), S = sha(sched);
const apiWrapper = `// ASTRODAY ${RELEASE.api} — API + bot. Also publishes the scheduler code (${RELEASE.scheduler}) to astroday_release_artifacts.
// Base: astroday-api-20261116-join-test-fix. Sources: tools/build-release.mjs (patches over the verified deployed bundle).
import { brotliDecompressSync } from "node:zlib";
import { SQL } from "bun";
const PACKED = "${packed}";
const API_SHA = "${A}", SCHEDULER_SHA = "${S}", SEP = ${JSON.stringify(SEP)};
const all = brotliDecompressSync(Buffer.from(PACKED, "base64")).toString("utf8");
const cut = all.indexOf(SEP);
const api = all.slice(0, cut), scheduler = all.slice(cut + SEP.length);
const digest = (s) => { const h = new Bun.CryptoHasher("sha256"); h.update(s); return h.digest("hex"); };
if (cut < 0 || digest(api) !== API_SHA || digest(scheduler) !== SCHEDULER_SHA) throw Error("ASTRODAY_SOURCE_DIGEST_MISMATCH");
console.log("ASTRODAY_SOURCE_OK " + JSON.stringify({ release: "${RELEASE.api}", api: API_SHA.slice(0, 12), scheduler: SCHEDULER_SHA.slice(0, 12) }));
if (Bun.env.DATABASE_URL) {
  const db = new SQL(Bun.env.DATABASE_URL, { max: 1 });
  try {
    await db.unsafe("CREATE TABLE IF NOT EXISTS astroday_release_artifacts(sha256 TEXT PRIMARY KEY,name TEXT NOT NULL,release TEXT NOT NULL,code TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
    await db.unsafe("INSERT INTO astroday_release_artifacts(sha256,name,release,code) VALUES($1,'scheduler',$2,$3) ON CONFLICT(sha256) DO NOTHING", [SCHEDULER_SHA, "${RELEASE.scheduler}", scheduler]);
    console.log("ASTRODAY_SCHEDULER_ARTIFACT_PUBLISHED " + SCHEDULER_SHA.slice(0, 12));
  } catch (e) {
    console.error("ASTRODAY_SCHEDULER_ARTIFACT_FAILED " + String(e?.message || e).slice(0, 120));
  } finally { await db.close(); }
}
await Bun.write("/tmp/astroday-release.mjs", api);
await import("/tmp/astroday-release.mjs");
`;
const schedWrapper = `// ASTRODAY ${RELEASE.scheduler} — loads the exact scheduler code published by the API release ${RELEASE.api}
// (table astroday_release_artifacts, pinned by SHA-256). Rollback = pin the previous SHA or redeploy the previous deployment.
import { SQL } from "bun";
const SCHEDULER_SHA = "${S}";
let code = null;
if (Bun.env.DATABASE_URL) {
  const db = new SQL(Bun.env.DATABASE_URL, { max: 1 });
  try { code = (await db.unsafe("SELECT code FROM astroday_release_artifacts WHERE sha256=$1 AND name='scheduler'", [SCHEDULER_SHA]))[0]?.code || null; }
  catch (e) { console.error("SCHEDULER_ARTIFACT_READ_FAILED " + String(e?.message || e).slice(0, 120)); }
  finally { await db.close(); }
}
const h = new Bun.CryptoHasher("sha256"); if (code) h.update(code);
if (!code || h.digest("hex") !== SCHEDULER_SHA) { console.error("SCHEDULER_ARTIFACT_MISSING_OR_INVALID " + SCHEDULER_SHA.slice(0, 12)); process.exit(1); }
await Bun.write("/tmp/astroday-scheduler.mjs", code);
await import("/tmp/astroday-scheduler.mjs");
`;
mkdirSync(root + "release/deploy", { recursive: true });
writeFileSync(root + "release/deploy/api-wrapper.ts", apiWrapper);
writeFileSync(root + "release/deploy/scheduler-wrapper.ts", schedWrapper);
writeFileSync(root + "release/deploy/daily7.ts", readFileSync(root + "release/daily7.ts", "utf8"));
writeFileSync(root + "release/deploy/MANIFEST.json", JSON.stringify({ release: RELEASE, apiSha256: A, schedulerSha256: S, apiWrapperBytes: apiWrapper.length, packedBase64: packed.length, daily7Sha256: sha(readFileSync(root + "release/daily7.ts", "utf8")), builtAt: new Date().toISOString(), rollback: { api: "acae37a3-d964-4e2c-a731-9bf12f5accfb", scheduler: "18e7cf39-8d74-4dcf-8188-1dc6c47da040", daily7: "790cb27f-089e-48c6-a293-e27e3c285905" } }, null, 2));
console.log(JSON.stringify({ apiWrapper: apiWrapper.length, packed: packed.length, A: A.slice(0, 12), S: S.slice(0, 12) }));
