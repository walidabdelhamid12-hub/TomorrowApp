# Finance Option B visual polish — Round 3

Started with a clean working tree on `codex/finance-3-1-linked-payments` at `4506d9bba9f0772c639b90fbd377ca084b6ca3a4`. This is a local-only visual correction; no push, merge, rebase or main change is included.

## Changes and boundaries

- Restored AssetCard directly from `f586a157d113265bd14b1e5cab7630330811ad96`. Comparison against that source confirms the same element hierarchy, content-driven layout, quantity/name/category/valuation placement, movement callback, accessibility summary and separate Edit/Delete controls. Only surface, border, corner and secondary text colors differ. Both the Finance asset preview and full Assets screen already reuse this component.
- Accounts retain a separate account-specific card: type icon left, prominent name next to it, secondary type/currency, right-aligned balance, and Edit/Delete side by side below the main content. Names and amounts can grow/wrap without fixed content heights or clipped text.
- Moved the one persisted global eye into the same heading row as Total Balance. Its callback, masking, currency list, Net Worth and full device-local date remain unchanged.
- Added restrained semantic Finance palettes in the existing theme, with soft surfaces, subtle borders and controlled accents for balances, assets, accounts, income, expenses, liabilities, transfers and neutral history sections. All have explicit light/dark variants. Green Edit/red Delete surfaces and text are also semantic tokens; touch targets and action dimensions are preserved.
- Kept the existing eight shortcuts, their order and destinations, two per row across four rows. Tints and icon/amount accents now follow each section's semantic tone. Categories stays outside the home grid and Installments remains Coming soon.
- Kept Rates as its existing modal. Gold/Silver now use equal flexible widths rather than 40% cards, removing unused horizontal space. With the existing 8-point gap and card padding this provides roughly 20–23% more input width at typical phone sizes, calculated from layout rules rather than measured on Android. Short Gold (gram)/Silver (gram) labels fit one line at normal sizes; gold's 24K definition remains explicit in the explanatory text. Effective widths below 360 points after font scaling stack the fields and permit text wrapping. Both inputs use the same 44-point minimum field height. Source status colors now also use theme variants. Canonical prices, formatting, change detection, setters, Save/close/discard and FX behavior are untouched.
- Preserved the vertical Recent Transactions list, detailed row actions and ownership revalidation. The heading now uses a receipt icon; View All has a contrast-tested Finance accent. Rows use themed direction/status tints, stronger amounts and slightly larger icon containers. No linked record gains a generic action.
- Loan cards gain a subtle liability surface, grouped metric background, semantic status/value accents and tinted disclosures. The approved layout, Deposit Distribution, Payment History, actions, lifecycle policy and all calculations remain unchanged.
- The only generic UI adjustment is a string check in AppText's color resolution, required by the new nested Finance palette. Existing scalar theme keys and raw color strings still resolve as before; typography and unrelated module palettes were not restyled.

## Changed files

| File | Change |
| --- | --- |
| `src/theme/colors.ts` | Finance-only semantic light/dark palettes |
| `src/components/ui/AppText.tsx` | Safely narrow scalar colors when palettes contain nested tokens |
| `src/features/finance/components/AssetCard.tsx` | Restore the approved pre-Round-2 structure and tint it |
| `src/features/finance/components/AccountCard.tsx` | Account-specific layout and surface |
| `src/features/finance/components/FinanceActionButtons.tsx` | Semantic green/red action colors |
| `src/features/finance/components/TotalCard.tsx` | Heading-row eye and tinted two-column shortcuts |
| `src/features/finance/components/RatesModal.tsx` | Wider responsive metal fields and themed source styles |
| `src/features/finance/components/TransactionsSection.tsx` | Receipt heading, accent, amount and row styling |
| `src/features/finance/components/FinanceDetailsModal.tsx` | Subtle metric surfaces and label hierarchy |
| `src/features/finance/components/FinanceDisclosure.tsx` | Themed compact section surface/border |
| `src/app/finance/loans.tsx` | Loan card, metric and status color hierarchy |
| `tests/finance-assets-ui.test.cjs` | Restored asset/account structure, contrast, geometry, eye/grid and Rates responsive checks |
| `tests/finance-transactions-ui.test.cjs` | Updated semantic direction/color expectations |
| `docs/finance-option-b-round-3.md` | This delivery record |

## Validation and limitations

- `npm run test:finance`: **230 passed**. Existing precision, persisted visibility, linked-payment, terminal-state, transfer editing and Rates behavior regressions remain covered.
- New checks cover accent/action text contrast of at least 4.5:1 against their tinted backgrounds in both themes, cash-direction semantics despite misleading category colors, identical themed card/grid geometry, the eight two-column shortcuts, single eye sharing the Total Balance heading, independent details/action targets, and typical/narrow/large-font metal layout rules.
- `npx tsc --noEmit`: passed.
- `npx expo lint`: ran; **38 errors and 13 warnings**, matching baseline. A programmatic comparison using the same ESLint configuration and normalized diagnostic messages found **no added diagnostics**. Existing lint debt is not suppressed.
- `npx expo export --platform web --output-dir .round3-export`: passed; generated verification files are removed before commit.
- `git diff --check`: passed. No changes to stores, financial utilities, hooks, dependencies or native projects.

No real-device Android visual validation is claimed. Native layout is mocked in the component tests; contrast checks validate token pairs rather than screenshot pixels. Remaining review is physical rendering at common/narrow widths and larger system fonts, light/dark appearance, long names/amounts, emoji availability, TalkBack, nested modal/back behavior and the visual feel of the restored asset cards. Installments remains intentionally nonfunctional. Review the local commit before remote publication.

References checked for the installed SDK: [Expo 58](https://docs.expo.dev/versions/v58.0.0/), [Expo documentation index](https://docs.expo.dev/llms.txt), [React Native window dimensions](https://reactnative.dev/docs/usewindowdimensions).
