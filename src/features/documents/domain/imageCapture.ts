export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export function imageCaptureMetadata(asset: { uri: string; mimeType?: string | null; fileName?: string | null }, id: string) {
  if (!/^(file|content):\/\//.test(asset.uri)) throw new Error('Unsupported image URI');
  const mime = asset.mimeType?.toLowerCase();
  const ext = mime === 'image/jpeg' ? 'jpg' : mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : null;
  if (!ext || !mime) throw new Error('Unsupported image type. Select JPEG, PNG or WebP.');
  const name = asset.fileName?.trim();
  return { mime, name: name && name.length <= 255 && !/[\\/\x00-\x1f]/.test(name) && new RegExp(ext === 'jpg' ? '\\.(jpg|jpeg)$' : '\\.' + ext + '$', 'i').test(name) ? name : `${id}.${ext}` };
}
