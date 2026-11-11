# Phase 2A: inactive installation metadata infrastructure

Finance and Ledger retain persistence envelope version 2. Their optional
`paymentJournal: { schemaVersion: 1, generationId }` field is validated and retained
by migration, partialize and reset. Legacy records are not assigned operation IDs.
Keeping the envelope version avoids an automatic rewrite of all existing v2 data.
Unsupported future migration versions and malformed marker objects fail hydration.

Journal envelope version 2 adds optional `installation` metadata with the same
marker and an `initializing`/`active` phase. Valid v1 journals load without a
migration write; the next explicit journal write uses v2. Nonempty uninstalled v1
or v2 journals cannot bootstrap automatically. Invalid/unsupported documents are
never filtered, reset or overwritten by the installation controller.

`createPaymentInstallationRecovery` is explicit and has no application caller.
There is no production Finance/Ledger writer binding in this phase. Tests supply
ports backed by real Zustand persistence and a shared tracked adapter. A future
production binding must wrap the accounting-store mutations and await that same
adapter's barriers; it must not write raw snapshots around the live store owners.
The explicit `sharedPersistenceReady` gate must verify that integration before
bootstrap is allowed. It is an injected contract, not automatic proof of a driver.

Bootstrap writes, awaiting each acknowledgement:

1. Journal `initializing` with a newly reserved generation.
2. Finance marker, followed by a persisted readback.
3. Ledger marker, followed by a persisted readback.
4. Recheck all persisted generations; journal `active`; final metadata check.

A failure blocks that controller. An interrupted initialization remains blocked
after restart; Phase 2A does not automatically resume it or reconstruct payments.
If activation reached disk but its acknowledgement failed, a fresh owner/controller
may recognize matching active persisted metadata. The failed session still fails.

The readiness checker rereads journal bytes as well as both accounting documents.
Missing journal metadata with either accounting marker means deletion/inconsistency,
not legacy installation. Generation mismatches, unreadable/unsupported data,
malformed historical record containers and unresolved operation receipts block.

`metadata-ready` is deliberately not permission to post: every result includes
`postingAllowed: false`. Completed operation receipts still require later accounting
link verification. Posting, editing, reversal, settlement, UI and startup behavior
are not integrated or activated here.

Remaining dependencies: one shared tracked production writer and lifecycle owner,
exclusive bootstrap execution relative to other writers, explicit inspection and
resolution of interrupted installation, linked-record recovery verification,
reserved-ID posting and caller operation identities. Deleting/restoring all three
documents together cannot be distinguished from an uninstalled legacy app without
an external anchor. Readback and acknowledgements are not cross-key atomicity or
power-loss durability guarantees.
