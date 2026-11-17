// Real preference store and ThemeProvider; only native surfaces and AsyncStorage IO are mocked.
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');
const root = path.resolve(path.dirname(module.filename), '..'), originalLoad = Module._load;
const memory = new Map();
let states, cursor, effects, context, tree, calls, reads, writes, canGoBack, systemScheme;
const permittedKeys = new Set(['tomorrow:theme-mode', 'tomorrow-finance-preferences']);
const storage = {
  async getItem(key) { assert.ok(permittedKeys.has(key), key); reads.push(key); return memory.get(key) ?? null; },
  async setItem(key, value) { assert.ok(permittedKeys.has(key), key); writes.push([key, value]); memory.set(key, value); },
  async removeItem(key) { assert.ok(permittedKeys.has(key), key); memory.delete(key); },
};
const hooks = { ...React,
  createContext: () => ({ Provider: 'ThemeContext' }), useContext: () => context,
  useState(initial) { const index = cursor++; if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial;
    return [states[index], next => { states[index] = typeof next === 'function' ? next(states[index]) : next; }]; },
  useEffect(fn, deps) { const index = cursor++; if (!states[index] || deps.some((value, i) => value !== states[index][i])) { states[index] = deps; effects.push(fn); } },
  useMemo: fn => fn(), useCallback: fn => fn, useDebugValue() {},
  useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot(),
};
Module._load = function(id, parent, main) {
  if (id === 'react') return hooks;
  if (id === 'react-native') return { View: 'View', Pressable: 'Pressable', useColorScheme: () => systemScheme,
    Platform: { OS: 'android' }, StyleSheet: { create: value => value, hairlineWidth: 1 } };
  if (id === '@react-native-async-storage/async-storage') return { __esModule: true, default: storage };
  if (id === '@expo/vector-icons') return { Ionicons: 'Ionicon' };
  if (id === '@/components/ui') return { AppText: 'AppText', Screen: 'Screen' };
  if (id === 'expo-router') return { useRouter: () => ({ canGoBack: () => canGoBack,
    back: () => calls.push('back'), replace: value => calls.push(['replace', value]) }) };
  if (/useLedgerStore|useFinanceStore|paymentOperations|expo-notifications/.test(id)) throw Error('Forbidden dependency: ' + id);
  return originalLoad.call(this, id.startsWith('@/') ? path.join(root, 'src', id.slice(2)) : id, parent, main);
};
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(
  ts.transpileModule(fs.readFileSync(filename, 'utf8'), { fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, filename);

// Initialize IO counters before the real persisted store's automatic hydration starts.
reads = []; writes = [];
const { ThemeProvider } = require('../src/theme/ThemeProvider.tsx');
const { useFinancePreferences: preferences } = require('../src/features/finance/store/useFinancePreferences.ts');
const Settings = require('../src/app/finance/settings.tsx').default;
const Notifications = require('../src/app/finance/notifications.tsx').default;
function expand(node) {
  if (Array.isArray(node)) return node.map(expand);
  if (!React.isValidElement(node)) return node;
  if (typeof node.type === 'function') return expand(node.type(node.props));
  if (node.type === 'ThemeContext') context = node.props.value;
  return { type: node.type, props: { ...node.props, children: expand(node.props.children) } };
}
function render(Screen = Settings) { cursor = 0; tree = expand(React.createElement(ThemeProvider, null, React.createElement(Screen))); }
function nodes(type, node = tree) {
  if (Array.isArray(node)) return node.flatMap(child => nodes(type, child));
  if (!node || typeof node !== 'object') return [];
  return [...(node.type === type ? [node] : []), ...nodes(type, node.props.children ?? null)];
}
function control(label) { const node = nodes('Pressable').find(n => n.props.accessibilityLabel === label); assert.ok(node, label); return node; }
const tick = () => new Promise(resolve => setImmediate(resolve));
async function hydrate(Screen = Settings) { render(Screen); for (const effect of effects.splice(0)) effect(); await tick(); render(Screen); }
beforeEach(async () => {
  memory.clear(); states = []; cursor = 0; effects = []; context = null; calls = []; reads = []; writes = [];
  canGoBack = true; systemScheme = 'light';
  await preferences.persist.rehydrate(); preferences.setState({ amountsVisible: false });
  reads = []; writes = [];
});

test('appearance options call the real provider, persist the exact choice and survive remount', async () => {
  await hydrate();
  for (const value of ['dark', 'light', 'system']) {
    const radio = control('Appearance: ' + value); assert.equal(radio.props.accessibilityRole, 'radio');
    radio.props.onPress(); render();
    assert.equal(control('Appearance: ' + value).props.accessibilityState.checked, true);
    assert.equal(memory.get('tomorrow:theme-mode'), value);
    states = []; effects = []; await hydrate();
    assert.equal(control('Appearance: ' + value).props.accessibilityState.checked, true);
    assert.equal(context.scheme, value === 'system' ? systemScheme : value);
  }
  assert.deepEqual(new Set(writes.map(([key]) => key)), new Set(['tomorrow:theme-mode']));
});
test('saved system appearance follows the device; invalid saved preference falls back safely', async () => {
  systemScheme = 'dark'; memory.set('tomorrow:theme-mode', 'system'); await hydrate();
  assert.equal(context.mode, 'system'); assert.equal(context.scheme, 'dark');
  states = []; effects = []; memory.set('tomorrow:theme-mode', 'invalid'); await hydrate();
  assert.equal(context.mode, 'system'); assert.equal(context.scheme, 'dark');
});
test('privacy switch persists using the real preference store and survives rehydration', async () => {
  await hydrate(); const toggle = control('Show Finance amounts');
  assert.equal(toggle.props.accessibilityRole, 'switch'); assert.equal(toggle.props.accessibilityState.checked, false);
  toggle.props.onPress(); render();
  assert.equal(control('Show Finance amounts').props.accessibilityState.checked, true);
  const saved = memory.get('tomorrow-finance-preferences');
  assert.equal(JSON.parse(saved).state.amountsVisible, true);
  preferences.setState({ amountsVisible: false }); memory.set('tomorrow-finance-preferences', saved);
  await preferences.persist.rehydrate(); render();
  assert.equal(control('Show Finance amounts').props.accessibilityState.checked, true);
  control('Show Finance amounts').props.onPress(); render();
  assert.equal(control('Show Finance amounts').props.accessibilityState.checked, false);
  assert.equal(JSON.parse(memory.get('tomorrow-finance-preferences')).state.amountsVisible, false);
  assert.deepEqual(new Set(writes.map(([key]) => key)), new Set(['tomorrow-finance-preferences']));
});
for (const Screen of [Settings, Notifications]) {
  test(Screen.name + ' Back returns through the stack and direct-entry Back falls back to Home', async () => {
    await hydrate(Screen); control('Back').props.onPress(); assert.deepEqual(calls, ['back']);
    calls = []; canGoBack = false; render(Screen); control('Back').props.onPress();
    assert.deepEqual(calls, [['replace', '/']]);
  });
}
test('Notifications is an honest empty screen with no inbox storage, badges or side effects', async () => {
  await hydrate(); reads = []; writes = []; render(Notifications);
  assert.ok(nodes('AppText').some(n => n.props.children === 'No notifications yet'));
  assert.deepEqual(nodes('Pressable').map(n => n.props.accessibilityLabel), ['Back']);
  assert.deepEqual(reads, []); assert.deepEqual(writes, []); assert.deepEqual(calls, []);
});
