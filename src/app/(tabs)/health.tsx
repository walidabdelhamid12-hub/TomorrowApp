import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function HealthRoute() {
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.container}>
        <Text style={styles.title}>Health</Text>
        <Text style={styles.subtitle}>Habits, workouts, and wellbeing</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8FAFC' },
  container: { flex: 1, padding: 16 },
  title: { fontSize: 32, fontWeight: '700', color: '#F43F5E' },
  subtitle: { fontSize: 16, color: '#64748B', marginTop: 4 },
});