/** Exact ratios of the decimal values already held in asset/rate Number fields. */
function decimalRatio(value: number): [bigint, bigint] {
  const [coefficient, exponent = '0'] = value.toString().toLowerCase().split('e');
  const decimals = coefficient.split('.')[1]?.length ?? 0;
  const scale = decimals - Number(exponent);
  const integer = BigInt(coefficient.replace('.', ''));
  return scale >= 0 ? [integer, 10n ** BigInt(scale)] : [integer * 10n ** BigInt(-scale), 1n];
}

/**
 * No currency/3-decimal quantization between metal valuation and FX conversion.
 * Convert the final exact ratio to the existing Number API only once. Forty
 * significant decimal digits exceed Number precision, including tiny quantities.
 * Used for asset valuation and read-only proportional principal allocation;
 * never used to post or round ledger entries.
 */
export function evaluateAssetRatio(numerators: readonly number[], denominators: readonly number[] = []): number | null {
  if (![...numerators, ...denominators].every(Number.isFinite) || denominators.includes(0)) return null;
  let numerator = 1n;
  let denominator = 1n;
  for (const value of numerators) {
    const [n, d] = decimalRatio(value);
    numerator *= n; denominator *= d;
  }
  for (const value of denominators) {
    const [n, d] = decimalRatio(value);
    numerator *= d; denominator *= n;
  }
  if (numerator === 0n) return 0;
  const negative = (numerator < 0n) !== (denominator < 0n);
  if (numerator < 0n) numerator = -numerator;
  if (denominator < 0n) denominator = -denominator;
  let exponent = numerator.toString().length - denominator.toString().length;
  if (exponent >= 0) denominator *= 10n ** BigInt(exponent);
  else numerator *= 10n ** BigInt(-exponent);
  if (numerator < denominator) { numerator *= 10n; exponent--; }
  const digits = numerator * 10n ** 39n / denominator;
  const result = Number((negative ? '-' : '') + digits.toString() + 'e' + (exponent - 39));
  return Number.isFinite(result) ? result : null;
}
