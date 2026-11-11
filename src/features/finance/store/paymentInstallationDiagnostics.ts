import type { PaymentOperationRuntime } from './paymentOperationRuntime';
import { verifyPersistedPaymentAccounting } from './paymentAccountingVerification';
import { classifyPaymentJournalVersion } from './paymentJournalVersionDetection';
import { inspectInstallationAdmission } from './paymentInstallationAdmission';
import type { InstallationAdmission } from './paymentInstallationAdmission';

/**
 * S3-E diagnostic bridge, intentionally fail-closed.
 *
 * readRecoverySnapshot obtains its own exclusive lease, which ends before
 * this function receives the bytes. A released lease MUST NOT be represented
 * as an exclusive installation gate. Therefore this diagnostic cannot issue
 * a preflight candidate, authorize installation, or perform writes.
 */
export async function inspectDormantPaymentInstallation(
  runtime: Pick<PaymentOperationRuntime, 'readRecoverySnapshot'>,
): Promise<InstallationAdmission> {
  try {
    const raw = await runtime.readRecoverySnapshot();
    const journal = classifyPaymentJournalVersion(raw['tomorrow:payment-operations']);
    const recovery = verifyPersistedPaymentAccounting(raw);
    const result = inspectInstallationAdmission({
      journalVersion: journal.kind,
      recoveryInstallation: recovery.installation,
      recoveryIssueCount: recovery.globalIssues.length,
      recoveryFindingCount: recovery.findings.length,
      financePresent: raw['tomorrow:finance'] !== null,
      ledgerPresent: raw['tomorrow:ledger'] !== null,
      // Not asserted by this diagnostic: no historical-content policy,
      // write durability certificate, or currently held exclusive lease.
      financeHistoryEmpty: false,
      ledgerHistoryEmpty: false,
      writeQueueDrained: false,
      storageHealthy: false,
      exclusiveMutationGateHeld: false,
    });
    if (result.status !== 'denied') {
      return Object.freeze({
        status: 'denied', reason: 'Diagnostic cannot authorize installation.',
        postingAllowed: false, readiness: 'blocked', installationAuthorized: false,
      });
    }
    return result;
  } catch {
    return Object.freeze({
      status: 'denied', reason: 'Recovery snapshot or verification unavailable.',
      postingAllowed: false, readiness: 'blocked', installationAuthorized: false,
    });
  }
}
