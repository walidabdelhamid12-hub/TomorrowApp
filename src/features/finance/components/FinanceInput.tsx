/** Finance-scoped input defaults; no changes to the global AppInput. */
import React from 'react';
import { useTheme } from '@/theme';
import { AppInput } from '@/components/ui/AppInput';
import { getFinanceDesignTokens } from '../constants/financeDesignTokens';

type Props = React.ComponentProps<typeof AppInput>;

export const FinanceInput = React.forwardRef<any, Props>(function FinanceInput(
  { fieldStyle, selectionColor, error, ...props }, ref
) {
  const { scheme } = useTheme();
  const tokens = getFinanceDesignTokens(scheme);
  return (
    <AppInput
      {...props}
      error={error}
      ref={ref}
      selectionColor={selectionColor ?? tokens.goldBorder}
      fieldStyle={[{ minHeight: 52, borderColor: error ? tokens.expense : tokens.goldBorder }, fieldStyle]}
    />
  );
});
