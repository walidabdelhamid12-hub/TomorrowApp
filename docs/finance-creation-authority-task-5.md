# Task 5: denial-only creation authority boundary

The internal coordinator access can check a creation-authority request under the
existing exclusive lease. It captures a detached immutable V1 binding and requires
both stores hydrated, an existing active V3 journal, matching persisted generations,
verified accounting admission, and no retained identity collision. Close, fences,
sticky failures, and expired lease ownership retain the existing runtime rules.

Every request rejects. In particular, absent records and a matching generation do
not prove fresh creation. There is no private entity-allocation witness or issuer
in the current runtime. Public addDebt/addLoan actions remain uncertified. Caller
attestations, candidate dispositions, timestamps, hydration, and empty payment arrays
cannot supply the missing witness. No issuance capability is created or exposed.

This implements the explicitly permitted fail-closed Task 5 fallback, not positive
trusted issuance. Tests may inspect pre-existing V3 fixture bytes to prove denial;
they do not activate/promote a journal or exercise a successful issuance path.
Positive issuance needs a separately approved internal fresh-allocation boundary
and a supported verified V3 installation lifecycle. No activation, migration,
asynchronous creation service, or attestation persistence is implemented here.

No newly issued evidence is persisted, no storage acknowledgement is certified,
and postingAllowed=false remains enforced. Record absence and local metadata are
not cryptographic proof against replacement, deletion, restore, or external writers.
