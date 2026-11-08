'use strict';
/* global __dirname */
const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const originalLoad = Module._load;
let native;
const sessions = [];

Module._load = function(id, parent, main) {
  if (id === '@react-native-async-storage/async-storage') {
    return { __esModule: true, default: native };
  }
  return originalLoad.call(
    this,
    id.startsWith('@/') ? path.join(root, 'src', id.slice(2)) : id,
    parent,
    main
  );
};

require.extensions['.ts'] = (module, filename) => {
  module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022
    }
  }).outputText, filename);
};

const F = 'tomorrow:finance';
const L = 'tomorrow:ledger';
const J = 'tomorrow:payment-operations';
const marker = { schemaVersion: 1, generationId: 'g' };

function fixture() {
  return new Map([
    [F, JSON.stringify({
      version: 2,
      state: {
        assets: [], debts: [], loans: [], cheques: [],
        paymentJournal: marker
      }
    })],
    [L, JSON.stringify({
      version: 2,
      state: {
        accounts: [], categories: [], transactions: [], transfers: [],
        paymentJournal: marker
      }
    })],
    [J, JSON.stringify({
      version: 3,
      state: {
        installation: { ...marker, phase: 'active' },
        receipts: [],
        baselines: []
      }
    })]
  ]);
}

function creationRequest(kind = 'debt') {
  const common = {
    entityType: kind,
    id: 'entity',
    currencyCode: 'USD',
    payments: [],
    createdAt: '2026-11-06T00:00:00.000Z',
    updatedAt: '2026-11-06T00:00:00.000Z'
  };

  return {
    schemaVersion: 1,
    entity: { entityType: kind, entityId: 'entity' },
    creationId: 'creation',
    generationId: 'g',
    image: kind === 'debt'
      ? {
          ...common,
          direction: 'payable',
          personName: 'Person',
          amount: 100,
          date: '2026-11-06'
        }
      : {
          ...common,
          name: 'Loan',
          lenderName: 'Lender',
          principalAmount: 100,
          totalRepaymentAmount: 120,
          monthlyInstallment: 10,
          numberOfInstallments: 12,
          firstDueDate: '2026-12-06',
          status: 'active'
        }
  };
}

async function setup(data = fixture()) {
  for (const file of Object.keys(require.cache)) {
    if (file.startsWith(path.join(root, 'src', 'features', 'finance'))) {
      delete require.cache[file];
    }
  }

  const events = [];

  native = {
    data,
    events,
    getItem: async key => {
      events.push(['get', key]);
      return data.get(key) ?? null;
    },
    setItem: async (key, value) => {
      events.push(['set', key, value]);
      data.set(key, value);
    },
    removeItem: async key => {
      events.push(['remove', key]);
      data.delete(key);
    }
  };

  const mod = require('../src/features/finance/store/paymentOperationRuntime.ts');
  const runtime = mod.createPaymentOperationRuntime(native);
  mod.installPaymentRuntimeBeforeStores(runtime);

  const { useFinanceStore: finance } =
    require('../src/features/finance/store/useFinanceStore.ts');
  const { useLedgerStore: ledger } =
    require('../src/features/finance/store/useLedgerStore.ts');

  const session = {
    runtime,
    finance,
    ledger,
    native,
    access: null
  };

  sessions.push(session);

  await Promise.all([
    finance.persist.rehydrate(),
    ledger.persist.rehydrate()
  ]);

  session.access = mod.createCoordinatorRuntimeAccess(runtime);
  return session;
}

afterEach(async () => {
  await Promise.all(sessions.splice(0).map(s => s.runtime.close()));
});

for (const kind of ['debt', 'loan']) {
  test(`${kind} creation authority remains denied without trusted allocation witness`, async () => {
    const s = await setup();
    const before = new Map(s.native.data);

    await assert.rejects(
      s.access.checkCreationAuthority(creationRequest(kind)),
      /private fresh-entity allocation witness is not implemented/i
    );

    assert.deepEqual(s.native.data, before);
    assert.equal(
      s.native.events.filter(e => e[0] === 'set' || e[0] === 'remove').length,
      0
    );

    const status = s.runtime.getStatus();
    assert.equal(status.postingAllowed, false);
    assert.equal(status.readiness, 'blocked');
  });
}

