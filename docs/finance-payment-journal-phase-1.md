# Dormant payment journal: Phase 1 integration contract

The journal is not connected to Finance/Ledger accounting, posting, reversals or
screens. It supplies immutable request receipts and storage acknowledgements;
`completed` is a caller-provided assertion, not independent ledger verification.

Journal transitions register their promise before notifying subscribers. Reentrant
delivery shares that promise; transitions are serialized, and each returns its
own acknowledged snapshot. A failed write blocks the owner, including retries.

Factory callers using the same backend object share one owner. Wrappers for the
same physical storage namespace must pass the same `ownerIdentity` object. The
default AsyncStorage backend shares its identity automatically. Await `close()`
before constructing a fresh owner for inspected recovery: closing rejects new
work, drains accepted work and persistence, and fences the old owner. Closing
does not clear disk, repair receipts, or make a blocked operation successful.

The storage adapter's `runMutation(key, callback)` must wrap each synchronous
Zustand mutation during integration. Subscribers, `partialize`, and serialization
may throw before `setItem` is queued. Such failures poison subsequent barriers
and writes. After a successful mutation, callers still must await `flush(key)`.
The raw adapter cannot observe unwrapped mutation errors or asynchronous domain
callbacks; do not interpret an empty barrier as proof that an action succeeded.

Remaining integration gates:

- Share one owner/namespace identity and tracked adapter across all writers.
  Arbitrary wrappers with different identities, module reloads and multiple JS
  runtimes/processes cannot be automatically identified or fenced by this cache.
- Integrate guarded mutations, reserved IDs, explicit cross-key ordering and
  coordinator verification before marking a journal operation completed.
- Add startup recovery gating, reversal tombstones and UI operation identities;
  hydration readiness alone never authorizes payment posting.
- A missing key still cannot distinguish first installation from deletion of a
  previously populated journal. Resolve that during recovery integration.

Acknowledgement means the storage API resolved. Neither per-key ordering nor
these receipts establish cross-key atomicity or power-loss durability. No
production duplicate-payment protection is enabled by Phase 1.
