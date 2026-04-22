# SLYGHT Cloudflare Notifications — Mission Brief

**Queen type:** strategic | **Max agents:** 3 | **Timeout:** 3600s

## Objective

Build a Cloudflare Worker backend that sends smart push notifications
to SLYGHT based on John's schedule and real financial state.
SLYGHT syncs balance to the Worker when app opens.
Worker sends scheduled push notifications using Web Push API.

## User Schedule

- **Office days:** Monday, Thursday, Friday
- **Girlfriend days:** Thursday through Monday morning (higher spend tolerance)
- **9:00am AEST** — Morning alert
- **10:00am AEST** — Breakfast/coffee check
- **12:30pm AEST** — Lunch check
- **2:00pm AEST** — Afternoon snack nudge
- **6:30pm AEST** — Home time / grocery reminder
- **Sunday 3pm + 8pm** — Grocery reminder until dismissed
- **Timezone:** Australia/Sydney (AEDT UTC+11 or AEST UTC+10)

## Agents

### Agent 1 — Cloudflare Worker Backend
- `slyght-worker/src/index.js` — Full worker with VAPID Web Push + KV storage
- `slyght-worker/wrangler.toml` — Wrangler config with cron triggers

### Agent 2 — SLYGHT App Integration
- `PUSH` object added to `index.html`
- Smart state sync on every transaction and app open
- Subscribe/unsubscribe UI in Settings tab

### Agent 3 — Service Worker Update
- `sw.js` push event handler
- Notification click actions (no-spend, log, grocery-done)
- URL action param handling on app load

## Deployment Steps (Post-Agent)

See MISSION.md bottom section — "John's Cloudflare Setup Guide"
