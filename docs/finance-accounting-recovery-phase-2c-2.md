# Phase 2C-2: dormant accounting recovery verification

This phase implements schemas, pure verification, scoped findings, and a dormant
persisted snapshot lease. It does not implement posting, editing, reversal, repair,
relinking, or startup integration. Every recovery result has postingAllowed=false
and readiness=blocked, even when individual operations verify.

## Persisted contracts

Journal envelope V3 contains immutable entity baselines and receipts with exact
payment/transaction deltas. Receipts identify the generation, baseline, entity
revision predecessor, original posting operation, and payment predecessor for
edits/reversals. Existing V1/V2 receipts retain their original format and reader.
The existing V2 journal writer does not accept V3. There is no V3 writer or
automatic migration in this phase; edit/reversal chains are tested as fixtures.

Finance and Ledger keep their existing envelope versions. Optional
paymentAccounting schemaVersion=1 contains entityHeads, each with an explicit
entity tuple, revision number, and operation ID. Partialize, migration, and guarded
resets preserve that metadata. No historical record receives invented metadata.

Expected images are derived in memory from a baseline and exact deltas. This
projection never executes store actions. Missing baselines, forked/skipped heads,
wrong predecessors, unresolved predecessors, funding conflicts, incorrect cash,
fees, contractual totals, settlement, and lifecycle changes fail closed. Terms
and proceeds cannot change through a payment delta. Nontarget payments are retained.
Payment array order has no accounting meaning; field presence does.

Completed current operations require exact Finance and Ledger images and both
revision heads. Completed reversal tombstones additionally require the exact
remaining parent image and absence of target records. Earlier completed receipts
verify only as superseded transitions in a verified current chain. Their past
physical persistence or receipt acknowledgement cannot be reconstructed.

Prepared operations classify as unapplied, partial, or accounting-matches. None
authorizes completion or retry. A sticky failure blocks the failing runtime even
if bytes reached storage. A fresh runtime may independently inspect those bytes;
a prepared receipt is never promoted to completed by verification.

Legacy receipts and baseline historical payments remain needs-review evidence.
They are not assigned operation provenance. Invalid document structure, generation
conflicts, duplicate ownership, and orphan accounting heads block globally. Valid
but insufficient entity evidence produces scoped findings. Unrelated entities may
verify, but aggregate readiness remains blocked. No result authorizes mutation of
shared accounts or resolves a legacy relationship.

## Explicit entry points

- verifyPersistedPaymentAccounting checks supplied persisted bytes purely. Its
  caller must establish snapshot provenance; arbitrary supplied bytes do not prove
  that they came from a coherent read.
- verifyPaymentAccountingRecovery(runtime) acquires the dormant bound-runtime
  snapshot lease and returns read-only findings.
- createPaymentInstallationRecovery(...).verifyAccounting() invokes that path
  only with an explicitly supplied accountingRuntime owning the same journal.
  The existing check() remains metadata-only and is not accounting readiness.

No application caller activates these paths automatically.

## Snapshot protection

In explicitly bound sessions only, the raw setter below Zustand persist guards
hydration application, domain setters, and exposed setState before mutation.
Accounting state trees, including roots, initial state, hydrated data, and supplied
children, are frozen before subscriber notification. Hydration admission is closed
while existing hydration drains. Accepted journal work and tracked writes drain
before a write-free lease reads all three keys twice and compares bytes.

Tracked persistence entry points, journal transitions, public rehydration, and
setters reject interference while the lease is reading. Rejected admission does
not itself poison persistence; it increments interference and invalidates that
snapshot. Subscriber/serialization/storage failures retain the existing sticky
failure behavior. The lease is released without writing in both success and failure.

The unbound production middleware remains the original persist configuration.
The synchronous legacy coordinator is not called inside the lease and is not
activated with the dormant binding by this phase.

## Limits and later phases

The guarantee is a point-in-time snapshot within a single cooperating runtime.
Raw backend references, another JS runtime/module owner, native/external storage
writes, and arbitrary API replacement cannot be fenced by Zustand middleware.
Such writers are unsupported; unknown namespace ownership cannot be certified.
Equal readbacks alone do not prove exclusion against an uncontrolled writer.

An unlinked ordinary transaction cannot be attributed to a custom payment by
matching amount/date/note. Absence of explicit ownership is not historical proof
that an unrelated cash entry was never created. Frozen-reference mutation attempts
cannot change state; setter/storage/hydration interference is explicitly counted.

There is no cross-key atomicity or power-loss durability claim. Device-level crash
testing and storage-size/performance measurements remain outstanding. Journal
storage is linear in baseline size plus deltas, but the current document-based
adapter still serializes the whole journal and projection retains intermediate
images in memory. Compaction and a different backend are outside this phase.

Phase 2C-3 owns the async posting coordinator and acknowledged revision writes.
Phase 2C-4 owns journal-aware editing, reversal, tombstone transitions, and UI.
Non-payment loan accounting changes and manual review resolution need separate
contracts before production activation. Posting remains disabled throughout.
