# Finance Round 4 — compact Home and Transfer

Baseline verified: clean working tree on `codex/finance-3-1-linked-payments` at `0d28a1e1bdbc28c7d1d4bb2ae09b9b8ebf3d3edd`. This round creates one local commit only; no push, merge, rebase or main change.

## Changes

- Total Balance keeps its heading-row eye, amount underneath, currency picker, Net Worth, formula disclosure and contractual-payment information. The summary now has 12-point horizontal/8-point vertical padding, less space above the amount and Net Worth, and explicit 800-weight Net Worth label/value text. Masking and financial expressions are unchanged.
- The shortcut grid is a sibling after the balance Card, rather than nested inside it. Removed the visible Finance Shortcuts heading and section counter. The eight existing destinations remain ordered Expenses/Income, Accounts/Assets, Installments/Loans, Debts/Transfers. Cards use 49% widths, 8-point row gaps, 6-point vertical padding and a content-driven 72-point minimum height. Existing Option B theme tones, labels, icons, amounts, accessibility and Coming soon state remain. Missing-valuation/principal-allocation warnings stay inside the balance Card.
- Account dropdown labels are bolder. Their options, filtering, eligibility, callbacks and side-by-side arrangement are unchanged; the existing effective-width fallback remains.
- Transfer amounts use one row at normal widths, with flexible weights 38/24/38 after gaps: Amount to transfer, Rate, Amount to receive. Source/destination currency flags/codes sit beneath their respective values, leaving the inputs free of redundant currency text. Rate contains only the existing numeric draft. The result remains read-only and uses the original display formatter.
- Numeric fields keep decimal keyboards, 48-point minimum heights and screen-reader labels/hints. Narrow screens or larger system fonts stack the fields when window width divided by font scale is below 360. Values are not capped or rounded anew. Incomplete account selection preserves editable amount entry while showing no invented rate or received amount.
- Date and Note are the next fields after the amount row, with existing edit values and validation. To keep the row compact and those fields adjacent, the existing suggested/fixed-rate explanation appears after Note and is also attached to Rate's accessibility hint. There is no conversion sentence inside the row.

No stores, ledger utilities, domain types, migrations, transfer initialization/rate effects, calculations, posting handlers, dependencies or navigation contracts changed. Date, Rates, Accounts, Assets and Recent Transactions retain their existing Home order and behavior.

## Changed files

| File | Purpose |
| --- | --- |
| `src/features/finance/components/TotalCard.tsx` | Compact balance summary, bold Net Worth and separate shortcut grid |
| `src/features/finance/components/AccountDropdown.tsx` | Bold themed selector labels only |
| `src/features/finance/components/TransferModal.tsx` | Three-field responsive presentation, currency labels and guidance placement |
| `tests/finance-assets-ui.test.cjs` | Updated Rate/input selectors and focused layout/behavior regressions |
| `docs/finance-round-4-compact-home-transfer.md` | This review record |

## Verification

- `npm run test:finance`: **239 passed**. New coverage verifies shortcuts outside the Card, absent headings, warning placement, eight-section order/two-column sizing, Net Worth weight/global masking, adjacent selectors, bold selector labels, three-field proportions and responsive fallback, short numeric-only Rate, read-only result/currencies, incomplete selection, Date/Note order and values, manual-rate precision and same-currency fixed-rate behavior. Existing saved-rate reopening/refresh, credit-card mode, real store accounting, precision, persistence and linked-payment protection tests remain.
- `npx tsc --noEmit`: passed.
- `npx expo lint`: ran; **38 errors and 13 warnings**, matching the baseline. A same-configuration ESLint comparison against `0d28a1e`, with normalized diagnostic messages, found **no added diagnostics**. No lint rules were disabled.
- `npx expo export --platform web --output-dir .round4-export`: passed. Generated verification artifacts are removed before commit.
- `git diff --check`: passed.

No real-device Android visual testing was performed. Component tests mock native layout and dimensions; they do not measure text or keyboard rendering. Physical review still needs typical/narrow Android widths, large fonts, light/dark themes, very large amounts/custom rates, TalkBack, decimal keyboards, dropdown selection, manual/stored rates after reopening and refresh, fixed-rate modes, Date/Note editing, and the resulting Home scroll height. The read-only result retains the existing formatter/precision behavior; this layout round deliberately does not alter it.

API references consulted for the installed SDK: [Expo 58](https://docs.expo.dev/versions/v58.0.0/), [Expo documentation index](https://docs.expo.dev/llms.txt), [React Native TextInput](https://reactnative.dev/docs/textinput), [window dimensions](https://reactnative.dev/docs/usewindowdimensions).
