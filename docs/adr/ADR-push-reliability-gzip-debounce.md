# ADR — Push reliability: gzip transport + 5s debounce + lifecycle flush

**Date:** 2026-05-26 · **Status:** Accepted (pending John's on-device acid test + `wrangler deploy`)
**Resolves:** OPEN-BUGS #50 · **Commits:** `765d633` (worker), `3d0215f` (client)

## Context
`PUSH.pushFullState` (Bundle 32a) silently dropped John's state. Confirmed live 2026-05-23: KV frozen ~5h while the phone advanced ~10 txns. Two compounding failures (Gather-confirmed at HEAD): (1) the pagehide flush used `fetch(keepalive:true)` whose body is capped at 64KB by browser policy, but the blob is ~136KB; (2) Android suspends the backgrounded PWA before the 30s debounce fires, so the only near-exit push was the keepalive one — which dropped. A third, deeper failure: both push callers `.catch(()=>{})` and discarded the result, so drops were **silent and untraced**.

## Decision
gzip the push body so it fits under the keepalive cap — which turns keepalive from liability back into asset (it's the one fetch that survives teardown). Measured: 136KB → 21.8KB (34% of cap).

1. **Transport contract (NEW):** the client sends the body gzipped with `Content-Encoding: gzip`; the worker sniffs that header and decompresses via `DecompressionStream` before `JSON.parse`. KV still stores plain JSON (gzip is transport-only). **Any future change to the push body or worker receive path MUST preserve this: client gzips, worker decompresses, both symmetric.** Backward-compatible: a non-gzip client still hits `request.json()`.
2. **Debounce 30s → 5s** — wins the race against Android background-suspend for the common case.
3. **Lifecycle flush (execution-model-aware):** gzip is async (`CompressionStream`), but `pagehide` is a synchronous teardown — `await compress(); fetch(keepalive)` can lose the race (page frozen mid-await). So the CURRENT state is pushed on **`visibilitychange:hidden`** (fires earlier, with runway), and `pagehide`/`beforeunload` call **`PUSH.flushSync()`** — a synchronous keepalive fetch from a pre-gzipped cache (no await → initiates before teardown).
4. **KEEP keepalive** (refined from the brief's "drop it"): gzip makes it fit AND it survives tab-close; dropping it would lose tab-close survival for no gain.
5. **Observability (NEW):** every push records `{ok, at, reason}` to `localStorage['slyght_push_status']` — a key SEPARATE from `slyght_v5` (never enters the synced blob, never triggers another push). Replaces the silent `.catch` blind spot.
6. **CORS:** worker `Access-Control-Allow-Headers` adds `Content-Encoding` (preflight).

## Verification
Full smoke 205/205 (14 push specs: gzip round-trip CompressionStream↔DecompressionStream, <64KB size proof, flushSync keepalive, observability trace, redaction-after-gunzip). Guardian: 4 `guardian-static` FAILs are pre-existing (RC11 `isPaidInCycle`, RC2 `getBurn7d` — identical on clean baseline); zero new violations. **The real acid test is John's: background a >64KB blob on the S23, pull KV, confirm it landed.**

## Consequences / follow-ons
- **Deploy order is load-bearing:** `wrangler deploy` the worker (backward-compatible) BEFORE the client gzip reaches John's phone.
- **SW retry queue** (failed pushes queue + retry on next online event) is the robust hard-close answer — deferred to Bundle 33-cache (needs the sw.js lifecycle).
- If `CompressionStream` is ever unavailable, the client falls back to a plain body (old behaviour; large keepalive may drop) — acceptable degradation.
