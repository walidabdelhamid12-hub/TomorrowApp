import { useCallback, useRef, useState } from 'react';
import { File } from 'expo-file-system';
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
      <Pressable accessibilityRole="button" accessibilityLabel="Import PDF" disabled={importing || loading} onPress={importPdf} style={styles.importButton}>
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
  name: { fontSize: 17, fontWeight: '600' },
  detail: { fontSize: 13, color: '#64748B' },
});
