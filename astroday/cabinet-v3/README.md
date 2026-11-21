# ASTRODAY 3.1 — premium Mini App design and BaZi

This directory contains the **source-controlled, isolated front-end design** of ASTRODAY 3.0. It is based on the five existing app areas and is intentionally **not a production release**.

## Public interactive demo (21 November 2026)

- **Live:** https://astroday-liza-v3.floot.app — published isolated Floot project, demo only.
- **Floot fork:** `abb86812-63e3-467d-b1af-11e2d754037e` — isolated database schema, no production records or provider secrets.
- **Source:** `src/astroday-design.tsx`, `components/JieCaiExperience.tsx`, `helpers/astrodayBazi.tsx` and CSS modules.
- **Tests:** `tests/astroday-design.spec.tsx`, `tests/bazi-calendar.spec.ts`, `tests/wealth-ui.spec.tsx`.
- **Do not treat published demo as Railway's live Mini App.** No real Telegram authorization, personalized subscription access, live planetary positions, payments or push notifications are enabled in this demo.

### BaZi: Дни Грабителя богатства (劫财)

A second view of the existing five-tab calendar renders the deterministic day-stem calculation from `astroday/v2/bazi.mjs`: same element and opposite yin/yang to Day Master (劫财), visible stem as the main signal, branch's principal hidden stem as a softer signal. Civil Gregorian day boundary is midnight; birth at 23:xx is marked as ambiguous. The UI explains its assumptions, displays a named reason for each date, and avoids promising financial losses. The source is a symbolic astrology convention, **not** a forecast of financial outcomes.

### Design decisions from 2026 research

Editorial serif headings, restrained material depth, calm dark theme, soft celestial ornamentation, high-contrast controls, lightweight motion with `prefers-reduced-motion`, responsive month/calendar cards, mobile thumb targets and respect for Telegram's `contentSafeAreaInset`. Avoid excessive blur and decorative animation that reduces readability or FPS.

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

Designed on 21 November 2026 in an **isolated Floot fork**, with its own empty database, no production credentials, and no scheduled jobs. TypeScript and the three tested spec files passed in Floot on 21 November 2026; the standalone GitHub Vite build has not been independently executed in this turn. Sources were copied here so the design can be reviewed and integrated, rather than being trapped in a temporary preview. Publishing/merging this branch by itself does **not** replace the Railway production frontend.
