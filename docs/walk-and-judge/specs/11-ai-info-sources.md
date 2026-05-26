# Spec 11 — AI chat: information sources / prompt provenance

> **⭐ HIGHEST-PRIORITY FINDING LIVES HERE.** John's directive 2026-05-26: walk this live to
> confirm, then it likely tops the fix-priority list (above Darwin).

**Story:** Sam asks the in-app AI "how am I doing?" / "can I afford X?". The AI's answer is only
as good as the numbers fed into its system prompt. If the prompt reads the WRONG balance basis,
the AI confidently advises on a number Sam can't even see — the worst kind of finance bug.

**Fixture:** positive (`state-snapshot.fake.json`). NOTE: `apiKey:""` — walk the **prompt
assembly** (what numbers get embedded) via code-read + any offline-renderable path; the live
API call needs a key Sam-fixture doesn't have, so judge the prompt CONTENTS, not the model reply.

## Level 1 — main UI
AI-Chat tab. Screenshot. Composer + history (empty in fixture) + any "what I know about you" panel.

## Level 2 — per control / prompt assembly
| action | driver | expect | finding |
|---|---|---|---|
| open AI chat | nav | composer renders | — |
| inspect system prompt assembly | **inline literal index.html:15665-15743** | should embed genuine surplus + visible balance | ⚠️ reads **RAW `S.bal` :15672** + `getDynamicDailyBudget` (NOT `getLiveBal` / genuine surplus) |
| `buildSystemPrompt()` :15332 | function | (should be the assembler) | ⚠️ **DEAD CODE** — never called; live prompt is the inline literal |
| send message (if key) | chat send | model reply + tool calls | `update_balance` overshoots (FR-03) |
| AI action: mark bill paid | AI tool | should use canonical writer | ⚠️ bypasses canonical writer |

## Level 3 — cross-surface
- The number the AI quotes must EQUAL the Dashboard hero (`getLiveBal`). Code-read says it
  quotes RAW `S.bal` — walk to confirm divergence (CDB-23 class).
- AI `update_balance` must respect INV-20 (FR-03: overshoots by ~$7k — memory, CLAUDE.md §10).
- AI `mark_bill_paid` must hit the same writer as Spec 03 (else cycle-key + audit drift).

## Candidate findings (TOP PRIORITY)
- **`buildSystemPrompt()` :15332 is DEAD CODE** — the live prompt is an inline literal
  (:15665-15743) reading RAW `S.bal` (:15672) + `getDynamicDailyBudget` (not genuine surplus).
  AI advises on a number the user can't see. **HIGHEST priority — walk live to confirm.**
- self-contradicting static persona text in the prompt [pending].
- `mark_bill_paid` bypasses canonical writer [pending].
- FR-03 `update_balance` overshoot [HIGH, known].
- AI action errors swallowed (no surface) [pending].
