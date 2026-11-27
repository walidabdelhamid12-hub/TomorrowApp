/** Bounded native PDF evidence, never a verified financial extraction. */
export type PdfIdentity = { sha256: string; bytes: number };
export type Glyph = { page: number; text: string; x: number; y: number; width: number; height: number };
export type Callback = { sequence: number; page: number; text: string; glyphStartIndex: number; glyphCount: number };
export type Page = { pageNumber: number; width: number; height: number; rotation: number; cropBox: number[]; coordinateSystem: 'pdf-direction-adjusted-points'; rawTableLines: number[][] | null; rawTableGeometryWarning: string | null };
export type NativeEvidence = { sourceSha256: string; sourceByteCount: number; pageCount: number; pages: Page[]; characters: Glyph[]; processedTextCallbacks: Callback[]; durationMs: number; needsReview: true; scored: false };
export type NativeReview = { evidence: NativeEvidence; text: string; ocrNeededPages: number[]; needsReview: true; postingAllowed: false; scored: false };
const MAX_BYTES = 1024 * 1024; // accepted Documents limit, not Lab's 20 MiB limit
function check(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
function obj(value: unknown): Record<string, unknown> { check(value !== null && typeof value === 'object' && !Array.isArray(value), 'Invalid object'); return value as Record<string, unknown>; }
function num(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value); }
function integer(value: unknown, min: number, max: number): value is number { return num(value) && Number.isSafeInteger(value) && value >= min && value <= max; }
function array(value: unknown, max: number): unknown[] { check(Array.isArray(value) && value.length <= max, 'Invalid or oversized array'); for (let i=0;i<value.length;i++) check(Object.prototype.hasOwnProperty.call(value,i),'Sparse array'); return value; }
function identityValid(id: PdfIdentity) { check(typeof id.sha256 === 'string' && /^[a-f0-9]{64}$/.test(id.sha256) && integer(id.bytes,1,MAX_BYTES),'Invalid PDF identity'); }
export function validateNativeEvidence(value: unknown, expected: PdfIdentity): NativeEvidence {
  identityValid(expected);
  const d=obj(value);
  check(d.sourceSha256===expected.sha256 && d.sourceByteCount===expected.bytes,'PDF identity mismatch');
  check(integer(d.pageCount,1,20) && num(d.durationMs) && d.durationMs>=0 && d.needsReview===true && d.scored===false,'Invalid native metadata');
  const count=d.pageCount;
  const pages=array(d.pages,20); check(pages.length===count,'Missing pages');
  let lineCount=0;
  const pageResult: Page[]=pages.map((p,i)=>{
    const a=obj(p); const crop=array(a.cropBox,4);
    check(a.pageNumber===i+1 && num(a.width) && a.width>0 && a.width<=30000 && num(a.height) && a.height>0 && a.height<=30000 && num(a.rotation) && [0,90,180,270].includes(a.rotation) && a.coordinateSystem==='pdf-direction-adjusted-points','Invalid page geometry');
    check(crop.length===4 && crop.every(num),'Invalid crop box');
    const c=crop as number[]; check(c[2]>c[0] && c[3]>c[1],'Invalid crop bounds');
    const raw=a.rawTableLines==null?null:array(a.rawTableLines,100000).map(l=>{const row=array(l,4);check(row.length===4 && row.every(num),'Invalid vector line'); return row as number[];});
    lineCount+=raw?.length??0;check(lineCount<=100000,'Vector limit exceeded');
    check(a.rawTableGeometryWarning==null || (typeof a.rawTableGeometryWarning==='string' && a.rawTableGeometryWarning.length<=10000),'Invalid geometry warning');
    return {pageNumber:i+1,width:a.width,height:a.height,rotation:a.rotation,cropBox:c,coordinateSystem:'pdf-direction-adjusted-points',rawTableLines:raw,rawTableGeometryWarning:(a.rawTableGeometryWarning??null) as string|null};
  });
  let glyphUnits=0;
  const characters: Glyph[]=array(d.characters,100000).map(g=>{
    const a=obj(g);check(integer(a.page,1,count) && typeof a.text==='string' && num(a.x) && num(a.y) && num(a.width) && a.width>=0 && num(a.height) && a.height>=0,'Invalid glyph');
    glyphUnits+=a.text.length;check(glyphUnits<=500000,'Glyph text limit exceeded');
    return {page:a.page,text:a.text,x:a.x,y:a.y,width:a.width,height:a.height};
  });
  let offset=0,units=0,previousPage=0;
  const processedTextCallbacks: Callback[]=array(d.processedTextCallbacks,20000).map((c,i)=>{
    const a=obj(c);check(a.sequence===i+1 && integer(a.page,1,count) && a.page>=previousPage && typeof a.text==='string' && a.glyphStartIndex===offset && integer(a.glyphCount,0,characters.length-offset),'Invalid callback range');
    units+=a.text.length;check(units<=500000,'Callback text limit exceeded');
    for(let j=offset;j<offset+a.glyphCount;j++) check(characters[j].page===a.page,'Callback glyph page mismatch');
    offset+=a.glyphCount;previousPage=a.page;
    return {sequence:i+1,page:a.page,text:a.text,glyphStartIndex:a.glyphStartIndex as number,glyphCount:a.glyphCount};
  });
  check(offset===characters.length,'Unaccounted glyphs');
  return {sourceSha256:expected.sha256,sourceByteCount:expected.bytes,pageCount:count,pages:pageResult,characters,processedTextCallbacks,durationMs:d.durationMs,needsReview:true,scored:false};
}
export interface NativePdfPort {
  /** Stage a unique app-owned cache file; return the identity of staged bytes. */
  stage(uri:string):Promise<{uri:string;identity:PdfIdentity;dispose:()=>Promise<void>}>;
  extractReaderLayout(uri:string):Promise<unknown>;
}
/** Never writes to the vault or calls Finance. The native runtime is supplied separately. */
export async function readNativePdf(uri:string, expected:PdfIdentity, port:NativePdfPort):Promise<NativeReview> {
  identityValid(expected);check(/^file:\/\/\//.test(uri),'Local PDF required');
  const staged=await port.stage(uri);
  try {
    check(staged.uri!==uri && /^file:\/\/\//.test(staged.uri),'Invalid cache staging');
    check(staged.identity.sha256===expected.sha256 && staged.identity.bytes===expected.bytes,'Staged PDF identity mismatch');
    const evidence=validateNativeEvidence(await port.extractReaderLayout(staged.uri),expected);
    const glyphs=Array.from({length:evidence.pageCount},()=>[] as Glyph[]);
    const callbacks=Array.from({length:evidence.pageCount},()=>[] as Callback[]);
    for(const g of evidence.characters) glyphs[g.page-1].push(g);
    for(const c of evidence.processedTextCallbacks) callbacks[c.page-1].push(c);
    const ocrNeededPages=evidence.pages.filter((_,i)=>{
      const g=glyphs[i].filter(x=>x.text.trim());const text=g.map(x=>x.text).join('');
      return g.length<4 || (text.match(/[\p{L}\p{N}]/gu)?.length??0)<8 || /\ufffd|[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(text+callbacks[i].map(x=>x.text).join(''));
    }).map(p=>p.pageNumber);
    return {evidence,text:evidence.processedTextCallbacks.map(c=>c.text).join('\n'),ocrNeededPages,needsReview:true,postingAllowed:false,scored:false};
  } finally { await staged.dispose(); }
}
