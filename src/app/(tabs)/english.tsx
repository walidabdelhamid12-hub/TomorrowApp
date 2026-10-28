import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function EnglishRoute() {
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.container}>
        <Text style={styles.title}>English</Text>
        <Text style={styles.subtitle}>Vocabulary, practice, and daily progress</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8FAFC' },
  container: { flex: 1, padding: 16 },
  title: { fontSize: 32, fontWeight: '700', color: '#3B82F6' },
  subtitle: { fontSize: 16, color: '#64748B', marginTop: 4 },
});