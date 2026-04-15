# SLYGHT State Guardian

## Last verified: 2026-04-15T09:54:40.532Z

## Results

- ✅ getLiveBal returns only S.bal: OK
- ✅ getGenuineSurplus includes getActiveDebtsDueBeforePayday: OK
- ✅ getMonthlySurplus deleted: OK
- ✅ REAL_PIN removed: OK
- ✅ getBillsDue filters recurring:false: OK
- ✅ API key stored in slyght_api_key: OK
- ✅ clearDebt orphan removed: OK
- ✅ daysLeft accounts for paydayReceived: OK
- ✅ renderMarkdown exists for chat: OK
- ✅ Monthly Position not duplicated in HTML: OK
- ✅ getActiveDebtsDueBeforePayday exists: OK
- ✅ shouldShowAlert uses paydayReceived guard: OK
- ❌ Seed does not wipe S.txns if transactions exist: WARNING — verify seed preserves existing transactions manually
- ✅ chatHistory preserved across seeds: OK
- ✅ renderDebtTiles reads from S.debts array: OK
- ✅ renderBillsGrouped reads from BILLS array: OK
- ✅ No duplicate function definitions: OK
- ✅ Ruflo CLAUDE.md present: OK
- ✅ API key not hardcoded in seed data: OK
- ✅ getActiveDebtsDueBeforePayday has paydayReceived cycle guard: OK
- ✅ daysLeft has Math.max(1,...) guard against division by zero: OK
- ✅ Budget dropdown removed from chat tab: OK
- ✅ Financial auditor AUDITOR object exists: OK
- ✅ Money mutations wrapped with auditedMutation: OK
- ✅ SNAPSHOTS system exists: OK
- ✅ RECONCILER system exists: OK
- ✅ CONSISTENCY system exists: OK
- ✅ HEALTH system exists: OK
- ✅ TRACER system exists and wired to surplus/maxday tiles: OK
- ✅ APP_HEALTH system exists: OK
- ✅ EOM export reminder in APP_HEALTH: OK
- ✅ Monthly paidBills reset in APP_HEALTH: OK
- ✅ PERSONALITY engine exists: OK
- ✅ PREDICTOR engine exists: OK
- ✅ NOTIFY system exists: OK
- ✅ SLYGHT_SCORE exists: OK
- ✅ WRX Command Centre present: OK
- ✅ China Holiday tracker upgraded with quick-add: OK
- ✅ Time Machine present in Analysis tab: OK
- ✅ HEARTBEAT replaces all separate intervals: OK
- ✅ Export strips API key: OK
- ✅ Chat inactivity check exists: OK
- ✅ Autofill disabled on inputs: OK

## How to run
```
node guardian.js verify
```
