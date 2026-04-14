# SLYGHT State Guardian

## Last verified: 2026-04-14T14:01:11.518Z

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

## How to run
```
node guardian.js verify
```
