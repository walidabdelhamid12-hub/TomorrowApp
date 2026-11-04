# Finance 3.1 consolidated Android follow-up

## Monetary display and price transparency

Verified source problem: formatAmount delegated decimal rounding to native
Number.toLocaleString/Intl; Node tests exercised Node's implementation, not Hermes.
formatMoney already delegated to it. The complete AssetsScreen and AssetRow paths
now use integer decimal half-up rounding, grouping and currency precision without
Intl/toFixed or binary multiply-and-round. Decimal ties round away from zero;
displayed zero has no minus sign. Existing unquantized asset valuation inputs and
ratios are preserved. Asset subtotal and Net Worth no longer introduce three-decimal
presentation rounding before currency display. Ledger/account balance rounding
and shared conversion/posting behavior are unchanged.

The reported physical Android failure was not reproduced on a connected device in
this session. Native Intl behavior, an old Expo bundle, or different device inputs
cannot be distinguished remotely. The runtime-dependent formatter is removed;
actual AssetsScreen tests run with native locale formatting made to throw and
assert 2g 21K at 7002.58 => 12,254.52 EGP. A small 0.002g asset remains 12.25 EGP
through asset subtotal and Net Worth (no 12.26 double rounding).

Verified silver source/display mismatch: Rates used toFixed(2) to populate its
editable metal fields; liveRates retains more precise USD-per-ounce converted to
EGP-per-gram values. A canonical 88.925 displays approximately 88.93 but 10g is
889.25, not 889.30. No production device storage was read, so 88.925 is a tested
explanation, not a claim about the user's exact saved value. Rates now exposes the
full Number price in its selected currency; it never silently snaps existing
prices to two decimals. Unchanged Save preserves canonical source prices. Assets
movement details also show full EGP reference prices and their pricing basis.
Gold is explicitly 24K per 1 gram; silver is per 1 gram with purity unspecified
because the source does not supply a grade. Changing a price still requires Save;
Save remains open, close only closes Rates, and unsaved close requires confirmation.

Rates and Assets share AssetTypeIcon for the original Rates symbols (gold medal,
silver medal). Currency flags/codes use the same CURRENCIES/getCurrencyFlag source.
No substitute bullion font, dependencies, or category changes are introduced.

## Approved principal policy

User-approved policy: simple repayment principal reduction = repayment amount ×
actual original principal / contractual total. Actual confirmed receivedAmount
wins over principalAmount when present; the latter is the legacy fallback. Late
fees do not reduce principal or contractual repayment balances. Explicit valid
legacy split principal allocations are retained; missing/conflicting allocations
are unknown rather than guessed. No interest percentage is required or derived.
Terminal settled/completed/closed records have zero outstanding principal;
closed-without-payment remains the existing explicit closure workflow, not an
account posting. Unconfirmed receipts do not enter loan liabilities.

Example: 100,000 principal / 120,000 contract, repayment 12,000 => remaining
principal 90,000 and remaining contractual payments 108,000. Net Worth deducts
90,000; the future contractual obligation is separate. The Finance card displays
Total Balance (accounts + assets), Net Worth, and future contractual payments
separately, with the existing privacy toggle. Missing principal or FX
marks the summary incomplete instead of treating the full contract as principal.
No stored loan/payment fields are migrated or rewritten. A lender allocation
schedule may differ from this app policy; explicit legacy allocations win.

Remaining installment count is an equivalent count (ceil remaining contract /
installment), not the number of payment records. Partial records no longer each
consume a full scheduled installment in date/count helpers. No due-date process
posts account transactions. Existing dedicated receipt/payment/settlement/edit/
reversal operations and all ownership guards remain intact.

Early settlement defaults to remaining contractual balance, explicitly described
as NOT a lender settlement quote. User controls the actual amount; existing store
validation and coordinated posting/reversal remain unchanged. Fees are separately
added to confirmed cash deduction. No real loan was paid or settled during tests.

## UI and navigation

Read-only FinanceDetailsModal is reused without adding routes. Accounts show
information, initial/current balance, dates and ordered transaction/transfer history.
Loans show original/remaining principal, contract balances, installment information,
status/dates and payment/fee history. Debts show direction/person, original and
outstanding balances, dates and collections/payments. Selection resolves unique
IDs from current stores, never matches amounts/notes. Back dismisses only the
modal; no mutation callback enters it. Existing debt expansion/payment controls
and loan/debt dedicated workflows are preserved. Asset body/chevron still opens
Movements. Action buttons remain separate sibling targets.

