import { CURRENCIES } from '@/features/finance/constants/currencies';
import { parseAmount } from '@/features/finance/utils/money';
import { isValidISODate, normalizeDigits } from '@/utils/input';
import type { ScanResult } from './types';

const NUMBER = /\d{1,3}(?:[,\s]\d{3})+(?:[.,]\d{1,3})?|\d+(?:[.,]\d{1,3})?/g;
const DATE_ANY = /\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{4}/g;
const TOTAL_WORDS =
  /grand\s*total|total\s*due|amount\s*due|net\s*amount|total|amount|الإجمالي|الاجمالي|المجموع|المبلغ|صافي|القيمة/i;

function fmt(y: string, m: string, d: string): string {
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

function findDate(text: string): string | undefined {
  // Year first: 2026-10-28
  for (const m of text.matchAll(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/g)) {
    const iso = fmt(m[1], m[2], m[3]);
    if (isValidISODate(iso)) return iso;
  }
  // Day first (Egypt / Gulf): 28/10/2026
  for (const m of text.matchAll(/(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/g)) {
    const iso = fmt(m[3], m[2], m[1]);
    if (isValidISODate(iso)) return iso;
  }
  return undefined;
}

function findCurrency(text: string): string | undefined {
  const upper = text.toUpperCase();
  for (const currency of CURRENCIES) {
    if (new RegExp(`\\b${currency.code}\\b`).test(upper)) return currency.code;
  }
  if (/جنيه|L\.E/i.test(text)) return 'EGP';
  return undefined;
}

/**
 * Pulls the amount and date out of raw OCR text. The amount comes from the last
 * line that mentions a "total" word, else the largest number with decimals.
 * Always let the user review the result.
 */
export function parseDocumentText(rawText: string): ScanResult {
  const text = normalizeDigits(rawText);
  let keywordAmount: number | undefined;
  let largestDecimal: number | undefined;

  for (const line of text.split(/\r?\n/)) {
    const cleaned = line.replace(DATE_ANY, ' ');
    const tokens = cleaned.match(NUMBER) ?? [];
    const values: number[] = [];

    for (const token of tokens) {
      const value = parseAmount(token);
      if (value === null || value <= 0 || value >= 1e9) continue;
      values.push(value);
      if (/[.,]\d{1,3}$/.test(token)) {
        largestDecimal = Math.max(largestDecimal ?? 0, value);
      }
    }

    if (values.length > 0 && TOTAL_WORDS.test(cleaned)) {
      keywordAmount = values[values.length - 1];
    }
  }

  return {
    amount: keywordAmount ?? largestDecimal,
    date: findDate(text),
    currencyCode: findCurrency(text),
    rawText,
  };
}