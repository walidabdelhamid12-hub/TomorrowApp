# Finance 3.1 UI refinement

## Baseline and inspected implementation

Started from a clean working tree on `codex/finance-3-1-linked-payments`, at `717ab36e5f00c539bb78be212f99bb410d9c1f8a`. GitHub PR #1 was open, not merged, and its head matched that commit. No branch discrepancy was found. Main was not edited.

Inspected the active `(tabs)/index.tsx` → `FinanceHomeScreen` entry, Finance route layout and Accounts/Assets/Loans/Debts routes; `TotalCard`, `TransactionsSection`, `AccountsSection`, `AccountDetails`, `AssetCard`, `AssetRow`, `AssetTypeIcon`, `AssetEntriesModal`, `FinanceDetailsModal`, `FinanceActionButtons`, Rates and form modals; ThemeProvider/colors and shared Card/AppText/AppButton; Finance/currency/ledger stores, payment coordinator, ownership/navigation helpers, summary hook, valuation/decimal/amount formatting and existing Finance tests. The older `FinanceScreen` and `FinanceHeader` are not the active home implementation and were left alone.

## Changes

- Reordered the nine existing shortcuts into Expenses/Income, Accounts/Assets, Installments/Loans, Debts/Transfers, then full-width Categories. Categories is the ninth section and has management navigation rather than an invented balance. Transfers retains its existing create-transfer behavior and has no invented balance aggregate. Existing internal `cheques` data/key are preserved; only the unimplemented shortcut's display name changes to Installments, with a visible Coming soon label and an explicit nonfunctional explanation.
- Replaced per-card eyes and home-only transient visibility with one Finance header eye. A separate persisted Zustand preference defaults to hidden and validates hydrated values. Total Balance, Net Worth, future contractual payments, shortcut amounts, recent transactions/transfers, their read-only details and the home asset preview all receive the same visibility value. Financial forms continue to expose their editable inputs intentionally.
- Kept the currency flag/code/list and existing rate setter; single-line Total Balance shrinks to available width. Added compact Net Worth with an initially collapsed formula explanation. No accounting formula or valuation calculation changed.
- Matched Add transaction and Rates using equal-flex AppButton wrappers, with primary/outline emphasis. Rates implementation, save behavior and unsaved-change handling were untouched.
- Added read-only details for ordinary transactions and transfers. Existing linked records still open their safely resolved parent and never receive generic Edit/Delete. Direct shared action controls recheck the current record and ownership at dispatch time.
- Made accounts separately bordered themed surfaces with icons, type/currency, balance, navigation and independent shared actions. Unified asset category/name/quantity hierarchy, upper-right value and actions beneath it; retained common currency flags and metal symbols.
- Loan metrics now flow into two columns where space permits; remaining principal, counts and due date remain visible. Active loan actions retain their payment/outline/destructive hierarchy. Payment history and deposit distribution use the new collapsed-by-default FinanceDisclosure, with payment count and compact inline actions.
- The existing schema has one receipt destination, not a multi-account distribution ledger. Deposit distribution reveals only the saved receipt amount/date and account/custom method, and preserves confirmation of receipt. No split allocation was invented.
- Introduced a shared themed confirmation hook for home, Accounts, Assets, asset movements, Loans and Debts destructive operations. Original descriptions, account-dependency warnings and mutation validation remain. Cancel and Android Back dismiss without mutation; a captured confirm action is consumed once.

## Payment safety policy

Settled and closed historical payments cannot be edited, including through a stale UI callback, the coordinated edit operation or direct Finance payment updates. Closed loans cannot reverse payments. Settled loans cannot delete earlier historical payments.

The existing explicit settlement reversal is retained: only the payment named by `settlementPaymentId` may be reversed through the validated coordinator. The UI labels this **Reverse settlement** and warns that it reopens the loan, restores outstanding principal and removes the linked account transaction. Existing reversal tests verify lifecycle metadata removal, ledger restoration and principal accounting. Completed-loan corrections retain their already-tested reopening workflow. Terminal loans show no Record payment, Early settlement or Close without payment action.

Reused FinanceActionButtons now also supports safely supported delete-only controls. New shared pieces are FinanceDisclosure, useFinanceConfirmation, useFinancePreferences and loanPaymentPolicy; existing Card/AppText/AppButton, details and financial utilities remain in use.

## Precision investigation

Asset valuation uses the existing decimal-ratio path and stays unrounded through its subtotal and Net Worth; formatting uses deterministic currency-specific half-up rounding. Account/loan/debt subtotal quantization remains exactly as in the baseline.

A focused reproduction demonstrates an expected display discrepancy: two assets of 0.01 USD at 55.4154 EGP/USD are each worth 0.554154 EGP. Each row displays **0.55**; adding those displays gives **1.10**. Their unrounded sum is **1.108308**, so the asset subtotal and Net Worth display **1.11**. Rounding individual rows before aggregation would lose precision and was not introduced.

The original physical Android comparison cannot be uniquely diagnosed without its exact stored components and rates. The reproduction establishes one valid explanation, not proof of that device's inputs. Existing finite JavaScript Number and separate non-crash-atomic AsyncStorage writes remain limitations.

## Verification and remaining device checks

- `npm run test:finance`: **210 passed**, including real component handler trees with native primitives mocked, actual store/coordinator operations, preference storage/rehydration, all-nine ordering, global home masking, disclosures, confirmation Cancel/Back, captured-action ownership checks, settled/closed restrictions and precision. The existing gold/silver/FX, transfers, linked payment, settlement and Rates regression coverage remains.
- `npx tsc --noEmit`: passed.
- `npx expo lint`: executed using SDK-compatible ESLint development dependencies installed through Expo. It reports **39 errors and 14 warnings**. A programmatic comparison against each tracked source file at `717ab36`, using the same ESLint configuration and normalized diagnostic messages, produced the same counts and **no added diagnostics**. Existing issues include state setters in effects/memos, unescaped JSX quotes and unused declarations. They were not suppressed or expanded into unrelated fixes.
- `npx expo export --platform web`: passed. The export occurred before the final small presentation/test follow-ups; final TypeScript/tests cover those follow-ups. Browser visual inspection was attempted but the local preview timed out; no visual pass is claimed.
- Added the standard Expo flat ESLint config and two development dependencies to make lint reproducible. No existing locked package version changed; no runtime dependency was added.

Android UI validation still requires the user: narrow widths and large fonts, light/dark themes and TalkBack, one-eye hide/show/restart, large Total Balance and currency dropdown, card/detail/action independence, transfer details and edit/delete, gold/silver/FX examples, loan metric wrapping, collapsed section toggles, settled/closed restrictions, explicit settlement reversal on disposable data, confirmation Cancel/Back and Rates Save/unsaved close. Automated native mocks do not prove physical layout, emoji glyph availability or durable device storage.

## Deferred scope

Installments remains nonfunctional. Implement property installment contracts and postdated checks separately, with explicit payment/clearance confirmation and exactly-once posting; a due date alone must never deduct a bank account. Multi-destination loan distributions, general reversal/reopening for closed loans and repository-wide lint remediation are separate work.

References consulted: [Expo SDK 58](https://docs.expo.dev/versions/v58.0.0/), [Router](https://docs.expo.dev/versions/v58.0.0/sdk/router/), [AsyncStorage](https://docs.expo.dev/versions/v58.0.0/sdk/async-storage/), [React Native Text](https://reactnative.dev/docs/text).
