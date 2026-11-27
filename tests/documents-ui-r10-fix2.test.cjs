const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const screen = fs.readFileSync(path.join(__dirname,'../src/app/finance/documents.tsx'),'utf8');
const header = screen.slice(screen.indexOf('testID="documents-add-header"'), screen.indexOf('{iconAction(\'document-outline\''));
test('Add Document title in Reports-style header with close and document icon',()=>{
  assert.match(header,/t\('Add Document', 'إضافة مستند'\)/);
  assert.match(header,/backgroundColor: '#1E293B', borderBottomLeftRadius: 20, borderBottomRightRadius: 20/);
  assert.match(header,/paddingHorizontal: 13, paddingTop: 6, paddingBottom: 8/);
  assert.match(header,/minHeight: 45/);
  assert.match(header,/name="arrow-left" size=\{27\}/);
  assert.match(header,/onPress=\{\(\) => onClose \? onClose\(\) : fromAdd === '1' \? router.navigate\('\/finance\/add'\) : router.back\(\)\}/);
  assert.match(header,/file-document-outline/);
});
test('Details is an icon-only button above Delete, with expanded state and full filename in details',()=>{
  assert.match(screen,/testID=\{`document-details-\$\{record.id\}`\}/);
  assert.match(screen,/accessibilityState=\{\{expanded: expandedId === record.id\}\}/);
  assert.match(screen,/onPress=\{\(\) => setExpandedId\(previous => previous === record.id \? null : record.id\)\}/);
  const button = screen.slice(screen.indexOf('testID={`document-details-${record.id}`}'), screen.indexOf('</Pressable>',screen.indexOf('testID={`document-details-${record.id}`}')));
  assert.match(button, /name="information-circle-outline" size=\{23\}/);
  assert.match(button, /style=\{styles.compactAction\}/);
  assert.doesNotMatch(button, /<Text\b|chevron-/);
  assert.match(screen, /filenameGroup: \{flex: 5, minWidth: 0, marginEnd: 8/);
  assert.match(screen,/testID=\{`document-details-panel-\$\{record.id\}`\}/);
  assert.match(screen,/<Text selectable style=\{styles.detail\}>\{record.name\}<\/Text>/);
  assert.match(screen,/onPress=\{\(\) => verifyStoredDocument\(record\)\}/);
});
test('six document action icons have no visible labels but keep accessible names',()=>{
  const actions = screen.slice(screen.indexOf('{DOCUMENT_COMMANDS.map'), screen.indexOf("{record.mimeType === 'application/pdf' ? <Text",screen.indexOf('{DOCUMENT_COMMANDS.map')));
  assert.match(actions,/accessibilityLabel=\{t\(command.en, command.ar\)\}/);
  assert.match(actions,/<Ionicons name=\{command.icon\} size=\{23\} color=\{command.color\}/);
  assert.doesNotMatch(actions,/<Text\b|commandLabel/);
});
test('Documents TSX transpilation succeeds',()=>{
  const result = ts.transpileModule(screen,{fileName:'documents.tsx',compilerOptions:{jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS},reportDiagnostics:true});
  assert.deepEqual(result.diagnostics,[]);
});

const add = fs.readFileSync(path.join(__dirname,'../src/app/finance/add.tsx'),'utf8');
test('Documents opens with the same bottom-up modal behavior as the other Add forms',()=>{
  assert.match(add, /<Modal visible=\{activeAction === 'documents'\} transparent animationType="slide" onRequestClose=\{closeAction\}/);
  assert.match(add, /justifyContent: 'flex-end'/);
  assert.match(add, /testID="documents-bottom-sheet" accessibilityViewIsModal style=\{\{ height: '92%', maxHeight: '92%'/);
  assert.match(add, /<DocumentsScreen onClose=\{closeAction\}/);
  assert.doesNotMatch(add, /router.push\(/);
  assert.match(screen,/<Screen scroll>\s*<View style=\{\{backgroundColor: '#F8FAFC', marginHorizontal: -spacing.md, marginTop: -spacing.sm, paddingBottom: spacing.md/);
  assert.match(header,/backgroundColor: '#334155', borderRadius: 11, borderWidth: 1, borderColor: '#64748B'/);
  assert.match(header,/shield-check-outline/);
});
test('search icon and one adjacent filter toggle expose category and sort in one panel',()=>{
  const search = screen.slice(screen.indexOf('<View style={styles.searchField}'),screen.indexOf('{visibleRecords.length}'));
  assert.match(search,/<TextInput[\s\S]*name="search-outline"[\s\S]*testID="documents-filter-toggle"[\s\S]*name="filter-outline"/);
  assert.match(search,/onPress=\{\(\) => setFilterMenu\(open => !open\)\}/);
  assert.match(search,/accessibilityState=\{\{expanded: filterMenu\}\}/);
  assert.match(search,/\{filterMenu \? <View testID="documents-filter-panel"/);
  assert.match(search,/setFilter\(value\);setFilterMenu\(false\)/);
  assert.match(search,/setSort\(value\);setFilterMenu\(false\)/);
  assert.doesNotMatch(search,/swap-vertical-outline/);
});
test('Add route TSX transpilation succeeds',()=>{
  const result = ts.transpileModule(add,{fileName:'add.tsx',compilerOptions:{jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS},reportDiagnostics:true});
  assert.deepEqual(result.diagnostics,[]);
});

test('Fix4 compact header has a single non-wrapping title row, no subtitle and a compact limits banner',()=>{
  assert.match(header,/flexDirection: 'row', alignItems: 'center', minHeight: 45, flexWrap: 'nowrap'/);
  assert.match(header,/numberOfLines=\{1\} adjustsFontSizeToFit minimumFontScale=\{0.68\}/);
  assert.doesNotMatch(header,/Choose how to add a document|اختر طريقة إضافة المستند/);
  assert.match(header,/testID="documents-file-limits" style=\{\{width: '100%', marginTop: 3, paddingVertical: 5/);
  assert.match(header,/Max: PDF 1 MiB · Images 10 MiB/);
  assert.match(header,/paddingHorizontal: 12, paddingTop: 7, gap: 7/);
});
test('Fix4 adds bottom scroll clearance for the Android navigation bar',()=>{
  assert.match(screen,/const \{ bottom: bottomInset \} = useSafeAreaInsets\(\)/);
  assert.match(screen,/paddingBottom: spacing.md \+ Math.max\(bottomInset, 24\)/);
});

test('Fix5 Add main header uses the Reports left arrow and a single-line English title',()=>{
  const h = add.slice(add.indexOf('testID="finance-add-header"'), add.indexOf('{ITEMS.map'));
  assert.match(h, /name="arrow-left" size=\{27\}/);
  assert.doesNotMatch(h, /arrow-forward|isRTL/);
  assert.match(h, /numberOfLines=\{1\} adjustsFontSizeToFit minimumFontScale=\{0.68\}/);
  assert.match(h, /Tomorrow Finance Add/);
});
test('Fix5 limits are more legible without restoring the removed subtitle',()=>{
  assert.match(header, /fontSize: 12, lineHeight: 17, flexShrink: 1/);
  assert.match(header, /shield-check-outline" size=\{17\}/);
  assert.doesNotMatch(header, /اختر طريقة إضافة المستند/);
});
