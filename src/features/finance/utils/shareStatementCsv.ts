import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
/** Share the existing escaped, Excel-compatible CSV, without ledger writes. */
export async function shareStatementCsv(csv: string): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) throw new Error('File sharing is not available on this device.');
  const file = new File(Paths.cache, `tomorrow-expenses-${Date.now()}.csv`);
  await file.write(csv);
  if (!file.exists || file.size <= 0) throw new Error('Unable to prepare CSV for sharing.');
  await Sharing.shareAsync(file.uri, { mimeType: 'text/csv', UTI: 'public.comma-separated-values-text', dialogTitle: 'Share Excel-compatible CSV' });
}
