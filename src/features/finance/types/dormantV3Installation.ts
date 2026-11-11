import { readRecoveryJournalV3, requireEvidence } from './paymentRecovery';

/**
 * Pure validation of an empty V3 installation metadata transition.
 * Supplied states are data, not evidence of storage acknowledgement, exclusive
 * ownership or matching accounting markers. No writer or activation authority.
 */
export function readDormantV3InstallationTransition(previous: unknown, next: unknown) {
  const before = readRecoveryJournalV3(previous);
  const after = readRecoveryJournalV3(next);
  requireEvidence(before.baselines.length === 0 && before.receipts.length === 0
    && after.baselines.length === 0 && after.receipts.length === 0,
  'Installation transitions require an empty V3 journal; history requires separate review.');
  const initial = before.installation;
  const proposed = after.installation;
  requireEvidence(proposed, 'Installation metadata cannot be removed or omitted.');
  if (!initial) {
    requireEvidence(proposed.phase === 'initializing', 'Installation must be initialized first.');
  } else {
    requireEvidence(initial.generationId === proposed.generationId, 'Journal generation cannot change.');
    requireEvidence(initial.phase !== 'active' || proposed.phase === 'active', 'Installation phase cannot regress.');
  }
  return Object.freeze({
    journal: after,
    postingAllowed: false as const,
    readiness: 'blocked' as const,
    installationAuthorized: false as const,
  });
}
