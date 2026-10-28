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

/** بيحسب التعبير مع أولوية × ÷ على + -. بيرجّع null لو غير صالح */
export function evaluateExpression(expression: string): number | null {
  // تجاهل عامل معلّق في الآخر (مثلاً "5+")
  const clean = isOperator(expression.slice(-1))
    ? expression.slice(0, -1)
    : expression;
  if (clean === '') return null;

  const numbers = clean.split(OPERATOR_SPLIT).map(Number);
  const operators = Array.from(clean).filter(isOperator);
  if (numbers.some(Number.isNaN) || numbers.length !== operators.length + 1) {
    return null;
  }

  // المرحلة 1: × و ÷
  const values: number[] = [numbers[0]];
  const addSub: Operator[] = [];
  for (let i = 0; i < operators.length; i++) {
    const op = operators[i];
    const n = numbers[i + 1];
    if (op === '×' || op === '÷') {
      if (op === '÷' && n === 0) return null;
      const prev = values.pop() as number;
      values.push(op === '×' ? prev * n : prev / n);
    } else {
      addSub.push(op);
      values.push(n);
    }
  }

  // المرحلة 2: + و -
  let result = values[0];
  addSub.forEach((op, i) => {
    result = op === '+' ? result + values[i + 1] : result - values[i + 1];
  });

  return Math.round(result * 1000) / 1000; // يشيل أخطاء الـ floating point
}