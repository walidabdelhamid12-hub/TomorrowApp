/* Task 8.3C: historical opening-date metadata and report integration. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const Module = require('node:module');

const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request.startsWith('@/')) request = path.join(__dirname, '../src', request.slice(2));
  return originalLoad.call(this, request, parent, isMain);
};
for (const extension of ['.ts', '.tsx']) {
  require.extensions[extension] = function(module, filename) {
    const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX }, fileName: filename,
    });
    module._compile(output.outputText, filename);
  };
}
const { aggregateAccountsReport } = require('../src/features/finance/utils/reportAccounts.ts');
const { validateAccountOpeningDate } = require('../src/features/finance/utils/accountOpeningDate.ts');
const baseAccount = extra => ({
  id: 'bank', name: 'Bank', type: 'bank', currencyCode: 'EGP',
  initialBalance: 100, archived: false, createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z', ...extra,
});
const data = (account, transactions = [], transfers = []) => ({
  accounts: [account], categories: [], transactions, transfers,
});
const period = { from: '2026-11-01', to: '2026-11-30' };
const report = ledger => aggregateAccountsReport(ledger, period,
  ledger.accounts.filter(a => typeof a.openingBalanceDate === 'string')
    .map(a => ({ accountId: a.id, openingBalanceDate: a.openingBalanceDate })))[0];

test('legacy accounts without a verified date remain unavailable', () => {
  const row = report(data(baseAccount()));
  assert.equal(row.status, 'historical_data_unavailable');
  assert.equal(row.openingBalance, null);
});
test('verified date supplies the exact opening basis without altering initialBalance', () => {
  const account = baseAccount({ openingBalanceDate: '2026-11-01' });
  const tx = { id: 'tx', accountId: 'bank', currencyCode: 'EGP',
    type: 'income', amount: 12.5, date: '2026-11-02' };
  const ledger = data(account, [tx]);
  const before = JSON.stringify(ledger);
  const row = report(ledger);
  assert.equal(row.status, 'available');
  assert.equal(row.openingBalance, 100);
  assert.equal(row.closingBalance, 112.5);
  assert.equal(row.change, 12.5);
  assert.equal(JSON.stringify(ledger), before);
});
test('invalid persisted opening date is never silently repaired', () => {
  const account = baseAccount({ openingBalanceDate: '2026-02-30' });
  const row = report(data(account));
  assert.equal(row.status, 'historical_data_unavailable');
  assert.equal(account.openingBalanceDate, '2026-02-30');
});
test('historical movements before the verified date invalidate the report', () => {
  const account = baseAccount({ openingBalanceDate: '2026-11-10' });
  const tx = { id: 'old', accountId: 'bank', currencyCode: 'EGP',
    type: 'expense', amount: 1, date: '2026-11-09' };
  assert.equal(report(data(account, [tx])).status, 'historical_data_unavailable');
});
test('archived negative credit-card balances remain valid', () => {
  const account = baseAccount({ type: 'credit_card', archived: true,
    initialBalance: -50, openingBalanceDate: '2026-11-01' });
  const row = report(data(account));
  assert.equal(row.status, 'available');
  assert.equal(row.openingBalance, -50);
  assert.equal(row.archived, true);
});
test('stored opening date survives JSON persistence round trip', () => {
  const account = baseAccount({ openingBalanceDate: '2026-11-01' });
  const restored = JSON.parse(JSON.stringify(data(account)));
  assert.equal(restored.accounts[0].openingBalanceDate, '2026-11-01');
  assert.equal(report(restored).status, 'available');
});
test('metadata verification action is distinct from generic account edits', () => {
  const source = fs.readFileSync(path.join(__dirname,
    '../src/features/finance/store/useLedgerStore.ts'), 'utf8');
  assert.match(source, /verifyAccountOpeningBalanceDate: \(id, date\) =>/);
  assert.match(source, /hasOwnProperty\.call\(patch, 'openingBalanceDate'\)/);
  assert.match(source, /financialBasisChanged/);
  assert.match(source, /openingBalanceDate: undefined/);
});
test('Accounts Report passes only stored opening dates to aggregation', () => {
  const source = fs.readFileSync(path.join(__dirname,
    '../src/app/finance/report-accounts.tsx'), 'utf8');
  assert.match(source, /account\.openingBalanceDate/);
  assert.doesNotMatch(source, /openingBalanceDate:\s*account\.createdAt/);
});

test('opening date validator accepts verified history and never mutates ledger', () => {
  const ledger = data(baseAccount());
  const before = JSON.stringify(ledger);
  assert.deepEqual(validateAccountOpeningDate(ledger, 'bank', '2026-11-01'), { valid: true });
  assert.equal(JSON.stringify(ledger), before);
});
test('opening date validator rejects impossible dates and unknown accounts', () => {
  const ledger = data(baseAccount());
  for (const date of ['2026-02-30', '2026-11-31', 'bad', '']) {
    const result = validateAccountOpeningDate(ledger, 'bank', date);
    assert.equal(result.valid, false, date);
  }
  assert.equal(validateAccountOpeningDate(ledger, 'missing', '2026-11-01').valid, false);
});
test('opening date validator rejects transactions earlier than verified basis', () => {
  const ledger = data(baseAccount(), [{
    id: 'old', accountId: 'bank', currencyCode: 'EGP',
    type: 'income', amount: 5, date: '2026-10-31',
  }]);
  const result = validateAccountOpeningDate(ledger, 'bank', '2026-11-01');
  assert.equal(result.valid, false);
  assert.match(result.reason, /predate/i);
});
test('opening date validator rejects ambiguous accounts and unsafe precision', () => {
  const duplicate = data(baseAccount());
  duplicate.accounts.push(baseAccount());
  assert.equal(validateAccountOpeningDate(duplicate, 'bank', '2026-11-01').valid, false);
  const invalid = data(baseAccount({ initialBalance: 0.001 }));
  assert.equal(validateAccountOpeningDate(invalid, 'bank', '2026-11-01').valid, false);
});
test('opening date validator rejects invalid linked transfer history', () => {
  const ledger = data(baseAccount(), [], [{
    id: 'transfer', fromAccountId: 'bank', toAccountId: 'unknown',
    amount: 10, currencyCode: 'EGP', type: 'internal', date: '2026-11-01',
  }]);
  assert.equal(validateAccountOpeningDate(ledger, 'bank', '2026-11-01').valid, false);
});

test('account details requires explicit user confirmation before metadata-only verification', () => {
  const source = fs.readFileSync(path.join(__dirname,
    '../src/features/finance/components/AccountDetails.tsx'), 'utf8');
  assert.match(source, /Verify opening balance date/);
  assert.match(source, /Alert\.alert\('Verify opening balance date'/);
  assert.match(source, /verifyOpeningDate\(account\.id,/);
  assert.match(source, /validateAccountOpeningDate/);
  assert.doesNotMatch(source, /updateAccount\(|addTransaction\(|addTransfer\(/);
});

test('account edits warn before invalidating a verified financial basis', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/app/finance/accounts.tsx'), 'utf8');
  assert.match(source, /basisChanged && editingAccount\.openingBalanceDate/);
  assert.match(source, /Opening date verification will be cleared/);
  assert.match(source, /Cancel.*style: 'cancel'/s);
  assert.match(source, /Continue.*onPress/s);
});

test('new account form requires explicit opening date confirmation', () => {
  const source = fs.readFileSync(path.join(__dirname,
    '../src/features/finance/components/AddAccountModal.tsx'), 'utf8');
  assert.match(source, /openingBalanceDate\?: string/);
  assert.match(source, /openingDateConfirmed/);
  assert.match(source, /Confirmation required/);
  assert.match(source, /!account && openingDate\.trim\(\)/);
});
test('account creation never assumes the date and warns if metadata verification fails', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/app/finance/accounts.tsx'), 'utf8');
  assert.match(source, /isValidISODate\(data\.openingBalanceDate\)/);
  assert.match(source, /verifyOpeningDate\(newAccountId, data\.openingBalanceDate\)/);
  assert.match(source, /Opening date not verified/);
});

test('invalid stored dates are not presented as verified in account details', () => {
  const source = fs.readFileSync(path.join(__dirname,
    '../src/features/finance/components/AccountDetails.tsx'), 'utf8');
  assert.match(source, /storedDateStatus\?\.valid/);
  assert.match(source, /Stored date needs review/);
});

test('account creation rejects runtime injection of historical date metadata', () => {
  const source = fs.readFileSync(path.join(__dirname,
    '../src/features/finance/store/useLedgerStore.ts'), 'utf8');
  const create = source.slice(source.indexOf('addAccount: (input) => {'),
    source.indexOf('verifyAccountOpeningBalanceDate: (id, date) =>'));
  assert.match(create, /hasOwnProperty\.call\(input, 'openingBalanceDate'\)/);
  assert.match(create, /return ''/);
});

test('same-day movements are allowed after opening balance; later backdating invalidates it', () => {
  const account = baseAccount({ openingBalanceDate: '2026-11-01' });
  const ledger = data(account, [{ id: 'same-day', accountId: 'bank',
    currencyCode: 'EGP', type: 'income', amount: 10, date: '2026-11-01' }]);
  assert.equal(validateAccountOpeningDate(ledger, 'bank', account.openingBalanceDate).valid, true);
  assert.equal(report(ledger).status, 'available');
  ledger.transactions.push({ id: 'backdated', accountId: 'bank',
    currencyCode: 'EGP', type: 'expense', amount: 2, date: '2026-10-31' });
  assert.equal(validateAccountOpeningDate(ledger, 'bank', account.openingBalanceDate).valid, false);
  assert.equal(report(ledger).status, 'historical_data_unavailable');
});