Shared green Edit/red Delete colored visuals are now 30 dp high (about 63% of
previous 48 dp), with reduced icons/padding and visible labels, inside separate
48 dp targets. Actions align bottom-right and wrap for font scaling; modal-menu
usage remains appropriate. Loan metrics stack and history wraps rather than
forcing multiple large amounts across one row. Receive/repay/settle/close actions
retain handlers and confirmations, with distinct semantic icons/styles.

Finance shortcuts expose one Debts entry. Receivable/Payable remain horizontal
tabs on the same existing screen. Horizontal-dominant gestures change the same
active-tab state; vertical scrolling and ordinary taps do not select a tab.

## Verification limits and physical checklist

Automated tests execute real TS utilities/stores/components with mocked native
surfaces/AsyncStorage. They do not measure Yoga, verify emoji rendering on a
physical phone, establish real storage durability, or prove a running Expo bundle
contains this commit. Separate AsyncStorage writes remain non-crash-atomic.
No ESLint installation/configuration was performed; ESLint is absent locally.

Android Expo Go checklist (use isolated test data, never a real settlement):
1. Confirm the current branch bundle/commit after reload; gold 7002.58, 2g 21K
   displays 12,254.52 on asset list, summary and Net Worth; Movements shows its full reference price;
   0.002g displays 12.25. Check EGP 2dp and OMR/KWD 3dp, positive/negative ties.
2. Inspect the full stored silver reference in Rates: 88.925 × 10g => 889.25;
   intentionally saved 88.93 × 10g => 889.30. Do not change existing prices just
   to match a rounded preview. Verify USD 10 × 55.4154 => 554.15 EGP.
3. Verify gold/silver Rates symbols match Assets/Movements; USD/EUR/GBP flags and
   three-letter codes render in light/dark themes without missing glyphs.
4. At 320/360 dp and large system font/display scaling, check full names, currencies,
   large amounts, button wrapping/visual size and TalkBack labels/focus. Check
   independent Edit/Delete vs body taps; Delete Cancel must preserve each record.
5. Open account details from both lists; confirm ordered transactions/transfers,
   correct balances/dates, privacy masking, Android Back and originating-list return.
6. Open loan/debt details, verify exact selected record/history/dates and Back.
   Confirm one Debts shortcut, horizontal tabs, left/right swipes, vertical scrolling
   and linked-transaction focused navigation without unrelated record selection.
7. On disposable loans, verify 100000/120000 with partial payments and fees;
   principal/contractual obligations stay distinct, Net Worth uses principal,
   multiple currencies convert, missing allocation warns, and due dates never
   move money. Verify no interest field is required.
8. On disposable loans only: settlement default explanation/prefill, amount edit,
   source-account choice, fees/date/note, Cancel/back no posting, confirmation one
   deduction, duplicate rejection, safe edit/reversal and restored principal/status.
9. Verify ordinary transaction and transfer create/edit/delete; combined same-currency
   transfer total stays constant. Protected loan/debt rows remain uneditable from
   generic controls; dedicated operations still work.
10. Gold/silver/FX Movements: Edit prefills, Cancel preserves history, Delete confirms.
    Close/reopen Expo Go and check all existing records, flags, rates and history;
    include light/dark and Finance amount-privacy toggles.

PR #1 stays open for review; no main merge and no Finance 3.2 work.

## Automated delivery checks

198 Finance tests pass: 91 linked-payment/store cases, 35 Transactions/navigation,
41 valuation/formatting/summary cases and 31 Assets/Rates/details/action cases.
TypeScript noEmit and git diff checks pass. Device verification remains pending.
No store implementation, schema, migration, dependency, or user storage was changed.

Changed implementation paths: utils/amountFormat.ts, utils/assetDecimal.ts,
utils/finance.ts, hooks/useFinanceSummary.ts; utils/detailLines.ts;
components/FinanceDetailsModal.tsx, AccountDetails.tsx, AccountsSection.tsx,
FinanceActionButtons.tsx, AssetCard.tsx, AssetEntriesModal.tsx, AssetTypeIcon.tsx,
RatesModal.tsx, FinanceNetworks.tsx, TotalCard.tsx; screens/FinanceHomeScreen.tsx;
src/app/finance/accounts.tsx, loans.tsx, debts.tsx. Three Finance test files and
asset-valuation documentation were updated. Finance paths above are under
src/features/finance unless explicitly prefixed with src/app.
