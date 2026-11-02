import { Screen } from '@/components/ui';
import { CategoryManagementScreen } from '@/features/finance/components/CategoryManagementScreen';

export default function CategoriesRoute() {
  return (
    <Screen padded={false}>
      <CategoryManagementScreen />
    </Screen>
  );
}
