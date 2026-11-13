import { useCallback, useRef, useState } from 'react';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { isSafeVaultRelativePath } from '@/features/documents/vault/vaultPaths';
import * as Crypto from 'expo-crypto';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createDocumentRepository } from '@/features/documents';
import type { DocumentRecord } from '@/features/documents';
import { createDocumentImporter } from '@/features/documents/import/importDocument';
import { createExpoVaultFileSystem } from '@/features/documents/vault/expoVaultFileSystem';
import { createLocalFileVault } from '@/features/documents/vault/localFileVault';

const repository = createDocumentRepository(AsyncStorage);
const vaultFs = createExpoVaultFileSystem();
const MAX_PDF_BYTES = 1024 * 1024;
const vault = createLocalFileVault(vaultFs, { maxBytes: MAX_PDF_BYTES, nextStageId: () => Crypto.randomUUID() });
const importer = createDocumentImporter({ repository, vault });

export default function DocumentsScreen() {
  const router = useRouter();
  const [records, setRecords] = useState<readonly DocumentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const importLock = useRef(false);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const verifyLock = useRef(false);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const openLock = useRef(false);

  const verifyStoredPdf = async (record: DocumentRecord) => {
    if (verifyLock.current || importLock.current) return;
    verifyLock.current = true;
    setVerifyingId(record.id);
    setNotice(null);
    setError(null);
    try {
      const current = await repository.read(record.id);
      if (!current.ok || !current.value || current.value.vaultPath !== record.vaultPath ||
          current.value.byteSize !== record.byteSize || current.value.sha256 !== record.sha256) {
        throw new Error('Stored document metadata is missing or changed.');
      }
      if (record.mimeType !== 'application/pdf' || !record.sha256 ||
          !/^[a-f0-9]{64}$/i.test(record.sha256)) throw new Error('Stored PDF metadata is invalid.');
      if (!(await vaultFs.exists(record.vaultPath))) throw new Error('Stored PDF file is missing.');
      if ((await vaultFs.size(record.vaultPath)) !== record.byteSize) throw new Error('Stored PDF size mismatch.');
      if ((await vaultFs.digestSha256(record.vaultPath)) !== record.sha256.toLowerCase()) {
        throw new Error('Stored PDF SHA-256 mismatch.');
      }
      setNotice(`PASS: ${record.name} — size and SHA-256 verified (read-only).`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Stored PDF verification failed.');
    } finally {
      verifyLock.current = false;
      setVerifyingId(null);
    }
  };

  const openPdf = async (record: DocumentRecord) => {
    if (openLock.current || verifyLock.current || importLock.current) return;
    openLock.current = true;
    setOpeningId(record.id);
    setNotice(null);
    setError(null);
    try {
      const current = await repository.read(record.id);
      if (!current.ok || !current.value ||
          current.value.vaultPath !== record.vaultPath ||
          current.value.byteSize !== record.byteSize ||
          current.value.sha256 !== record.sha256 ||
          current.value.mimeType !== 'application/pdf' ||
          !current.value.sha256 ||
          !/^[a-f0-9]{64}$/i.test(current.value.sha256) ||
          !isSafeVaultRelativePath(current.value.vaultPath)) {
        throw new Error('Stored PDF metadata failed validation.');
      }
      if (!(await vaultFs.exists(record.vaultPath)) ||
          (await vaultFs.size(record.vaultPath)) !== record.byteSize ||
          (await vaultFs.digestSha256(record.vaultPath)) !== record.sha256.toLowerCase()) {
        throw new Error('Stored PDF integrity check failed. File was not shared.');
      }
      if (!(await Sharing.isAvailableAsync())) throw new Error('No Android share/open handler available.');
      const file = new File(Paths.document, ...record.vaultPath.split('/'));
      await Sharing.shareAsync(file.uri, { mimeType: 'application/pdf', dialogTitle: 'Open or share PDF' });
      setNotice('Android open/share dialog completed. Original vault file was not modified.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open PDF.');
    } finally {
      openLock.current = false;
      setOpeningId(null);
    }
  };

  const refresh = useCallback(async () => {
    const result = await repository.list();
    if (!result.ok) throw new Error('Documents repository could not be read');
    setRecords([...result.value].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  }, []);

  const importPdf = async () => {
    if (importLock.current) return;
    importLock.current = true;
    setImporting(true);
    setNotice(null);
    setError(null);
    try {
      const selection = await File.pickFileAsync({ mimeTypes: ['application/pdf'], multipleFiles: false });
      if (selection.canceled) { setNotice('Selection canceled. Nothing was imported.'); return; }
      const file = selection.result;
      if (!/^(file|content):\/\//.test(file.uri) || !file.exists) throw new Error('Selected PDF cannot be read');
      const size = file.size;
      if (!Number.isSafeInteger(size) || size <= 0 || size > MAX_PDF_BYTES) {
        throw new Error('Select a non-empty PDF no larger than 1 MiB');
      }
      const digest = (await file.digest('SHA-256')).toLowerCase();
      if (!/^[a-f0-9]{64}$/.test(digest)) throw new Error('Unable to verify selected PDF');
      const id = `doc-${Crypto.randomUUID()}`;
      const name = file.name && file.name.length <= 255 ? file.name : `${id}.pdf`;
      const result = await importer.importDocument({
        id, sourceUri: file.uri, category: 'other', source: 'picker', name,
        declaredMime: 'application/pdf', createdAt: new Date().toISOString(),
      });
      if (!result.ok) throw new Error(`Import could not be completed (${result.code}). Existing files were not deleted.`);
      if (result.record.sha256 !== digest || result.record.byteSize !== size ||
          !(await vaultFs.exists(result.record.vaultPath)) ||
          (await vaultFs.size(result.record.vaultPath)) !== size ||
          (await vaultFs.digestSha256(result.record.vaultPath)) !== digest) {
        throw new Error('Import integrity check failed. Stored evidence was preserved.');
      }
      await refresh();
      setNotice(result.kind === 'duplicate' ? 'This PDF is already saved. No duplicate record was created.' : 'PDF saved and verified successfully.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'PDF import failed. No files were automatically deleted.');
    } finally {
      importLock.current = false;
      setImporting(false);
    }
  };

  useFocusEffect(useCallback(() => {
    let active = true;
    setLoading(true);
    setError(null);
    repository.list().then((result) => {
      if (!active) return;
      if (!result.ok) {
        setRecords([]);
        setError('Documents could not be loaded safely. No data was changed.');
      } else {
        setRecords([...result.value].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
      }
    }).catch(() => {
      if (!active) return;
      setRecords([]);
      setError('Documents could not be loaded safely. No data was changed.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []));

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Pressable accessibilityRole="button" accessibilityLabel="Back to Finance" onPress={() => router.back()}>
        <Text style={styles.back}>‹ Back to Finance</Text>
      </Pressable>
      <Text style={styles.title}>Documents</Text>
      <Text style={styles.hint}>Saved PDF documents · stored locally on this device</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Import PDF" disabled={importing || loading || verifyingId !== null || openingId !== null} onPress={importPdf} style={styles.importButton}>
        <Text style={styles.importText}>{importing ? 'Importing…' : '+ Import PDF'}</Text>
      </Pressable>
      <Text style={styles.hint}>PDF only · maximum 1 MiB · no automatic financial transactions</Text>
      {notice ? <Text accessibilityRole="alert" style={styles.success}>{notice}</Text> : null}
      {loading ? <ActivityIndicator accessibilityLabel="Loading documents" /> : error ? (
        <Text accessibilityRole="alert" style={styles.error}>{error}</Text>
      ) : records.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.name}>No documents saved yet</Text>
          <Text style={styles.detail}>Choose + Import PDF to add your first document. Android test documents remain separate.</Text>
        </View>
      ) : records.map((record) => (
        <View key={record.id} style={styles.item}>
          <Text style={styles.name}>{record.name}</Text>
          <Text style={styles.detail}>{record.category} · {record.mimeType}</Text>
          <Text style={styles.detail}>{record.byteSize} bytes · {record.createdAt.slice(0, 10)}</Text>
          <Text style={styles.detail}>Status: {record.status}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={`Open or share PDF ${record.name}`} disabled={openingId !== null || verifyingId !== null || importing} onPress={() => openPdf(record)} style={styles.verifyButton}>
            <Text style={styles.verifyText}>{openingId === record.id ? 'Opening…' : 'Open / Share PDF (Android)'}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={`Verify stored PDF ${record.name}`} disabled={verifyingId !== null || importing || openingId !== null} onPress={() => verifyStoredPdf(record)} style={styles.verifyButton}>
            <Text style={styles.verifyText}>{verifyingId === record.id ? 'Verifying…' : 'Verify stored PDF (read-only)'}</Text>
          </Pressable>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingBottom: 48, gap: 16 },
  back: { color: '#2563EB', fontSize: 16, paddingVertical: 8 },
  title: { fontSize: 28, fontWeight: '700' },
  hint: { fontSize: 14, color: '#64748B' },
  error: { color: '#B91C1C', fontSize: 15 },
  success: { color: '#047857', fontSize: 15 },
  importButton: { backgroundColor: '#2563EB', padding: 14, borderRadius: 10, alignItems: 'center' },
  importText: { color: '#FFFFFF', fontWeight: '700', fontSize: 16 },
  empty: { padding: 20, borderRadius: 12, borderWidth: 1, borderColor: '#CBD5E1', gap: 8 },
  item: { padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#CBD5E1', gap: 5 },
  verifyButton: { paddingVertical: 12, marginTop: 6 },
  verifyText: { color: '#2563EB', fontSize: 15, fontWeight: '600' },
  name: { fontSize: 17, fontWeight: '600' },
  detail: { fontSize: 13, color: '#64748B' },
});
