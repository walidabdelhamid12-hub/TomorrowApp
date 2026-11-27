import { useEffect, useState, useSyncExternalStore } from 'react';
import { View } from 'react-native';
import { AppText } from '@/components/ui';
import { FinanceButton as AppButton } from './FinanceButton';
import { useAppLanguage } from '@/localization/LanguageProvider';
import { financeSubmissions } from '../store/productionFinancePersistence';
import { completeRetainedFinanceSubmission } from './acknowledgedFinanceHandler';

/** Explicit UI completion remains available even when a saved refund exhausts its purchase. */
export function FinanceSubmissionReceipt({scope, label, onCommitted}: {scope: string; label?: string; onCommitted: (result: unknown) => void}) {
  const {t} = useAppLanguage();
  const submissions = useSyncExternalStore(financeSubmissions.subscribe, financeSubmissions.getSnapshot, financeSubmissions.getSnapshot);
  useEffect(() => { void financeSubmissions.initialize().catch(() => {}); }, []);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [verifiedId, setVerifiedId] = useState<string | null>(null);
  const slot = submissions.slots.find(item => item.scope === scope && item.state === 'completed');
  if (!slot) return null;
  return <View style={{gap: 8}}>
    {!!label && <AppText>{label}</AppText>}
    <AppText>{t('A previously saved operation is available. Finishing it will not submit the current form.', 'توجد عملية محفوظة سابقًا. إكمالها لن يرسل بيانات النموذج الحالي.')}</AppText>
    {verifiedId === slot.operationId && <AppText accessibilityLiveRegion="polite">{t('Saved operation verified. No new transaction was recorded.', 'تم التحقق من العملية المحفوظة دون تسجيل معاملة جديدة.')}</AppText>}
    {!!error && <AppText accessibilityLiveRegion="polite">{error}</AppText>}
    <AppButton variant="outline" title={t('Finish previously saved operation', 'إكمال العملية المحفوظة سابقًا')} disabled={working || submissions.phase !== 'ready'} onPress={() => {
      if (working) return;
      setError('');
      setWorking(true);
      void completeRetainedFinanceSubmission(scope).then(result => {
          onCommitted(result);
          setVerifiedId(slot.operationId);
        })
        .catch(reason => setError(reason instanceof Error ? reason.message : 'The saved operation requires review.'))
        .finally(() => setWorking(false));
    }} />
    <AppButton title={t('Prepare new independent operation', 'تجهيز عملية مستقلة جديدة')} disabled={working || submissions.phase !== 'ready'} onPress={() => {
      if (working) return;
      setError(''); setWorking(true);
      void financeSubmissions.startNew(scope, slot.operationId)
        .catch(reason => setError(reason instanceof Error ? reason.message : 'The saved operation requires review.'))
        .finally(() => setWorking(false));
    }} />
  </View>;
}
