import { useEffect, useRef, useState } from 'react';
import { Button, ScrollView, Text, View } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as Crypto from 'expo-crypto';
import * as DocumentPicker from 'expo-document-picker';
import { createExpoVaultFileSystem } from '@/features/documents/vault/expoVaultFileSystem';
import { createLocalFileVault } from '@/features/documents/vault/localFileVault';
import { extensionForMime } from '@/features/documents/vault/vaultPaths';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createDocumentRepository, DOCUMENTS_NAMESPACE, validateDocument } from '@/features/documents';
import type { DocumentRecord, DocumentStorageBackend } from '@/features/documents';
import { createDocumentImporter } from '@/features/documents/import/importDocument';
import type { ImportDocumentResult } from '@/features/documents/import/importDocument';

const vaultFs = createExpoVaultFileSystem();

// ---------------------------------------------------------------------------
// Import integration test support (test-only; never touches Finance stores).
// Documents metadata is redirected to a dedicated namespace by a key-rewriting
// adapter. Every AsyncStorage key used below must start with TEST_PREFIX.
// ---------------------------------------------------------------------------
const TEST_PREFIX = 'tomorrow:vault-test:v1:';
const EVIDENCE_PREFIX = `${TEST_PREFIX}evidence:`;
const TEST_MIME = 'application/pdf';
const TEST_MAX_BYTES = 1024 * 1024;
const RECORD_FIELDS = [
  'id', 'category', 'status', 'source', 'name', 'mimeType',
  'byteSize', 'vaultPath', 'sha256', 'createdAt', 'updatedAt',
] as const;

function namespacesAreDisjoint(): boolean {
  return !TEST_PREFIX.startsWith(DOCUMENTS_NAMESPACE) && !DOCUMENTS_NAMESPACE.startsWith(TEST_PREFIX);
}

/** Only route from the Documents repository to AsyncStorage. Fails closed on any foreign key. */
function createIsolatedBackend(readOnly: boolean): DocumentStorageBackend {
  const mapKey = (key: string): string => {
    if (!namespacesAreDisjoint()) throw new Error('Test and production namespaces overlap');
    if (typeof key !== 'string' || !key.startsWith(DOCUMENTS_NAMESPACE)) {
      throw new Error('Refusing storage key outside the Documents namespace');
    }
    const mapped = TEST_PREFIX + key.slice(DOCUMENTS_NAMESPACE.length);
    if (!mapped.startsWith(TEST_PREFIX) || mapped.startsWith(DOCUMENTS_NAMESPACE)) {
      throw new Error('Storage isolation violation');
    }
    return mapped;
  };
  return {
    getItem: (key) => AsyncStorage.getItem(mapKey(key)),
    setItem: async (key, value) => {
      if (readOnly) throw new Error('Read-only backend: write refused');
      await AsyncStorage.setItem(mapKey(key), value);
    },
  };
}

function evidenceKey(runId: string, part: 'start' | 'result'): string {
  if (!/^[a-f0-9-]{36}$/.test(runId)) throw new Error('Invalid run id');
  return `${EVIDENCE_PREFIX}${runId}:${part}`;
}

/** Evidence is write-once: an existing key is never overwritten. */
async function writeOnce(key: string, value: string): Promise<void> {
  if (!key.startsWith(TEST_PREFIX) || key.startsWith(DOCUMENTS_NAMESPACE)) {
    throw new Error('Refusing to write outside the test namespace');
  }
  if ((await AsyncStorage.getItem(key)) !== null) throw new Error(`Refusing to overwrite ${key}`);
  await AsyncStorage.setItem(key, value);
  if ((await AsyncStorage.getItem(key)) !== value) throw new Error('Evidence write verification failed');
}

async function sha256Hex(text: string): Promise<string> {
  return (await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, text)).toLowerCase();
}

