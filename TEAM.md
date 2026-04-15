# SLYGHT Full Project Team Audit

## Team Roles
- QUEEN: Programme Director — coordinates all workstreams, owns final sign-off
- AGENT 1: Principal Architect — owns the data model, S object, canonical functions
- AGENT 2: Lead Engineer — owns all calculations, edge cases, spider network audit
- AGENT 3: QA Lead — owns test scenarios, SIT testing, regression testing
- AGENT 4: UX Design Lead — owns dashboard layout, information hierarchy, emphasis
- AGENT 5: Bills Domain Expert — owns bills tab, calendar, paid/unpaid logic
- AGENT 6: Debt Domain Expert — owns debt tiles, surplus, affordability calculations
- AGENT 7: Security & Data Architect — owns data integrity, export/import, monitoring
- AGENT 8: Competitor Analyst — benchmarks against YNAB, Frollo, Pocketbook
- AGENT 9: Field Expert / Superuser — tests as a real daily user making real mistakes
- AGENT 10: Integration Consultant — ensures every system talks to every other system

## Core App Objective
SLYGHT is a personally tracked finance assistant that:
1. Identifies where money is going
2. Calculates affordability in real time
3. Directs where money should go
4. Keeps the user on track with minimal input
5. User's only input should be: logging transactions, marking debts paid

## Known Critical Issues
- Bills tab: paid bills still appearing in calculations and calendar
- Car loan marked paid still showing on April 16th selection
- Rent $3000 showing as charging today despite being paid
- PAID badge not preventing recalculation
- This Week tile not cross-referencing paidBills database
- UX monitor registering taps but not validating data accuracy on screen
- Information on dashboard not prioritised by importance
- Spider network of calculations not fully connected

## Definition of Done
- Every number on every screen traces to one canonical function
- Every paid bill excluded from ALL calculations immediately
- Every paid debt excluded from ALL calculations immediately
- No contradicting numbers between any two screens
- Dashboard tells the story in 5 seconds
- Bills tab has zero false information
- Debt section has zero stale data
- All monitoring systems catch real issues not false positives
- 100% guardian pass
- App ready for daily production use