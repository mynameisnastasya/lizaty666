# Actual Railway staging website — 14 November 2026

This is **not** production and it is **not** the finished Floot full-stack migration.

## Working staging URL

https://lizty666-stage.up.railway.app

The existing Railway Function service `liz-ty666-preview` was changed in the **staging** environment to remove its Floot upstream proxy for public static pages.

Due to Railway plan resource limits and missing Railway↔GitHub account integration, we could not create/connect a new GitHub-backed service. The interim Railway Function is under the 96 KB function limit. It proxies a strictly allowlisted set of static public files from a **commit-pinned** URL:
`raw.githubusercontent.com/mynameisnastasya/lizaty666/36101f9f147c458d62f003a3ec837a9d6/`.

The function caches each downloaded asset in process memory for up to one hour. This means the website no longer requires Floot to serve its public pages, **but it still requires GitHub Raw availability**. It is not a self-contained static image or a replacement for the full academy app. Full deploy should use the Dockerfile in this branch once Railway GitHub connection is configured.

Only allowlisted routes are served. `/health` explicitly reports `fullStackMigrated:false`, `databaseMigrated:false`, `paymentsEnabled:false`. `/login`, `/register` and API paths return 503 rather than pretending a checkout or auth flow works. `robots.txt` and X-Robots-Tag disable staging search indexing.

The existing standalone ASTRODAY checkout and mini **preview pages** remain, using the same existing staging API URL. They are demonstrations, not permission to run live payments.

## Verification

Read-only HTTP checks from a separate compute VM confirmed 21/21 page and asset URLs returned HTTP 200 with expected MIME types, including the 1.9 MB PNG. Node integration tests also run against the public staging URL in CI. The existing Playwright suite checks static pages with seven screen sizes (360–1440 px).

## Blocking requirements for full migration

1. In Floot, project menu → Get Code → Download ZIP. Its full-stack Node/Vite export includes `server.ts`; the Floot app connector has **no ZIP-export action**. Keep full-stack source in a private repository.
2. In Railway Account Settings, connect the user's GitHub account; then authorize the app for the selected repository and use a reviewed commit source.
3. Review Railway service-plan resource limits (a sixth service creation attempt was rejected), reuse existing staging services or upgrade the plan if needed.
4. Export/migrate the database only after approval of a verified backup, schema rehearsal, user migration test and cutover/rollback sequence. Never commit or share raw user database dumps in this public repository.
5. Confirm published product price mapping, Telegram bot credentials and one worker, forecast refund processing, webhook idempotency and production payment readiness before enabling sales.
6. Preserve production and Floot data unchanged until the user approves final switchover.

## Operational caution

Do not replace the live Railway Function with 300 KB of inline HTML; Railway Functions have a documented 96 KB source limit. The next stable step is a GitHub-backed Docker service from the reviewed source; do not treat the current Function arrangement as production-ready.
