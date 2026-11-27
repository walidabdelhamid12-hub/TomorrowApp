import { useAppLanguage } from '@/localization/LanguageProvider';
import { useCallback, useMemo, useRef, useState } from 'react';
import { File, Paths } from 'expo-file-system';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { imageCaptureMetadata, MAX_IMAGE_BYTES } from '@/features/documents/domain/imageCapture';
import * as Sharing from 'expo-sharing';
import { isSafeVaultRelativePath, objectPath, extensionForMime } from '@/features/documents/vault/vaultPaths';
import * as Crypto from 'expo-crypto';
import { ActivityIndicator, Alert, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createDocumentRepository } from '@/features/documents';
import type { DocumentCategory, DocumentRecord } from '@/features/documents';
import { createDocumentImporter } from '@/features/documents/import/importDocument';
import { readPdfWithNativeRuntime, type NativePdfReadResult } from '@/features/documents/extraction/pdfNativeRuntime';
import { DOCUMENT_COMMANDS, commandRoute, openInNativeViewer, type FileCommand, type ReadResult } from '@/features/documents/domain/documentCommands';
import { createExpoVaultFileSystem } from '@/features/documents/vault/expoVaultFileSystem';
import { createLocalFileVault } from '@/features/documents/vault/localFileVault';
import { FinanceButton } from '@/features/finance/components/FinanceButton';
import { AppText, Screen } from '@/components/ui';
import { useTheme } from '@/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { categoryLabels, selectDocuments, type DocumentSort } from '@/features/documents/domain/documentList';

const repository = createDocumentRepository(AsyncStorage);
const vaultFs = createExpoVaultFileSystem();
const MAX_PDF_BYTES = 1024 * 1024;
const vault = createLocalFileVault(vaultFs, { maxBytes: MAX_PDF_BYTES, nextStageId: () => Crypto.randomUUID() });
const importer = createDocumentImporter({ repository, vault });
const imageImporter = createDocumentImporter({ repository, vault: createLocalFileVault(vaultFs, { maxBytes: MAX_IMAGE_BYTES, nextStageId: () => Crypto.randomUUID() }) });
async function recoverPending() {
  return repository.recoverPendingImport(async record => {
    if (!record.sha256 || record.byteSize <= 0 || record.vaultPath !== objectPath(record.sha256, record.mimeType)) return false;
    return await vaultFs.exists(record.vaultPath) &&
      await vaultFs.size(record.vaultPath) === record.byteSize &&
      await vaultFs.digestSha256(record.vaultPath) === record.sha256;
  });
}
function nextDocumentUpdateTimestamp(previous: string): string {
  return new Date(Math.max(Date.now(), Date.parse(previous) + 1)).toISOString();
}
const categoryOptions: readonly { value: DocumentCategory; label: string }[] = [
  { value: 'receipt', label: 'Receipt' },
  { value: 'invoice', label: 'Invoice' },
  { value: 'contract', label: 'Contract' },
  { value: 'bank_statement', label: 'Bank Statement' },
  { value: 'handwritten_note', label: 'Handwritten Note' },
  { value: 'other', label: 'Other' },
];

