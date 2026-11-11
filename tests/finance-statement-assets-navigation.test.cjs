const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = file => fs.readFileSync(path.join(__dirname, '../src/', file), 'utf8');
test('Assets report forwards month and optional asset filter', () => {
  const report = read('app/finance/report-assets.tsx');
  assert.match(report, /pathname: '\/finance\/statement-assets'/);
  assert.match(report, /params: \{ month, \.\.\.\(assetId \? \{ assetId \} : \{\}\) \}/);
});
test('Assets statement lists only recorded movements in selected period without valuations', () => {
  const screen = read('app/finance/statement-assets.tsx');
  assert.match(screen, /aggregateAssetsReport\(assets, period\)/);
  assert.match(screen, /entry\.date >= period\.from && entry\.date <= period\.to/);
  assert.match(screen, /Historical market valuations and unverified balances are unavailable/);
  assert.match(screen, /validateAssetOpeningDate\(assets, asset\.id, asset\.openingBalanceDate\)\.valid/);
  assert.match(screen, /assetReportHistoryAvailable\(asset, period\.from\)/);
  assert.match(screen, /Some asset history is unverified/);
  assert.doesNotMatch(screen, /addAssetEntry|updateAsset|deleteAsset|setState/);
});
