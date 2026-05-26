# CC Session — Push Reliability Fix (OPEN-BUGS #50, URGENT, foundational)

Fresh focused session. This is the high-blast-radius persistence fix that unblocks everything — trustworthy Ledger Walks, live screenshot-walks, the whole Walk-and-Judge campaign. It's the only thing on the table this session. Run it through the full pipeline. This touches how the app SAVES DATA — the failure mode of getting it wrong is silent data loss, the exact thing we're fixing — so maximal rigor, Sentinel-gated, John approves the push.

## The bug (known root cause)

`PUSH.pushFullState` (Bundle 32a) doesn't reliably deliver. Confirmed live: KV was frozen at 17:17 for ~5 hours while John's phone localStorage advanced — ~10 transactions stranded on-device, never reaching the cloud. Root cause, two compounding failures:
1. **Keepalive 64KB cap** — the pagehide push uses `keepalive: true`, but browsers cap keepalive request bodies at 64KB. John's blob is ~139KB (was ~292KB before the apiKey redaction stripped `_prevState` etc). So every pagehide push silently drops — body too big, fetch never sent.
2. **Android backgrounding** — Samsung One UI aggressively suspends the backgrounded PWA before the 30s debounce timer fires, so the debounced regular-fetch push often never runs either.

Net: pushes only land when John keeps the app foregrounded long enough for the 30s debounce (regular fetch, no keepalive, no size cap). Normal use (background the app) = data drops.

## Known fix shape (verify, don't assume — Gather confirms current code first)

Belt-and-suspenders, addresses both failure modes:
- **(a) Drop keepalive on pagehide, use regular fetch** — removes the 64KB cap. Risk: browser may kill an in-flight fetch on tab close. Mitigate with (c).
- **(b) Shorter debounce (~5s instead of 30s)** — pushes fire sooner, far less likely to lose the race against Android suspension.
- **(c) Gzip the body** — 139KB compresses well under 64KB, so even a keepalive path would fit; also cuts bandwidth. Needs the worker to accept + decompress (~10-15 worker lines). Belt to (a)'s suspenders.
- Consider: a service-worker retry queue is the most robust long-term answer (failed pushes queue, retry on next online event) — but it depends on Bundle 33-cache's sw.js lifecycle, which isn't built. So NOT this session; note it as the future-hardening follow-on. This session = (a)+(b)+(c), which makes push reliable enough now without the cache dependency.

## SESSION STEP 0 — hygiene pass FIRST (the gate John set)

Before anything touches the persistence layer:
1. **Reconcile the working tree.** It's dirty with prior-session work (untracked ledger-walk-*.js, the 2026-05-22 retro, modified GUARDIAN.md / runtime-report.json, screenshots, slyght-worker/.wrangler/). Reconcile/commit/stash it so this build starts from clean context. A persistence change cannot start on a tree where committed-vs-floating is ambiguous.
2. **Prove repo matches memory.** Session memory cites 2026-05-23 commits but some referenced artifacts show untracked — confirm the repo actually contains what the docs claim shipped. Resolve the drift before building.
3. Confirm the `walk-and-judge-foundation` branch (d788d08, 5aeac5e) is intact and decide base branch for this fix.

## SESSION STEP 0b — Ledger Walk (the chicken-and-egg)

A fresh-state walk is blocked by THIS bug (KV lags the phone) + the CF 401. So: walk the frozen oracle (`live-2026-05-23.json`) for Gather context only, explicitly flagged illustrative. The whole point of this fix is that AFTER it ships, fresh-state walks become trustworthy. The acid test (below) is the real verification, not Step 0.

## Pipeline run

**Gather** — tight, on the actual push code. Read `PUSH.pushFullState` and everything it touches: the pagehide handler, the debounce timer, the keepalive flag, the worker's `/push-full-state` endpoint, the body construction, the size. Confirm the 64KB-cap + backgrounding diagnosis against the real current code (don't assume — the blob size, the debounce value, the keepalive usage all need confirming at HEAD). Enumerate every caller of the push path. Parallelize if it spans multiple regions (client push + worker receive + any sw involvement).

