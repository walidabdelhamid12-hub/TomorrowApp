const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const cache = new Map();

function loadTs(relativePath) {
  const absolutePath = path.resolve(root, relativePath);
  if (cache.has(absolutePath)) return cache.get(absolutePath).exports;

  const source = fs.readFileSync(absolutePath, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
    fileName: absolutePath,
  }).outputText;

  const module = { exports: {} };
  cache.set(absolutePath, module);

  function localRequire(specifier) {
    let target;
    if (specifier.startsWith('@/')) {
      target = path.resolve(root, 'src', specifier.slice(2));
    } else if (specifier.startsWith('.')) {
      target = path.resolve(path.dirname(absolutePath), specifier);
    } else {
      throw new Error(`Unexpected import: ${specifier}`);
    }
    return loadTs(path.relative(root, target + '.ts'));
  }

  new Function('require', 'module', 'exports', compiled)(
    localRequire, module, module.exports
  );
  return module.exports;
}

const { resolveAmountExpression } = loadTs(
  'src/features/finance/utils/amountExpression.ts'
);

test('exact amount regression: currency, lost fractions and unsafe units', () => {
  for (const [input, code] of [
    ['0.0000001+0','USD'], ['9007199254740993','USD'],
    ['9007199254740991+2','USD'], ['1000000000000000+0.001','USD'],
    ['1+2','ZZZ'], ['1','ZZZ'], ['1/3','USD'], ['1/0','OMR'],
    ['90071992547409.91','USD'], ['70368744177664.01','USD'],
    ['9007199254740993-9007199254740992','USD'], ['1.000','USD'],
    ['12,34.56','USD'], ['(1+2','USD'], ['2+','USD'],
    ['('.repeat(33)+'1'+')'.repeat(33),'USD'], ['1'.repeat(257),'USD'],
    ['1.00000000000000000000000000001+0','USD'], ['0-1','USD']
  ]) assert.equal(resolveAmountExpression(input, code), null, input+' '+code);
});
test('exact amount regression: valid amounts and rational cancellation', () => {
  for (const [input, code, expected] of [
    ['0.1+0.2','USD',0.3], ['(1/3)*3','USD',1], ['(2+3)*4','USD',20],
    ['1/8','OMR',0.125], ['1/8','KWD',0.125], ['1.2+3.4','EGP',4.6],
    ['١٢٫٥٠','USD',12.5], ['۱۲٬۳۴۵٫۶۷','USD',12345.67],
    ['12,345.67','USD',12345.67], ['12.','USD',12], ['.5','USD',0.5],
    ['1',' usd ',1], ['1000000000000+0.01','USD',1000000000000.01],
    ['90071992547409','USD',90071992547409], ['(0.001+0.009)*1','USD',0.01]
  ]) assert.equal(resolveAmountExpression(input, code), expected, input+' '+code);
});

const { hasValidCurrencyPrecision } = loadTs('src/features/finance/utils/amountPrecision.ts');
test('shared currency guard rejects lossy, unsupported and malformed direct input', () => {
  for (const [input, code] of [
    ['9007199254740993','USD'], ['90071992547409.91','USD'], ['70368744177664.01','USD'],
    ['1','ZZZ'], ['','ZZZ'], ['1e-7','USD'], ['0.001','USD'], ['1.2.3','USD'],
    ['12,34.56','USD'], ['1,234.56,7','USD'], ['-9007199254740993','USD']
  ]) assert.equal(hasValidCurrencyPrecision(input, code), false, input+' '+code);
});
test('shared currency guard preserves optional empty fee, zero, signed and localized amounts', () => {
  for (const [input, code] of [
    ['', 'USD'], ['  ', 'OMR'], ['0','USD'], ['-0.00','USD'], ['-1.25','USD'],
    ['12.','USD'], ['.5','USD'], ['١٢٫٥٠','USD'], ['۱۲٬۳۴۵٫۶۷','USD'],
    ['0.001','OMR'], ['1,234.567','KWD'], ['90071992547409','USD']
  ]) assert.equal(hasValidCurrencyPrecision(input, code), true, input+' '+code);
});
