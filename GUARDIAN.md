# SLYGHT State Guardian

## Last verified: 2026-04-14T14:05:42.912Z

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

## How to run
```
node guardian.js verify
```
