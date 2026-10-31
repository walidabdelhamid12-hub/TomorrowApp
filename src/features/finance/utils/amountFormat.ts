/**
 * Display-only number formatting.
 * It never changes stored values or calculation precision.
 * Always displays thousands separators and exactly two decimal places.
 */
export function formatAmount(value: number): string {
  const safe = Number.isFinite(value) ? value : 0;

  return safe.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}