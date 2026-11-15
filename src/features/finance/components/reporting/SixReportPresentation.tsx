import { useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '@/components/ui';
import { useTheme } from '@/theme';

/** Compact disclosure for the six approved reports only. */
export function SixReportDetails({
  title, subtitle, leadingIcon, children
}: {
  title: string;
  subtitle?: string; leadingIcon?: string;
  children: ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const { colors } = useTheme();

  return <View style={{
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 11,
    backgroundColor: colors.surface,
    marginVertical: 4,
    overflow: 'hidden'
  }}>
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Toggle ${title} details`}
      accessibilityState={{ expanded }}
      onPress={() => setExpanded(value => !value)}
      style={{
        minHeight: 49,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 10,
        paddingVertical: 6,
        gap: 8
      }}
    >
      {leadingIcon ? (
        <View style={{ width: 28, height: 28, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <AppText style={{ fontSize: 19, lineHeight: 26, textAlign: 'center' }}>{leadingIcon}</AppText>
        </View>
      ) : <Ionicons name="document-text-outline" size={18} color="#0B315C" />}
      <View style={{ flex: 1, minWidth: 0 }}>
        <AppText variant="bodyStrong" numberOfLines={1}>{title}</AppText>
        {subtitle ? <AppText variant="caption" color="textSecondary" numberOfLines={1}>{subtitle}</AppText> : null}
      </View>
      <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={19} color="#0B315C" />
    </Pressable>
    {expanded ? <View style={{
      paddingHorizontal: 10,
      paddingBottom: 9,
      borderTopWidth: 1,
      borderColor: colors.border
    }}>{children}</View> : null}
  </View>;
}

/** Accounting explanations remain accessible. */
export function SixReportInfo({
  detail, warning = false
}: {
  detail: string;
  warning?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  return <View style={{ marginVertical: 3 }}>
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Report information"
      accessibilityState={{ expanded }}
      onPress={() => setExpanded(value => !value)}
      style={{
        minHeight: 32,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6
      }}
    >
      <Ionicons
        name="information-circle-outline"
        size={17}
        color={warning ? '#B45309' : '#64748B'}
      />
      <AppText variant="caption" color="textSecondary">
        {warning ? 'History incomplete · Details' : 'Report information'}
      </AppText>
      <Ionicons
        name={expanded ? 'chevron-up' : 'chevron-down'}
        size={13}
        color="#64748B"
      />
    </Pressable>
    {expanded ? <AppText variant="caption" color="textSecondary">{detail}</AppText> : null}
  </View>;
}