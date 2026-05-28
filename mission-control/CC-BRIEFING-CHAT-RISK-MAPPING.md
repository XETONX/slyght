# Briefing Chat — Action-Plan Schema + Risk-Tier Mapping (sign-off)

> NEEDS-REVIEW item from the Phase 1 brief. The schema + the full LOW/HIGH split + the guarantees the
> executor enforces — for your one-pass review before this is "done." All changes from this doc go
> through Edit/restart, nothing pushed. Branch `mission-control`.

## 1. The action-plan schema Jarvis emits

One Claude (sonnet) call per chat turn — output ends with exactly one fenced JSON block:

```json
{
  "reply": "plain-English reply to John (what you're doing and why)",
  "actions": [
    { "name": "<actionName>",  "args": { ... },  "why": "what this does + why" }
  ]
}
```

- `name` must be one allowlisted action (LOW *or* HIGH below). Unknown → REJECTED at the executor *and* at /api/action.
- `args` is the action's normal argument object — same shape as the UI calls. **Claude must NEVER set `confirm:true`** — the executor strips it server-side regardless. For LOW actions that require it, the executor *re-sets* it before firing (whitelist: triageWorkload / jarvisOrganize / clusterBacklog / autoLogDryRun). For HIGH actions, only your typed CONFIRM can flip it.
- `why` is the in-chat explanation shown on the action result card.
- Empty `actions: []` is fine — Jarvis can just reply without acting.

## 2. Tier 1 — LOW-RISK (fires on Jarvis's call)

Jarvis-own reads + recoverable single-field edits. Auto-fire is the *point* of the chat — Jarvis answering questions IS Jarvis working.

| Action | What it does | Why LOW |
|---|---|---|
| `triageWorkload` | Opus reads the whole backlog + ARCHITECTURE + INVARIANTS + live ledger, ranks issues, writes triage-report.json. | Central "what matters" read. Tokens spent on Jarvis's *cognition*, not on producing a new artifact. |
| `jarvisOrganize` | Per-ticket: suggest epic/bundle/related/closesWith. | Per-ticket suggestion, suggest→click pattern. The user applies via UI. |
| `jarvisAskAll` | Jarvis answers every open question on ONE ticket in one threaded reply. | Reasoning to unblock a single ticket. Read-only output. |
| `clusterBacklog` | Opus dedupe pass — proposes merge groups into cluster-report.json. | Read-only proposal. Merges still require a click in the Dedupe view. |
| `autoLogDryRun` | Local heuristic scan of unmapped findings; writes auto-log-dryrun.json. No Claude. | Cheap deterministic scan. |
| `createTicket` | Logs a new ticket — auto-enriched via (e) (surface guess + auto-organize). | John dictates, Jarvis logs. Recoverable (delete reverses). |
| `setMeta` | Edit ONE field (type / severity / dueDate / bundle / epic) on ONE ticket. | Recoverable single-field edit. No spend. |
| `setBlockedBy` | Set dependency edges on a ticket. | Edge edit, recoverable. No spend. |
| `autoLogDisable` | Turn auto-write OFF. | Safe reverse of the high-risk `autoLogEnable`. |
| `clusterReviewed` | Flip the cluster dry-run flag → reviewed (unlocks bulk merge in Dedupe). | One-bit state change, recoverable. |

## 3. Tier 2 — HIGH-RISK (your typed CONFIRM, server-enforced)

EITHER destructive writes OR token-spending multi-step drone fires that produce a real artifact. Routed to a `PENDING_CONFIRM` card; you type **CONFIRM** (case-sensitive exact) to fire. Claude can never bypass this — `confirm:true` is stripped at the executor.