for (const [name, change, reason = /^Error: Invalid creation provenance evidence\.$/] of [
  ['wrong schema version', x => { x.schemaVersion = 2; }],
  ['entity ID mismatch', x => { x.entity.entityId = 'different'; }],
  ['entity type mismatch', x => { x.entity.entityType = 'loan'; }],
  ['empty creation ID', x => { x.creationId = ''; }],
  ['wrong generation', x => { x.generationId = 'other'; }, /Creation authority installation or generation is unverified or stale\./],
  ['unexpected authority flag', x => { x.authorized = true; }],
  ['nonempty payment history', x => { x.image.payments.push({ id: 'payment' }); }],
]) {
  test(`creation authority rejects ${name}`, async () => {
    const s = await setup();
    const before = new Map(s.native.data);
    const input = creationRequest();
    change(input);

    await assert.rejects(
      s.access.checkCreationAuthority(input),
      reason
    );

    assert.deepEqual(s.native.data, before);
    assert.equal(
      s.native.events.filter(e => e[0] === 'set' || e[0] === 'remove').length,
      0
    );
    assert.equal(s.runtime.getStatus().postingAllowed, false);
    assert.equal(s.runtime.getStatus().readiness, 'blocked');
  });
}

for (const [name, modify, reason] of [
  ['missing V3 journal', data => data.delete(J), /Coordinator leases require an existing V3 journal; no promotion is performed\./],
  ['legacy V2 journal', data => {
    data.set(J, JSON.stringify({ version: 2, state: {} }));
  }, /Coordinator leases require an existing V3 journal; no promotion is performed\./],
  ['malformed journal JSON', data => data.set(J, '{invalid'), { name: 'SyntaxError', message: /JSON/ }],
  ['existing debt identity', data => {
    const document = JSON.parse(data.get(F));
    const { entityType, ...debt } = creationRequest().image;
    document.state.debts.push(debt);
    data.set(F, JSON.stringify(document));
  }, /Existing or retained identity cannot receive new creation authority\./],
]) {
  test(`creation authority denies ${name}`, async () => {
    const s = await setup();
    modify(s.native.data);
    const before = new Map(s.native.data);
    const writesBefore = s.native.events.filter(
      e => e[0] === 'set' || e[0] === 'remove'
    ).length;

    await assert.rejects(
      s.access.checkCreationAuthority(creationRequest()),
      reason
    );

    assert.deepEqual(s.native.data, before);
    assert.equal(
      s.native.events.filter(
        e => e[0] === 'set' || e[0] === 'remove'
      ).length,
      writesBefore
    );
    assert.equal(s.runtime.getStatus().postingAllowed, false);
    assert.equal(s.runtime.getStatus().readiness, 'blocked');
  });
}

test('creation authority denies requests after runtime close', async () => {
  const s = await setup();
  await s.runtime.close();

  const before = new Map(s.native.data);
  const writesBefore = s.native.events.filter(
    e => e[0] === 'set' || e[0] === 'remove'
  ).length;

  await assert.rejects(
    s.access.checkCreationAuthority(creationRequest()),
    /closed|closing/i
  );

  assert.deepEqual(s.native.data, before);
  assert.equal(
    s.native.events.filter(
      e => e[0] === 'set' || e[0] === 'remove'
    ).length,
    writesBefore
  );
  assert.equal(s.runtime.getStatus().postingAllowed, false);
});

// Characterizes the dormant stage boundary; no production posting or V3 activation.
test('finance stage whitelist rejects creationProvenance retained by actual persistence', async () => {
  const data = fixture();
  const document = JSON.parse(data.get(F));
  document.state.creationProvenance = { schemaVersion: 1, entries: [] };
  data.set(F, JSON.stringify(document));
  const s = await setup(data);
  const before = new Map(s.native.data);
  const stateBefore = s.finance.getState();
  const persisted = JSON.parse(s.native.data.get(F)).state;
  assert.deepEqual(stateBefore.creationProvenance, persisted.creationProvenance);
  const request = { operationId: 'stage-regression', entity: creationRequest().entity, predecessor: null };
  const binding = { ...request, key: F, stage: 'finance-insert' };

  await assert.rejects(s.access.withWriteLease(request, async lease => {
    await lease.write(lease.issue(binding), binding, persisted);
  }), /^Error: Private stage requires a complete persisted accounting document\.$/);

  assert.equal(s.finance.getState(), stateBefore);
  assert.deepEqual(s.native.data, before);
  assert.equal(s.native.events.filter(e => e[0] === 'set' || e[0] === 'remove').length, 0);
  assert.equal(s.runtime.getStatus().postingAllowed, false);
  assert.equal(s.runtime.getStatus().readiness, 'blocked');
  assert.match(s.runtime.getStatus().writeFence, /authorized stage failed/);
});
