const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');
const root = path.resolve(__dirname, '..');
const load = Module._load;
let transactions = [];
let currency = { baseCurrency: 'EGP', rates: { EGP: 1, OMR: 100 }, verifiedCurrencies: ['EGP', 'OMR'], metals: {} };
const ledger = () => ({ transactions, accounts: [], categories: [], transfers: [] });
Module._load = function(id, parent, main) {
  if (id === 'react') return { ...React, useMemo: fn => fn(), useState: x => [x, () => {}] };
  if (id === 'react-native') return { ActivityIndicator: 'ActivityIndicator', Pressable: 'Pressable', View: 'View', StyleSheet: { create: x => x, hairlineWidth: 1 } };
  if (id === '@expo/vector-icons') return { Ionicons: 'Icon' };
  if (id === '@/components/ui') return { AppText: 'AppText', Card: 'Card', Screen: 'Screen' };
  if (id === '@/theme') return { useTheme: () => ({ colors: {}, spacing: { md: 12 } }), moduleColors: {} };
  if (id === '@/features/finance/components/AddTransactionModal') return { AddTransactionModal: 'AddTransactionModal' };
  if (id === '@/features/finance/store/useLedgerStore') return { useLedgerStore: fn => fn(ledger()), useLedgerHydrated: () => true };
  if (id === '@/features/finance/store/useCurrencyStore') return { useCurrencyStore: fn => fn(currency) };
  if (id === '@/features/finance/store/useFinanceStore') return { useFinanceStore: fn => fn({ assets: [], loans: [], debts: [], cheques: [] }) };
  return load.call(this, id.startsWith('@/') ? path.join(root, 'src', id.slice(2)) : id, parent, main);
};
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  fileName: filename, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText, filename);
const { getMonthlyFinanceSummary: calculate } = require('../src/features/finance/utils/monthlySummary.ts');
const { useFinanceSummary } = require('../src/features/finance/hooks/useFinanceSummary.ts');
const { useMonthlyFinanceSummary } = require('../src/features/finance/hooks/useMonthlyFinanceSummary.ts');
const { IncomeExpensesScreen } = require('../src/features/finance/screens/IncomeExpensesScreen.tsx');
const { todayISO } = require('../src/features/finance/utils/finance.ts');
const month = todayISO().slice(0, 7);
const tx = (type, amount, currencyCode = 'EGP', date = month + '-01', entryType) => ({ id: String(Math.random()), type, amount, currencyCode, date, createdAt: date, entryType });
const summarize = (rows, base = 'EGP', rates = currency.rates, verified = ['EGP', 'OMR']) => calculate(rows, month, base, rates, verified);
function text(node) {
  if (Array.isArray(node)) return node.map(text).join('');
  if (!node || typeof node !== 'object') return node ?? '';
  return text(node.props?.children);
}
test('mixed EGP/OMR monthly totals convert to either selected base', () => {
  const rows = [tx('income', 100), tx('income', 2, 'OMR'), tx('expense', 50), tx('expense', 1, 'OMR')];
  assert.deepEqual(summarize(rows), { income: 300, expense: 150, missing: 0 });
  assert.deepEqual(summarize(rows, 'OMR'), { income: 3, expense: 1.5, missing: 0 });
});
test('calendar month includes first/last dates and excludes other months and years', () => {
  const rows = ['2026-11-01', '2026-11-30', '2026-10-31', '2026-12-01', '2025-11-01'].map(date => tx('income', 10, 'EGP', date));
  assert.deepEqual(calculate(rows, '2026-11', 'EGP', {}, []), { income: 20, expense: 0, missing: 0 });
});
test('refunds reduce expenses even when typed income, never income; expenses floor at zero', () => {
  const rows = [tx('income', 100), tx('expense', 2, 'OMR'), tx('income', 50, 'EGP', undefined, 'refund')];
  assert.deepEqual(summarize(rows), { income: 100, expense: 150, missing: 0 });
  rows.push(tx('expense', 2, 'OMR', undefined, 'refund'));
  assert.deepEqual(summarize(rows), { income: 100, expense: 0, missing: 0 });
});
test('preserves precision until final three-decimal rounding', () => {
  assert.deepEqual(summarize([tx('income', 1, 'OMR'), tx('income', 1, 'OMR')], 'EGP', { EGP: 1, OMR: 1.23456 }), { income: 2.469, expense: 0, missing: 0 });
  assert.equal(summarize([tx('income', 1.23456), tx('income', 1.23456)]).income, 2.469);
});
test('missing, invalid and unverified rates flag incomplete totals including refunds', () => {
  for (const rates of [{ EGP: 1 }, { EGP: 1, OMR: 0 }, { EGP: 1, OMR: NaN }, { EGP: 1, OMR: Infinity }]) {
    assert.deepEqual(summarize([tx('income', 10), tx('income', 2, 'OMR'), tx('expense', 1, 'OMR', undefined, 'refund')], 'EGP', rates), { income: 10, expense: 0, missing: 2 });
  }
  assert.equal(summarize([tx('expense', 1, 'OMR')], 'EGP', currency.rates, ['EGP']).missing, 1);
  assert.equal(summarize([tx('income', 2, 'OMR', '2000-01-01')], 'EGP', {}).missing, 0);
  assert.deepEqual(summarize([tx('income', 2, 'OMR')], 'OMR', {}, []), { income: 2, expense: 0, missing: 0 });
});
test('real screen shares Finance Home totals, labels base/month and retains original history', () => {
  transactions = [tx('income', 100), tx('income', 2, 'OMR'), tx('expense', 4, 'OMR'), tx('expense', 50, 'EGP', undefined, 'refund'), tx('income', 999, 'OMR', '2000-01-01')];
  const original = JSON.stringify(transactions);
  for (const baseCurrency of ['EGP', 'OMR']) {
    currency = { ...currency, baseCurrency };
    const home = useFinanceSummary();
    const monthly = useMonthlyFinanceSummary();
    assert.equal(home.income, monthly.income);
    assert.equal(home.expense, monthly.expense);
    assert.equal(home.monthlyMissing, monthly.missing);
    const incomeText = text(IncomeExpensesScreen({ kind: 'income' }));
    const expenseText = text(IncomeExpensesScreen({ kind: 'expense' }));
    const { formatAmount } = require('../src/features/finance/utils/amountFormat.ts');
    assert.ok(incomeText.includes(formatAmount(home.income, baseCurrency) + ' ' + baseCurrency));
    assert.ok(expenseText.includes(formatAmount(home.expense, baseCurrency) + ' ' + baseCurrency));
    assert.ok(incomeText.includes('This month (' + month + ')'));
    assert.ok(incomeText.includes('2000-01-01'));
    assert.ok(incomeText.includes('999.00 OMR'));
    assert.ok(incomeText.includes('2.00 OMR'));
  }
  assert.equal(JSON.stringify(transactions), original);
});
test('screen warns and labels partial totals when conversion unavailable', () => {
  currency = { ...currency, baseCurrency: 'EGP', verifiedCurrencies: ['EGP'] };
  transactions = [tx('income', 10), tx('expense', 1, 'OMR')];
  for (const kind of ['income', 'expense']) {
    const rendered = text(IncomeExpensesScreen({ kind }));
    assert.ok(rendered.includes('Partial total'));
    assert.ok(rendered.includes('Monthly total incomplete: 1 transaction(s) could not be converted'));
  }
  assert.equal(useFinanceSummary().monthlyMissing, 1);
});
