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
  // Use the PDF bytes returned by expo-print instead of trying to read its
  // temporary URI, which may be inaccessible to expo-file-system on Android.
  const { base64 } = await Print.printToFileAsync({ html, base64: true });
  if (!base64 || !base64.startsWith('JVBERi0')) {
    throw new Error('PDF generation did not return valid PDF data.');
  }
  const target = new File(Paths.cache, 'tomorrow-statement-' + Date.now() + '.pdf');
  target.write(base64, { encoding: 'base64' });
  if (!target.exists || target.size <= 0) {
    throw new Error('Unable to prepare the PDF for sharing.');
  }
  await Sharing.shareAsync(target.uri, {
    mimeType: 'application/pdf',
    UTI: 'com.adobe.pdf',
    dialogTitle: 'Share statement PDF',
  });
}
