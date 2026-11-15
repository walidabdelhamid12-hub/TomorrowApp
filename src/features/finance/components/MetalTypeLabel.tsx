import { AppText } from '@/components/ui';

/** Apply metal styling only to known semantic labels, never user-entered names. */
export function MetalTypeLabel({ type, suffix = '' }: { type: 'gold' | 'silver'; suffix?: string }) {
  return <AppText variant="caption" style={{ fontWeight: '800', color: type === 'gold' ? '#A97808' : '#697586' }}>
    {type === 'gold' ? 'Gold' : 'Silver'}{suffix}
  </AppText>;
}
