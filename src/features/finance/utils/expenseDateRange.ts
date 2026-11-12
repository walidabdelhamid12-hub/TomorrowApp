import type { ReportPeriod } from './reportAggregation';

/** UTC calendar arithmetic avoids daylight-saving shifts for inclusive report dates. */
export function previousExpensePeriod(period: ReportPeriod): ReportPeriod {
  const parse = (value: string): number => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Invalid date');
    const [year, month, day] = value.split('-').map(Number);
    const timestamp = Date.UTC(year, month - 1, day);
    const actual = new Date(timestamp);
    if (actual.getUTCFullYear() !== year || actual.getUTCMonth() + 1 !== month || actual.getUTCDate() !== day) throw new Error('Invalid date');
    return timestamp;
  };
  const start = parse(period.from);
  const end = parse(period.to);
  if (end < start) throw new Error('Invalid date range');
  const days = Math.round((end - start) / 86400000) + 1;
  const format = (timestamp: number) => {
    const date = new Date(timestamp);
    if (date.getUTCFullYear() < 100) throw new Error('Previous period out of range');
    return date.toISOString().slice(0, 10);
  };
  return { from: format(start - days * 86400000), to: format(start - 86400000) };
}
