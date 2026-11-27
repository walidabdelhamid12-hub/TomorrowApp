/** Exact, bounded decimal arithmetic for monetary entry; no floating-point math. */
type Fraction = { numerator: bigint; denominator: bigint };
const MAX_LENGTH = 256;
const MAX_DEPTH = 32;
const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);

function fraction(numerator: bigint, denominator: bigint): Fraction {
  if (denominator === 0n) throw new Error('Division by zero');
  if (denominator < 0n) { numerator = -numerator; denominator = -denominator; }
  let a = numerator < 0n ? -numerator : numerator;
  let b = denominator;
  while (b !== 0n) { const remainder = a % b; a = b; b = remainder; }
  return { numerator: numerator / a, denominator: denominator / a };
}

function decimal(text: string): Fraction {
  const [whole, part = ''] = text.split('.');
  const denominator = 10n ** BigInt(part.length);
  const numerator = BigInt((whole || '0') + part);
  // Preserve rejection of unsafe integer literals, including decimal variants.
  if (numerator > MAX_SAFE * denominator) throw new Error('Unsafe literal');
  return fraction(numerator, denominator);
}

export function evaluateExactAmountExpression(expression: string): Fraction | null {
  if (!expression || expression.length > MAX_LENGTH) return null;
  let pos = 0;
  let depth = 0;
  function primary(): Fraction {
    if (expression[pos] === '(') {
      if (++depth > MAX_DEPTH) throw new Error('Too deeply nested');
      pos++;
      const value = addition();
      if (expression[pos++] !== ')') throw new Error('Missing closing parenthesis');
      depth--;
      return value;
    }
    const match = /^(?:\d+(?:\.\d*)?|\.\d+)/.exec(expression.slice(pos));
    if (!match) throw new Error('Invalid number');
    pos += match[0].length;
    return decimal(match[0]);
  }
  function multiplication(): Fraction {
    let value = primary();
    while (expression[pos] === '×' || expression[pos] === '÷') {
      const operator = expression[pos++];
      const right = primary();
      value = operator === '×'
        ? fraction(value.numerator * right.numerator, value.denominator * right.denominator)
        : fraction(value.numerator * right.denominator, value.denominator * right.numerator);
    }
    return value;
  }
  function addition(): Fraction {
    let value = multiplication();
    while (expression[pos] === '+' || expression[pos] === '-') {
      const operator = expression[pos++];
      const right = multiplication();
      const n = value.numerator * right.denominator;
      const m = right.numerator * value.denominator;
      value = fraction(operator === '+' ? n + m : n - m, value.denominator * right.denominator);
    }
    return value;
  }
  try {
    const value = addition();
    return pos === expression.length ? value : null;
  } catch { return null; }
}

/** Convert only exact, positive minor-unit amounts that survive Number storage. */
export function exactAmountToNumber(value: Fraction, decimals: number): number | null {
  if (value.numerator <= 0n || !Number.isInteger(decimals) || decimals < 0 || decimals > 3) return null;
  const factor = 10n ** BigInt(decimals);
  const scaled = value.numerator * factor;
  if (scaled % value.denominator !== 0n) return null;
  const units = scaled / value.denominator;
  if (units > MAX_SAFE) return null;
  const digits = units.toString().padStart(decimals + 1, '0');
  const text = decimals ? digits.slice(0, -decimals) + '.' + digits.slice(-decimals) : digits;
  const result = Number(text);
  if (!Number.isFinite(result) || result <= 0) return null;
  // Match the existing reporting policy: fractional values must preserve a minor unit.
  if (!Number.isInteger(result)) {
    const estimatedExponent = Math.floor(Math.log2(result));
    const exponent = result < 2 ** estimatedExponent ? estimatedExponent - 1 : estimatedExponent;
    if (2 ** (exponent - 52) > 1 / Number(factor)) return null;
  }
  // Number's canonical decimal representation must recover the exact original units.
  try {
    const recovered = decimal(String(result));
    return recovered.numerator * factor === units * recovered.denominator ? result : null;
  } catch { return null; }
}
