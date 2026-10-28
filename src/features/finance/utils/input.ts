/** Generic input helpers (digits + dates). No feature-specific imports. */

const ARABIC_INDIC = '٠١٢٣٤٥٦٧٨٩';
const PERSIAN = '۰۱۲۳۴۵۶۷۸۹';

/** Converts Arabic-Indic (٠-٩) and Persian (۰-۹) digits to 0-9. */
export function normalizeDigits(text: string): string {
  return text.replace(/[٠-٩۰-۹]/g, (ch) => {
    const arabic = ARABIC_INDIC.indexOf(ch);
    return String(arabic >= 0 ? arabic : PERSIAN.indexOf(ch));
  });
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Local-timezone "YYYY-MM-DD". */
export function toLocalISODate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** True for a real calendar date written as YYYY-MM-DD. */
export function isValidISODate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return (
    date.getFullYear() === y &&
    date.getMonth() === m - 1 &&
    date.getDate() === d
  );
}

/** Parses a valid YYYY-MM-DD into a local Date. */
export function isoToDate(value: string): Date {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d);
}