**Conformance** — does the fix fit? The push path is a canonical writer-adjacent surface. Check: does gzip change the worker's contract (it must decompress)? Does the shorter debounce affect any other timer-coupled logic? Does dropping keepalive on pagehide lose the one case keepalive was protecting (the genuine tab-close)? The (a)+(c) combination is specifically designed so (c) covers (a)'s gap — verify that holds. Any NEW drift blocks; flag adjacent existing drift.

**Build** — Sentinel-gated per commit. Likely 2-3 commits: client push changes (drop keepalive + shorter debounce + gzip the body), worker changes (accept + decompress gzip), and the smoke specs. Conservation + full smoke + Guardian green at each. The push path doesn't touch money math directly, but it touches whether money math PERSISTS — so the Human Verdict's reversibility axis is central here: this is the rare fix where "does it persist correctly" IS the impact.

**Council + Human Verdict** — per pipeline. Human Verdict will likely flag this as significant on the reversibility axis (it changes the data-persistence path) even though it's PASS on the magnitude axis (no hero number changes). John approves the push. This is NOT a bundle-ack candidate — it's individual, high-stakes, John reads it.

## THE ACID TEST (the clean "done" — this is what proves it works)

After the fix ships, on John's actual phone (S23 Ultra, Android Chrome PWA):
1. Make a change that grows the blob over 64KB (it's already ~139KB, so any state works).
2. **Background the app** (the failure condition — switch away, let Android suspend it).
3. Pull KV.
4. **If KV reflects the backgrounded state → push works.** If KV is stale → it doesn't, diagnose further.

This is the real verification. Step 0's walk is illustrative; the acid test against the actual failure condition (backgrounding a large blob) is the proof. John runs the wrangler pull himself (CF auth lives in his shell, not CC's) and confirms KV matches the phone.

## Smoke specs to add

- Push body construction: assert it gzips, assert compressed size < 64KB for a representative ~139KB blob.
- Worker decompress: assert the worker correctly inflates a gzipped body and stores the same state a plaintext body would have.
- Debounce timing: assert the shorter debounce value.
- pagehide path: assert it uses the non-keepalive fetch (or the keepalive path only when body < 64KB, if the design keeps keepalive as a fallback).
- Round-trip: push a state, pull it, assert byte-equivalence post-decompress.

## What this unblocks (why it's foundational, for the session memory)

Once push delivers reliably: (1) fresh-state Ledger Walks become trustworthy (KV stops lagging the phone), (2) the Walk-and-Judge live screenshot-walks can verify against persisted state, (3) Bundle 23 single-device sync becomes buildable (sync assumed push works — now it will). This is the keystone. Everything sequenced behind it has been waiting on this.

## Standing rules in force

- Maximal parallelism on investigation (John's directive — Tier 2, budget, spin the fleet even for simple tasks; parallelize work, not approval).
- Conservation + smoke + Guardian + §8 green every commit. Conformance before Build. Council + Human Verdict gate the push. John approves — no autonomous push.
- Document during: session memory live, ADR if the fix establishes a persistence-path contract, OPEN-BUGS #50 → resolved on ship, JOHN-KNOWLEDGE append if John learns the mechanics (keepalive caps, gzip, debounce — likely teaching moments; break them down plain-English, anchor to what he knows).
- Teaching: John wants to UNDERSTAND this one, not just approve it. When explaining the fix, break it down — what keepalive is (the browser trying to finish a request even as the page closes, but capped at 64KB so big bodies get dropped), what gzip does (squashes the data small enough to fit), why the debounce matters (how long it waits before saving). Anchor to what he knows. This is a genuine learning opportunity on real cloud-services mechanics — the exact gap he wants to close.

Start: Step 0 hygiene pass → Step 0b frozen-oracle walk → Gather on the push code → surface the confirmed diagnosis + fix plan for John before building.
