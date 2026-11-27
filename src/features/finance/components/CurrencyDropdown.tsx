import { View, type StyleProp, type ViewStyle } from 'react-native';
import { FinanceChoiceDropdown, FINANCE_CURRENCY_CHOICES } from './FinanceChoiceDropdown';

type Props = { label: string; value: string; onChange: (code: string) => void; containerStyle?: StyleProp<ViewStyle> };
export function CurrencyDropdown({ label, value, onChange, containerStyle }: Props) {
  return <View style={[{ flex: 1, minWidth: 0 }, containerStyle]}>
    <FinanceChoiceDropdown label={label} value={value} options={FINANCE_CURRENCY_CHOICES} onChange={onChange} />
  </View>;
}
