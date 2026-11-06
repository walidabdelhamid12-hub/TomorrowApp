/** S3-C read-only admission policy. No persistence writes or posting authorization. */
export type AdmissionEvidence = Readonly<{
  journalVersion: 'missing' | 'legacy' | 'v3' | 'blocked';
  recoveryInstallation: 'legacy' | 'consistent' | 'blocked';
  recoveryIssueCount: number;
  recoveryFindingCount: number;
  financePresent: boolean;
  ledgerPresent: boolean;
  financeHistoryEmpty: boolean;
  ledgerHistoryEmpty: boolean;
  writeQueueDrained: boolean;
  storageHealthy: boolean;
  exclusiveMutationGateHeld: boolean;
}>;
export type InstallationAdmission = Readonly<{
  status: 'denied' | 'preflight-candidate';
  reason: string;
  postingAllowed: false;
  readiness: 'blocked';
  installationAuthorized: false;
}>;
const deny = (reason: string): InstallationAdmission => Object.freeze({
  status: 'denied', reason, postingAllowed: false, readiness: 'blocked', installationAuthorized: false,
});
export function inspectInstallationAdmission(e: AdmissionEvidence): InstallationAdmission {
  if (e.journalVersion === 'blocked') return deny('Malformed or unsupported journal.');
  if (e.journalVersion === 'v3') return deny('Existing V3 requires recovery review, not reinstall.');
  if (e.recoveryInstallation !== 'legacy') return deny('Recovery is not clean legacy.');
  if (!Number.isSafeInteger(e.recoveryIssueCount) || e.recoveryIssueCount !== 0 ||
      !Number.isSafeInteger(e.recoveryFindingCount) || e.recoveryFindingCount !== 0) {
    return deny('Unresolved recovery findings or invalid counts.');
  }
  if (e.financePresent !== true || e.ledgerPresent !== true) return deny('Accounting document missing.');
  if (e.financeHistoryEmpty !== true || e.ledgerHistoryEmpty !== true) return deny('Historical accounting data needs separate review.');
  if (e.writeQueueDrained !== true || e.storageHealthy !== true) return deny('Persistence not confirmed idle and healthy.');
  if (e.exclusiveMutationGateHeld !== true) return deny('Exclusive mutation gate not held.');
  return Object.freeze({ status: 'preflight-candidate',
    reason: 'Read-only prerequisites observed; installation is NOT authorized.',
    postingAllowed: false, readiness: 'blocked', installationAuthorized: false });
}
