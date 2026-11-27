const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ts=require('typescript');
const filename=path.join(__dirname,'../src/features/documents/extraction/pdfNativeEvidence.ts');
const output=ts.transpileModule(fs.readFileSync(filename,'utf8'),{fileName:filename,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},reportDiagnostics:true});
assert.deepEqual(output.diagnostics,[]);
const mod={exports:{}};new Function('module','exports',output.outputText)(mod,mod.exports);
const {validateNativeEvidence,readNativePdf}=mod.exports;
const id={sha256:'a'.repeat(64),bytes:100};
function fixture(){const text='قسط 12345678';return {sourceSha256:id.sha256,sourceByteCount:id.bytes,pageCount:1,durationMs:10,needsReview:true,scored:false,pages:[{pageNumber:1,width:100,height:200,rotation:0,cropBox:[0,0,100,200],coordinateSystem:'pdf-direction-adjusted-points',rawTableLines:[[0,0,100,0]],rawTableGeometryWarning:'review'}],characters:Array.from(text,(text,x)=>({page:1,text,x,y:10,width:1,height:2})),processedTextCallbacks:[{page:1,sequence:1,text,glyphStartIndex:0,glyphCount:Array.from(text).length}]};}
function port(data=fixture()){const calls=[];return {calls,stage:async uri=>{calls.push(['stage',uri]);return {uri:'file:///cache/unique.pdf',identity:{...id},dispose:async()=>{calls.push(['dispose']);}}},extractReaderLayout:async uri=>{calls.push(['extract',uri]);return data;}};}
const validUri='file:///vault/a.pdf';
test('preserves mixed Arabic and numeric evidence, vector lines and callback range',()=>assert.deepEqual(validateNativeEvidence(fixture(),id),fixture()));
for(const [name,mutate] of [
 ['wrong hash',d=>d.sourceSha256='b'.repeat(64)],['wrong bytes',d=>d.sourceByteCount++],['zero pages',d=>d.pageCount=0],['too many pages',d=>d.pageCount=21],['missing page',d=>d.pages=[]],['invalid rotation',d=>d.pages[0].rotation=45],['invalid crop',d=>d.pages[0].cropBox=[0,0,-1,200]],['nonfinite glyph',d=>d.characters[0].x=NaN],['negative glyph size',d=>d.characters[0].width=-1],['wrong glyph page',d=>d.characters[0].page=2],['noncontiguous callback',d=>d.processedTextCallbacks[0].glyphStartIndex=1],['unclaimed glyph',d=>d.processedTextCallbacks[0].glyphCount--],['unsafe review flag',d=>d.needsReview=false],['unsafe score flag',d=>d.scored=true],['malformed vector',d=>d.pages[0].rawTableLines=[[1,2,3]]],['sparse glyphs',d=>delete d.characters[0]],['oversized callback',d=>d.processedTextCallbacks[0].text='a'.repeat(500001)]]){
 test('rejects '+name,()=>{const d=fixture();mutate(d);assert.throws(()=>validateNativeEvidence(d,id));});
}
test('uses cached copy only, cleans it, preserves review-only flags',async()=>{const p=port();const r=await readNativePdf(validUri,id,p);assert.deepEqual(p.calls,[['stage',validUri],['extract','file:///cache/unique.pdf'],['dispose']]);assert.equal(r.postingAllowed,false);assert.equal(r.needsReview,true);assert.equal(r.scored,false);assert.deepEqual(r.ocrNeededPages,[]);assert.equal(r.text,fixture().processedTextCallbacks[0].text);});
test('scanned page requires OCR, no invented text',async()=>{const d=fixture();d.characters=[];d.processedTextCallbacks=[];const r=await readNativePdf(validUri,id,port(d));assert.deepEqual(r.ocrNeededPages,[1]);assert.equal(r.text,'');});
test('identity mismatch before extraction still disposes cache',async()=>{const p=port();const stage=p.stage;p.stage=async u=>({...await stage(u),identity:{...id,bytes:99}});await assert.rejects(readNativePdf(validUri,id,p),/Staged PDF identity/);assert.deepEqual(p.calls,[['stage',validUri],['dispose']]);});
test('native rejection cleans cache',async()=>{const p=port();p.extractReaderLayout=async()=>{throw new Error('parser failure');};await assert.rejects(readNativePdf(validUri,id,p),/parser failure/);assert.deepEqual(p.calls.at(-1),['dispose']);});
test('invalid native response cleans cache',async()=>{const p=port(null);await assert.rejects(readNativePdf(validUri,id,p));assert.deepEqual(p.calls.at(-1),['dispose']);});
test('rejects network URI without staging',async()=>{const p=port();await assert.rejects(readNativePdf('https://example.com/a.pdf',id,p));assert.deepEqual(p.calls,[]);});
test('preserves 1 MiB import policy',async()=>{const p=port();await assert.rejects(readNativePdf(validUri,{...id,bytes:1048577},p));assert.deepEqual(p.calls,[]);});
test('rejects original URI returned as staging copy',async()=>{const p=port();p.stage=async()=>({uri:validUri,identity:id,dispose:async()=>{}});await assert.rejects(readNativePdf(validUri,id,p),/Invalid cache/);});
test('cleanup failure cannot report successful extraction',async()=>{const p=port();const stage=p.stage;p.stage=async u=>({...await stage(u),dispose:async()=>{throw new Error('cleanup failed');}});await assert.rejects(readNativePdf(validUri,id,p),/cleanup failed/);});
