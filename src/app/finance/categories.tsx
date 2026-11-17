import { Screen } from '@/components/ui';
import { CategoryManagementScreen } from '@/features/finance/components/CategoryManagementScreen';
import { router } from 'expo-router';

export default function CategoriesRoute() {
  return (
    <Screen padded={false}>
      <CategoryManagementScreen onBack={() => router.back()} />
    </Screen>
  );
}
