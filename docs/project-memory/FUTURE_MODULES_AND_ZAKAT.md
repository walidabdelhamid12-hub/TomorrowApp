# TomorrowApp — Future Modules, Finance UI and Zakat Integration
Status: **Approved design requirements; implementation deferred**. Updated 2026-11-11.

## Canonical application navigation
TomorrowApp has **exactly four top-level modules**: **Finance, Spiritual, Health, Growth**. Reports is **not** a fifth top-level module; it is an entry point **inside Finance**.

### Finance home visual reference
The user-approved Finance dashboard reference is the previously shared `TomorrowApp_Finance_Design.png` image (2026-11-11 chat). **Image binary not yet committed to this repository; attach it to this document when available.** Do not pretend the image is a runtime screenshot or that every illustration detail is implemented.

Preserve the **eight main finance tiles in a two-column grid** as shown in the approved visual:
- Row 1: Expenses (left), Income (right).
- Row 2: Accounts (left), Assets (right).
- Row 3: Installments (left), Loans (right).
- Row 4: Debts (left), Transfers (right).

Below the tiles: **Add**, **Rates**, **Reports** actions. **Financial Planning** has **Trips (left), Events (middle), Budget (right)**. Below it, Recent Transactions. Bottom navigation has only the four top-level modules. This is a **design reference**, not confirmation of current implementation. Preserve eight tiles; do not add Zakat to the Finance home grid.

## Zakat — future design
**Navigation:** `Finance → Reports → Annual Reports → Zakat Calculator`. No independent top-level Reports module or separate Finance-home Zakat icon.

**Single source of truth:** Finance owns asset/account balances, gold holdings/purity, valuation, zakat computation, records and user-confirmed payments. Spiritual only reads a derived eligibility/reminder state and links to the same Finance calculator; it must not duplicate financial calculations.

**Calculation policy:** support configurable jurisprudential choices (including personal jewelry and eligible liabilities), nisab reference based on 85 g of 24K pure gold or equivalent, gold purity conversion, lunar Hijri hawl, cash and other eligible holdings, and 2.5% of eligible zakatable base **only when conditions are satisfied**. Nisab threshold alone does not establish immediate obligation. Record start-of-hawl, assessment date, source rates, valuation snapshot, calculation version/policy, eligible asset composition, paid and remaining amounts. Obtain qualified Sharia review before treating results as authoritative; Hijri calendar method/local differences must be configurable.

**Posting safety:** estimation and reminders must never mutate balances. User explicitly confirms payment amount, date, account and category (Expense/Donation); only the confirmed actual payment changes the account **once**. Reporting must avoid double counting and reconcile the payment record. Preserve `postingAllowed=false` and dormant V3 gates; do not implement or bypass them in this documentation task.

## Spiritual — future module
Optional prayer tracking (obligatory, regular Sunnah, Duha, night prayer, shaf/witr, Ramadan taraweeh), fasting (Mon/Thu, Hijri 13–15, Ashura, Arafah 9 Dhu al-Hijjah, six Shawwal days), Ramadan fasting and Quran completion, seasonal calendar and reminders. **10 Dhu al-Hijjah is Eid al-Adha, not a suggested fasting day.** Hijri calendar must allow locally appropriate adjustment. Sensitive religious activity is optional/private, without judgmental prompts. Zakat reminders are read-only Finance integrations.

## Health — future module
Measurements (weight/height/BMI), calories, walking/gym/exercise, hydration, checkups, medication schedules and user-entered insulin timing, blood donation history. Protect sensitive data; never infer or prescribe insulin/medication doses. Notifications are best-effort, not guaranteed safety-critical alarms; require careful reliability/failure design. Blood donation eligibility depends on medical guidance and personal circumstances, not a universal timer. BMI/calories are informational, not diagnoses.

## Growth — future module
Language learning (vocabulary, listening, courses), technical/professional skills, reading and knowledge, SMART monthly/quarterly goals. Share a reusable progress/goal tracking core without forcing identical units on distinct activities. Broader Growth scope is now a **future requirement**, not proof of implemented features.

## Project sequencing and guardrails
- Preserve the **single canonical Finance 12-phase roadmap**. Phase 6 supplies finance/asset data foundations; Phase 8 is analytics/reports; Phase 12 is **financial reminders** and does not become a replacement Spiritual phase.
- These non-Finance modules require **separate implementation planning after Finance stabilizes**. Cross-module reminder infrastructure can be reused, but no renumbering of Finance phases.
- No UI implementation, schema migration, accounting/posting changes, test result claims, or Android verification follow from this documentation.
- **Next Finance candidate remains the proposed read-only monthly operating trend series (8.2E candidate), not yet authorized for implementation**. Its scope decisions must be approved separately.
- On **“Tomorrow Resume”**: read MASTER_ROADMAP.md, CURRENT_STATE.md, DAILY_HANDOVER.md, ACCOUNTING_DECISIONS.md, WORK_RULES.md and this file; verify actual branch HEAD/status and newest accepted checkpoint; report completed, unverified and next approved task separately. Do not silently assume all tasks in this file were implemented.
