import type { Asset } from '../types/finance';

export interface AssetReportPeriod { from: string; to: string }
export type AssetReportStatus = 'available' | 'historical_data_unavailable';
export interface AssetReportRow {
  assetId: string;
  assetName: string;
  category: Asset['category'];
  unit: string;
  status: AssetReportStatus;
  openingQuantity: number | null;
  additions: number | null;
  withdrawals: number | null;
  closingQuantity: number | null;
  netChange: number | null;
  historicalValuationStatus: 'historical_data_unavailable';
  reason?: string;
}

function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 100 || month < 1 || month > 12) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= days[month - 1];
}

/** Converts an existing recorded amount to the app's three-decimal quantity units. */
function toUnits(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const scaled = value * 1000;
  if (!Number.isSafeInteger(Math.round(scaled)) || Math.abs(scaled - Math.round(scaled)) > 1e-8) return null;
  return Math.round(scaled);
}

/** Pure, read-only movement report. Historical market prices are deliberately not inferred. */
export function aggregateAssetsReport(
  assets: readonly Asset[],
  period: AssetReportPeriod,
): AssetReportRow[] {
  if (!period || !validDate(period.from) || !validDate(period.to) || period.from > period.to) {
    throw new Error('Invalid asset report period');
  }
  if (!Array.isArray(assets)) throw new Error('Invalid assets collection');
  const ids = new Set<string>();
  const duplicateAssetIds = new Set<string>();
  for (const asset of assets) {
    if (ids.has(asset.id)) duplicateAssetIds.add(asset.id);
    ids.add(asset.id);
  }

  return assets.map(asset => {
    const unit = asset.category === 'gold' || asset.category === 'silver'
      ? 'g' : asset.currencyCode;
    const base = {
      assetId: asset.id, assetName: asset.name, category: asset.category,
      unit, historicalValuationStatus: 'historical_data_unavailable' as const,
    };
    const unavailable = (reason: string): AssetReportRow => ({
      ...base, status: 'historical_data_unavailable', openingQuantity: null,
      additions: null, withdrawals: null, closingQuantity: null, netChange: null, reason,
    });
    if (duplicateAssetIds.has(asset.id)) return unavailable('Duplicate asset identity');
    if (!Array.isArray(asset.entries)) return unavailable('Invalid asset movements');
    const entryIds = new Set<string>();
    let opening = 0;
    let additions = 0;
    let withdrawals = 0;
    for (const entry of asset.entries) {
      if (typeof entry.id !== 'string' || !entry.id || entryIds.has(entry.id)) {
        return unavailable('Invalid or duplicate movement identity');
      }
      entryIds.add(entry.id);
      if (!validDate(entry.date)) return unavailable('Invalid movement date');
      const units = toUnits(entry.amount);
      if (units === null) return unavailable('Invalid or unsafe movement amount');
      if (entry.date < period.from) {
        opening += units;
      } else if (entry.date <= period.to) {
        if (units >= 0) additions += units;
        else withdrawals += -units;
      }
      if (![opening, additions, withdrawals].every(Number.isSafeInteger)) {
        return unavailable('Unsafe quantity accumulation');
      }
    }
    const change = additions - withdrawals;
    const closing = opening + change;
    if (![change, closing].every(Number.isSafeInteger)) {
      return unavailable('Unsafe calculated quantity');
    }
    return {
      ...base, status: 'available', openingQuantity: opening / 1000,
      additions: additions / 1000, withdrawals: withdrawals / 1000,
      closingQuantity: closing / 1000, netChange: change / 1000,
    };
  });
}
