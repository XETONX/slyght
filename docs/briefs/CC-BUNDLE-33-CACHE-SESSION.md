# CC Session — Bundle 33-cache (OPEN-BUGS #51): reliable fresh-code delivery

Fresh focused session. This is the second keystone. Push reliability (#50, done) made data PERSIST; this makes code DELIVER. Together they're the reliable foundation the Walk-and-Judge live walks + Bundle 23 sync build on. High-blast-radius substrate — it changes how the app loads and updates itself, and the failure mode of getting it wrong is the OPPOSITE of the goal (serving permanently-stale code, or breaking the PWA's ability to update at all). So: full pipeline, Sentinel-gated, John approves the push, careful Gather on the real sw.js before any change.

## The bug (#51)

The service worker (`sw.js`) doesn't precache anything and has no `CACHE_VERSION` discipline. Updates to `index.html` deployed to GitHub Pages may not reach John's installed PWA until the SW happens to refresh — Chrome's update-on-navigation is browser-dependent and can lag hours/days. Drone H (Bundle 23 scoping) found ZERO `cache.put` calls in the entire codebase — the SW is effectively inert on caching.

Lived proof this session: to get the push fix onto his phone, John had to uninstall + reinstall the PWA (twice — once before the origin push when the reinstall pulled old code, once after). That manual reinstall ritual is the workaround for #51. The goal of this bundle: deploy a visible change → it reaches the phone WITHOUT a reinstall.

## What this unblocks

- Kills the reinstall dance (fresh code delivers reliably).
- Unblocks the service-worker RETRY QUEUE — the real fix for push reliability's one known edge (a true OS hard-close without visibilitychange:hidden can lose ≤5s, falling back to cached gzip). The retry queue needs the SW lifecycle this bundle builds. So #50's last edge closes via this.
- Last prerequisite for the Walk-and-Judge LIVE screenshot-walks (the device must run fresh code for walks to be real).
- Bundle 23 single-device sync builds on reliable code delivery.

## SESSION STEP 0

- Working tree should be clean (push session left it clean; the 2 doc commits are on origin). Confirm. Reconcile anything floating before touching sw.js.
- Ledger Walk: NOW POSSIBLE FOR REAL — push reliability shipped, so a fresh-state KV pull is trustworthy for the first time. BUT the CF 401 from CC's sandbox still blocks CC pulling directly (CDB-08) — so John runs the wrangler pull in his shell (`!` prefix) and pastes the fresh state, OR the walk runs on the freshest available dump flagged accordingly. Note: this is the first session where "fresh state is trustworthy" is true — worth a real walk to re-baseline the BACKED/ORPHAN/AMBIGUOUS verdicts against current truth (the China Holiday over-claim candidate from last session can finally be checked against real fresh data).

## The fix shape (Gather confirms against real sw.js first — do NOT assume)

The standard, safe PWA cache pattern — but Gather must read the ACTUAL current sw.js and confirm what's there before designing:
- **CACHE_VERSION constant** — bump it on each deploy; the SW activate event deletes all caches not matching the current version (clean slate on update, no stale leftovers).
- **Precache the app shell** on install (`index.html`, manifest, icons) via `cache.put` / `cache.addAll`.
- **Network-first (or stale-while-revalidate) for index.html** — so the newest code is fetched when online, with cache as offline fallback. The memory pin notes the prior learning: `manifest.json start_url` must be `/slyght/index.html`; sw.js should be network-first with full cache deletion on activate. CONFIRM that against the current sw.js — it may already be partially there or may have regressed.
- **skipWaiting + clients.claim** — so a new SW takes control immediately rather than waiting for all tabs to close (this is a big part of why fresh code lags — the old SW keeps serving until every tab is gone).
- Consider an in-app "update available — reload" prompt (the SW detects a new version, tells the page) so John gets fresh code on next interaction without a manual reinstall, with control over WHEN.

## The hard risk — and the discipline around it

A cache bug can serve PERMANENTLY stale code or brick the PWA's update path. So:
- **Test the update path explicitly**, not just "does it load." The done-test: deploy a VISIBLE marker change (e.g. a version string in a corner) → open the PWA on the S23 (already installed, NO reinstall) → confirm the marker updates within the expected window (immediately with skipWaiting + network-first, or on the next open). If it updates without a reinstall, #51 is dead.
- **Offline fallback must still work** — after the cache change, airplane-mode the phone, open the PWA, confirm it still loads from cache (don't trade stale-code-bug for can't-load-offline-bug).
- **Don't break the manifest/install** — confirm the PWA still installs cleanly and start_url resolves.
- Worker is not involved here (this is client SW + GitHub Pages); no deploy-order concern like #50 had. But the SW update itself has lifecycle timing — sequence the commits so a half-shipped SW can't strand the app.

## Pipeline run

**Gather** (parallel, maximal — John's standing rule) — read the real sw.js, the manifest, the registration code in index.html, the GitHub Pages serving behavior. Confirm: what does the SW cache today (Drone H said nothing — verify at HEAD)? How is it registered? What's the current update behavior? Is start_url correct? Enumerate every asset the shell needs.

**Conformance** — does the cache strategy fit the PWA's structure? Does network-first collide with any offline assumption? Does skipWaiting risk any in-flight state (a tab mid-write when the SW swaps)? Does the CACHE_VERSION discipline have a single source of truth?

**Build** — Sentinel-gated. Likely: sw.js rewrite (precache + version + network-first + skipWaiting/claim), manifest confirm/fix, registration + update-prompt in index.html, smoke specs for the cache logic. Conservation/smoke/Guardian green each commit.

**Council + Human Verdict** — magnitude PASS (no hero numbers move); reversibility CENTRAL (this is the load/update path — a bad cache state is sticky and user-visible). Individual approval. John runs the deploy + the update-path test on-device.

## Standing rules in force

- Maximal parallelism (Tier 2, budget — spin the fleet even for simple Gather tasks).
- Conservation + smoke + Guardian + §8 every commit. Conformance before Build. Council + Human Verdict gate the push. John approves — no autonomous push, no autonomous deploy.
- CF-auth + git-push + deploy actions are John's (`!` prefix his shell).
- Document during: session memory live, ADR for the cache strategy (it's a persistence-path-adjacent contract), OPEN-BUGS #51 → resolved on verified-on-device.
- **Teach John the mechanics** (he wants to understand, per JOHN-KNOWLEDGE + the teaching memory): what a service worker actually IS (a script that sits between the app and the network, intercepting requests — like a proxy the browser runs), what precaching does, why network-first-vs-cache-first matters, why skipWaiting fixes the "old SW keeps serving" lag, what CACHE_VERSION buys. Anchor to what he knows. Plain-English before jargon. This is more real cloud/web-platform mechanics on the exact frontier he's closing — and it directly explains the reinstall-ritual he just lived, so it'll land concretely.

Start: Step 0 (confirm clean tree + attempt the now-trustworthy fresh Ledger Walk) → Gather on the real sw.js → surface the confirmed diagnosis + fix plan before building. Scope and confirm with John before any sw.js change ships — cache bugs are sticky, so this one earns an extra beat of "confirm the plan" before building.
