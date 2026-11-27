const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.join(__dirname, '..');
const src = rel => fs.readFileSync(path.join(root, rel), 'utf8');
function load(rel) {
  const compiled = ts.transpileModule(src(rel), {fileName: rel, reportDiagnostics: true, compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}});
  assert.equal(compiled.diagnostics.length, 0);
  const mod = {exports: {}};
  new Function('module', 'exports', compiled.outputText)(mod, mod.exports);
  return mod.exports;
}
const {DOCUMENT_COMMANDS, commandRoute, openInNativeViewer, readDocumentText} = load('src/features/documents/domain/documentCommands.ts');
const {createPdfTextAdapter} = load('src/features/documents/extraction/pdfTextAdapter.ts');
const screen = src('src/app/finance/documents.tsx');
const images = ['image/jpeg', 'image/png', 'image/webp'];
test('one exact command order and colors for every document', () => {
  assert.deepEqual(DOCUMENT_COMMANDS.map(c => [c.id,c.icon,c.color]), [
    ['edit','pencil-outline','#15803D'], ['preview','eye-outline','#365575'], ['read','book-outline','#B28B46'],
    ['open','folder-open-outline','#365575'], ['share','share-social-outline','#365575'], ['delete','trash-outline','#B91C1C']]);
  assert.equal(new Set(DOCUMENT_COMMANDS.map(c => c.icon)).size, 6);
  assert.match(screen, /DOCUMENT_COMMANDS\.map\(command/);
});
for (const mime of images) test(`${mime}: edit, read-only preview, open and share are distinct`, () => {
  assert.equal(commandRoute('edit',mime),'image-edit');
  assert.equal(commandRoute('preview',mime),'image-preview');
  assert.equal(commandRoute('read',mime),'image-read-unavailable');
  assert.equal(commandRoute('open',mime),'native-open');
  assert.equal(commandRoute('share',mime),'share');
});
test('PDF routes do not pretend to offer an internal renderer or editor', () => {
  assert.equal(commandRoute('edit','application/pdf'),'category-edit');
  assert.equal(commandRoute('preview','application/pdf'),'pdf-preview-unavailable');
  assert.equal(commandRoute('read','application/pdf'),'pdf-read');
  assert.equal(commandRoute('open','application/pdf'),'native-open');
  assert.equal(commandRoute('share','application/pdf'),'share');
});
for(const mime of ['image/svg+xml','image/heic','text/plain','']) test(`reject unsupported MIME ${mime}`, () => assert.throws(() => commandRoute('open',mime)));
test('native open hands MIME and filename to the real native-viewer interface', async () => {
  const calls = [];
  await openInNativeViewer({canPreview: async o => { calls.push(['canPreview',o]); return true; }, preview: async o => { calls.push(['preview',o]); }}, 'application/pdf','خطة.pdf');
  assert.deepEqual(calls,[['canPreview',{mimeType:'application/pdf'}],['preview',{mimeType:'application/pdf',title:'خطة.pdf'}]]);
});
test('no viewer does not launch a preview or fall back to share', async () => {
  await assert.rejects(openInNativeViewer({canPreview:async()=>false,preview:async()=>assert.fail('must not call')},'application/pdf','x.pdf'), /No installed viewer/);
});
test('missing runtime API fails clearly', async () => {
  await assert.rejects(openInNativeViewer({},'image/png','x.png'), /unavailable/);
});
test('native failure propagates', async () => {
  await assert.rejects(openInNativeViewer({canPreview:async()=>true,preview:async()=>{throw Error('native failure')}},'image/png','x.png'), /native failure/);
});
test('PDF Read calls the existing adapter and reports no engine', async () => {
  assert.deepEqual(await readDocumentText('pdf-read','file:///a.pdf',createPdfTextAdapter(null)),{ok:false,reason:'unavailable'});
});
test('future verified engine passes its result through adapter, with no posting', async () => {
  const result = {ok:true, engine:'test-only',pageCount:1,text:'العربية'};
  const adapter = createPdfTextAdapter({id:'test-only',supports:async()=>true,extract:async uri=>{assert.equal(uri,'file:///a.pdf');return result;}});
  assert.deepEqual(await readDocumentText('pdf-read','file:///a.pdf',adapter),result);
});
test('image Read cannot call PDF extractor', async () => {
  assert.deepEqual(await readDocumentText('image-read-unavailable','file:///a.png',{extract:async()=>assert.fail('must not extract')}),{ok:false,reason:'image_ocr_unavailable'});
});
test('open UI routes separately from share; integrity checks precede both', () => {
  const body = screen.slice(screen.indexOf('const openDocument ='),screen.indexOf('const refresh ='));
  assert.ok(body.indexOf('await vaultFs.digestSha256') < body.indexOf('await openInNativeViewer'));
  assert.ok(body.indexOf('await vaultFs.digestSha256') < body.indexOf('await Sharing.shareAsync'));
  assert.match(body,/if \(route === 'native-open'\) \{\s+await openInNativeViewer\(file, record.mimeType, record.name\);\s+return;/);
  assert.match(body,/if \(route === 'pdf-read' \|\| route === 'image-read-unavailable'\)/);
});
test('preview hides editing tools; edit preserves Save and zoom controls', () => {
  assert.match(screen,/mode: route === 'image-edit' \? 'edit' : 'preview'/);
  assert.match(screen,/preview\?\.mode === 'edit' \? <Pressable[^\n]+Save copy/);
  assert.match(screen,/preview\?\.mode === 'edit' \? <>\s+\{\(\[/);
  assert.match(screen,/preview\?\.mode === 'edit' && tool \?/);
  assert.match(screen,/Zoom out/); assert.match(screen,/Zoom in/);
});
test('accepted R6 editing functions unchanged', () => {
  const editor = screen.slice(screen.indexOf('  const editImage ='),screen.indexOf('  const captureImage ='));
  assert.equal(require('node:crypto').createHash('sha256').update(editor).digest('hex'), 'baae87c01d3754c659e28e359d803127ff2da4cd2238d29366c44926fdf24532');
});
test('integrity is reported inside details; PDF preview cannot invoke duplicate Open', () => {
  assert.match(screen,/Integrity not checked in this view/);
  assert.match(screen,/Verified — size and SHA-256 match/);
  assert.match(screen,/disabled=\{busy \|\| \(command.id === 'preview' && record.mimeType === 'application\/pdf'\)\}/);
});
