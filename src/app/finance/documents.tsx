import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createDocumentRepository } from '@/features/documents';
import type { DocumentRecord } from '@/features/documents';

const repository = createDocumentRepository(AsyncStorage);

export default function DocumentsScreen() {
  const router = useRouter();
  const [records, setRecords] = useState<readonly DocumentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      <Text style={styles.hint}>Saved documents · read-only preview of your library</Text>
      {loading ? <ActivityIndicator accessibilityLabel="Loading documents" /> : error ? (
        <Text accessibilityRole="alert" style={styles.error}>{error}</Text>
      ) : records.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.name}>No documents saved yet</Text>
          <Text style={styles.detail}>The Android import test uses separate metadata. Production import will be added after this screen is verified.</Text>
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
  empty: { padding: 20, borderRadius: 12, borderWidth: 1, borderColor: '#CBD5E1', gap: 8 },
  item: { padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#CBD5E1', gap: 5 },
  name: { fontSize: 17, fontWeight: '600' },
  detail: { fontSize: 13, color: '#64748B' },
});
