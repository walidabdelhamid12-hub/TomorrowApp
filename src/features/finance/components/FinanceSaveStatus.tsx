import { useEffect, useState, useSyncExternalStore } from 'react';
import { View } from 'react-native';
import { AppButton, AppText } from '@/components/ui';
import { useAppLanguage } from '@/localization/LanguageProvider';
import { durableFinanceOperations, financeSubmissions } from '../store/productionFinancePersistence';
import { useFinanceStore } from '../store/useFinanceStore';
import { useLedgerStore } from '../store/useLedgerStore';

type Evidence = Awaited<ReturnType<typeof durableFinanceOperations.inspect>>;
/** Finance-only safety state. Never replays or modifies accounting records. */
export function FinanceSaveStatus() {
  const { t } = useAppLanguage();
  const status = useSyncExternalStore(durableFinanceOperations.subscribe, durableFinanceOperations.getStatus, durableFinanceOperations.getStatus);
  const [evidence, setEvidence] = useState<Evidence>();
  const [message, setMessage] = useState('');
  const [working, setWorking] = useState(false);
  const submissions = useSyncExternalStore(financeSubmissions.subscribe, financeSubmissions.getSnapshot, financeSubmissions.getSnapshot);
  useEffect(() => { void financeSubmissions.initialize().catch(() => {}); }, []);
  const completed = submissions.slots.filter(slot => slot.state === 'completed');
  // Scope remains unchanged; the label is display-only, derived from the saved request.
  const operationLabel = (slot: typeof completed[number]) => {
    let kind: unknown;
    try { const payload = JSON.parse(slot.request ?? 'null')?.payload; kind = payload?.kind ?? payload?.operation; } catch { /* use a neutral display label */ }
    switch (kind) {
      case 'account.create': case 'account.edit': return t('Account', 'الحساب');
      case 'debt.create': case 'debt.edit': return t('Debt', 'الدين');
      case 'debt.payment.create': return t('Debt payment', 'دفعة الدين');
      case 'debt.payment.edit': return t('Edit debt payment', 'تعديل دفعة الدين');
      case 'transaction.create': return t('Transaction', 'المعاملة');
      case 'transaction.edit': return t('Edit transaction', 'تعديل المعاملة');
      case 'refund.create': return t('Refund', 'الاسترداد');
      case 'category.create': case 'category.edit': case 'category.archive': case 'category.delete': return t('Category', 'التصنيف');
      case 'removeTransaction': return t('Delete transaction', 'حذف المعاملة');
      case 'deleteAccount': return t('Delete account', 'حذف الحساب');
      case 'deleteAsset': return t('Delete asset', 'حذف الأصل');
      case 'deleteAssetEntry': return t('Delete asset movement', 'حذف حركة الأصل');
      case 'removeTransfer': return t('Delete transfer', 'حذف التحويل');
      case 'deleteDebt': return t('Delete debt', 'حذف الدين');
      case 'reverseLinkedPayment': return t('Reverse payment', 'عكس الدفعة');
      case 'addCategory': case 'updateCategory': case 'archiveCategory': case 'deleteCategory': return t('Category', 'التصنيف');
      case 'transfer.create': case 'transfer.edit': return t('Transfer', 'التحويل');
      case 'asset.create': case 'asset.edit': return t('Asset', 'الأصل');
      case 'asset.entry.edit': return t('Edit asset movement', 'تعديل حركة الأصل');
      case 'asset.verify-opening-date': case 'account.verify-opening-date': return t('Opening date', 'تاريخ الافتتاح');
      case 'loan.create': case 'loan.receive': case 'closeLoanWithoutPayment': return t('Loan', 'القرض');
      case 'loan.payment.create': case 'loan.payment.edit': return t('Loan payment', 'دفعة القرض');
      default: return t('Saved operation', 'عملية محفوظة');
    }
  };
  const buttonLabel = (slot: typeof completed[number]) => {
    const label = operationLabel(slot);
    const matches = completed.filter(other => operationLabel(other) === label);
    return matches.length > 1 ? `${label} (${matches.indexOf(slot) + 1})` : label;
  };
  if (status.phase === 'ready' && !completed.length && submissions.phase !== 'blocked') return null;
  const inspect = async () => {
    if (working) return;
    setWorking(true);
    try { setEvidence(await durableFinanceOperations.inspect()); setMessage(''); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Saved evidence could not be read.'); }
    finally { setWorking(false); }
  };
  const resolve = async (decision: 'accept-applied' | 'dismiss-unapplied') => {
    if (working || !evidence || !('intent' in evidence)) return;
    setWorking(true);
    try {
      await durableFinanceOperations.resolve(evidence.intent.operationId, decision);
      setEvidence(undefined);
      setMessage(t('Evidence retained. Restart the app to reload the reviewed saved data.', 'تم حفظ الأدلة. أعد تشغيل التطبيق لتحميل البيانات المحفوظة التي تمت مراجعتها.'));
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Recovery requires review.'); }
    finally { setWorking(false); }
  };
  return <View accessibilityLiveRegion="polite" style={{ padding: 16, gap: 10 }}>
    <AppText>{status.phase === 'ready' ? t('The saved operation is retained for safe retries. Start a new independent operation explicitly before recording another.', 'تم الاحتفاظ بالعملية المحفوظة لإعادة المحاولة بأمان. ابدأ عملية مستقلة جديدة صراحةً قبل تسجيل عملية أخرى.') : status.phase === 'saving'
      ? t('Saving Finance data. Waiting for storage verification…', 'جارٍ حفظ البيانات المالية وانتظار التحقق من التخزين…')
      : status.phase === 'loading' ? t('Loading saved Finance data…', 'جارٍ تحميل البيانات المالية المحفوظة…')
      : t('Finance changes are blocked until saved evidence is reviewed.', 'التغييرات المالية متوقفة حتى تتم مراجعة أدلة الحفظ.')}</AppText>
    {!!status.reason && <AppText>{status.reason}</AppText>}
    {!!message && <AppText>{message}</AppText>}
    {status.phase === 'ready' && completed.map((slot) => <AppButton key={slot.operationId}
      title={t('Start new independent operation: ', 'بدء عملية مستقلة جديدة: ') + buttonLabel(slot)} disabled={working}
      onPress={() => {
        if (working) return;
        setWorking(true);
        void financeSubmissions.startNew(slot.scope, slot.operationId).then(() => setMessage(t('New submission prepared. Identical amounts will be recorded as a separate operation.', 'تم تجهيز عملية جديدة. سيتم تسجيل المبالغ المتطابقة كعملية مستقلة.')))
          .catch(error => setMessage(error instanceof Error ? error.message : 'Submission requires review.'))
          .finally(() => setWorking(false));
      }} />)}
    {status.phase === 'blocked' && <>
      <AppButton title={t('Inspect saved evidence', 'فحص أدلة الحفظ')} disabled={working} onPress={() => { void inspect(); }} />
      {evidence && <AppText>{t('Recovery classification: ', 'تصنيف الاسترداد: ') + evidence.classification}</AppText>}
      {evidence?.classification === 'partial' || evidence?.classification === 'conflict'
        ? <AppText>{t('Keep the saved evidence. Partial or conflicting writes require manual review; no accounting changes will be replayed.', 'احتفظ بأدلة الحفظ. تحتاج الكتابات الجزئية أو المتعارضة إلى مراجعة يدوية؛ لن تتم إعادة تنفيذ أي تغييرات مالية.')}</AppText>
        : null}
      {evidence?.classification === 'applied-unconfirmed' && <AppButton
        title={t('Confirm reviewed saved operation', 'تأكيد العملية المحفوظة بعد مراجعتها')} disabled={working}
        onPress={() => { void resolve('accept-applied'); }} />}
      {evidence?.classification === 'unapplied' && <AppButton
        title={t('Dismiss verified unapplied operation', 'إغلاق العملية التي تم التحقق من عدم حفظها')} disabled={working}
        onPress={() => { void resolve('dismiss-unapplied'); }} />}
      <AppButton title={t('Retry read-only hydration', 'إعادة محاولة قراءة البيانات فقط')} disabled={working} onPress={() => {
        if (working) return;
        setWorking(true);
        void Promise.all([useFinanceStore.persist.rehydrate(), useLedgerStore.persist.rehydrate()])
          .finally(() => setWorking(false));
      }} />
    </>}
  </View>;
}

