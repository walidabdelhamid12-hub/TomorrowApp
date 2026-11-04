# Finance 3.1 Android polish — Round 2

Baseline: clean `codex/finance-3-1-linked-payments` at `f586a157d113265bd14b1e5cab7630330811ad96`. Work is committed locally on that branch only. No push, merge, rebase, main change, schema migration or dependency change is part of this round.

## Visual and interaction changes

1. **Date:** full English device-local weekday, month, day and year. A minute timer and app-resume listener refresh the label across midnight and timezone changes; both are cleaned up on unmount.
2. **Eye:** the one global control sits immediately below Total Balance's heading, beside the amount. Its existing persisted preference, default masking and propagation to summaries/recent records are unchanged. No per-record eyes were added.
3. **Assets:** shared three-zone layout: icon/type/quantity on the left, user name in the center, value with green Edit/red Delete beneath it on the right. Finance preview and full Assets already use AssetCard and now receive the same layout. Existing value/weight strings, gold/silver medals and currency flags are preserved.
4. **Accounts:** AccountCard uses the same FinanceRecordCard shell, showing type/currency on the left, name centrally, and balance/actions on the right. Separate details/action touch targets remain. Narrow windows or larger system fonts switch to a readable stacked arrangement rather than clipping text.
5. **Account details:** labeled balance/type/currency/credit-limit metrics, optional notes, collapsed transaction history and record timestamps. History ordering and balance calculations are preserved. The shared details modal uses a 48-point back arrow, including safe Android Back dismissal.
6. **Loans:** reduced card padding/gaps, clearer short contractual label, accessible back control and structured read-only detail metrics. Remaining principal and contractual payments stay distinct. Loan metadata and read-only payment history remain available in disclosures; all terminal-state policies and calculations are untouched.
7. **Transfer form:** adjacent From/To dropdowns replace the long account chip lists, with a vertical fallback for narrow widths or large fonts. Amount/rate/receive summary now follow directly after them, ahead of date and note. Existing source/destination eligibility, credit-card mode, errors, validation and submit/store calls remain.
8. **Categories:** removed only from the active Finance home grid, leaving eight approved shortcuts in the requested order. Category management remains under Add transaction → Transaction → Edit Categories, and the existing management route, selectors and records remain. Installments is still Coming soon and nonfunctional.
9. **Recent transactions:** explicit expense, income, refund, loan/debt and transfer/card-payment icons. Ordinary rows put their amount and Edit/Delete in one right-side area, separate from their read-only detail target; accessible narrow/large-font fallback is supported. Protected linked records still offer only their safe parent-navigation action. Ownership is still checked again when an action is dispatched.
10. **Rates:** gold/silver display uses deterministic three-decimal formatting with trailing zeros trimmed. The displayed rounded text is never treated as canonical data for an untouched field. Explicit edit flags and exact parsed-number comparisons replace the metal-only tolerance check. Untouched Save does not call a metal setter; deliberately edited valid values retain all entered Number precision and use the existing base-rate conversion. Invalid/negative prices, clearing, dirty-close/discard and staying open after Save retain their behavior. FX rate formatting/change detection is unchanged.

## Transfer edit-state regression found during validation

The new real-form test exposed existing effect ordering that could overwrite freshly loaded account selections, then replace a stored custom exchange rate with the current suggestion on a later effect pass. Initialization now marks which edit has loaded before selection validation runs. Rates update automatically only when the actual account/mode selection changes. Opening another edit or refreshing live rates preserves its saved rate. This is form-state handling; ledger posting, conversion arithmetic and accounting stores are unchanged.

## Changed-file inventory

| File | Purpose |
| --- | --- |
| `src/features/finance/hooks/useFinanceDate.ts` | New local-date label and lifecycle refresh |
| `src/features/finance/screens/FinanceHomeScreen.tsx` | Full date and relocation of the shared visibility callback |
| `src/features/finance/components/TotalCard.tsx` | Eye placement and eight-section home grid |
| `src/features/finance/components/FinanceRecordCard.tsx` | New responsive three-zone shared card |
| `src/features/finance/components/AssetCard.tsx` | Shared asset presentation for preview/full screen |
| `src/features/finance/components/AccountCard.tsx` | New compact account presentation |
| `src/features/finance/components/AccountsSection.tsx` | Reuse AccountCard in account summaries |
| `src/app/finance/accounts.tsx` | Reuse AccountCard in the full account list |
| `src/features/finance/components/FinanceDetailsModal.tsx` | Structured metrics, children and back arrow |
| `src/features/finance/components/AccountDetails.tsx` | Structured account details and collapsed history |
| `src/features/finance/components/LoanDetails.tsx` | New structured read-only loan details |
| `src/app/finance/loans.tsx` | Compact spacing, labels and LoanDetails integration |
| `src/features/finance/components/AccountDropdown.tsx` | New themed account dropdown with independent selection sheet |
| `src/features/finance/components/TransferModal.tsx` | Compact field order, responsive dropdowns and safe edit initialization |
| `src/features/finance/components/TransactionsSection.tsx` | Transaction icons and compact right-side values/actions |
| `src/features/finance/components/RatesModal.tsx` | Clean metal display, canonical no-op preservation and explicit edits |
| `tests/finance-assets-ui.test.cjs` | Updated layouts and new date, metal, transfer and responsiveness checks |
| `tests/finance-transactions-ui.test.cjs` | Native dimension mock for responsive real-component checks |
| `docs/finance-3-1-android-round-2.md` | This delivery record |

## Verification

- `npm run test:finance`: **221 passed**. Includes existing store/linkage/terminal-state/visibility persistence regressions; the actual home component's single-eye masking; date midnight/resume/cleanup; rounded metal no-op saves in a non-EGP base; deliberate sub-tolerance metal edits; validation/clearing/dirty close; transfer dropdown layout/fallback; saved-rate preservation through repeated effects, refresh and reopening another edit; credit-card mode; independent card/detail/action targets and history privacy.
- `npx tsc --noEmit`: passed.
- `npx expo export --platform web --output-dir .round2-export`: passed. Generated verification output is removed before commit.
- `npx expo lint`: ran. Current result **38 errors, 13 warnings** versus baseline **39 errors, 14 warnings**. A programmatic ESLint comparison of baseline source and the current source, including new files and normalized diagnostic messages, found **no added diagnostics**. Existing lint debt remains; no rules were disabled.
- `git diff --check`: passed.

The component tests mock native layout primitives, AppState and dimensions. They verify render trees, callbacks and policy behavior, not physical text measurement or Android rendering. **No real-device Android visual pass is claimed.** Remaining review: typical and very narrow Android widths, large fonts, light/dark themes and TalkBack, long account/asset names and large values, nested dropdown/back behavior, account/loan disclosures, eye hide/show and restart persistence, Rates editing/Save/discard, and transfer editing with custom FX rates. Installments remains intentionally deferred.

API references checked for the installed SDK: [Expo 58](https://docs.expo.dev/versions/v58.0.0/), [Router](https://docs.expo.dev/versions/v58.0.0/sdk/router/), [window dimensions](https://reactnative.dev/docs/usewindowdimensions), [AppState](https://reactnative.dev/docs/appstate).
