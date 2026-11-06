/** S3-B: pure observation classification; not a storage writer or posting authority. */
export type PersistenceAck =
  | Readonly<{ kind: 'rejected'; stage: 'preflight'; reason: string }>
  | Readonly<{ kind: 'uncertain'; stage: 'write' | 'readback'; reason: string }>
  | Readonly<{ kind: 'conflict'; stage: 'readback'; reason: string }>
  | Readonly<{ kind: 'readback-verified'; key: string; generationId: string }>;

export type PersistenceObservation = Readonly<{
  key: string;
  generationId: string;
  writeIssued: boolean;
  writeAcknowledged: boolean;
  readbackAcknowledged: boolean;
  expectedRaw: string;
  actualRaw?: string | null;
  error?: string;
}>;

/** Byte equality is only an API-level observation; not a durability or cross-document certificate. */
export function classifyPersistenceAck(o: PersistenceObservation): PersistenceAck {
  if (o.writeIssued !== true) return { kind: 'rejected', stage: 'preflight', reason: o.error ?? 'Write not issued.' };
  if (o.writeAcknowledged !== true) return { kind: 'uncertain', stage: 'write', reason: o.error ?? 'Write acknowledgement missing.' };
  if (o.readbackAcknowledged !== true || typeof o.actualRaw !== 'string') {
    return { kind: 'uncertain', stage: 'readback', reason: o.error ?? 'Read-back acknowledgement missing.' };
  }
  if (o.actualRaw !== o.expectedRaw) {
    return { kind: 'conflict', stage: 'readback', reason: 'Persisted bytes differ from expected bytes.' };
  }
  if (typeof o.key !== 'string' || !o.key.trim() || typeof o.generationId !== 'string' || !o.generationId.trim() || typeof o.expectedRaw !== 'string') {
    return { kind: 'conflict', stage: 'readback', reason: 'Missing persistence identity.' };
  }
  return { kind: 'readback-verified', key: o.key, generationId: o.generationId };
}
