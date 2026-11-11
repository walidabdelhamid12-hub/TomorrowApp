export const OPERATORS = ['+', '-', '×', '÷'] as const;
export type Operator = (typeof OPERATORS)[number];

const OPERATOR_SPLIT = /[+\-×÷]/;
const MAX_LENGTH = 24;

const isOperator = (ch: string): ch is Operator =>
  (OPERATORS as readonly string[]).includes(ch);

/** بيطبّق ضغطة زرار على التعبير الحالي ويرجّع التعبير الجديد */
export function applyKey(expr: string, key: string): string {
  if (key === 'C') return '';
  if (key === 'DEL') return expr.slice(0, -1);

  const last = expr.slice(-1);
  const segment = expr.split(OPERATOR_SPLIT).pop() ?? '';

  if (isOperator(key)) {
    if (expr === '') return expr; // مفيش عامل في الأول
    if (isOperator(last)) return expr.slice(0, -1) + key; // استبدال العامل
    if (last === '.') return expr.slice(0, -1) + key;
    return expr + key;
  }

  if (expr.length >= MAX_LENGTH) return expr;

  if (key === '.') {
    if (segment.includes('.')) return expr;
    return segment === '' ? expr + '0.' : expr + '.';
  }

  // رقم
  if (segment === '0') return expr.slice(0, -1) + key; // منع 007
  return expr + key;
}

/** Safe arithmetic evaluator with precedence and nested parentheses. */
export function evaluateExpression(expression: string): number | null {
  const clean = isOperator(expression.slice(-1))
    ? expression.slice(0, -1)
    : expression;
  if (!clean || clean.length > 256) return null;

  const MAX_PAREN_DEPTH = 32;
  let depth = 0;
  let pos = 0;
  const invalid = () => Number.NaN;

  const number = (): number => {
    const rest = clean.slice(pos);
    const match = /^(?:\d+(?:\.\d*)?|\.\d+)/.exec(rest);
    if (!match) return invalid();
    pos += match[0].length;
    const value = Number(match[0]);
    if (!Number.isFinite(value)) return invalid();
    if (/^\d+$/.test(match[0]) && !Number.isSafeInteger(value)) {
      return invalid();
    }
    return value;
  };

  const primary = (): number => {
    if (clean[pos] !== '(') return number();
    if (depth >= MAX_PAREN_DEPTH) return invalid();
    depth++;
    pos++;
    const value = addition();
    depth--;
    if (!Number.isFinite(value) || clean[pos] !== ')') return invalid();
    pos++;
    return value;
  };

  const multiplication = (): number => {
    let value = primary();
    while (clean[pos] === '×' || clean[pos] === '÷') {
      const operator = clean[pos++];
      const right = primary();
      if (!Number.isFinite(value) || !Number.isFinite(right)) return invalid();
      if (operator === '÷' && right === 0) return invalid();
      value = operator === '×' ? value * right : value / right;
      if (!Number.isFinite(value)) return invalid();
    }
    return value;
  };

  const addition = (): number => {
    let value = multiplication();
    while (clean[pos] === '+' || clean[pos] === '-') {
      const operator = clean[pos++];
      const right = multiplication();
      if (!Number.isFinite(value) || !Number.isFinite(right)) return invalid();
      value = operator === '+' ? value + right : value - right;
      if (!Number.isFinite(value)) return invalid();
    }
    return value;
  };

  const result = addition();
  return pos === clean.length && Number.isFinite(result) ? result : null;
}
