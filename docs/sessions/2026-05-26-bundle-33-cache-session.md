# CC session — 2026-05-26 (Bundle 33-cache, OPEN-BUGS #51)

> Running session memory. Second keystone: #50 made data persist; this makes code deliver. Brief: `docs/briefs/CC-BUNDLE-33-CACHE-SESSION.md`. Branch `bundle-33-cache` off main.

## Step 0 — FIRST trustworthy fresh Ledger Walk (push #50 shipped → KV is current)
John ran the wrangler pull in his shell (the earlier 401 was wrong-folder, not permissions — pull works from `slyght-worker/`). Findings:
1. **#50 delete-persistence CLOSED** — audit log ends `txn_record $1 Test` → `txn_remove` of same; both pushed through backgrounding. #50 dead BOTH directions, fully confirmed.
2. **China Holiday over-claim = NOT A BUG.** `bucket.saved $206.63` is real — every increment has a matching `bucket_saved_change` event, climbing legitimately via round-ups (196.62→…→206.63). The earlier "$206 vs $42 ledger" was **the walk-script (`ledger-walk-buckets.js`) under-counting `addToBucket` credits** — exactly the limitation flagged as a candidate last session. CANDIDATE CLOSED (tooling artifact, not INV-12). **TODO (tooling):** `ledger-walk-buckets.js` under-counts round-up/addToBucket credits → produces false OVER-CLAIM; fix the walk script before trusting its bucket verdicts again.
3. **Darwin finding CONFIRMED LIVE.** John's Darwin Trip bucket = `saved:800`, credited via the Plan-tick path (the buried-correct path). Quick Log → Savings → Darwin STILL has no picker and would have left the bucket at 0. John navigated around the bug without knowing — exactly the behavior-truth gap. The Walk-and-Judge #1 finding STANDS, now confirmed against real fresh state.
4. **FLAG (Step-0 re-baseline):** live `_invariantViolationCounts['paidbills-key-not-future'] = 1` — a paidBills key dated in the future. Not urgent. Needs the fresh dump to walk (backed-by-txn/scheduled-auto-debit = legitimate, per the P0-5 rule; orphan = suspect). **Open — investigate when the fresh dump is saved to a file CC can read.**

## Gather — the reframe (3 drones, sw.js + registration + manifest)
The OLD `sw.js` **caches NOTHING** (zero `cache.put/add/addAll`; `slyght-v6` cache name never created; network-passthrough fetch). So it can't serve stale code from a cache it doesn't have. Real causes: (1) HTTP/bfcache staleness of index.html (the SW is a transparent passthrough); (2) `index.html:16034-16035` **unregistered every SW on every load** then re-registered (origin: commit `8496d12` "Update index.html" — generic message, NO protective comment → scar tissue for this exact staleness); (3) the update banner keyed on SW-version (rarely changes) not index.html, gated on a controller the unregister-hammer kept tearing down. Offline was also silently broken (nothing precached). **"Add a cache" was the wrong fix — the right one is update DELIVERY.**

## BUILD (commit 5708da0)
- **sw.js rewrite:** network-first `cache:'reload'` for navigation+shell (online always freshest index.html — the core fix); precache shell for OFFLINE; `CACHE_VERSION` prune on activate; skipWaiting + clients.claim; SKIP_WAITING message handler; sw.js itself NOT precached; fixed push icon paths (/icon-192 → /slyght/icon-192).
- **registration rewrite:** `register(updateViaCache:'none')` + `reg.update()` on load+visibility + updatefound/controllerchange → "New version, Reload" banner (John controls WHEN, no forced reload); REMOVED the unregister-every-load workaround (origin confirmed scar tissue).
- **permanent `#build-stamp`** marker (`b33 · 2026-05-26`, tiny bottom-left, muted) — glance to confirm fresh code. *Placement is John's to tweak (premium-feel).* 
- ADR: `docs/adr/ADR-bundle-33-cache.md`. DEPLOY RITUAL: bump CACHE_VERSION (sw.js) + build-stamp (index.html) together.

**Sentinel:** full smoke **212/212** (7 new sw-cache-structure assertions). Guardian: 4 guardian-static FAILs (RC11 isPaidInCycle, RC2 getBurn7d) PRE-EXISTING — zero new. Human Verdict: magnitude PASS; reversibility CENTRAL (load/update path, sticky if wrong). Individual push approval.

## ACTIONS FOR JOHN (deploy + on-device done-test — yours)
1. Push/merge the branch → GitHub Pages serves the new sw.js + index.html. (This deploy itself may need ONE last reinstall to escape the current stale SW — the LAST one; after this, updates self-deliver.)
2. **Done-test:** confirm the `#build-stamp` shows; next deploy I bump it → you open the installed PWA WITHOUT reinstall → marker updates within the window (banner → tap Reload). #51 dead.
3. **Airplane test:** airplane-mode → open the PWA → it loads from precache (offline — a NEW capability; old SW couldn't).

## Open / follow-on
- `paidbills-key-not-future` count:1 — walk it when the fresh dump is on disk.
- `ledger-walk-buckets.js` under-counts addToBucket credits — fix the walk script.
- **SW retry queue** for #50's last hard-close edge — now buildable on this SW lifecycle (natural next hardening).
- Branch note: GUARDIAN.md/allow-list.json churn from the guardian run reverted (not committed).
