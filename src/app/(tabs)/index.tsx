import { StyleSheet, Text, View } from 'react-native';

export default function HomeScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Finance Dashboard</Text>
      <Text style={styles.subtitle}>جارٍ ربط الـ Finance Store...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    justifyContent: 'center', 
    alignItems: 'center', 
    backgroundColor: '#fff',
    padding: 20 
  },
  title: { 
    fontSize: 24, 
    fontWeight: 'bold', 
    color: '#10B981',
    marginBottom: 8 
  },
  subtitle: { 
    fontSize: 16, 
    color: '#666' 
  },
});