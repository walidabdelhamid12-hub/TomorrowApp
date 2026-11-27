import { acknowledgedFinanceHandler } from './acknowledgedFinanceHandler';
import type { Account, NewAccountInput } from '../types/ledger';

export type FormSaveResult = string | boolean | null;
/** A patch's explicit undefined keys can mean clear, not omit. Retain that distinction in the durable request. */
export function formPayload(kind: string, targetId: string | null, data: object, extra: object = {}) {
  return { kind, targetId, data, clearFields: Object.entries(data).filter(([, value]) => value === undefined).map(([key]) => key).sort(), extra };
}
/** Validation happens before admission. UI completion is replay-safe, not an accounting mutation. */
export function submitFinanceForm(scope: string, payload: unknown, mutate: (operationId: string) => FormSaveResult,
  onSuccess: (result: string | true) => void, onRejected: () => void): unknown {
  return acknowledgedFinanceHandler(scope, () => undefined, {
    payload, mutate,
    onCommitted: result => {
      if (result === true || (typeof result === 'string' && result.length > 0)) onSuccess(result);
      else onRejected();
    },
  })();
}

type AccountPort = {
  accounts: readonly Account[];
  addAccount(input: NewAccountInput, openingDate?: string): string;
  updateAccount(id: string, patch: NewAccountInput): void;
};
/** The store edit API returns void, including on rejection. Verify its postcondition before acknowledging. */
export function applyAccountForm(read: () => AccountPort, targetId: string | null,
  input: NewAccountInput, openingDate?: string, expectedUpdatedAt?: string): FormSaveResult {
  if (targetId === null) return read().addAccount(input, openingDate) || null;
  const before = read().accounts.filter(account => account.id === targetId);
  if (before.length !== 1 || before[0].updatedAt !== expectedUpdatedAt) return false;
  // Currency changes may be silently refused by the existing store when history exists.
  // An apparent success must never close the form unless all requested fields agree.
  read().updateAccount(targetId, input);
  const after = read().accounts.filter(account => account.id === targetId);
  if (after.length !== 1 || !Object.entries(input).every(([key, value]) => (after[0] as unknown as Record<string, unknown>)[key] === value)) {
    // The coordinator restores both in-memory snapshots and fences uncertain writes.
    throw new Error('Account change was not fully accepted; review the existing account.');
  }
  return true;
}

/** Reject stale and duplicate targets inside the admitted synchronous callback. */
export function matchesUniqueRevision(records: readonly {id: string; updatedAt: string}[], id: string, revision: string): boolean {
  const matches = records.filter(record => record.id === id);
  return matches.length === 1 && matches[0].updatedAt === revision;
}
