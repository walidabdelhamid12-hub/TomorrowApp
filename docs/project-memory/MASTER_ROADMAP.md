# TomorrowApp — Unified Master Roadmap V6
Approved: 2026-11-11. Scope: Tomorrow Finance plus separate app modules. This roadmap supersedes *status statements* in older plans, not their uncompleted requirements.

## Progress convention
Estimated overall Finance scope progress: **~65% (planning estimate, not measured code coverage)**. "Implemented" does not mean fully accepted; automated tests, Android verification, historical correctness, and sign-off remain distinct.

## Finance — canonical 12 phases
1. **Finance foundation/data:** account, transaction, asset and currency models; persistence/migrations; balances and net worth; decimal precision; dates; entity relationships. Advanced implementation; final migration/date/legacy-data audit open.
2. **Accounts/categories:** account CRUD/types including credit cards; categories name/icon/color, archive behavior, historical references. Accounts advanced; independent Categories management and safe archive behavior open.
3. **Income/expenses:** create/edit/delete; account/category/date/currency links; history; search/filter; duplicate-operation safety. Core advanced; full filters and idempotency acceptance open.
4. **Transfers:** same/cross-currency source and destination actual amounts; fees; no operating P&L impact. Implemented substantially; edge cases and final acceptance open.
5. **Currencies/rates:** base currency, rates and historical FX, conversion direction, native and base-currency display, missing/stale rates, historical-vs-current valuation. Substantial implementation; comprehensive audit open.
6. **Assets/liabilities/debts/loans/installments:** asset movements, gold/silver valuation, receivables/payables, cheques, loans, installments, net worth, linked payments and recovery. Substantial implementation; installments schedules-only, safe posting activation deferred, cheques and final acceptance open.
7. **Calculator/amount entry:** arithmetic, precision, zero division, invalid results, native keyboard and optional calculator, field integration, consistent money display. Substantial implementation; end-to-end UI acceptance open.
8. **Analytics/reports:** monthly income/expense; comparison; category breakdown; weekly and monthly trends; account history; date/account/category filters; exclude internal transfers; reconcile with known examples. In progress: classification **8.2A** and read-only aggregation **8.2B** committed; reporting UI, charts, filters and remaining acceptance open.
9. **Smart documents/receipts:** capture/import, file links, permissions, QR, OCR, extracted fields with confirmation, search, duplicate detection, image cleanup, sharing/export, backup and restore. Planned.
10. **Smart voice entry:** Arabic speech-to-text, draft transaction parsing, account/category suggestion, clarification and explicit confirmation. Planned.
11. **Backup/sync:** local export/import, complete restore, attachments, cloud sync, encryption, conflict handling, offline operation, restore tests. Planned.
12. **Financial reminders:** credit card statement/grace/due dates, partial payment updates, cancel settled reminders, installment/debt reminders, no automatic balance deduction, reboot tests. Planned.

## Approved scope additions / cross-cutting
- Cross-currency original transaction amount, historical rate suggestion, actual bank amount as sole balance authority; refund uses actual bank amount, with FX variance separate in analytics.
- Safe linked-payment authority / dormant V3 journal; never infer posting readiness from report tests.
- Historical Accounts Report requires verified openingBalanceDate and complete movements; unavailable/ambiguous data yields null plus reason.
- Potential future enhancements requiring separate specification/approval: profiles, budgets, trip/event spending, bank-message imports.
- Arabic/English and RTL/LTR are app-wide quality requirements, not an extra Finance phase.

## Other TomorrowApp plans — separate from Finance
- **Tomorrow Health:** requirements, data model, screens and tests to be scoped separately.
- **Tomorrow Spiritual:** content, features, screens and tests to be scoped separately.
- **Tomorrow English / Growth:** English lessons, exercises and saved progress; any broader Growth scope needs approval.
- **App-wide Quality & Release:** visual system, localization, accessibility, device layouts, keyboard/navigation, security, performance, offline/error cases, Expo Android/iOS configuration, beta builds, migration and release tests.

## Sequencing
Finish Finance Phase 8 in approved increments; close open foundational safety dependencies before any posting activation; continue Phases 9–12; complete Finance V1 acceptance; plan other modules separately. Preserve one canonical roadmap and update status rather than recreating plans.
