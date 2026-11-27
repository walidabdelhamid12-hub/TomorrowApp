const { test }=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const ts=require('typescript');
const root=path.join(__dirname,'..');
const source='file:///vault/original.pdf';
const data=Buffer.from('%PDF-1.7\nmock source, not a real PDF');
const identity={sha256:crypto.createHash('sha256').update(data).digest('hex'),bytes:data.length};
function fakeEnvironment(options={}){
  const files=new Map([[source,Buffer.from(data)]]);const dirs=new Set();const calls=[];
  const cache='file:///cache';
  class Directory {
    constructor(parent,name){this.uri=`${parent.uri}/${name}`;}
    get exists(){return dirs.has(this.uri);}
    create(o){calls.push(['create',this.uri,o]);if(this.exists)throw Error('exists');dirs.add(this.uri);}
    delete(){calls.push(['delete-dir',this.uri]);dirs.delete(this.uri);for(const u of files.keys())if(u.startsWith(this.uri+'/'))files.delete(u);}
  }
  class File {
    constructor(parent,name){this.uri=typeof parent==='string'?parent:`${parent.uri}/${name}`;}
    get exists(){return files.has(this.uri);}
    get size(){return files.get(this.uri)?.length??0;}
    async copy(dest,o){calls.push(['copy',this.uri,dest.uri,o]);if(options.copyFails)throw Error('copy failed');if(files.has(dest.uri))throw Error('exists');files.set(dest.uri,Buffer.from(options.corruptCopy??files.get(this.uri)));}
    async arrayBuffer(){if(options.readFails)throw Error('read failed');return Uint8Array.from(files.get(this.uri)).buffer;}
    async base64(){calls.push(['base64',this.uri]);if(options.base64Fails)throw Error('base64 failed');return options.badBase64??files.get(this.uri).toString('base64');}
  }
  const native={extractReaderLayout:async uri=>{calls.push(['extract',uri]);if(options.nativeFails)throw Error('parser failed');return options.response??fixture();}};
  const mocks={
    'expo-file-system':{Directory,File,Paths:{cache:{uri:cache}}},
    'expo-crypto':{randomUUID:()=> 'unit-test-id',CryptoDigestAlgorithm:{SHA256:'SHA-256'},digest:async(_,bytes)=>{assert.ok(bytes instanceof ArrayBuffer);calls.push(['digest',bytes.byteLength]);return Uint8Array.from(crypto.createHash('sha256').update(new Uint8Array(bytes)).digest()).buffer;}},
    'react-native':{Platform:{OS:options.platform??'android'}},
    'expo':{requireOptionalNativeModule:name=>{calls.push(['resolve',name]);return options.noModule?null:native;}},
  };
  function load(rel){
    const f=path.resolve(root,rel);const out=ts.transpileModule(fs.readFileSync(f,'utf8'),{fileName:f,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS},reportDiagnostics:true});assert.deepEqual(out.diagnostics,[]);
    const mod={exports:{}};
    new Function('module','exports','require',out.outputText)(mod,mod.exports,id=>{
      if(Object.hasOwn(mocks,id))return mocks[id];
      const full=path.resolve(path.dirname(f),id);
      const target=fs.existsSync(full+'.ts')?full+'.ts':path.join(full,'index.ts');
      return load(path.relative(root,target));
    });return mod.exports;
  }
  const api=load('src/features/documents/extraction/pdfNativeRuntime.ts');
  return {api,files,dirs,calls};
}
function fixture(){const text='Payment 123';return {sourceSha256:identity.sha256,sourceByteCount:identity.bytes,pageCount:1,durationMs:10,needsReview:true,scored:false,pages:[{pageNumber:1,width:100,height:200,rotation:0,cropBox:[0,0,100,200],coordinateSystem:'pdf-direction-adjusted-points',rawTableLines:null,rawTableGeometryWarning:null}],characters:Array.from(text,(text,x)=>({page:1,text,x,y:10,width:1,height:2})),processedTextCallbacks:[{page:1,sequence:1,text,glyphStartIndex:0,glyphCount:text.length}]};}
function assertClean(e){assert.deepEqual([...e.files.keys()],[source]);assert.deepEqual(e.files.get(source),data);assert.equal(e.dirs.size,0);}
test('Android route stages independent bytes, validates digest and returns review-only native data through existing adapter',async()=>{const e=fakeEnvironment();const r=await e.api.readPdfWithNativeRuntime(source,identity);assert.equal(r.ok,true);assert.equal(r.review.postingAllowed,false);assert.equal(r.review.needsReview,true);assert.equal(r.text,'Payment 123');assert.equal(e.calls.find(c=>c[0]==='extract')[1],'file:///cache/tomorrow-pdf-reader-unit-test-id/document.pdf');assertClean(e);});
test('Expo Go / missing native module fails closed without copying',async()=>{const e=fakeEnvironment({noModule:true});assert.deepEqual(await e.api.readPdfWithNativeRuntime(source,identity),{ok:false,reason:'unavailable'});assert.equal(e.calls.some(c=>c[0]==='copy'),false);assertClean(e);});
test('unsupported platform never calls native resolver',async()=>{const e=fakeEnvironment({platform:'web'});assert.deepEqual(await e.api.readPdfWithNativeRuntime(source,identity),{ok:false,reason:'unavailable'});assert.deepEqual(e.calls,[]);assertClean(e);});
for(const [name,options] of [['copy failure',{copyFails:true}],['cache read failure',{readFails:true,base64Fails:true}],['invalid fallback base64',{readFails:true,badBase64:'AAAA'}],['cache size mismatch',{corruptCopy:Buffer.from('%PDF-')}],['cache hash mismatch',{corruptCopy:Buffer.concat([data.subarray(0,-1),Buffer.from('x')])}],['native parser failure',{nativeFails:true}],['bad native identity',{response:{...fixture(),sourceSha256:'0'.repeat(64)}}]]){
 test(name+' rejects and cleans staged data',async()=>{const e=fakeEnvironment(options);assert.deepEqual(await e.api.readPdfWithNativeRuntime(source,identity),{ok:false,reason:'engine_error'});assertClean(e);});
}
test('empty native text is not reported as successful OCR',async()=>{const e=fakeEnvironment({response:{...fixture(),characters:[],processedTextCallbacks:[]}});assert.deepEqual(await e.api.readPdfWithNativeRuntime(source,identity),{ok:false,reason:'empty_text'});assertClean(e);});
test('mixed native coverage keeps incomplete page warning',async()=>{const d=fixture();d.pageCount=2;d.pages.push({...d.pages[0],pageNumber:2});const e=fakeEnvironment({response:d});const r=await e.api.readPdfWithNativeRuntime(source,identity);assert.equal(r.ok,true);assert.deepEqual(r.review.ocrNeededPages,[2]);assertClean(e);});
test('accepted Documents Read uses vault metadata after integrity validation, and image Read does not use PDF engine',()=>{const screen=fs.readFileSync(path.join(root,'src/app/finance/documents.tsx'),'utf8');const body=screen.slice(screen.indexOf('const openDocument ='),screen.indexOf('const refresh ='));assert.ok(body.indexOf('await vaultFs.digestSha256')<body.indexOf('await readPdfWithNativeRuntime'));assert.match(body,/route === 'pdf-read'\s*\? await readPdfWithNativeRuntime\(file.uri, \{ sha256: expectedSha256.toLowerCase\(\), bytes: record.byteSize \}\)/);assert.match(body,/: \{ ok: false as const, reason: 'image_ocr_unavailable' as const \}/);assert.match(screen,/Incomplete native text; OCR required on pages/);});
test('native source retains only the bounded cache extraction entrypoint',()=>{const s=fs.readFileSync(path.join(root,'modules/tomorrow-pdf-extractor/android/src/main/java/com/tomorrowlab/pdfextractor/TomorrowPdfExtractorModule.kt'),'utf8');assert.deepEqual([...s.matchAll(/AsyncFunction\("([^"]+)"\)/g)].map(x=>x[1]),['extractReaderLayout']);assert.match(s,/context.cacheDir.canonicalPath/);assert.match(s,/hash\(file\) == identity/);assert.match(s,/PositionedTextStripper\(100_000, 20_000, 500_000\)/);});

test('arrayBuffer denial uses bounded base64 fallback without bypassing SHA-256',async()=>{const e=fakeEnvironment({readFails:true});const r=await e.api.readPdfWithNativeRuntime(source,identity);assert.equal(r.ok,true);assert.ok(e.calls.some(c=>c[0]==='base64'));assertClean(e);});

for (const readFails of [false,true]) test(`SHA-256 receives owned ArrayBuffer with exact bytes (fallback=${readFails})`,async()=>{const e=fakeEnvironment({readFails});const staged=await e.api.stagePdfForReader(source);assert.deepEqual(staged.identity,identity);assert.deepEqual(e.calls.filter(c=>c[0]==='digest'),[['digest',data.length]]);await staged.dispose();assertClean(e);});
