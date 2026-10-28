import { StyleSheet, Text, View } from 'react-native';

export default function FinanceHomeScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Finance Module (قيد البناء)</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' },
  text: { fontSize: 18, fontWeight: 'bold', color: '#333' },
});