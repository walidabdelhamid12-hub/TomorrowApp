const test = require('node:test');
const assert = require('node:assert/strict');
const { repository } = require('./documents-local-loader.cjs');
const ns = 'tomorrow:documents:v1:';
const r = {id:'one',category:'other',status:'stored',source:'picker',name:'one.pdf',mimeType:'application/pdf',byteSize:12,sha256:'a'.repeat(64),vaultPath:'vault/objects/aa/'+ 'a'.repeat(64)+'.pdf',createdAt:'2026-11-24T00:00:00.000Z',updatedAt:'2026-11-24T00:00:00.000Z'};
for (const stage of ['pending','record','index','clear']) for (const after of [false,true]) test(`production recovery ${stage} ${after?'after':'before'} commit`, async()=>{
 const map=new Map([['tomorrow:finance','unchanged']]); let fail=true;
 const backend={getItem:async k=>map.get(k)??null,setItem:async(k,v)=>{const hit=fail&&(stage==='pending'?k===ns+'pending-import'&&v!=='null':stage==='record'?k===ns+'record:one':stage==='index'?k===ns+'index':k===ns+'pending-import'&&v==='null');if(hit&&!after)throw Error();map.set(k,v);if(hit)throw Error();}};
 const make=()=>repository().createDocumentRepository(backend);
 assert.equal((await make().createIfHashAbsent(r)).ok,false);fail=false;
 const snapshot=[...map]; const blocked=await make().recoverPendingImport(async()=>false);
 assert.deepEqual([...map],snapshot);
 const hasPending=!!JSON.parse(map.get(ns+'pending-import')??'null');assert.equal(blocked.ok,!hasPending);
 const result=await make().recoverPendingImport(async x=>{assert.deepEqual(x,r);return true;});assert.equal(result.ok,true);
 assert.deepEqual(await make().recoverPendingImport(async()=>{throw Error()}),{ok:true,value:null});
 const list=await make().list();assert.equal(list.ok,true);assert.equal(list.value.length,stage==='pending'&&!after?0:1);assert.equal(map.get('tomorrow:finance'),'unchanged');
});
