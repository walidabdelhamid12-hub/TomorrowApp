/** S3-A: read-only classification of persisted journal envelope. Not a content validator or posting authority. */
export type JournalVersionClassification =
  | Readonly<{ kind: 'missing' }>
  | Readonly<{ kind: 'legacy'; version: 1 | 2 }>
  | Readonly<{ kind: 'v3'; version: 3 }>
  | Readonly<{ kind: 'blocked'; reason: 'invalid-json' | 'invalid-envelope' | 'unsupported-version' }>;

export function classifyPaymentJournalVersion(raw: string | null): JournalVersionClassification {
  if (raw === null) return { kind: 'missing' };
  let value: unknown;
  try { value = JSON.parse(raw); }
  catch { return { kind: 'blocked', reason: 'invalid-json' }; }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return { kind: 'blocked', reason: 'invalid-envelope' };
  }
  const envelope = value as Record<string, unknown>;
  if (!Object.hasOwn(envelope, 'version') || !Object.hasOwn(envelope, 'state') ||
      Object.keys(envelope).some(key => key !== 'version' && key !== 'state') ||
      envelope.state === null || typeof envelope.state !== 'object' || Array.isArray(envelope.state)) {
    return { kind: 'blocked', reason: 'invalid-envelope' };
  }
  if (envelope.version === 1 || envelope.version === 2) return { kind: 'legacy', version: envelope.version };
  if (envelope.version === 3) return { kind: 'v3', version: 3 };
  return { kind: 'blocked', reason: 'unsupported-version' };
}
