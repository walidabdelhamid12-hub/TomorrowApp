# Finance 8.3C — Android acceptance (manual, non-destructive)

This task adds **verified opening-balance dates** to Accounts Report. It must not change balances, transfers, transaction history, journal posting, or loan/debt history.

## Before testing

- Use a **separate Git worktree** for the review branch; do not checkout the review branch over the user's existing working directory or delete any untracked files.
- Keep the original development branch and `main` untouched.
- Prefer a fresh test account with non-sensitive amounts. Record existing balances and transaction counts before testing.
- Automated TypeScript and Finance tests are necessary but do **not** establish Android persistence.

## Acceptance sequence

1. Open an existing account without `openingBalanceDate`. Accounts Report must say historical data is unavailable, not show fabricated zeroes or use `createdAt`.
2. In Account Details, enter a real date in YYYY-MM-DD. Confirm the dialog. Verify that the account details show `Verified: YYYY-MM-DD` and Accounts Report shows a reconciled opening/closing balance.
3. Fully close and restart Expo Go/app, return to Account Details and Accounts Report, and verify the date and report still agree. Repeat after a second restart.
4. Create a fresh account without a date. Confirm report remains unavailable until explicitly verified. Create a second account with an optional date and explicit confirmation; confirm it persists.
5. Try invalid date `2026-02-30`: it must be rejected. Cancel the confirmation dialog: date must remain unverified.
6. Rename a verified account: verified date must remain. Change its starting balance: warning must appear; cancel must preserve the previous balance/date; continue must clear the verified date.
7. Add a transaction dated **before** the verified date to a test account: report must become unavailable without modifying the transaction or account balance. A transaction on the exact verified date must count.
8. Verify archived account and negative credit-card opening balance; test transfer legs and light/dark appearance.
9. Compare the saved balances and transaction/transfer counts before and after the test. No automatic postings or repairs are allowed.

## Stop conditions

Stop and report any crash, unexpected balance/transaction change, loss of data after restart, inaccurate available report, or unexpected modification to an existing account. Do not merge the draft PR before review and device acceptance.
