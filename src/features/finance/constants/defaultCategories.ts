import type { Category } from '@/features/finance/types/ledger';

/** Stable ids so seeded categories survive app updates and migrations. */
export const DEFAULT_CATEGORIES: Category[] = [
  // Income
  { id: 'cat_salary', name: 'Salary', kind: 'income', icon: 'briefcase-outline', color: '#10B981', isDefault: true },
  { id: 'cat_freelance', name: 'Freelance', kind: 'income', icon: 'laptop-outline', color: '#14B8A6', isDefault: true },
  { id: 'cat_gift_in', name: 'Gifts', kind: 'income', icon: 'gift-outline', color: '#F59E0B', isDefault: true },
  { id: 'cat_other_in', name: 'Other income', kind: 'income', icon: 'add-circle-outline', color: '#64748B', isDefault: true },

  // Expense
  { id: 'cat_food', name: 'Food', kind: 'expense', icon: 'restaurant-outline', color: '#F97316', isDefault: true },
  { id: 'cat_groceries', name: 'Groceries', kind: 'expense', icon: 'cart-outline', color: '#84CC16', isDefault: true },
  { id: 'cat_transport', name: 'Transport', kind: 'expense', icon: 'car-outline', color: '#3B82F6', isDefault: true },
  { id: 'cat_bills', name: 'Bills', kind: 'expense', icon: 'receipt-outline', color: '#EF4444', isDefault: true },
  { id: 'cat_health', name: 'Health', kind: 'expense', icon: 'medkit-outline', color: '#F43F5E', isDefault: true },
  { id: 'cat_education', name: 'Education', kind: 'expense', icon: 'school-outline', color: '#6366F1', isDefault: true },
  { id: 'cat_shopping', name: 'Shopping', kind: 'expense', icon: 'bag-outline', color: '#EC4899', isDefault: true },
  { id: 'cat_charity', name: 'Charity', kind: 'expense', icon: 'heart-outline', color: '#8B5CF6', isDefault: true },
  { id: 'cat_other_out', name: 'Other expenses', kind: 'expense', icon: 'ellipsis-horizontal-circle-outline', color: '#64748B', isDefault: true },
];