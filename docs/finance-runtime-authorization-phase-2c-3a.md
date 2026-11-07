# Phase 2C-3A: dormant runtime authorization

Only runtime ownership, opaque capabilities, private persistence continuation,
write fencing, forensic reads, and interruption handling are implemented here.
There are no posting plans, payment execution APIs, V3 journal transitions, or
application/UI callers. postingAllowed=false and readiness=blocked remain constant.

## Ownership and capabilities

createCoordinatorRuntimeAccess is an internal infrastructure factory. Explicitly
entering coordinator mode permanently closes public write admission in that bound
session, including before its first lease and between leases. Ordinary bound
sessions that never construct this access retain their existing behavior; unbound
production stores still use the original Zustand persist configuration.

Lease acquisition uses the existing exclusive queue, stops new hydration, drains
accepted hydration/journal work, establishes exclusion, and drains the final write
prefix. Both actual accounting stores must have successfully hydrated. Admission
requires an existing active V3 journal with matching accounting generations and no
unresolved/conflicting operation evidence. Legacy promotion and replay are absent.
This resource-level admission is not first-baseline or posting eligibility; those
domain checks belong to later phases.

Capability records live in a module-private per-runtime WeakMap. Tokens are frozen
empty identities, not serialized credentials. Each binds its runtime/lease owner,
operation, entity, key, stage, and predecessor revision. Wrong identity, binding,
stage, predecessor, reuse, and expired leases reject before state mutation. A
recognized token is consumed before binding/data validation and never restored.
Only one authorized stage may be in flight. Stage names are single-use per lease.
Private stages cannot change the accounting installation generation marker.
Journal stage names have no execution port in 3A.

The private transport takes complete plain accounting data, never an arbitrary
mutation callback. It is not a replacement for domain validation. The future
trusted posting ports must produce validated accounting images; this low-level
transport must not be connected to application callers as a general replacement
store action. Test fixtures exercise it using assets/accounts, not payments.

## Actual Zustand persistence lifecycle

The middleware retains a private reference to persist's setter. A validated stage
uses that setter and a frame tied to the exact frozen next-state identity:

1. Applying: only the expected private raw setter is admitted.
2. Notifying: public setters and adapters remain denied; the capability is spent.
3. Serializing: only persist's private continuation can partialize/enqueue the
   expected image. Caller-controlled accessors, toJSON, functions, custom prototypes,
   nonfinite values, sparse arrays, and cycles are rejected before mutation.
4. Queued: the synchronous frame expires; shared tracked acknowledgement remains.

The public runtime adapter never inherits this frame. getOptions returns a frozen
view with a separately guarded public storage facade, rather than persist's private
adapter. Synchronous subscriber reentry and subscriber microtasks therefore retain
public admission checks. Nested exclusive/snapshot/forensic acquisition is rejected
while a coordinator owns the runtime instead of being awaited recursively.

Private stages reserve the same tracked mutation acknowledgement before notifying
subscribers. Subscriber barriers cannot observe a premature empty persistence queue.
Subscriber, partialize, and storage exceptions retain sticky persistence failures.

## Fences and forensic reads

Authorized stage failure, interruption after a stage begins, explicit unresolved
evidence, or persisted unresolved/conflicting receipts fences Finance, Ledger, and
Journal writes session-wide. Unrelated entities remain fenced because these stores
persist shared documents. There is no fence-reset API.

Store getState/status reads remain available. readForensicSnapshot waits for issued
I/O using the adapter's settle barrier, which does not erase sticky failures, and
reads raw backend bytes. Every document has an explicit error if unreadable. The
report always has coherent=false, readiness=blocked, and postingAllowed=false: it
is not a recovery certificate and cannot reopen writes. It is also available after
close, subject to the external-writer limits below.

Entering coordinator mode on restart closes public writes before inspection. Lease
admission reconstructs a fence from persisted prepared/review/conflicting evidence;
even prepared-unapplied is not resumed. A logical fence by itself is not written to
disk in 3A. Later posting must acknowledge its prepared journal evidence before any
accounting stage; 3A neither supplies nor claims that future durability protocol.

## Close and limits

Close immediately revokes authority, rejects queued stages/leases, and interrupts
the lease independently of the caller's callback. It waits for issued I/O and pending
stage acknowledgements, not for an arbitrary callback to finish. A callback awaiting
close therefore cannot deadlock the new lease path. Any detached continuation has
expired authority and cannot begin another stage. Pre-stage interruption is rejected;
interruption after a stage begins is uncertain, without compensation. The older
general exclusive API remains non-reentrant.

This is an in-process boundary for trusted internal consumers, not a security sandbox
against malicious JavaScript with raw backend access or arbitrary API replacement.
No capability is exposed through state, subscribers, results, or persistence options.
Cooperating namespace ownership is required; another runtime/native writer is not
fenced. Forensic bytes after close may overlap a new owner and are never certified.
An underlying storage promise that never settles can still prevent draining/close.
There is no cross-key atomicity or power-loss durability claim.

Actual-store tests cover synchronous/microtask reentry, cross-store and public
adapter attempts, identity/binding misuse, serialization hooks, private predecessor
checks, sticky failures, hydration, acquisition drains, close boundaries, forensic
reads, and restart admission. Device-level interruption and later posting stages
remain unimplemented. Phase 2C-3B and Phase 2C-4 have not been started.
