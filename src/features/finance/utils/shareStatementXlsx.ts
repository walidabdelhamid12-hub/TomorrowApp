import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { bytesToBase64 } from './expensesXlsx';

/** Share a real XLSX workbook using the mobile system share sheet. */
export async function shareStatementXlsx(bytes: Uint8Array): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) throw new Error('File sharing is not available on this device.');
  if (bytes.length < 22 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new Error('Invalid XLSX workbook');
  const file = new File(Paths.cache, `tomorrow-expenses-${Date.now()}.xlsx`);
  await file.write(bytesToBase64(bytes), { encoding: 'base64' });
  if (!file.exists || file.size <= 0) throw new Error('Unable to prepare XLSX for sharing.');
  await Sharing.shareAsync(file.uri, {
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    UTI: 'org.openxmlformats.spreadsheetml.sheet',
    dialogTitle: 'Share Expenses Excel workbook',
  });
}
