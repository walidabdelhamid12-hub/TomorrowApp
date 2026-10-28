import { Stack } from 'expo-router';

import CategoriesScreen from '../features/finance/screens/CategoriesScreen';

export default function CategoriesRoute() {
  return (
    <>
      <Stack.Screen options={{ title: 'إدارة الفئات' }} />
      <CategoriesScreen />
    </>
  );
}