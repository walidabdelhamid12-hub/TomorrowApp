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

## Review hardening

Account deletion now fails when the account has dependent transfers, protected
transactions, or explicit loan/debt account references. Both account deletion UI
paths display rejection. The Finance loan screen has no delete-loan action; direct
store deletion now rejects historical, received, or ledger-referenced loans.
Debt deletion also checks the current ledger and rejects explicit debt-ID
references even when the legacy payment array is empty or transaction ownership
metadata is incomplete/conflicting. It returns a result that the debt UI checks
again after confirmation. Missing/unhydrated ledger data and duplicate debt IDs
fail closed; a truly empty, unlinked debt can still be deleted. No relationship
is inferred from matching amounts, dates, or notes.
Ledger clear/reset rejects transfers, loans/debts, and protected transactions;
Finance reset rejects existing loans/debts and protected ledger transactions.
These operations fail closed until both stores are hydrated. A lazy registered
ledger reader avoids a circular store import in Finance's deletion guards.

Generic transaction creation rejects linked ownership and payment purposes.
Dedicated `addPaymentTransaction` accepts only explicit payment IDs and a category;
it derives account, cash amount, direction, date, and ownership from a unique
existing unlinked payment. Receipt posting validates the current unconfirmed loan
and derives its ownership and direction. The shared raw creation helper is private
to the ledger store; there is no caller-controlled generic bypass flag.

Dedicated loan editing rejects split/legacy payments (including retained component
fields) rather than converting their accounting semantics. Valid single-entry
reversal remains supported. Custom payments are blocked by incomplete/conflicting
explicit loan ownership or matching payment IDs; an independently verified receipt
is allowed alongside a custom repayment. No ambiguous record is relinked.

This PR does not declare the overall Finance 3.1 milestone complete. Transfer
editing behavior, asset valuation, currency policy, and total/net-worth presentation
still require their separate review and verification. Crash-atomic persistence and
native UI/device verification remain outstanding as described above.
