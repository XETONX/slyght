# ADR — Bundle 33-cache: reliable fresh-code delivery + offline shell

**Date:** 2026-05-26 · **Status:** Accepted (pending John's on-device done-test + `wrangler`/Pages deploy)
**Resolves:** OPEN-BUGS #51 · **Commit:** `5708da0` · **Sibling:** #50 (push reliability)

## Context
Deployed `index.html` wasn't reaching John's installed PWA without a manual delete+reinstall (lived twice this session). Gather (2026-05-26) reframed the bug: the OLD `sw.js` **cached nothing** (zero `cache.put/add/addAll`; network-passthrough fetch). So it could not be serving stale code from a cache it didn't have — the staleness lived in the layers UNDER the SW: Chrome's HTTP cache + GitHub Pages default headers + Android resuming the backgrounded PWA's in-memory page. The brief's assumed fix ("add a cache + CACHE_VERSION") targeted the wrong cause. Three real causes: (1) HTTP/bfcache staleness of index.html; (2) an `unregister()`-every-load workaround (commit 8496d12, no protective rationale) that tore down the controller each load + kept the update banner from firing; (3) the banner keyed on SW-version (rarely changes) not index.html. Offline was also silently broken (nothing precached).

## Decision
Fix update **delivery**, not "add a cache":
1. **Network-first with `cache:'reload'`** for navigation + shell → an online open ALWAYS fetches the freshest index.html, bypassing the stale HTTP/bfcache layer. This is the core fix.
2. **Precache the app shell** (`index.html`, `manifest.json`, icons) keyed to `CACHE_VERSION` — the OFFLINE fallback only (the old SW had none). `activate` prunes non-current caches. **`sw.js` is NOT precached** (must stay self-updatable).
3. **`skipWaiting()` + `clients.claim()`** — new SW activates fast (kills the "old SW keeps serving" lag). A `SKIP_WAITING` message handler is the belt.
4. **Registration:** `register('/slyght/sw.js', {updateViaCache:'none'})` (forces the browser to revalidate sw.js itself) + `reg.update()` on load + visibility → so update checks actually happen.
5. **User-controlled reload:** `updatefound`/`controllerchange` (guarded to genuine updates) → show the "New version — Reload" banner. **No forced auto-reload** — John controls WHEN (per the brief).
6. **Removed** the unregister-every-load workaround — git blame showed it was generic scar tissue for this exact staleness, not a guard for anything else; the proper update handling replaces it.
7. **Permanent `#build-stamp`** (e.g. `b33 · 2026-05-26`) — a glanceable "am I on fresh code" diagnostic.
8. Fixed push-notification icon paths (`/icon-192.png` → `/slyght/icon-192.png`).

**DEPLOY RITUAL (contract):** bump `CACHE_VERSION` (sw.js) AND `#build-stamp` (index.html) together on every deploy. The build-stamp is the visible freshness signal; CACHE_VERSION drives the offline-cache prune.

## Why network-first beats cache-first here
A cache-first design pins you to the cached copy until `CACHE_VERSION` bumps — so a *forgotten* bump = permanently-stale code (the worst sticky risk, and the failure mode is the opposite of the goal). Network-first means online always hits the network, so a forgotten bump can never pin stale code; the cache is purely the offline floor.

## Sticky risks + mitigations
- **Precache pinning stale-forever** → network-first (online always fresh); cache is offline-only.
- **skipWaiting+claim version-skew under an open tab** → not force-reloaded; the banner lets John reload WHEN ready (network-first means the old page still works meanwhile).
- **Caching sw.js → un-updatable SW** → sw.js deliberately excluded from SHELL; `updateViaCache:'none'` revalidates it.
- **GH Pages headers (can't set on a static host)** → influenced indirectly via `updateViaCache:'none'` + `cache:'reload'`.
- **Interaction with #50** → a stale index.html could have gated #50's push fix reaching the device; network-first now guarantees the freshest index.html online, so this bug sat UPSTREAM of #50 and is now closed.

## Verification
Full smoke 212/212 (incl. 7 new `sw-cache-structure` assertions — SW runtime is env-dependent and the smoke harness blocks SWs, so these assert the fix PIECES). Guardian: 4 `guardian-static` FAILs are pre-existing (RC11/RC2), zero new. **The real proof is John's on-device done-test:** deploy a `#build-stamp` change → open the installed PWA WITHOUT reinstall → marker updates (#51 dead); + airplane-mode → PWA still loads from precache (offline, a new capability).

## Consequence / follow-on
This SW lifecycle is the substrate the **service-worker retry queue** needs — the real fix for #50's one remaining edge (a true OS hard-close without `visibilitychange:hidden`). That retry queue is the natural next hardening now that precache + a proper SW lifecycle exist.
