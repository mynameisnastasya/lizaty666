# ASTRODAY 3.0 — premium Mini App design prototype

This directory contains the **source-controlled, isolated front-end design** of ASTRODAY 3.0. It is based on the five existing app areas and is intentionally **not a production release**.

## Run it locally

```bash
npm install
npm run dev
npm run build
npm test
```

The view supports mobile and desktop layouts, accessible five-tab navigation, daily forecast expansion and copy, an interactive calendar, clickable planet filters, time-zone-aware delivery settings as a local preview, and an access/subscription design with payment disabled. The data, planetary positions, copy and access status on this prototype are illustrative and must not be mistaken for authenticated customer information.

## Safely integrate into ASTRODAY on Railway

**Current canonical live frontend:** `lizty666-stage.up.railway.app/app`.
**Current canonical bot webhook:** `lizty666-api-stage.up.railway.app/v1/telegram/webhook`.
The existing Railway `staging` environment serves real people; it is **not an isolated test environment**. Do not overwrite that service with this preview.

Build a separate test deployment with its own database and test payments; retain the existing Telegram identity and subscriptions. Wire the interface through a typed same-origin adapter and server-verified Telegram initData/session cookies:

| UI area | Existing API path from cabinet's E2E fixture |
| --- | --- |
| Profile and access | `/_api/forecast/me` |
| Today's forecast | `/_api/forecast/today` |
| Calendar / day view | `/_api/forecast/calendar` |
| Natal chart | `/_api/forecast/chart` |
| Notification time, consent and timezone | `/_api/forecast/settings` |
| Public plan catalogue and readiness | `/_api/payments/plans`, `/_api/payments/readiness` |

The production integration **must not** turn current demo local state into server truth. Store subscription, natal data, access, time-zone configuration and delivery status in the existing backend; handle invalid/expired login, retries, loading and empty states. Keep historic birth timezone separate from current delivery timezone. Do not use the demo horoscope, sample natal wheel or fake monthly events for customers. For Telegram digital goods, review the current Stars/XTR billing requirements before enabling purchase controls; keep real checkout disabled until the verified flow has test coverage.

## Release quality gates

1. `npm run build` and `npm test` pass.
2. Browser checks at 320, 393, 768 and 1280 px: no horizontal scroll; bottom menu visible above the safe area.
3. Screen reader and keyboard checks: names, focus, selected section, disabled days, interactive controls.
4. Auth checks: invalid/expired Telegram initData rejected by server, no unauthorized profile access, session recovery.
5. Forecast checks: real astrological facts from the engine, one day = one keyed text, no fabricated biography, stale profile changes invalidate unsent content.
6. Delivery checks: correct timezone and minutes, opt-in respected, no duplicate daily messages, retry and monitoring.
7. Payment checks: amount + currency validated server-side, idempotency, refunds, grace periods, no access from return URL alone.
8. Database backups and restore drill, observability, rate limits, privacy review and a rollback path.
9. Isolated canary release, then measured rollout. Never point Telegram webhook at Floot.

### Provenance

Designed on 21 November 2026 in an **isolated Floot fork**, with its own empty database, no production credentials, and no scheduled jobs. TypeScript and three UI regression tests passed there. Sources were copied here so the design can be reviewed and integrated, rather than being trapped in a temporary preview. Publishing/merging this branch by itself does **not** replace the Railway production frontend.
