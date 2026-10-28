import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppButton, AppText } from '@/components/ui';
import { pickDocument } from '@/features/finance/scanner/pickDocument';
import { getScanProvider } from '@/features/finance/scanner/providers';
import type {
    ScanResult,
    ScanSource,
} from '@/features/finance/scanner/types';
import { moduleColors, useTheme } from '@/theme';

interface ScanDocumentButtonProps {
  onResult: (result: ScanResult) => void;
}

/** Camera / gallery / PDF buttons that fill the transaction form from a document. */
export function ScanDocumentButton({ onResult }: ScanDocumentButtonProps) {
  const { spacing } = useTheme();
  const [busy, setBusy] = useState<ScanSource | null>(null);
  const [message, setMessage] = useState<string | undefined>();

  const run = async (source: ScanSource) => {
    const provider = getScanProvider();
    if (!provider) {
      setMessage(
        'Scanner is not set up yet. Set EXPO_PUBLIC_OCR_ENDPOINT to your OCR service.'
      );
      return;
    }

    setBusy(source);
    setMessage(undefined);
    try {
      const input = await pickDocument(source);
      if (!input) return;

      const result = await provider.extract(input);
      if (result.amount === undefined && result.date === undefined) {
        setMessage('No amount or date found. Please enter them manually.');
        return;
      }
      onResult(result);
      setMessage('Filled from the document. Please review before saving.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Scan failed.');
    } finally {
      setBusy(null);
    }
  };

  const accent = moduleColors.finance;

  return (
    <View>
      <AppText
        variant="label"
        color="textSecondary"
        style={{ marginBottom: spacing.xs }}
      >
        SCAN CHEQUE / RECEIPT / PDF
      </AppText>
      <View style={styles.row}>
        <View style={[styles.flex, { marginEnd: spacing.sm }]}>
          <AppButton
            title="Camera"
            variant="outline"
            accentColor={accent}
            loading={busy === 'camera'}
            disabled={busy !== null}
            onPress={() => void run('camera')}
          />
        </View>
        <View style={[styles.flex, { marginHorizontal: spacing.xs }]}>
          <AppButton
            title="Gallery"
            variant="outline"
            accentColor={accent}
            loading={busy === 'gallery'}
            disabled={busy !== null}
            onPress={() => void run('gallery')}
          />
        </View>
        <View style={[styles.flex, { marginStart: spacing.sm }]}>
          <AppButton
            title="PDF"
            variant="outline"
            accentColor={accent}
            loading={busy === 'file'}
            disabled={busy !== null}
            onPress={() => void run('file')}
          />
        </View>
      </View>
      {message ? (
        <AppText
          variant="caption"
          color="textSecondary"
          style={{ marginTop: spacing.xs }}
        >
          {message}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row' },
});