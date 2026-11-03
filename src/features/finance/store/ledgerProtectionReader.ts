import type { LedgerData } from '@/features/finance/types/ledger';

type ProtectionSnapshot = Pick<LedgerData, 'transactions' | 'transfers'> & { hydrated: boolean };
let reader: (() => ProtectionSnapshot) | undefined;

// A lazy reader keeps Finance's deletion guards independent of ledger initialization.
// Missing/unhydrated ledger state must fail closed, never mean "no dependencies".
export function registerLedgerProtectionReader(value: () => ProtectionSnapshot) { reader = value; }
export function readLedgerProtection(): ProtectionSnapshot | undefined { return reader?.(); }
