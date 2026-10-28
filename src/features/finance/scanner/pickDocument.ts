import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';

import type { ScanInput, ScanSource } from './types';

function uriToBase64(uri: string): Promise<string> {
  return fetch(uri)
    .then((response) => response.blob())
    .then(
      (blob) =>
        new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onerror = () => reject(new Error('Could not read the file.'));
          reader.onloadend = () => {
            const result = reader.result;
            if (typeof result !== 'string') {
              reject(new Error('Could not read the file.'));
              return;
            }
            const comma = result.indexOf(',');
            resolve(comma >= 0 ? result.slice(comma + 1) : result);
          };
          reader.readAsDataURL(blob);
        })
    );
}

/** Opens the camera, gallery or file picker. Returns null if the user cancels. */
export async function pickDocument(source: ScanSource): Promise<ScanInput | null> {
  if (source === 'file') {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'image/*'],
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets[0]) return null;
    const asset = result.assets[0];
    return {
      uri: asset.uri,
      name: asset.name,
      mimeType: asset.mimeType ?? 'application/pdf',
      base64: await uriToBase64(asset.uri),
    };
  }

  if (source === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      throw new Error('Camera permission is required to scan a document.');
    }
  }

  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'],
    quality: 0.7,
  };
  const result =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);

  if (result.canceled || !result.assets[0]) return null;
  const asset = result.assets[0];
  return {
    uri: asset.uri,
    name: asset.fileName ?? undefined,
    mimeType: asset.mimeType ?? 'image/jpeg',
    base64: await uriToBase64(asset.uri),
  };
}