import { View } from 'react-native';
import { AppText } from '@/components/ui';
import type { Asset } from '@/features/finance/types/finance';
import { useTheme } from '@/theme';

export function AssetTrendChart({
  assets, unit, compact = false,
}: {
  assets: readonly Asset[];
  unit: string;
  compact?: boolean;
}) {
  const { colors } = useTheme();

  const entries = assets.flatMap(asset =>
    asset.entries.map(entry => ({
      date: entry.date,
      amount: entry.amount,
    }))
  );

  const dates = [...new Set(entries.map(item => item.date))].sort();
  let cumulative = 0;

  const points = dates.map(date => {
    for (const entry of entries) {
      if (entry.date === date) cumulative += entry.amount;
    }
    return { date, amount: Math.round(cumulative * 1000) / 1000 };
  });

  const valid = points.every(point => Number.isFinite(point.amount));
  const width = compact ? 155 : 280;
  const height = compact ? 100 : 120;
  const min = Math.min(0, ...points.map(point => point.amount));
  const max = Math.max(0, ...points.map(point => point.amount));
  const scale = max - min || 1;

  const coords = points.map((point, index) => ({
    x: points.length === 1
      ? width / 2
      : 8 + index * (width - 16) / (points.length - 1),
    y: height - 8 - (point.amount - min) / scale * (height - 16),
  }));

  return (
    <View style={{
      padding: compact ? 0 : 10,
      marginVertical: compact ? 0 : 6,
      borderWidth: compact ? 0 : 1,
      borderColor: colors.border,
      borderRadius: 12,
      backgroundColor: colors.surface,
    }}>
      {!compact && <AppText variant="bodyStrong">Recorded Movements Trend · {unit}</AppText>}
      {!compact && <AppText variant="caption" color="textSecondary">
        Cumulative recorded movements by date. Not verified historical balances or market prices.
      </AppText>}

      {!valid || points.length === 0 ? (
        <AppText variant="caption">No valid dated movements to chart.</AppText>
      ) : (
        <>
          {points.length === 1 && <AppText variant="caption" color="textSecondary">Only one recorded date is available; the marker shows a single observation, not a trend.</AppText>}
          <View style={{
            width,
            height,
            alignSelf: 'center',
            marginVertical: compact ? 4 : 12,
          }}>
            {coords.slice(1).map((point, index) => {
              const previous = coords[index];
              const dx = point.x - previous.x;
              const dy = point.y - previous.y;
              const length = Math.sqrt(dx * dx + dy * dy);
              const angle = Math.atan2(dy, dx) * 180 / Math.PI;

              return (
                <View key={index} style={{
                  position: 'absolute',
                  left: previous.x,
                  top: previous.y,
                  width: length,
                  height: 2,
                  backgroundColor: '#0B7497',
                  transform: [
                    { translateX: (dx - length) / 2 },
                    { translateY: dy / 2 },
                    { rotate: `${angle}deg` },
                  ],
                }} />
              );
            })}

            {coords.map((point, index) => (
              <View key={index} style={{
                position: 'absolute',
                left: point.x - 3,
                top: point.y - 3,
                width: 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: '#0B7497',
              }} />
            ))}
          </View>

          {!compact && <AppText variant="caption" color="textSecondary">
            {points[0].date}: {points[0].amount.toFixed(3)} {unit}
            {' → '}
            {points[points.length - 1].date}: {points[points.length - 1].amount.toFixed(3)} {unit}
          </AppText>}
        </>
      )}
    </View>
  );
}