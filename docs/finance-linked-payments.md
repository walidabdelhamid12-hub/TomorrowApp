# Finance 3.1: linked payment protection

Generic `updateTransaction`, `removeTransaction`, and refund creation enforce the
loan/debt transaction lock in the ledger store. They inspect payment purposes,
ownership metadata, and exact reverse references from the Finance store. Both
stores must finish hydration before generic edit/delete/refund operations.

Dedicated screens use `paymentOperations.ts` for posting, editing, reversing, and
confirming loan receipts. These operations validate current ownership, amount,
currency, account, date, and payment limits. They reuse Finance store validation
and the existing account-balance and remaining-contract formulas. Loan cash
payments include late fees; fees do not reduce the contract balance. Reversing
early settlement reopens the loan and removes its settlement metadata.

Legacy records are never linked by matching notes, names, amounts, or dates.
An exact reverse reference, or one unique complete entity/payment tuple, is
required for a dedicated ledger mutation. Conflicting references, duplicate
ownership, purpose-only records, and unsupported split ledger entries remain
protected and unchanged. Unique tuple recovery occurs only during an explicit
dedicated edit; hydration and opening a form do not relink records. Custom loan
payments require an explicit custom-method label and no account/link evidence.

## Runtime rollback and persistence limitation

Operations are synchronous and retain the previous immutable loan/debt arrays and
ledger transactions. A rejected store action or thrown runtime exception restores
both snapshots, including fields that were originally absent. A rollback exception
is reported explicitly rather than being presented as success.

**This is not crash-atomic persistence.** Zustand persists `tomorrow:finance` and
`tomorrow:ledger` separately through AsyncStorage. Process termination, power loss,
or asynchronous storage failure between writes can still leave partial disk state,
including during compensation. There is no journal or automatic repair in this
change. A durable single transaction/journal would require separate storage work;
do not infer links to repair ambiguous saved records.

## Verification

- `npm run test:finance`: Node's built-in test runner loads the actual TypeScript
  stores using the existing TypeScript dependency. Only native AsyncStorage is
  replaced by an in-memory adapter. No packages are installed.
- `node_modules/.bin/tsc --noEmit --incremental false`: project typecheck.
- Lint requires ESLint/configuration that this project does not currently have.
  Do not run Expo's automatic lint setup as part of these checks.

Tests cover generic mutation/refund blocking, dedicated loan/debt edits and
reversals, contractual versus cash amounts, settlement lifecycle, legacy links,
stale ownership, rehydration, and injected runtime failures. Native UI interaction
and real-device storage failure/crash recovery are not covered by this runner.

Account deletion/reset paths, transfer behavior, asset valuation, currency policy,
and total/net-worth presentation are outside this fix.
