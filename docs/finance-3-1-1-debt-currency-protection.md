# Finance 3.1.1 — Debt currency protection

Debt currency changes are rejected when payment history or explicit ledger ownership
exists, including legacy/orphan links with empty payment arrays. A currency change
also requires hydrated Finance and ledger data. Rejection leaves the entire update
unapplied; same-currency detail edits remain available. Empty, unlinked debts may
still change currency. The editor disables currency choices for known protected
records and keeps the form open with an explanation if saving is rejected.

No accounting migration or Instruments code/data changes are included.

## Deferred testing checklist

- [ ] Android visual tests — deferred to the dedicated visual testing round.
- [ ] Instruments practical tests — deferred to a dedicated testing round.
  Status: **Implemented / Testing Deferred** applies only to confirmed existing
  instrument-related domain types and store operations. A complete Instruments
  workflow has not been verified in this round. Preserve all existing functionality
  and data; do not infer completion or verification of the section as a whole.