function sameRecord(a: DocumentRecord, b: DocumentRecord): boolean {
  return RECORD_FIELDS.every((field) => a[field] === b[field]);
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parseJson(raw: string | null): Record<string, unknown> | null {
  if (raw === null) return null;
  try { return asObject(JSON.parse(raw)); } catch { return null; }
}

function isPendingClear(raw: string | null): boolean {
  return raw === null || raw === 'null';
}

/** Creates one uniquely named test document through the real importer. Never deletes anything. */
async function runImportIntegrationTest(): Promise<string> {
  const lines: string[] = [];
  const note = (message: string) => { lines.push(message); };
  const check = (ok: boolean, label: string) => {
    if (!ok) throw new Error(`CHECK FAILED: ${label}`);
    note(`PASS: ${label}`);
  };
  let runId = '';
  let documentId = '';
  let importSummary: unknown = null;
  try {
    check(namespacesAreDisjoint(), 'Test and production namespaces are disjoint');
    note(`Test namespace: ${TEST_PREFIX}`);
    const pendingRaw = await AsyncStorage.getItem(`${TEST_PREFIX}pending-import`);
    if (!isPendingClear(pendingRaw)) {
      throw new Error('Unfinished test import found in the test namespace. Not starting a new run; evidence preserved.');
    }
    note('PASS: No unfinished test import');

    runId = Crypto.randomUUID();
    documentId = `vt-${runId}`;
    const content = `%PDF-1.4\nTomorrow import integration ${runId}\n%%EOF\n`;
    if (![...content].every((ch) => ch === '\n' || (ch >= ' ' && ch <= '~'))) {
      throw new Error('Test content must be ASCII so character count equals byte count');
    }
    const expectedBytes = content.length;
    const expectedSha = await sha256Hex(content);
    const expectedPath = `vault/objects/${expectedSha.slice(0, 2)}/${expectedSha}.pdf`;
    note(`Run ID: ${runId}`);
    note(`Document ID: ${documentId}`);
    note(`Expected SHA-256: ${expectedSha}`);
    note(`Expected bytes: ${expectedBytes}`);

    const prodIndexKey = `${DOCUMENTS_NAMESPACE}index`;
    const prodPendingKey = `${DOCUMENTS_NAMESPACE}pending-import`;
    const prodRecordKey = `${DOCUMENTS_NAMESPACE}record:${documentId}`;
    const prodIndexRaw = await AsyncStorage.getItem(prodIndexKey);
    const prodPendingRaw = await AsyncStorage.getItem(prodPendingKey);
    check((await AsyncStorage.getItem(prodRecordKey)) === null, 'Production key for this document id is absent (read-only check)');

    const source = new File(Paths.cache, `tomorrow-import-${runId}.pdf`);
    if (source.exists) throw new Error('Source collision');
    source.create();
    await source.write(content);
    check(source.exists, 'Source file created');
    check((await vaultFs.sourceSize(source.uri)) === expectedBytes, 'Source size equals expected bytes');

    await writeOnce(evidenceKey(runId, 'start'), JSON.stringify({
      version: 1,
      kind: 'vault-test-start',
      runId,
      documentId,
      startedAt: new Date().toISOString(),
      sourceUri: source.uri,
      expected: { sha256: expectedSha, byteSize: expectedBytes, mimeType: TEST_MIME, vaultPath: expectedPath },
      testNamespace: TEST_PREFIX,
      productionSnapshot: {
        indexSha256: prodIndexRaw === null ? null : await sha256Hex(prodIndexRaw),
        pendingSha256: prodPendingRaw === null ? null : await sha256Hex(prodPendingRaw),
      },
    }));
    note('PASS: Start evidence saved (write-once)');

    const repository = createDocumentRepository(createIsolatedBackend(false));
    const vault = createLocalFileVault(vaultFs, {
      maxBytes: TEST_MAX_BYTES,
      nextStageId: () => Crypto.randomUUID(),
    });
    const importer = createDocumentImporter({ vault, repository });
    const result: ImportDocumentResult = await importer.importDocument({
      id: documentId,
      sourceUri: source.uri,
      category: 'other',
      source: 'picker',
      name: `vault-test-${runId.slice(0, 8)}.pdf`,
      declaredMime: TEST_MIME,
      createdAt: new Date().toISOString(),
    });
    importSummary = result;
    if (!result.ok) {
      throw new Error(`Import failed: ${result.code}; detail=${result.detail ?? '(none)'}; evidence=${JSON.stringify(result.evidence ?? null)}`);
    }
    check(result.kind === 'created', 'Importer created a new record');
    check(result.vaultOutcome === 'stored', 'Vault stored a new object');
    const record = result.record;
    check(record.id === documentId, 'Record id matches');
    check(record.status === 'stored' && record.mimeType === TEST_MIME, 'Record status and MIME type');
    check(record.sha256 === expectedSha, 'Record SHA-256 equals independently computed SHA-256');
    check(record.byteSize === expectedBytes, 'Record byte size equals expected size');
    check(record.vaultPath === expectedPath, 'Vault path equals expected content-addressed path');
    check(await vaultFs.exists(record.vaultPath), 'Vault object exists');
    check((await vaultFs.size(record.vaultPath)) === expectedBytes, 'Vault object size equals expected size');
    check((await vaultFs.digestSha256(record.vaultPath)) === expectedSha, 'Vault object SHA-256 equals expected SHA-256');

    const read = await repository.read(documentId);
    if (!read.ok || read.value === null) throw new Error('Repository readback failed');
    check(sameRecord(read.value, record), 'Repository readback matches imported record');
    const listed = await repository.list();
    if (!listed.ok) throw new Error('Repository listing failed');
    const matches = listed.value.filter((item) => item.id === documentId);
    check(matches.length === 1 && sameRecord(matches[0], record), 'Repository listing contains exactly one matching record');

    const rawStored = parseJson(await AsyncStorage.getItem(`${TEST_PREFIX}record:${documentId}`));
    check(rawStored !== null && RECORD_FIELDS.every((field) => rawStored[field] === record[field]), 'Raw test-namespace storage holds the record');
    check(isPendingClear(await AsyncStorage.getItem(`${TEST_PREFIX}pending-import`)), 'No pending import state remains in test namespace');
    check((await AsyncStorage.getItem(prodRecordKey)) === null, 'Production record key still absent');
    check((await AsyncStorage.getItem(prodIndexKey)) === prodIndexRaw, 'Production Documents index unchanged');
    check((await AsyncStorage.getItem(prodPendingKey)) === prodPendingRaw, 'Production pending-import state unchanged');

    await writeOnce(evidenceKey(runId, 'result'), JSON.stringify({
      version: 1,
      kind: 'vault-test-result',
      runId,
      documentId,
      finishedAt: new Date().toISOString(),
      status: 'passed',
      record,
      vaultOutcome: result.vaultOutcome,
      steps: lines,
    }));
    note('PASS: Result evidence saved (write-once)');
    note('RESULT: PASS (device run complete; persistence NOT yet verified across restart)');
    note('NEXT: fully close and reopen the app, then press "Verify Persistence (read-only)".');
  } catch (error) {
    note(`RESULT: FAIL - ${String(error)}`);
    if (runId) {
      try {
        await writeOnce(evidenceKey(runId, 'result'), JSON.stringify({
          version: 1,
          kind: 'vault-test-result',
          runId,
          documentId,
          finishedAt: new Date().toISOString(),
          status: 'failed',
          error: String(error),
          importResult: importSummary,
          steps: lines,
        }));
        note('Failure evidence saved (write-once).');
      } catch (evidenceError) {
        note(`Could not save failure evidence: ${String(evidenceError)}`);
      }
    }
  }
  note('No files, staging files or metadata were deleted.');
  return lines.join('\n');
}


// Manual Android picker smoke test. Uses isolated TEST_PREFIX metadata but the
// existing shared app-private vault object store. Only use non-sensitive fixtures.
async function runPickerImportTest(): Promise<string> {
  const lines: string[] = [];
  const note = (message: string) => { lines.push(message); };
  try {
    if (!namespacesAreDisjoint()) throw new Error('Test namespace overlaps production');
    if (!isPendingClear(await AsyncStorage.getItem(`${TEST_PREFIX}pending-import`))) {
      throw new Error('Pending test import exists; preserve evidence and stop');
    }
    const picked = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'],
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (picked.canceled) return 'RESULT: CANCELED - no import attempted';
    if (picked.assets.length !== 1) throw new Error('Expected exactly one selected document');
    const asset = picked.assets[0];
    const mime = asset.mimeType;
    if (!mime || !extensionForMime(mime)) throw new Error('Unsupported or missing MIME type');
    if (!asset.uri.startsWith('file://') && !asset.uri.startsWith('content://')) throw new Error('Unsupported source URI');
    if (!asset.name || asset.name.length > 255) throw new Error('Invalid file name');
    if (asset.size !== undefined && (!Number.isSafeInteger(asset.size) || asset.size <= 0 || asset.size > TEST_MAX_BYTES)) {
      throw new Error('Selected file size is invalid or exceeds the 1 MiB test limit');
    }
    // Android's document provider may return a content URI that File cannot
    // query directly. The picker was requested to copy into app cache; verify
    // that cache copy before handing it to the existing vault importer.
    note(`Picker URI scheme: ${asset.uri.startsWith('file://') ? 'file' : 'content'}`);
    note(`Picker MIME: ${mime}; reported size: ${asset.size ?? 'unknown'}`);
    let selectedFile: File;
    try {
      selectedFile = new File(asset.uri);
    } catch {
      throw new Error('Picker URI cannot be opened by expo-file-system File');
    }
    let accessible: boolean;
    try {
      accessible = selectedFile.exists;
    } catch {
      throw new Error('Picker cache existence check threw');
    }
    note(`Picker cache accessible: ${accessible}`);
    if (!accessible) {
      throw new Error('Picker cache copy unavailable; selected file was not imported');
    }
    let actualSize: number;
    try {
      actualSize = selectedFile.size;
    } catch {
      throw new Error('Picker cache size read threw');
    }
    note(`Readable source bytes: ${actualSize}`);
    if (!Number.isSafeInteger(actualSize) || actualSize <= 0 || actualSize > TEST_MAX_BYTES) {
      throw new Error('Source exceeds the 1 MiB test limit or is empty');
    }
    if (asset.size !== undefined && asset.size !== actualSize) throw new Error('Picker size differs from readable source size');

    const id = `vt-picker-${Crypto.randomUUID()}`;
    const prodIndexKey = `${DOCUMENTS_NAMESPACE}index`;
    const prodPendingKey = `${DOCUMENTS_NAMESPACE}pending-import`;
    const prodRecordKey = `${DOCUMENTS_NAMESPACE}record:${id}`;
    const prodIndex = await AsyncStorage.getItem(prodIndexKey);
    const prodPending = await AsyncStorage.getItem(prodPendingKey);
    if ((await AsyncStorage.getItem(prodRecordKey)) !== null) throw new Error('Production ID collision');
    const repository = createDocumentRepository(createIsolatedBackend(false));
    const vault = createLocalFileVault(vaultFs, {
      maxBytes: TEST_MAX_BYTES,
      nextStageId: () => Crypto.randomUUID(),
    });
    const result = await createDocumentImporter({ vault, repository }).importDocument({
      id, sourceUri: asset.uri, category: 'other', source: 'picker',
      name: asset.name, declaredMime: mime, createdAt: new Date().toISOString(),
    });
    if (!result.ok) throw new Error(`Import failed: ${result.code}; ${result.detail ?? 'no detail'}`);
    const record = result.record;
    if (record.byteSize !== actualSize || !await vaultFs.exists(record.vaultPath) ||
        await vaultFs.size(record.vaultPath) !== actualSize ||
        await vaultFs.digestSha256(record.vaultPath) !== record.sha256) {
      throw new Error('Stored object integrity verification failed');
    }
    const read = await repository.read(record.id);
    if (!read.ok || !read.value || !sameRecord(read.value, record)) throw new Error('Repository readback mismatch');
    const listed = await repository.list();
    if (!listed.ok || listed.value.filter((item) => item.id === record.id).length !== 1) {
      throw new Error('Repository listing mismatch');
    }
    if ((await AsyncStorage.getItem(prodIndexKey)) !== prodIndex ||
        (await AsyncStorage.getItem(prodPendingKey)) !== prodPending ||
        (await AsyncStorage.getItem(prodRecordKey)) !== null) {
      throw new Error('Production Documents metadata changed unexpectedly');
    }
    note(`PASS: Picker imported ${record.byteSize} bytes; ${result.kind}; SHA-256 ${record.sha256}`);
    note('PASS: Vault integrity, repository readback, and production metadata isolation');
    note('RESULT: PASS - manual picker test; persistence after restart not yet verified');
  } catch (error) {
    note(`RESULT: FAIL - ${String(error)}`);
  }
  note('No files or metadata automatically deleted. Test and production share the vault object directory.');
  return lines.join('\\n');
}

/** Strictly read-only: AsyncStorage get/getAllKeys, repository read/list, vault exists/size/digest. */
async function runPersistenceVerification(): Promise<string> {
  const lines: string[] = [];
  let failures = 0;
  let warnings = 0;
  let verified = 0;
  const pass = (message: string) => { lines.push(`PASS: ${message}`); };
  const fail = (message: string) => { failures += 1; lines.push(`FAIL: ${message}`); };
  const warn = (message: string) => { warnings += 1; lines.push(`WARN: ${message}`); };
  try {
    if (!namespacesAreDisjoint()) throw new Error('Test and production namespaces overlap');
    const keys = await AsyncStorage.getAllKeys();
    const runIds = new Set<string>();
    for (const key of keys) {
      if (!key.startsWith(EVIDENCE_PREFIX)) continue;
      const match = /^([a-f0-9-]{36}):(start|result)$/.exec(key.slice(EVIDENCE_PREFIX.length));
      if (match) runIds.add(match[1]);
    }
    if (runIds.size === 0) {
      return 'No test runs found in the test namespace. Run "Run Import Integration Test" first.\nNothing was read from production and nothing was written.';
    }
    const repository = createDocumentRepository(createIsolatedBackend(true));
    if (!isPendingClear(await AsyncStorage.getItem(`${TEST_PREFIX}pending-import`))) {
      fail('Unfinished pending-import state exists in the test namespace (evidence preserved)');
    } else {
      pass('No pending-import state in test namespace');
    }
    const listed = await repository.list();
    if (!listed.ok) fail(`Repository listing failed: ${listed.error}`);
    else pass(`Repository lists ${listed.value.length} test document(s)`);

    const runs: { runId: string; startedAt: string; start: Record<string, unknown> | null; result: Record<string, unknown> | null }[] = [];
    for (const runId of runIds) {
      const start = parseJson(await AsyncStorage.getItem(evidenceKey(runId, 'start')));
      const result = parseJson(await AsyncStorage.getItem(evidenceKey(runId, 'result')));
      runs.push({ runId, startedAt: typeof start?.startedAt === 'string' ? start.startedAt : '', start, result });
    }
    runs.sort((a, b) => (a.startedAt < b.startedAt ? -1 : a.startedAt > b.startedAt ? 1 : 0));
    lines.push(`Runs found: ${runs.length}`);

    for (const run of runs) {
      const label = `run ${run.runId.slice(0, 8)}`;
      if (!run.start) warn(`${label}: start evidence missing or unreadable`);
      if (!run.result) { warn(`${label}: no result evidence (run was interrupted; evidence preserved)`); continue; }
      if (run.result.status === 'failed') { warn(`${label}: failed when it ran: ${String(run.result.error)}`); continue; }
      if (run.result.status !== 'passed') { fail(`${label}: unknown result status`); continue; }
      try {
        const candidate: unknown = run.result.record;
        validateDocument(candidate);
        const record: DocumentRecord = candidate;
        const expected = asObject(run.start?.expected);
        if (expected && (expected.sha256 !== record.sha256 || expected.byteSize !== record.byteSize || expected.vaultPath !== record.vaultPath)) {
          fail(`${label}: recorded result differs from start evidence`);
          continue;
        }
        if (!(await vaultFs.exists(record.vaultPath))) { fail(`${label}: vault object missing at ${record.vaultPath}`); continue; }
        if ((await vaultFs.size(record.vaultPath)) !== record.byteSize) { fail(`${label}: vault object size changed`); continue; }
        if ((await vaultFs.digestSha256(record.vaultPath)) !== record.sha256) { fail(`${label}: vault object SHA-256 changed`); continue; }
        const read = await repository.read(record.id);
        if (!read.ok || read.value === null || !sameRecord(read.value, record)) { fail(`${label}: repository readback missing or different`); continue; }
        if (!listed.ok || listed.value.filter((item) => item.id === record.id).length !== 1) { fail(`${label}: not listed exactly once`); continue; }
        if ((await AsyncStorage.getItem(`${DOCUMENTS_NAMESPACE}record:${record.id}`)) !== null) { fail(`${label}: unexpected production record key`); continue; }
        verified += 1;
        pass(`${label}: file ${record.byteSize} bytes, SHA-256 ${record.sha256.slice(0, 12)}..., readback, listing, isolation`);
      } catch (error) {
        fail(`${label}: ${String(error)}`);
      }
    }
  } catch (error) {
    fail(`Verification aborted: ${String(error)}`);
  }
  if (failures > 0) lines.push(`RESULT: FAIL (${failures} failure(s), ${warnings} warning(s))`);
  else if (verified === 0) lines.push(`RESULT: INCONCLUSIVE - no completed passing run to verify (${warnings} warning(s))`);
  else lines.push(`RESULT: PASS - ${verified} run(s) verified after restart (${warnings} warning(s))`);
  lines.push('Read-only: nothing was written or deleted.');
  return lines.join('\n');
}

export default function VaultTestScreen() {
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState('Ready â€” no test files created yet.');

  async function runStoreIntegrationTest() {
    if (busy) return;
    setBusy(true);
    const messages: string[] = [];
    try {
      const id = Crypto.randomUUID();
      const source = new File(Paths.cache, `tomorrow-store-${id}.pdf`);
      if (source.exists) throw new Error('Source collision');
      messages.push('STEP: Create source');
      source.create();
      await source.write(`%PDF-1.4\nTomorrow store integration ${id}\n%%EOF\n`);
      if (!source.exists) throw new Error('Source missing after write');
      messages.push('PASS: Source created');

      const vault = createLocalFileVault(vaultFs, {
        maxBytes: 1024 * 1024,
        nextStageId: () => Crypto.randomUUID(),
      });
      messages.push('STEP: First store');
      const first = await vault.store({ sourceUri: source.uri, declaredMime: 'application/pdf' });
      if (!first.ok) throw new Error(`First store failed: ${first.code}; stage=${first.stagedRelPath ?? '(none)'}`);
      if (first.outcome !== 'stored' || !first.verified) throw new Error('First store was not verified stored');
      if (!(await vaultFs.exists(first.objectRelPath))) throw new Error('Stored object missing');
      if ((await vaultFs.size(first.objectRelPath)) !== first.byteSize) throw new Error('Stored size mismatch');
      if ((await vaultFs.digestSha256(first.objectRelPath)) !== first.sha256) throw new Error('Stored digest mismatch');
      messages.push('PASS: First store verified');

      messages.push('STEP: Duplicate store');
      const second = await vault.store({ sourceUri: source.uri, declaredMime: 'application/pdf' });
      if (!second.ok) throw new Error(`Duplicate store failed: ${second.code}; stage=${second.stagedRelPath ?? '(none)'}`);
      if (second.outcome !== 'duplicate' || !second.verified) throw new Error('Expected verified duplicate');
      if (second.objectRelPath !== first.objectRelPath || second.sha256 !== first.sha256 || second.byteSize !== first.byteSize) throw new Error('Duplicate metadata mismatch');
      if (!second.leftoverStageRelPath || !(await vaultFs.exists(second.leftoverStageRelPath))) throw new Error('Duplicate staging was not retained');
      if ((await vaultFs.digestSha256(first.objectRelPath)) !== first.sha256) throw new Error('Original object changed');
      messages.push('PASS: Duplicate preserved original');
      messages.push(`Object: ${first.objectRelPath}`);
      messages.push(`Retained stage: ${second.leftoverStageRelPath}`);
      messages.push('RESULT: PASS');
    } catch (error) {
      messages.push(`RESULT: FAIL - ${String(error)}`);
    } finally {
      messages.push('No files automatically deleted.');
      setReport(messages.join('\n'));
      setBusy(false);
    }
  }
  async function runTest() {
    if (busy) return;
    setBusy(true);
    const messages: string[] = [];
    let stagePath = '';
    let objectPath = '';
    try {
      const id = Crypto.randomUUID();
      const stage = `vault/staging/${id}.part`;
      stagePath = stage;
      const source = new File(Paths.cache, `tomorrow-vault-${id}.pdf`);
      if (source.exists) throw new Error('Source collision');
      messages.push('STEP: Before source.create');
      source.create();
      messages.push(`PASS: Source created; exists=${source.exists}`);
      messages.push('STEP: Before source.write');
      await source.write(`%PDF-1.4\nTomorrow Vault test ${id}\n%%EOF\n`);
      messages.push(`PASS: Source written; exists=${source.exists}`);
      messages.push('STEP: Before sourceSize');
      const sourceSize = await vaultFs.sourceSize(source.uri);
      messages.push(`PASS: Source size=${sourceSize}`);
      if (sourceSize <= 0) throw new Error('Empty source');
      messages.push('PASS: Source created and sized');
      await vaultFs.ensureParentDirectory(stage);
      await vaultFs.copySourceNoOverwrite(source.uri, stage);
      if (!(await vaultFs.exists(stage)) || (await vaultFs.size(stage)) !== sourceSize) throw new Error('Staging size mismatch');
      messages.push('PASS: Stage copy and size');
      const hash = await vaultFs.digestSha256(stage);
      if (!/^[a-f0-9]{64}$/.test(hash)) throw new Error('Invalid SHA-256');
      messages.push('PASS: SHA-256 digest');
      const object = `vault/objects/${hash.slice(0, 2)}/${hash}.pdf`;
      objectPath = object;
      if (await vaultFs.exists(object)) throw new Error('Unexpected existing object; no overwrite attempted');
      await vaultFs.ensureParentDirectory(object);
      await vaultFs.moveNoOverwrite(stage, object);
      if (await vaultFs.exists(stage)) throw new Error('Stage remained after move');
      if (!(await vaultFs.exists(object))) throw new Error('Object missing');
      if ((await vaultFs.size(object)) !== sourceSize) throw new Error('Object size mismatch');
      if ((await vaultFs.digestSha256(object)) !== hash) throw new Error('Object hash mismatch');
      messages.push('PASS: Promotion, size, digest');
      let refused = false;
      try { await vaultFs.copySourceNoOverwrite(source.uri, object); } catch { refused = true; }
      if (!refused || (await vaultFs.digestSha256(object)) !== hash) throw new Error('Overwrite protection failed');
      messages.push('PASS: Existing object preserved');
      messages.push('RESULT: PASS');
    } catch (error) {
      messages.push(`RESULT: FAIL â€” ${String(error)}`);
    } finally {
      messages.push(`Stage: ${stagePath || '(none)'}`);
      messages.push(`Object: ${objectPath || '(none)'}`);
      messages.push('No files automatically deleted.');
      setReport(messages.join('\n'));
      setBusy(false);
    }
  }

  const busyRef = useRef(false);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  async function runExclusive(work: () => Promise<string>) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    let text: string;
    try { text = await work(); }
    catch (error) { text = `RESULT: FAIL - unexpected error: ${String(error)}`; }
    busyRef.current = false;
    if (mountedRef.current) {
      setReport(text);
      setBusy(false);
    }
  }
  const runImportIntegration = () => runExclusive(runImportIntegrationTest);
  const runPersistenceCheck = () => runExclusive(runPersistenceVerification);
  const runPickerImport = () => runExclusive(runPickerImportTest);

  return (
    <ScrollView contentContainerStyle={{ padding: 24, gap: 16 }}>
      <Text style={{ fontSize: 24, fontWeight: 'bold' }}>Vault Android Test</Text>
      <Text>Isolated test using app-private sample files. No automatic deletion.</Text>
      <Button title={busy ? 'Running...' : 'Run Vault Test'} onPress={runTest} disabled={busy} />
      <Button title={busy ? 'Running...' : 'Run Store Integration Test'} onPress={runStoreIntegrationTest} disabled={busy} />
      <Button title={busy ? 'Running...' : 'Run Import Integration Test'} onPress={runImportIntegration} disabled={busy} />
      <Button title={busy ? 'Running...' : 'Verify Persistence (read-only)'} onPress={runPersistenceCheck} disabled={busy} />
      <Text>Picker test: choose a NON-SENSITIVE PDF/image (max 1 MiB). Stored test files are not deleted and share the app-private vault directory.</Text>
      <Button title={busy ? 'Running...' : 'Select Test Document (Picker Import)'} onPress={runPickerImport} disabled={busy} />
      <View style={{ padding: 12, borderRadius: 8, backgroundColor: '#eeeeee' }}>
        <Text selectable style={{ color: '#111111' }}>{report}</Text>
      </View>
    </ScrollView>
  );
}