| Action | What it does | Why HIGH |
|---|---|---|
| `mergeTickets` | Folds dupe tickets into a keeper; tombstones the dupes. | Destructive (though recoverable — tombstone, not purge). |
| `executeFixOnMain` | Fires the CC writer drone to implement the fix on an isolated worktree. | **Destructive** — writes code. The biggest existing high-risk action. |
| `dispatchCC` | General CC writer-drone fire. | Destructive — writes code. |
| `dispatchScoped` | Fires ONE scoped investigation drone (root-cause / locate-surface / fix-proposal / conformance / auditor / intent / design / acceptance / breakdown). | **John's call 2026-05-28**: not destructive, but spends tokens + multi-step real work → confirm-friction. |
| `buildCase` | Fires multiple scoped drones in parallel ("full case"). | N × dispatchScoped spend. |
| `composeResolution` | Opus drafts the resolution text artifact for a complete case. | Token spend + produces an artifact. |
| `designAgent` | Opus designs a NEW scoped drone from a plain-English description. | Token spend + adds *capability* to the cockpit. Worth extra friction. |
| `uxAudit` | Cockpit visual-consistency audit drone. | Token spend (Opus). |
| `alignHandoff` (with `force:true`) | Bypasses the (b) readiness gate. | Overrides the contract — log-only, but the override IS the destructive bit. |
| `autoLogEnable` | Turns auto-write to ON. | Opens the unattended-write floodgate — the (d) seatbelt OFF. |
| `markReadyToShip` | Commits the fix on main + moves the ticket to the deploy queue. | Destructive (commits). |
| `deleteTicket` | Tombstones a ticket. | Destructive (recoverable but irreversible from chat). |
| `doExecuteWithPush` | Publishes to remote. | Destructive (push). |

## 4. Outside both lists → REJECTED

Anything not in either set returns `REJECTED` in the action result card. Currently: `pushDeploy`, internal helpers, every drone-record callback, the `*Confirm`/`*Disable` admin paths not listed above. Add via this doc → review → executor allowlist.

## 5. Security guarantees the executor enforces

1. **Allowlist holds.** Names not in LOW ∪ HIGH → REJECTED at the executor *and* unknown names die at `/api/action` regardless. No path executes an unlisted action.
2. **Token holds.** Every chat-driven action passes through `/api/action` with `MC_TOKEN`. Same auth as the UI buttons.
3. **No-bypass `confirm:true`.** Claude's emitted `confirm:true` is stripped at the chat executor *for every name in HIGH_RISK_CHAT_NAMES*, before any dispatch. Defense in depth.
4. **Typed-CONFIRM gate.** `confirmChatAction` checks three things in sequence:
   - `confirmText === 'CONFIRM'` (case-sensitive exact).
   - The action's current verdict is still `PENDING_CONFIRM` (no replays).
   - The action's name is still in `HIGH_RISK_CHAT_NAMES` (no privilege escalation by editing the chat file).
5. **No silent state.** Every action verdict is recorded on the chat turn: `FIRED` / `BLOCKED` / `REJECTED` / `PENDING_CONFIRM` / `CANCELLED` / `ERROR`. Nothing happens off-thread; you can always scroll and see what Jarvis did in your name.

## 6. Operational notes

- **Reset is destructive (chat-wise) but harmless (state-wise).** `briefingChatReset` wipes briefing-chat.json. No drones fire, no tickets change. Not in either list — admin call.
- **Async drones.** Phase 1 returns synchronously after `claudeChatCall` resolves; for the few sync actions (setMeta, autoLogDryRun) the result is in the action card. For async drones (jarvisOrganize, clusterBacklog, triageWorkload, dispatchScoped), the card shows `dispatched: <key>` and the actual results land in the existing `record*` paths (triage-report.json, the ticket caseFile, cluster-report.json). Phase 3 polish item — hook the record* paths to post a follow-up chat turn when a chat-fired drone lands.
- **Cost ceiling.** Each chat turn is one sonnet call (~$0.01–$0.05 typical). High-risk drones (executeFixOnMain, dispatchCC, designAgent) carry the existing per-drone caps from `spawnDrone` ($1.50 sonnet / $3 opus). The typed-CONFIRM is the *spend* gate as well as the *correctness* gate.

## 7. Sign-off

If anything in the LOW table looks too loose, move it to HIGH and Jarvis will route it through typed-CONFIRM. If anything in HIGH feels over-gated, move it to LOW and Jarvis will fire on its call. The split is a single source edit at the top of the BRIEFING CHAT section in `server.js`:

```js
const LOW_RISK_CHAT_ALLOWLIST = new Set([ ... ]);
const HIGH_RISK_CHAT_NAMES    = new Set([ ... ]);
```

Branch `mission-control`. Nothing pushed. Awaiting your one-pass review.
