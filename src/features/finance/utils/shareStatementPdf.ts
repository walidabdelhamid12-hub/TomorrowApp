import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

/**
 * Print's temporary URI may be outside the shareable Expo file directory on
 * Android. Copy into the app cache before asking the OS to share it.
 * No ledger writes or persistent document storage.
 */
export async function shareStatementPdf(html: string): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('File sharing is not available on this device.');
  }
  const { uri } = await Print.printToFileAsync({ html });
  const source = new File(uri);
  if (!source.exists || source.size <= 0) {
    throw new Error('The generated PDF is missing or empty.');
  }
  const target = new File(Paths.cache, 'tomorrow-statement-' + Date.now() + '.pdf');
  source.copy(target);
  if (!target.exists || target.size <= 0) {
    throw new Error('Unable to prepare the PDF for sharing.');
  }
  await Sharing.shareAsync(target.uri, {
    mimeType: 'application/pdf',
    UTI: 'com.adobe.pdf',
    dialogTitle: 'Share statement PDF',
  });
}
