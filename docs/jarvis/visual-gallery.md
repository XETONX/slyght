# slyght — Visual Gallery

A snapshot gallery of slyght's main surfaces, captured for the record and future Jarvis use.

- **Captured:** 2026-05-26 (frozen clock `2026-05-26T10:00:00+10:00`)
- **Fixture:** `state-snapshot.fake.json` (FAKE / synthetic — `pushOnSaveEnabled:false`; never John's real state)
- **Viewport:** 412 × 915, deviceScaleFactor 2, serviceWorkers blocked, locale en-AU, tz Australia/Sydney
- **Boot recipe:** reused verbatim from `scripts/walker/run-walk.js` (loadFixture → buildSlyghtV5 → serve.js → seed localStorage + slyght_seeded_* flags + onboarded/ai_consent/payday_canvas_seen → frozen clock → splashTap → wait for S + BRAIN + renderAll)
- **Page errors during capture:** 0
- **Surfaces captured:** 8 / 8

> App version shown in captures: SLYGHT v0.247 (footer build tag `b33 · 2026-05-26`).

## Surfaces

| Surface | Capture | What the screen shows |
|---|---|---|
| Dashboard | [gallery/dashboard.png](../../mission-control/gallery/dashboard.png) | Home hero: SAFE TO SPEND $1,017.59, 20 days to payday, $60/day cap card, MAX PER DAY tile, 7-day burn, IMMEDIATE DEBTS $775 total (Sam / Jordan tiles), bottom nav. Reached via `goPage('pg-dash')`. |
| Bills / Calendar | [gallery/bills.png](../../mission-control/gallery/bills.png) | May 2026 month calendar with bill/payday/bill+debt day markers, THIS WEEK PROJECTION ($1,388 week total, "$60 under pace — good week"), Add A Bill + BNPL buttons. Reached via `goPage('pg-cal')`. |
| Analysis | [gallery/analysis.png](../../mission-control/gallery/analysis.png) | WHERE YOUR MONEY WENT spend view (Today/7/30/All filters), Total outflows $60, "You can make it to payday" breakdown to payday (unpaid bills, upcoming, min living costs → +$697.04 remaining). Reached via `goPage('pg-spend')`. |
| AI Chat | [gallery/chat.png](../../mission-control/gallery/chat.png) | SLYGHT AI surface showing the **API-key activation gate** ("Enter your Anthropic API key to activate") + "Ask SLYGHT anything…" composer. The fake fixture has no API key seeded, so this is the pre-activation state, not an active conversation. Reached via `goPage('pg-chat')`. |
| Settings | [gallery/settings.png](../../mission-control/gallery/settings.png) | Settings IA list: Financial Data, Strategies, Notifications, AI Assistant, Data & Backup, Diagnostics, About (v0.247), Reset All Data. Reached via `goPage('pg-settings')`. |
| Payday Plan | [gallery/plan.png](../../mission-control/gallery/plan.png) | Payday Plan canvas: cycle 15 May → 15 June, MONEY COMING IN $5,000, stacked allocation bar (Bills/Debts/Savings/Upcoming/Living), "Overcommitted by $87" warning, ESSENTIALS tiles (Bills $3,182 · Debts $775 · Living $930 · Provisions $298), WHERE THE $5,000 SITS NOW. Opened via `openPaydayPlan()`. |
| Savings | [gallery/savings.png](../../mission-control/gallery/savings.png) | Savings plan sub-screen: POOL TO ALLOCATE ($113 surplus − $298 provisions − $300 buffer = $0), YOUR SAVINGS GOALS (Darwin Trip $800/$4,000, China Holiday $1,500/$6,000, Rainy Day Fund $1,200/$3,000), EXTRA DEBT PAYMENT (KIA extra), Goal/Trip/Bucket add chips. Opened via `openPaydayPlan()` → `openPaydayCategory('payday-savings')`. |
| Debts | [gallery/debts.png](../../mission-control/gallery/debts.png) | Debts sub-screen: $775 · 0 of 3, MINIMUM PAYMENTS (Borrowed from Sam $400, Borrowed from Jordan $250, Afterpay — Concert Tickets $125 due 31 May), EXTRA PAYMENTS note + "Go to Savings →". Opened via `openPaydayCategory('payday-debts')` (after closing the savings sub-screen). |

## Notes / honesty

- **All 8 target surfaces captured successfully** with zero page errors.
- **Savings & Debts are sub-screens of the Payday Plan**, not top-level nav pages. There are only five `goPage` pages in the app (`pg-dash`, `pg-cal`, `pg-spend`, `pg-chat`, `pg-settings`); savings/debts/plan live inside `pg-payday-plan` and open via `openPaydayPlan()` / `openPaydayCategory(...)`.
- The savings sub-screen stays `payday-active` once opened and overlays whatever is opened next; the debts capture explicitly closes `payday-savings` first (`closePaydayCategory`) before opening `payday-debts`.
- **AI Chat** shows the activation gate rather than a live chat thread, because the FAKE fixture intentionally carries no Anthropic API key. This is the honest pre-activation state of that surface.
- All figures are **synthetic FAKE-fixture values**, not John's real finances.
