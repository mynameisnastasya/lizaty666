# LIZ_TY666 — migration to Railway (phase 1; review only)

## Scope and safety

This branch prepares the **existing static storefront** for standalone Railway hosting. The separate Floot full-stack project is **not in this GitHub repository**. This branch does not change production, connect billing, run migrations, deploy anything, change DNS, or access real user records.

The repository is **public**. Do not add secrets, customer exports, tester birth data, private DB snapshots, payment credentials or copies of Floot production logs to it. A separate private source-control location is required for the backend and data migration.

## System map as observed on 14 Nov 2026

| Layer | Present location | Important boundary |
| --- | --- | --- |
| Static storefront | `mynameisnastasya/lizaty666` (GitHub Pages) | Deployable here with `Dockerfile` and `server.mjs` |
| React website, Mini App, orders, admin, authentication | Floot project `LIZ_TY666 — разборы, соляр и обучение` | Needs separate source export and deployable app build |
| Payment API | Railway Function `liz-ty666-payment-api` | Staging only, release gate should remain closed |
| Astro engine | Railway Function `migration-readiness-smoke` | Service includes private computation endpoints |
| Worker | Railway Function `liz-ty666-scheduler` | Do not conflate with Floot's own scheduler |
| DB | Railway PostgreSQL | No real migration or data modification authorized |
| Preview | Railway Function `liz-ty666-preview` | Proxies some pages to Floot; **not independent** |

Railway currently has only a staging environment in this project. This branch deliberately does not reference a production Railway environment.

## Findings that block public paid launch

| Priority | Finding and evidence | Correction and acceptance test |
| --- | --- | --- |
| P1 | Floot `helpers/forecastConfig.tsx:4-6` lists RUB 3,666 / 6,666 / 8,888. Railway payment Function lines 5-9 lists RUB 1,666 / 3,666 / 6,666. | Agree on authoritative prices; share a contract; require UI and API tests to agree before enabling checkout. |
| P1 | Floot `endpoints/payments/yookassa-webhook_POST.ts:18-20` routes refunds only through `helpers/yooKassaRefund.tsx`, which queries `siteOrderRequests`. Forecast RUB subscriptions use `forecastOrders`. | Add a **separate** authenticated refund path for forecast orders, refund ledger, idempotency and explicit subscription-access policy. |
| P1 | Floot `helpers/paymentTelegram.tsx:95-112` claims outbox entries into `sending` while retries select only `pending,error`. No stuck-claim recovery found. | Add lease/reconciliation + tests for ambiguous send, provider timeout and duplicate delivery. |
| P1 | Floot `static/__dev/scheduled-jobs.json` enables `forecastDispatch`; published Floot diagnostics showed no scheduled jobs deployed. | Move dispatch responsibility to exactly one Railway worker; verify 24-hour controlled delivery with masked test accounts. |
| P2 | Railway `liz-ty666-preview` proxies traffic to a Floot upstream. | Replace proxy with independent frontend; prohibit Floot URLs in runtime build. |
| P2 | Railway scheduler source performs `CREATE TABLE` and `ALTER TABLE` at runtime. | Replace runtime DDL with separately reviewed migration scripts. **Do not execute migrations without explicit authorization.** |

Note: Railway staging payment API has many 503 responses from deliberate negative QA checks. This is **not evidence that production is failing**. In Floot, 25 spec files and TypeScript typecheck passed as of inspection. Tests are not a guarantee that all E2E payment and authorization cases work.

## Changes made in this branch

- `server.mjs`: standalone read-only HTTP static host, environment `PORT`, safe file extensions, symlink traversal protection, 404s, restricted methods, and `/health`.
- `Dockerfile`: pinned Node major version, non-root user, syntax check.
- `.dockerignore`: excludes local credentials, docs, test artifacts and internal folders.
- `tests/server.test.mjs`: unit/integration tests for HTTP access, health, content types, and traversal.
- package scripts: `npm run build` and `npm run test:unit`; existing Playwright E2E stays in place.
- CI: standalone unit/build workflow for pull requests.

These steps do **not** move React app, auth, order data or checkout. They prepare the **first** deployable slice only.

## Safe migration plan after this PR

1. Create or designate a **private** GitHub repository for the full-stack source. Inventory code, integration endpoints, licensed assets, schema and secret references without publishing values.
2. Import the React pages and API to a Railway-targeted monorepo (web/api/workers/shared); remove Floot-only SDK bindings. Add build and smoke tests for every service.
3. Write migrations, export/import tools and read-only validation for masked test fixtures. Validate constraints, counts, authorization and referential integrity. Do not run against the live database.
4. Use a single versioned price/plan contract; add provider **sandbox/test mode** integration for checkout, cancellations, refunds, duplicate webhooks, lost responses and subscription renewal/extension.
5. Add Telegram webhook outbox leasing and reconciliation tests; separate permissioned API endpoints and document role matrix.
6. Run browsers at 360, 390, 430, 768, 1280 and 1440 pixels. Audit loading/errors, responsiveness, keyboard focus, accessibility and screen-reader labels.
7. Prepare Railway Infrastructure as Code `.railway/railway.ts` only after importing current service state; run `railway config plan` for review, **not** `railway config apply`.
8. Obtain separate explicit authorization for staging deploy, any real data migration, and production cutover. Cutover requires a recent backup, reconciliation report and tested rollback.

## Manual setup when deployment is separately approved

Use a new, unexposed staging web service with repository source on the reviewed commit, Dockerfile build, `/health` healthcheck, and no DB or billing credentials. Do not configure production DNS or enable auto-deploy before review. Railway recommends Infrastructure as Code over legacy `railway.json` / `railway.toml` for new services.

## Exit criteria

Static web service passes unit and browser tests, private full-stack source is identified, user-facing and payment flows have fixtures and evidence, Railway services are independent of Floot, all migrations are separately approved, and cutover/rollback checklist is signed off.
