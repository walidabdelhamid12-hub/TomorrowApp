import type { Ionicons } from '@expo/vector-icons';

export type IconName = keyof typeof Ionicons.glyphMap;

export const CATEGORY_ICONS: IconName[] = [
  'cart-outline', 'restaurant-outline', 'cafe-outline', 'car-outline',
  'home-outline', 'flash-outline', 'phone-portrait-outline', 'medkit-outline',
  'school-outline', 'game-controller-outline', 'shirt-outline', 'gift-outline',
  'airplane-outline', 'paw-outline', 'barbell-outline', 'heart-outline',
  'wallet-outline', 'cash-outline', 'briefcase-outline', 'trending-up-outline',
];