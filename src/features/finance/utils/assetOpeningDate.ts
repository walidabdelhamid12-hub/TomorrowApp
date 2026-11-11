import type { Asset } from '../types/finance';
import { aggregateAssetsReport } from './reportAssets';

function validDate(date: unknown): date is string {
  if (typeof date !== 'string') return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number);
  if (year < 100) return false;
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

/**
 * Verification is read-only and user-confirmed. A complete recorded history
 * cannot be inferred from creation timestamps or the first recorded movement.
 */
export function validateAssetOpeningDate(
  assets: readonly Asset[], assetId: string, date: string,
): { valid: true } | { valid: false; reason: string } {
  if (!validDate(date)) return { valid: false, reason: 'Enter a real date as YYYY-MM-DD' };
  const matches = assets.filter(asset => asset.id === assetId);
  if (matches.length !== 1) return { valid: false, reason: 'Asset is missing or ambiguous' };
  const asset = matches[0];
  if (!Array.isArray(asset.entries)) return { valid: false, reason: 'Invalid asset history' };
  if (asset.entries.some(entry => typeof entry.date === 'string' && entry.date < date)) {
    return { valid: false, reason: 'Recorded movements predate the proposed opening date' };
  }
  try {
    const rows = aggregateAssetsReport(assets, { from: date, to: date });
    const row = rows.find(item => item.assetId === assetId);
    if (!row || row.status !== 'available') {
      return { valid: false, reason: row?.reason ?? 'Asset history could not be verified' };
    }
    return { valid: true };
  } catch {
    return { valid: false, reason: 'Unable to verify asset history; review the asset data' };
  }
}

/** Never turn missing or incomplete history into a zero balance. */
export function assetReportHistoryAvailable(asset: Asset, from: string): boolean {
  return validDate(asset.openingBalanceDate) && validDate(from)
    && from >= asset.openingBalanceDate;
}
