# Phase 2B: dormant shared persistence binding

The shared runtime covers `tomorrow:finance`, `tomorrow:ledger` and
`tomorrow:payment-operations`. One runtime/journal owner is cached per backend
object. Journal construction receives the same tracked adapter; competing adapter
ownership is rejected. The journal cannot be independently closed/released while
owned by a runtime; close the owning runtime instead. Runtime modules do not import accounting stores, so no
accounting-store initialization cycle is introduced.

There is deliberately no application caller for `installPaymentRuntimeBeforeStores`.
Normal production store creation returns the original Zustand `persist`
configuration unchanged. The new binding is exercised in isolated sessions using
the actual Finance and Ledger stores, not replacement store implementations.
Installation must precede both stores. Late installation, hot replacement, and
competing bindings are rejected. No bootstrap, journal hydration, posting or replay
is automatically enabled. `postingAllowed` is always false.

In an explicitly bound session, the middleware sits inside Zustand persist and
guards both persisted internal `set` and external `setState`. It also guards
partialize/migration/JSON storage and observes hydration failures. It reserves an
acknowledgement before subscriber notification, so a barrier requested reentrantly
cannot observe an empty adapter queue and report premature success. Per-key writes
are serialized, rejected writes are handled even when callers ignore middleware
promises, and the error remains observable through barriers/status.

Runtime barriers cover the mutation/queued prefix captured at invocation. The
exclusive gate runs submitted jobs in order and awaits outstanding writes before
and after each job. It is a non-reentrant gate: callbacks must not await another
exclusive job or runtime close from inside themselves. Ordinary mutations outside
the gate are tracked but not cross-store-isolated by it; future coordinators must
establish the required domain exclusion policy.

Close fences new mutations/jobs, drains issued writes and current hydration, then
closes the runtime. Queued jobs not yet started are rejected. Mounted stores never
fall back to raw persistence; rebinding requires session teardown and fresh module
initialization. Failed or superseded hydration does not authorize posting. Persist
configuration replacement and direct clearStorage are unsupported in bound mode;
existing guarded domain reset methods preserve generation markers.

## Production activation is BLOCKED

The existing payment coordinator is synchronous: it can report in-memory success
before asynchronous storage rejects. Its snapshot compensation also writes through
setState. A sticky tracked subscriber/serialization failure correctly prevents that
rollback write, changing the old recovery behavior. Actual-store regression tests
demonstrate this incompatibility. It would be unsafe to switch production stores
without changing that coordinator and its callers, which is outside this phase.

Before production activation: implement the awaited coordinator/failure protocol,
safe uncertain-state handling instead of stale-array compensation, coordinated
startup/recovery gates, reserved-ID posting, and async caller handling. Preserve
shared namespace identity across wrappers. Arbitrary raw backend writes, separate
module copies, and multiple JS runtimes are not fenced by an in-process cache.

No accounting formulas, posting/edit/reversal/settlement logic or UI changes are
included. No claim of cross-key atomicity or power-loss durability is made.
