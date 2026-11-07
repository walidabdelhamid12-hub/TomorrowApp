import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

export function formatFinanceDate(date: Date): string {
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}
export function useFinanceDate(): string {
  const [label, setLabel] = useState(() => formatFinanceDate(new Date()));
  useEffect(() => {
    const refresh = () => setLabel(formatFinanceDate(new Date()));
    const timer = setInterval(refresh, 60_000);
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') refresh(); });
    return () => { clearInterval(timer); subscription.remove(); };
  }, []);
  return label;
}