export default function DocumentsScreen({ onClose }: { onClose?: () => void } = {}) {
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const { spacing } = useTheme();
  const { bottom: bottomInset } = useSafeAreaInsets();
  const [preview, setPreview] = useState<{ uri: string; name: string; mode: 'edit' | 'preview' } | null>(null);
  const [qrOpen, setQrOpen] = useState(false);
  const [qrText, setQrText] = useState<string | null>(null);
  const qrLock = useRef(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [edited, setEdited] = useState<{uri: string; width: number; height: number} | null>(null);
  const [editingImage, setEditingImage] = useState(false);
  const editLock = useRef(false);
  const [tool, setTool] = useState<'rotate' | 'crop' | 'compress' | null>(null);
  const [angle, setAngle] = useState(0);
  const [quality, setQuality] = useState(65);
  const [editMessage, setEditMessage] = useState('');
  const [cropSize, setCropSize] = useState({width: 1, height: 1});
  const [cropBox, setCropBox] = useState({x: 0, y: 0, w: 1, h: 1});
  const cropStart = useRef({x: 0, y: 0, box: {x:0,y:0,w:1,h:1}, corner: -1});
  const [zoom, setZoom] = useState(1);
  const [previewError, setPreviewError] = useState(false);
  const { t } = useAppLanguage();
  const { fromAdd } = useLocalSearchParams<{ fromAdd?: string }>();
  const [records, setRecords] = useState<readonly DocumentRecord[]>([]);
  const [filterMenu, setFilterMenu] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<DocumentCategory | 'all'>('all');
  const [sort, setSort] = useState<DocumentSort>('newest');
  const visibleRecords = useMemo(() => selectDocuments(records, query, filter, sort), [records, query, filter, sort]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recoveryBlocked, setRecoveryBlocked] = useState(false);
  const [importing, setImporting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const importLock = useRef(false);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const verifyLock = useRef(false);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const openLock = useRef(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [readResult, setReadResult] = useState<{ id: string; sha256: string | null; result: ReadResult | NativePdfReadResult } | null>(null);
  const [integrity, setIntegrity] = useState<{ id: string; sha256: string | null; ok: boolean } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<DocumentCategory>('other');
  const [savingCategory, setSavingCategory] = useState(false);
  const categoryLock = useRef(false);

  const saveCategory = async (record: DocumentRecord) => {
    if (categoryLock.current || importLock.current || openLock.current || verifyLock.current) return;
    categoryLock.current = true;
    setSavingCategory(true);
    setError(null);
    setNotice(null);
    try {
      const current = await repository.read(record.id);
      if (!current.ok || !current.value || current.value.updatedAt !== record.updatedAt ||
          current.value.vaultPath !== record.vaultPath || current.value.sha256 !== record.sha256) {
        throw new Error('Document changed. Reload before editing its category.');
      }
      if (current.value.category === selectedCategory) {
        setEditingId(null);
        setNotice('Category unchanged.');
        return;
      }
      const updated = { ...current.value, category: selectedCategory, updatedAt: nextDocumentUpdateTimestamp(current.value.updatedAt) };
      const result = await repository.update(updated, current.value.updatedAt);
      if (!result.ok) throw new Error(`Category could not be saved (${result.error}). Reload and retry.`);
      await refresh();
      setEditingId(null);
      setNotice('Document category saved. Original file and fingerprint unchanged.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Category update failed.');
    } finally {
      categoryLock.current = false;
      setSavingCategory(false);
    }
  };

  const verifyStoredDocument = async (record: DocumentRecord) => {
    if (verifyLock.current || importLock.current || categoryLock.current || openLock.current) return;
    verifyLock.current = true;
    setVerifyingId(record.id);
    setIntegrity(null);
    setNotice(null);
    setError(null);
    try {
      const current = await repository.read(record.id);
      if (!current.ok || !current.value || current.value.updatedAt !== record.updatedAt || current.value.vaultPath !== record.vaultPath ||
          current.value.byteSize !== record.byteSize || current.value.sha256 !== record.sha256 || current.value.mimeType !== record.mimeType) {
        throw new Error('Stored document metadata is missing or changed.');
      }
      if (!extensionForMime(record.mimeType) || !record.sha256 ||
          !/^[a-f0-9]{64}$/i.test(record.sha256) || record.vaultPath !== objectPath(record.sha256, record.mimeType)) throw new Error('Stored document metadata is invalid.');
      if (!(await vaultFs.exists(record.vaultPath))) throw new Error('Stored document file is missing.');
      if ((await vaultFs.size(record.vaultPath)) !== record.byteSize) throw new Error('Stored document size mismatch.');
      if ((await vaultFs.digestSha256(record.vaultPath)) !== record.sha256.toLowerCase()) {
        throw new Error('Stored document SHA-256 mismatch.');
      }
      setIntegrity({ id: record.id, sha256: record.sha256, ok: true });
    } catch (e) {
      setIntegrity({ id: record.id, sha256: record.sha256, ok: false });
      setError(e instanceof Error ? e.message : 'Stored document verification failed.');
    } finally {
      verifyLock.current = false;
      setVerifyingId(null);
    }
  };

  const openDocument = async (record: DocumentRecord, command: FileCommand) => {
    if (openLock.current || verifyLock.current || importLock.current || categoryLock.current) return;
    openLock.current = true;
    setOpeningId(record.id);
    setIntegrity(null);
    setNotice(null);
    setError(null);
    if (command === 'read') { setReadResult(null); setExpandedId(record.id); }
    try {
      const route = commandRoute(command, record.mimeType);
      const current = await repository.read(record.id);
      if (!current.ok || !current.value ||
          current.value.updatedAt !== record.updatedAt || current.value.vaultPath !== record.vaultPath ||
          current.value.byteSize !== record.byteSize ||
          current.value.sha256 !== record.sha256 ||
          current.value.mimeType !== record.mimeType || !extensionForMime(current.value.mimeType) ||
          !current.value.sha256 ||
          !/^[a-f0-9]{64}$/i.test(current.value.sha256) ||
          !isSafeVaultRelativePath(current.value.vaultPath) || current.value.vaultPath !== objectPath(current.value.sha256, current.value.mimeType)) {
        throw new Error('Stored document metadata failed validation.');
      }
      const expectedSha256 = current.value.sha256;
      if (!(await vaultFs.exists(record.vaultPath)) ||
          (await vaultFs.size(record.vaultPath)) !== record.byteSize ||
          (await vaultFs.digestSha256(record.vaultPath)) !== expectedSha256.toLowerCase()) {
        throw new Error('Stored document integrity check failed. Command was not executed.');
      }
      setIntegrity({ id: record.id, sha256: record.sha256, ok: true });
      const file = new File(Paths.document, ...record.vaultPath.split('/'));
      if (route === 'category-edit') {
        setExpandedId(record.id);
        setSelectedCategory(record.category);
        setEditingId(record.id);
        return;
      }
      if (route === 'image-preview' || route === 'image-edit') {
        setZoom(1);
        setPreviewError(false);
        setEdited(null);
        setTool(null);
        setEditMessage('');
        setPreview({ uri: file.uri, name: record.name, mode: route === 'image-edit' ? 'edit' : 'preview' });
        return;
      }
      if (route === 'pdf-preview-unavailable') {
        throw new Error(t('Internal PDF preview is not available. Use Open for the native viewer.', 'المعاينة الداخلية لملف PDF غير متاحة. استخدم فتح للعارض الخارجي.'));
      }
      if (route === 'native-open') {
        await openInNativeViewer(file, record.mimeType, record.name);
        return;
      }
      if (route === 'pdf-read' || route === 'image-read-unavailable') {
        const result = route === 'pdf-read'
          ? await readPdfWithNativeRuntime(file.uri, { sha256: expectedSha256.toLowerCase(), bytes: record.byteSize })
          : { ok: false as const, reason: 'image_ocr_unavailable' as const };
        setReadResult({ id: record.id, sha256: record.sha256, result });
        return;
      }
      if (!(await Sharing.isAvailableAsync())) throw new Error('No sharing handler available.');
      await Sharing.shareAsync(file.uri, { mimeType: record.mimeType, dialogTitle: t('Share document', 'مشاركة المستند') });
      setNotice(t('Sharing dialog closed. Original preserved.', 'تم إغلاق نافذة المشاركة. الأصل محفوظ.'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open document.');
    } finally {
      openLock.current = false;
      setOpeningId(null);
    }
  };

  const refresh = useCallback(async () => {
    const result = await repository.list();
    if (!result.ok) throw new Error('Documents repository could not be read');
    setRecords([...result.value].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  }, []);

  const importPdf = async () => {
    if (importLock.current || categoryLock.current || openLock.current || verifyLock.current) return;
    importLock.current = true;
    setImporting(true);
    setNotice(null);
    setError(null);
    try {
      const recovery = await recoverPending();
      setRecoveryBlocked(!recovery.ok);
      if (!recovery.ok) throw new Error('Pending import could not be recovered safely. Evidence preserved.');
      if (recovery.value) { await refresh(); setNotice('Pending document recovered.'); return; }
      const selection = await File.pickFileAsync({ mimeTypes: ['application/pdf'], multipleFiles: false });
      if (selection.canceled) { setNotice('Selection canceled. Nothing was imported.'); return; }
      const file = selection.result;
      if (!/^(file|content):\/\//.test(file.uri) || !file.exists) throw new Error('Selected PDF cannot be read');
      const size = file.size;
      if (!Number.isSafeInteger(size) || size <= 0 || size > MAX_PDF_BYTES) {
        throw new Error('Select a non-empty PDF no larger than 1 MiB');
      }
      const digest = (await file.digest('SHA-256')).toLowerCase();
      if (!/^[a-f0-9]{64}$/.test(digest)) throw new Error('Unable to verify selected PDF');
      const id = `doc-${Crypto.randomUUID()}`;
      const name = file.name && file.name.length <= 255 ? file.name : `${id}.pdf`;
      const result = await importer.importDocument({
        id, sourceUri: file.uri, category: 'other', source: 'picker', name,
        declaredMime: 'application/pdf', createdAt: new Date().toISOString(),
      });
      if (!result.ok) throw new Error(`Import could not be completed (${result.code}). Existing files were not deleted.`);
      if (result.record.sha256 !== digest || result.record.byteSize !== size ||
          !(await vaultFs.exists(result.record.vaultPath)) ||
          (await vaultFs.size(result.record.vaultPath)) !== size ||
          (await vaultFs.digestSha256(result.record.vaultPath)) !== digest) {
        throw new Error('Import integrity check failed. Stored evidence was preserved.');
      }
      await refresh();
      setNotice(result.kind === 'duplicate' ? 'This PDF is already saved. No duplicate record was created.' : 'PDF saved and verified successfully.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'PDF import failed. No files were automatically deleted.');
    } finally {
      importLock.current = false;
      setImporting(false);
    }
  };

  const startQr = async () => {
    if (importLock.current || openLock.current || verifyLock.current || categoryLock.current || qrLock.current) return;
    qrLock.current = true;
    try {
      const permission = cameraPermission?.granted ? cameraPermission : await requestCameraPermission();
      if (!permission.granted) { setNotice(t('Camera permission denied.', 'لم يتم السماح بالكاميرا.')); return; }
      setQrText(null);
      setQrOpen(true);
    } catch (e) { setError(e instanceof Error ? e.message : 'QR camera unavailable.'); }
    finally { qrLock.current = false; }
  };
  const editImage = async (kind: 'rotate' | 'crop' | 'compress') => {
    if (!preview || editLock.current) return;
    editLock.current = true; setEditingImage(true); setEditMessage('');
    try {
      const uri = edited?.uri ?? preview.uri;
      const dimensions = edited ?? await new Promise<{width: number; height: number}>((resolve, reject) => Image.getSize(uri, (width, height) => resolve({width, height}), reject));
      const w = dimensions.width, h = dimensions.height;
      if (!Number.isSafeInteger(w) || !Number.isSafeInteger(h) || w < 2 || h < 2) throw new Error('Invalid image dimensions.');
      const before = new File(uri).size;
      const x = Math.min(w-1, Math.floor(cropBox.x * w)), y = Math.min(h-1, Math.floor(cropBox.y * h));
      const actions = kind === 'rotate' ? [{rotate: angle}] : kind === 'crop' ? [{crop: {originX: x, originY: y, width: Math.min(w-x, Math.floor(cropBox.w*w)), height: Math.min(h-y, Math.floor(cropBox.h*h))}}] : [];
      if (kind === 'crop' && (cropBox.w*w < 2 || cropBox.h*h < 2)) throw new Error('Select a larger crop area.');
      const result = await manipulateAsync(uri, actions, {compress: kind === 'compress' ? quality / 100 : 1, format: SaveFormat.JPEG});
      const after = new File(result.uri).size;
      if (!Number.isSafeInteger(before) || before <= 0 || !Number.isSafeInteger(after) || after <= 0) throw new Error('Cannot measure image size.');
      if (kind === 'compress') {
        setEditMessage(`${(before/1024).toFixed(1)} KB → ${(after/1024).toFixed(1)} KB (${((1-after/before)*100).toFixed(1)}%)` + (after >= before ? ' — ' + t('No size reduction; previous image kept.', 'لم ينخفض الحجم؛ تم الاحتفاظ بالصورة السابقة.') : ''));
        if (after >= before) { setTool(null); return; }
      }
      setEdited(result); setZoom(1); setTool(null); setAngle(0); setPreviewError(false);
    } catch (e) { setEditMessage(e instanceof Error ? e.message : 'Image edit failed.'); }
    finally { editLock.current = false; setEditingImage(false); }
  };
  const openTool = async (kind: 'rotate' | 'crop' | 'compress') => {
    if (!preview || editLock.current) return;
    setAngle(0); setEditMessage(''); setCropBox({x:0.1,y:0.1,w:0.8,h:0.8});
    if (kind === 'crop') {
      editLock.current = true; setEditingImage(true);
      try {
        const d = edited ?? await new Promise<{width:number;height:number}>((resolve,reject)=>Image.getSize(preview.uri,(width,height)=>resolve({width,height}),reject));
        const scale = Math.min(Math.max(1,width-24)/d.width, Math.max(1,height-300)/d.height);
        setCropSize({width:d.width*scale,height:d.height*scale});
      } catch { setEditMessage('Cannot read image dimensions.'); return; }
      finally { editLock.current=false; setEditingImage(false); }
    }
    if (kind === 'compress') { const bytes = new File(edited?.uri ?? preview.uri).size; setEditMessage(`${t('Current size','الحجم الحالي')}: ${(bytes/1024).toFixed(1)} KB`); }
    setTool(kind);
  };
  const saveEdited = async () => {
    if (!edited || !preview || editLock.current || importLock.current) return;
    editLock.current = true; importLock.current = true; setEditingImage(true); setImporting(true);
    try {
      const recovery = await recoverPending();
      if (!recovery.ok || recovery.value) throw new Error('Pending recovery requires refresh before saving.');
      const file = new File(edited.uri);
      if (!file.exists || !Number.isSafeInteger(file.size) || file.size <= 0 || file.size > MAX_IMAGE_BYTES) throw new Error('Edited image exceeds size limit or is unreadable.');
      const digest = (await file.digest('SHA-256')).toLowerCase();
      const result = await imageImporter.importDocument({id: `doc-${Crypto.randomUUID()}`, sourceUri: edited.uri, source: 'gallery', category: 'other', name: `${preview.name.replace(/\.[^.]+$/, '').slice(0, 80)}-edited.jpg`, declaredMime: 'image/jpeg', createdAt: new Date().toISOString()});
      if (!result.ok) throw new Error(`Edited image import failed (${result.code}).`);
      if (result.record.sha256 !== digest || result.record.byteSize !== file.size || await vaultFs.digestSha256(result.record.vaultPath) !== digest) throw new Error('Edited image integrity check failed.');
      await refresh(); setTool(null); setEditMessage(''); setPreview(null); setEdited(null); setNotice(t('Edited copy saved. Original preserved.', 'تم حفظ نسخة معدلة مع الحفاظ على الأصل.'));
    } catch (e) { setEditMessage(e instanceof Error ? e.message : 'Edited copy failed.'); }
    finally { editLock.current = false; importLock.current = false; setEditingImage(false); setImporting(false); }
  };

  const captureImage = async (source: 'camera' | 'gallery') => {
    if (importLock.current || categoryLock.current || openLock.current || verifyLock.current || loading) return;
    importLock.current = true;
    setImporting(true);
    setNotice(null);
    setError(null);
    try {
      const recovery = await recoverPending();
      setRecoveryBlocked(!recovery.ok);
      if (!recovery.ok) throw new Error('Pending import recovery blocked. Evidence preserved.');
      if (recovery.value) { await refresh(); setNotice('Pending document recovered. Please retry capture.'); return; }
      if (source === 'camera') {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) { setNotice(t('Camera permission denied. No file imported.', 'لم يتم السماح بالكاميرا. لم يتم استيراد ملف.')); return; }
      }
      const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], allowsEditing: false, quality: 1, allowsMultipleSelection: false };
      const selection = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
      if (selection.canceled) { setNotice(t('Selection canceled. Nothing imported.', 'تم الإلغاء. لم يتم استيراد ملف.')); return; }
      if (selection.assets.length !== 1) throw new Error('Select exactly one image.');
      const asset = selection.assets[0];
      const id = `doc-${Crypto.randomUUID()}`;
      const metadata = imageCaptureMetadata(asset, id);
      const file = new File(asset.uri);
      if (!file.exists || !Number.isSafeInteger(file.size) || file.size <= 0 || file.size > MAX_IMAGE_BYTES) throw new Error('Select a readable image no larger than 10 MiB.');
      const size = file.size;
      const digest = (await file.digest('SHA-256')).toLowerCase();
      if (!/^[a-f0-9]{64}$/.test(digest)) throw new Error('Image fingerprint unavailable.');
      const result = await imageImporter.importDocument({ id, sourceUri: asset.uri, source, category: 'other', name: metadata.name, declaredMime: metadata.mime, createdAt: new Date().toISOString() });
      if (!result.ok) throw new Error(`Image import failed (${result.code}). Evidence preserved.`);
      if (result.record.sha256 !== digest || result.record.byteSize !== size || !(await vaultFs.exists(result.record.vaultPath)) || await vaultFs.size(result.record.vaultPath) !== size || await vaultFs.digestSha256(result.record.vaultPath) !== digest) throw new Error('Image integrity check failed. Evidence preserved.');
      await refresh();
      setNotice(result.kind === 'duplicate' ? t('Image already saved.', 'الصورة محفوظة بالفعل.') : t('Image saved and verified.', 'تم حفظ الصورة والتحقق منها.'));
    } catch (e) { setError(e instanceof Error ? e.message : 'Image import failed.'); }
    finally { importLock.current = false; setImporting(false); }
  };

  useFocusEffect(useCallback(() => {
    let active = true;
    setLoading(true);
    setError(null);
    (async () => {
      const recovery = await recoverPending();
      if (active) {
        setRecoveryBlocked(!recovery.ok);
        if (!recovery.ok) setError('Pending import recovery blocked. Original evidence preserved.');
        else if (recovery.value) setNotice('Pending document recovered and verified.');
      }
      return repository.list();
    })().then((result) => {
      if (!active) return;
      if (!result.ok) {
        setRecords([]);
        setError('Documents could not be loaded safely. No data was changed.');
      } else {
        setRecords([...result.value].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
      }
    }).catch(() => {
      if (!active) return;
      setRecords([]);
      setError('Documents could not be loaded safely. No data was changed.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []));

  const busy = importing || loading || verifyingId !== null || openingId !== null || savingCategory;
  const iconAction = (icon: keyof typeof Ionicons.glyphMap, label: string, action: () => void, color = '#365575', disabled = busy) => (
    <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={action} style={[styles.compactAction, disabled && {opacity: 0.4}]}><Ionicons name={icon} size={23} color={color} /></Pressable>
  );
  const confirmRemove = (record: DocumentRecord) => Alert.alert(t('Remove document?', 'حذف المستند؟'), record.name + '\n' + t('Removes from the library; original and vault evidence remain.', 'يحذف من القائمة مع الحفاظ على الأصل والنسخة المحفوظة.'), [
    {text: t('Cancel', 'إلغاء'), style: 'cancel'},
    {text: t('Delete', 'حذف'), style: 'destructive', onPress: async () => {
      if (importLock.current || categoryLock.current || openLock.current || verifyLock.current) return;
      categoryLock.current = true; setSavingCategory(true); setError(null); setNotice(null);
      try {
        const result = await repository.remove(record.id, record.updatedAt);
        await refresh();
        if (!result.ok) throw new Error('Removal not confirmed. Reload to check the library.');
        setExpandedId(null); setReadResult(null); setIntegrity(null); setEditingId(null);
        setNotice(t('Removed from library.', 'تم الحذف من القائمة.'));
      } catch (e) { setError(e instanceof Error ? e.message : 'Removal failed'); }
      finally { categoryLock.current = false; setSavingCategory(false); }
    }}]);
  return (
    <>
    <Screen scroll>
    <View style={{backgroundColor: '#F8FAFC', marginHorizontal: -spacing.md, marginTop: -spacing.sm, paddingBottom: spacing.md + Math.max(bottomInset, 24)}}>
      <View testID="documents-add-header" style={{backgroundColor: '#1E293B', borderBottomLeftRadius: 20, borderBottomRightRadius: 20,
        paddingHorizontal: 13, paddingTop: 6, paddingBottom: 8, alignItems: 'center'}}>
        <View style={{width: '100%', flexDirection: 'row', alignItems: 'center', minHeight: 45, flexWrap: 'nowrap'}}>
          <Pressable accessibilityRole="button" accessibilityLabel={t('Close', 'إغلاق')}
            onPress={() => onClose ? onClose() : fromAdd === '1' ? router.navigate('/finance/add') : router.back()}
            style={{width: 45, height: 45, alignItems: 'center', justifyContent: 'center'}}>
            <MaterialCommunityIcons name="arrow-left" size={27} color="#FFFFFF" />
          </Pressable>
          <AppText accessibilityRole="header" variant="bodyStrong" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.68} style={{color: '#FFFFFF', textAlign: 'center', fontSize: width < 360 ? 15 : 18, flex: 1, minWidth: 0, fontWeight: '700'}}>
            {t('Add Document', 'إضافة مستند')}
          </AppText>
          <View style={{width: 45, alignItems: 'center'}}>
            <MaterialCommunityIcons name="file-document-outline" size={25} color="#CBD5E1" />
          </View>
        </View>
        <View testID="documents-file-limits" style={{width: '100%', marginTop: 3, paddingVertical: 5, paddingHorizontal: 8,
          backgroundColor: '#334155', borderRadius: 11, borderWidth: 1, borderColor: '#64748B',
          flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7}}>
          <MaterialCommunityIcons name="shield-check-outline" size={17} color="#F2C879" />
          <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={{color: '#E2E8F0', textAlign: 'center', fontSize: 12, lineHeight: 17, flexShrink: 1}}>
            {t('Max: PDF 1 MiB · Images 10 MiB', 'الحد: PDF 1 MiB · الصور 10 MiB')}
          </Text>
        </View>
      </View>
      <View style={{paddingHorizontal: 12, paddingTop: 7, gap: 7}}>
      <View style={styles.compactRow}>
        {iconAction('document-outline', t('Import PDF', 'استيراد PDF'), importPdf, '#DC2626')}
        {iconAction('camera-outline', t('Camera', 'الكاميرا'), () => captureImage('camera'), '#365575')}
        {iconAction('images-outline', t('Gallery', 'معرض الصور'), () => captureImage('gallery'), '#365575')}
        {iconAction('qr-code-outline', t('Scan QR', 'قراءة QR'), startQr, '#365575')}
      </View>
      {recoveryBlocked ? <Text style={styles.hint}>{t("Recovery blocked. Import retries recovery before selecting a new file.", "تعذر الاسترجاع. زر الاستيراد يعيد محاولة الاسترجاع قبل اختيار ملف جديد.")}</Text> : null}
      {notice ? <Text accessibilityRole="alert" style={styles.success}>{notice}</Text> : null}
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      {!loading && records.length > 0 ? <View style={styles.detailsPanel}>
        <View style={styles.compactRow}>
          <View style={styles.searchField}>
            <TextInput style={styles.searchInput} value={query} onChangeText={setQuery} placeholder={t('Search documents', 'بحث في المستندات')} accessibilityLabel={t('Search documents', 'بحث في المستندات')} placeholderTextColor="#64748B" />
            <Ionicons name="search-outline" size={23} color="#365575" />
          </View>
          <Pressable testID="documents-filter-toggle" accessibilityRole="button" accessibilityLabel={t('Filter and sort', 'الفلتر والترتيب')} accessibilityState={{expanded: filterMenu}}
            onPress={() => setFilterMenu(open => !open)} style={styles.filterAction}>
            <Ionicons name="filter-outline" size={23} color={filterMenu || filter !== 'all' || sort !== 'newest' ? '#B28B46' : '#365575'} />
          </Pressable>
          {query || filter !== 'all' || sort !== 'newest' ? <Pressable accessibilityRole="button" accessibilityLabel={t('Reset filters', 'إعادة ضبط الفلاتر')} onPress={() => {setQuery('');setFilter('all');setSort('newest');setFilterMenu(false);}} style={styles.filterAction}><Ionicons name="reload-outline" size={23} color="#365575" /></Pressable> : null}
        </View>
        {filterMenu ? <View testID="documents-filter-panel" style={{gap: 7}}>
          <Text style={styles.name}>{t('Category', 'التصنيف')}</Text>
          <View style={styles.filterRow}>
            {(['all', ...categoryOptions.map(option => option.value)] as const).map(value => <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: filter === value }} onPress={() => {setFilter(value);setFilterMenu(false);}} style={[styles.categoryOption, filter === value && styles.activeFilter]}><Text style={styles.verifyText}>{value === 'all' ? t('All', 'الكل') : t(...categoryLabels[value])}</Text></Pressable>)}
          </View>
          <Text style={styles.name}>{t('Sort', 'الترتيب')}</Text>
          <View style={styles.filterRow}>
            {(['newest', 'oldest', 'name'] as const).map(value => <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: sort === value }} onPress={() => {setSort(value);setFilterMenu(false);}} style={[styles.categoryOption, sort === value && styles.activeFilter]}><Text style={styles.verifyText}>{value === 'newest' ? t('Newest', 'الأحدث') : value === 'oldest' ? t('Oldest', 'الأقدم') : t('Name', 'الاسم')}</Text></Pressable>)}
          </View>
        </View> : null}
        <Text style={styles.detail}>{visibleRecords.length} / {records.length} {t('documents', 'مستندات')}</Text>
      </View> : null}
      {loading ? <ActivityIndicator accessibilityLabel={t("Loading documents", "جارٍ تحميل المستندات")} /> : records.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.name}>{t("No documents saved yet", "لا توجد مستندات محفوظة بعد")}</Text>
          <Text style={styles.detail}>{t("Choose + Import PDF to add your first document. Android test documents remain separate.", "اختر استيراد PDF لإضافة أول مستند. مستندات اختبار أندرويد منفصلة.")}</Text>
        </View>
      ) : visibleRecords.length === 0 ? <View style={styles.empty}><Text style={styles.name}>{t('No matching documents', 'لا توجد مستندات مطابقة')}</Text></View> : visibleRecords.map((record) => (
        <View key={record.id} style={styles.item}>
          <View style={styles.compactRow}>
            <View style={styles.filenameGroup}>
              <Ionicons name={record.mimeType === 'application/pdf' ? 'document-outline' : 'image-outline'} size={21} color={record.mimeType === 'application/pdf' ? '#DC2626' : '#B28B46'} />
              <Text style={[styles.name, {flex: 1, minWidth: 0, fontSize: 15}]} numberOfLines={1} ellipsizeMode="middle">{record.name}</Text>
            </View>
            <Pressable testID={`document-details-${record.id}`} accessibilityRole="button" accessibilityLabel={t('Details', 'التفاصيل') + ' ' + record.name}
              accessibilityState={{expanded: expandedId === record.id}}
              onPress={() => setExpandedId(previous => previous === record.id ? null : record.id)} style={styles.compactAction}>
              <Ionicons name="information-circle-outline" size={23} color={expandedId === record.id ? '#B28B46' : '#365575'} />
            </Pressable>
          </View>
          <View style={styles.compactRow}>
            {DOCUMENT_COMMANDS.map(command => (
              <Pressable key={command.id} accessibilityRole="button" accessibilityLabel={t(command.en, command.ar)}
                accessibilityHint={command.id === 'preview' && record.mimeType === 'application/pdf' ? t('Internal PDF preview unavailable; use Open.', 'المعاينة الداخلية غير متاحة؛ استخدم فتح.') : undefined}
                accessibilityState={{ disabled: busy || (command.id === 'preview' && record.mimeType === 'application/pdf') }} disabled={busy || (command.id === 'preview' && record.mimeType === 'application/pdf')}
                onPress={() => command.id === 'delete' ? confirmRemove(record) : void openDocument(record, command.id)}
                style={[styles.compactAction, (busy || (command.id === 'preview' && record.mimeType === 'application/pdf')) && {opacity: 0.4}]}>
                <Ionicons name={command.icon} size={23} color={command.color} />
              </Pressable>
            ))}
          </View>
          {record.mimeType === 'application/pdf' ? <Text style={[styles.hint, {fontSize: 11}]}>{t('Open uses the native PDF viewer; internal preview is unavailable.', 'فتح يستخدم عارض PDF الخارجي؛ المعاينة الداخلية غير متاحة.')}</Text> : null}
          {editingId === record.id ? (
            <View style={styles.detailsPanel}>
              <Text style={styles.name}>{t("Choose document category", "اختر تصنيف المستند")}</Text>
              {categoryOptions.map((option) => (
                <Pressable
                  key={option.value}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selectedCategory === option.value }}
                  disabled={savingCategory}
                  onPress={() => setSelectedCategory(option.value)}
                  style={styles.categoryOption}
                >
                  <Text style={styles.verifyText}>{selectedCategory === option.value ? '◉' : '○'} {t(option.label, ({ receipt: 'إيصال', invoice: 'فاتورة', contract: 'عقد', bank_statement: 'كشف حساب بنكي', handwritten_note: 'ملاحظة بخط اليد', other: 'أخرى' } as Record<DocumentCategory, string>)[option.value])}</Text>
                </Pressable>
              ))}
              <Pressable accessibilityRole="button" accessibilityLabel={t("Save Category", "حفظ التصنيف")} disabled={savingCategory} onPress={() => saveCategory(record)} style={styles.importButton}>
                <Text style={styles.importText}>{savingCategory ? t("Saving…", "جارٍ الحفظ…") : t("Save Category", "حفظ التصنيف")}</Text>
              </Pressable>
              <Pressable accessibilityRole="button" disabled={savingCategory} onPress={() => setEditingId(null)} style={styles.verifyButton}><Text style={styles.verifyText}>{t('Cancel', 'إلغاء')}</Text></Pressable>
            </View>
          ) : null}
          {expandedId === record.id && readResult?.id === record.id && readResult.sha256 === record.sha256 ? (
            <View style={styles.detailsPanel}>
              <Text style={styles.name}>{t('Read — document text', 'قراءة — نص المستند')}</Text>
              {readResult.result.ok ? <>
                <Text style={styles.detail}>{readResult.result.engine} · {readResult.result.pageCount} {t('pages', 'صفحات')}</Text>
                <Text selectable style={styles.detail}>{readResult.result.text}</Text>
                {'review' in readResult.result && readResult.result.review.ocrNeededPages.length > 0 ? <Text accessibilityRole="alert" style={styles.hint}>{t('Incomplete native text; OCR required on pages: ', 'النص غير مكتمل؛ يلزم OCR للصفحات: ')}{readResult.result.review.ocrNeededPages.join(', ')}</Text> : null}
              </> : <Text accessibilityRole="alert" style={styles.hint}>{readResult.result.reason === 'image_ocr_unavailable' ? t('Image OCR is not integrated.', 'استخراج نص الصورة غير مدمج.') : readResult.result.reason === 'unavailable' ? t('Native PDF reader is unavailable in this build.', 'قارئ PDF الأصلي غير متاح في هذه النسخة.') : readResult.result.reason === 'empty_text' ? t('No native text. Offline OCR is not integrated yet.', 'لا يوجد نص أصلي. لم يدمج OCR دون اتصال بعد.') : t('Text extraction failed: ', 'تعذر استخراج النص: ') + readResult.result.reason}</Text>}
              <Text style={styles.hint}>{t('Unverified text only. No financial posting.', 'نص غير معتمد فقط. لا ترحيل مالي.')}</Text>
            </View>
          ) : null}
          {expandedId === record.id ? (
            <View testID={`document-details-panel-${record.id}`} style={styles.detailsPanel}>
              <Text accessibilityRole="header" style={styles.name}>{t('Document details', 'تفاصيل المستند')}</Text>
              <Text selectable style={styles.detail}>{record.name}</Text>
              <Pressable accessibilityRole="button" disabled={busy} onPress={() => verifyStoredDocument(record)} style={styles.verifyButton}><Text style={styles.verifyText}>{t('Verify file integrity', 'التحقق من سلامة الملف')}</Text></Pressable>
              <Text accessibilityRole="text" style={integrity?.id === record.id && integrity.sha256 === record.sha256 ? integrity.ok ? styles.success : styles.error : styles.detail}>
                {integrity?.id === record.id && integrity.sha256 === record.sha256 ? integrity.ok ? t('Verified — size and SHA-256 match.', 'تم التحقق — الحجم والبصمة متطابقان.') : t('Integrity verification failed.', 'فشل التحقق من سلامة الملف.') : t('Integrity not checked in this view.', 'لم يتم التحقق في هذه الشاشة.')}
              </Text>
              {record.mimeType === 'application/pdf' ? <Text style={styles.hint}>{t('Edit changes category only. Internal PDF preview is not integrated; use Open.', 'التعديل للتصنيف فقط. المعاينة الداخلية غير مدمجة؛ استخدم فتح.')}</Text> : null}
              {record.mimeType !== 'application/pdf' ? <Pressable accessibilityRole="button" disabled={busy} onPress={() => {setEditingId(record.id);setSelectedCategory(record.category);}} style={styles.verifyButton}><Text style={styles.verifyText}>{t('Edit category', 'تعديل التصنيف')}</Text></Pressable> : null} 
              <Text style={styles.detail}>{t("Status: ", "الحالة: ")}{record.status}</Text>
              <Text style={styles.detail}>{t("Document ID: ", "معرّف المستند: ")}{record.id}</Text>
              <Text style={styles.detail}>{t("Category: ", "التصنيف: ")}{record.category}</Text>
              <Text style={styles.detail}>{t("Source: ", "المصدر: ")}{record.source}</Text>
              <Text style={styles.detail}>{t("Created: ", "تاريخ الإنشاء: ")}{record.createdAt}</Text>
              <Text style={styles.detail}>{t("Updated: ", "آخر تحديث: ")}{record.updatedAt}</Text>
              <Text style={styles.detail}>{t("Size: ", "الحجم: ")}{record.byteSize} bytes</Text>
              <Text style={styles.detail}>{t("MIME: ", "نوع MIME: ")}{record.mimeType}</Text>
              <Text style={styles.detail}>{t("SHA-256: ", "SHA-256: ")}{record.sha256 ?? 'Unavailable'}</Text>
              <Text style={styles.detail}>{t("Local storage: app-private vault", "التخزين المحلي: خزنة التطبيق الخاصة")}</Text>
              <Text style={styles.hint}>{t("Details are read-only. No financial transaction is created.", "التفاصيل للقراءة فقط. لن يتم إنشاء معاملة مالية.")}</Text>
            </View>
          ) : null}
        </View>
      ))}
      </View>
    </View>
    </Screen>
    <Modal visible={qrOpen} onRequestClose={() => setQrOpen(false)}>
      <View style={styles.previewRoot}>
        <FinanceButton title={t('Close', 'إغلاق')} onPress={() => setQrOpen(false)} />
        {qrOpen && qrText === null ? <CameraView style={{flex: 1}} facing="back" barcodeScannerSettings={{barcodeTypes: ['qr']}} onBarcodeScanned={event => setQrText(previous => previous ?? event.data.slice(0, 4096))} /> : null}
        {qrText !== null ? <><ScrollView><Text selectable style={styles.previewTitle}>{qrText}</Text></ScrollView><FinanceButton title={t('Scan again', 'قراءة أخرى')} onPress={() => setQrText(null)} /></> : null}
      </View>
    </Modal>
    <Modal visible={preview !== null} onRequestClose={() => { if (!editLock.current) { setTool(null); setEditMessage(''); setEdited(null); setPreview(null); } }} animationType="fade">
      <View style={styles.previewRoot}>
        <View style={styles.editorHeader}>
          <Text style={styles.editorName} numberOfLines={1}>{preview?.name}</Text>
          {preview?.mode === 'edit' ? <Pressable accessibilityRole="button" accessibilityLabel={t('Save copy', 'حفظ نسخة')} disabled={editingImage || !edited || tool !== null} onPress={saveEdited} style={[styles.headerIcon, (editingImage || !edited) && styles.editorDisabled]}><Ionicons name="save-outline" size={19} color="#D6B777" /></Pressable> : null}
          <Pressable accessibilityRole="button" accessibilityLabel={t('Cancel and close', 'إلغاء وإغلاق')} disabled={editingImage} onPress={() => { if (!editLock.current) { setEdited(null); setTool(null); setEditMessage(''); setPreview(null); } }} style={[styles.headerIcon, editingImage && styles.editorDisabled]}><Ionicons name="close" size={19} color="#FFFFFF" /></Pressable>
        </View>
        <View style={styles.editorToolbar}>
          {preview?.mode === 'edit' ? <>
          {([
            { kind: 'rotate', icon: 'refresh-outline', label: t('Rotate freely', 'تدوير حر') },
            { kind: 'crop', icon: 'crop-outline', label: t('Free crop', 'قص حر') },
            { kind: 'compress', icon: 'contract-outline', label: t('Compress', 'ضغط') },
          ] as const).map(tool => <Pressable key={tool.kind} accessibilityRole="button" accessibilityLabel={tool.label} disabled={editingImage} onPress={() => openTool(tool.kind)} style={[styles.editorIcon, editingImage && styles.editorDisabled]}><Ionicons name={tool.icon} size={19} color="#FFFFFF" /></Pressable>)}
          <Pressable accessibilityRole="button" accessibilityLabel={t('Reset all edits', 'إلغاء جميع التعديلات')} disabled={editingImage || !edited} onPress={() => {setEdited(null); setTool(null); setEditMessage(''); setPreviewError(false); setZoom(1);}} style={[styles.editorIcon, (editingImage || !edited) && styles.editorDisabled]}><Ionicons name="reload-outline" size={19} color="#FFFFFF" /></Pressable>
          </> : null}
          <Pressable accessibilityRole="button" accessibilityLabel={t('Zoom out', 'تصغير')} disabled={zoom <= 1} onPress={() => setZoom(z => Math.max(1, z - 0.5))} style={[styles.editorIcon, zoom <= 1 && styles.editorDisabled]}><Ionicons name="remove-circle-outline" size={19} color="#FFFFFF" /></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={t('Reset zoom', 'إعادة حجم العرض')} onPress={() => setZoom(1)} style={styles.editorIcon}><Text style={styles.editorPercent}>{Math.round(zoom * 100)}%</Text></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={t('Zoom in', 'تكبير')} disabled={zoom >= 4} onPress={() => setZoom(z => Math.min(4, z + 0.5))} style={[styles.editorIcon, zoom >= 4 && styles.editorDisabled]}><Ionicons name="add-circle-outline" size={19} color="#FFFFFF" /></Pressable>
        </View>
        {preview?.mode === 'edit' && tool ? <View style={styles.editorToolbar}>
          {tool !== 'crop' ? <>
            <Pressable accessibilityLabel={t('Decrease','ناقص')} disabled={editingImage} style={styles.editorIcon} onPress={() => tool === 'rotate' ? setAngle(a => (a+359)%360) : setQuality(q => Math.max(5,q-5))}><Ionicons name="remove" size={19} color="white" /></Pressable>
            <Text style={styles.editorPercent}>{tool === 'rotate' ? `${angle}°` : `${quality}%`}</Text>
            <Pressable accessibilityLabel={t('Increase','زائد')} disabled={editingImage} style={styles.editorIcon} onPress={() => tool === 'rotate' ? setAngle(a => (a+1)%360) : setQuality(q => Math.min(100,q+5))}><Ionicons name="add" size={19} color="white" /></Pressable>
          </> : <Text style={styles.editorPercent}>{t('Adjust corners','حرك الأركان')}</Text>}
          <Pressable accessibilityLabel={t('Cancel','إلغاء')} disabled={editingImage} style={styles.editorIcon} onPress={() => {if(!editLock.current) {setTool(null);setEditMessage('');}}}><Ionicons name="close" size={19} color="white" /></Pressable>
          <Pressable accessibilityLabel={t('Apply','تطبيق')} disabled={editingImage} style={styles.editorIcon} onPress={() => editImage(tool)}><Ionicons name="checkmark" size={19} color="#D6B777" /></Pressable>
        </View> : null}
        {editMessage ? <Text style={styles.previewTitle}>{editMessage}</Text> : null}
        {preview?.mode === 'edit' && tool === 'crop' ? <View style={{alignSelf:'center',width:cropSize.width,height:cropSize.height}}>
          <Image source={{uri:edited?.uri ?? preview.uri}} style={{width:'100%',height:'100%'}} resizeMode="stretch" />
          <View style={StyleSheet.absoluteFill} onStartShouldSetResponder={()=>!editingImage} onMoveShouldSetResponder={()=>!editingImage} onResponderTerminationRequest={()=>false}
            onResponderGrant={e=>{const x=e.nativeEvent.locationX/cropSize.width,y=e.nativeEvent.locationY/cropSize.height; const b=cropBox; const corners=[[b.x,b.y],[b.x+b.w,b.y],[b.x,b.y+b.h],[b.x+b.w,b.y+b.h]]; const corner=corners.findIndex(([cx,cy])=>Math.hypot((cx-x)*cropSize.width,(cy-y)*cropSize.height)<=28); cropStart.current={x,y,box:{...b},corner};}}
            onResponderMove={e=>{const a=cropStart.current,b=a.box; const x=Math.max(0,Math.min(1,e.nativeEvent.locationX/cropSize.width)),y=Math.max(0,Math.min(1,e.nativeEvent.locationY/cropSize.height)); const dx=x-a.x,dy=y-a.y; if(a.corner<0){setCropBox({...b,x:Math.max(0,Math.min(1-b.w,b.x+dx)),y:Math.max(0,Math.min(1-b.h,b.y+dy))});return;} const left=a.corner%2===0,top=a.corner<2; const l=left?Math.max(0,Math.min(b.x+b.w-0.02,b.x+dx)):b.x; const r=left?b.x+b.w:Math.min(1,Math.max(b.x+0.02,b.x+b.w+dx)); const t=top?Math.max(0,Math.min(b.y+b.h-0.02,b.y+dy)):b.y; const bottom=top?b.y+b.h:Math.min(1,Math.max(b.y+0.02,b.y+b.h+dy));setCropBox({x:l,y:t,w:r-l,h:bottom-t});}}>
            <View pointerEvents="none" style={{position:'absolute',left:cropBox.x*cropSize.width,top:cropBox.y*cropSize.height,width:cropBox.w*cropSize.width,height:cropBox.h*cropSize.height,borderWidth:2,borderColor:'#D6B777',backgroundColor:'#D6B77722'}} />
            {[[cropBox.x,cropBox.y],[cropBox.x+cropBox.w,cropBox.y],[cropBox.x,cropBox.y+cropBox.h],[cropBox.x+cropBox.w,cropBox.y+cropBox.h]].map(([x,y],i)=><View key={i} pointerEvents="none" style={{position:'absolute',left:x*cropSize.width-7,top:y*cropSize.height-7,width:14,height:14,borderRadius:7,backgroundColor:'white',borderWidth:2,borderColor:'#D6B777'}}/>)}
          </View>
        </View> : null}
        {editingImage ? <ActivityIndicator /> : null}
        {previewError ? <Text accessibilityRole="alert" style={styles.previewTitle}>{t('Image could not be displayed.', 'تعذر عرض الصورة.')}</Text> : null}
        <ScrollView style={{ flex: 1 }}>
          <ScrollView horizontal>
            {preview && !previewError && tool !== 'crop' ? <Image source={{ uri: edited?.uri ?? preview.uri }} resizeMode="contain" onError={() => setPreviewError(true)} style={{ width: Math.max(1, width - 24) * zoom, height: Math.max(1, height - 200) * zoom, transform: [{scale: tool === 'rotate' ? Math.min(1, (width-24)/Math.max(1,Math.abs(Math.cos(angle*Math.PI/180))*(width-24)+Math.abs(Math.sin(angle*Math.PI/180))*(height-200))) : 1}, {rotate: `${tool === 'rotate' ? angle : 0}deg`}] }} /> : null}
          </ScrollView>
        </ScrollView>
      </View>
    </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  compactRow: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 2},
  compactAction: {flex: 1, minWidth: 0, minHeight: 44, alignItems: 'center', justifyContent: 'center'},
  filenameGroup: {flex: 5, minWidth: 0, marginEnd: 8, flexDirection: 'row', alignItems: 'center', gap: 2},
  previewRoot: { flex: 1, backgroundColor: '#111827', padding: 12, paddingTop: 36 },
  previewTitle: { color: '#FFFFFF', fontSize: 16, marginBottom: 8 },
  editorHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  headerIcon: {width:40,height:40,alignItems:'center',justifyContent:'center'},
  editorName: { flex: 1, color: '#FFFFFF', fontSize: 15, textAlign: 'center' },
  editorToolbar: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', flexWrap: 'nowrap', gap: 2, marginBottom: 4 },
  editorIcon: { flex: 1, minWidth: 0, minHeight: 40, paddingHorizontal: 0, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: '#243244' },
  editorDisabled: { opacity: 0.35 },
  editorPercent: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
  searchField: {flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: '#D6B777', borderRadius: 10, paddingHorizontal: 8, minHeight: 44},
  searchInput: {flex: 1, minWidth: 0, paddingVertical: 8, color: '#1E293B'},
  filterAction: {width: 44, height: 44, alignItems: 'center', justifyContent: 'center'},
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  activeFilter: { backgroundColor: '#E2E8F0', borderColor: '#365575' },
  importButton: { backgroundColor: '#1E293B', padding: 14, borderRadius: 12, alignItems: 'center' },
  importText: { color: '#FFFFFF', fontWeight: '700', fontSize: 16 },
  back: { color: '#D6B777', fontSize: 16, paddingVertical: 8, fontWeight: '700' },
  title: { fontSize: 24, fontWeight: '700', color: '#1E293B' },
  hint: { fontSize: 14, color: '#64748B' },
  error: { color: '#B91C1C', fontSize: 15 },
  success: { color: '#047857', fontSize: 15 },
  empty: { padding: 20, borderRadius: 16, borderWidth: 1, borderColor: '#D6B777', backgroundColor: '#FFFFFF', gap: 8 },
  item: { padding: 8, borderRadius: 16, borderWidth: 1, borderColor: '#D6B777', backgroundColor: '#FFFFFF', gap: 5 },
  verifyButton: { paddingVertical: 12, paddingHorizontal: 12, marginTop: 6, borderWidth: 1, borderColor: '#D6B777', backgroundColor: '#FFFFFF', borderRadius: 12 },
  detailsPanel: { padding: 12, borderRadius: 12, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#D6B777', gap: 7 },
  categoryOption: { paddingVertical: 9, paddingHorizontal: 12, borderWidth: 1, borderColor: '#D6B777', borderRadius: 10, backgroundColor: '#FFFFFF' },
  verifyText: { color: '#365575', fontSize: 15, fontWeight: '600' },
  name: { fontSize: 17, fontWeight: '600', color: '#1E293B' },
  detail: { fontSize: 13, color: '#64748B' },
});
