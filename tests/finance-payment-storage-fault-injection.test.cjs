'use strict';
/**
 * S3-F executable in-memory storage fault injection.
 * Tests the real ordered persistence adapter, not a production device.
 * No finance posting, installation or recovery writes are invoked.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync(path.join(__dirname,'../src/features/finance/store/financePersistence.ts'),'utf8');
const js = ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const mod={exports:{}};
vm.runInNewContext(js,{module:mod,exports:mod.exports,Promise,Map,Error});
const create = mod.exports.createOrderedFinancePersistence;
function backend() {
 const values=new Map(), events=[];
 let writeFailure=false, readFailure=false, removeFailure=false;
 return {
   values,events,
   setWriteFailure(v){writeFailure=v;},
   setReadFailure(v){readFailure=v;},
   setRemoveFailure(v){removeFailure=v;},
   async getItem(k){events.push('read:'+k);if(readFailure)throw Error('read interrupted');return values.get(k)??null;},
   async setItem(k,v){events.push('write:'+k);if(writeFailure)throw Error('write interrupted');values.set(k,v);},
   async removeItem(k){events.push('remove:'+k);if(removeFailure)throw Error('remove interrupted');values.delete(k);},
 };
}
test('ordered successful writes and flush preserve final bytes',async()=>{
 const b=backend(),p=create(b);
 const a=p.storage.setItem('finance','v1'),c=p.storage.setItem('finance','v2');
 await Promise.all([a,c]);await p.flush('finance');
 assert.equal(await p.storage.getItem('finance'),'v2');
 assert.deepEqual(b.events,['write:finance','write:finance','read:finance']);
});
test('failed write becomes sticky and later writes are refused',async()=>{
 const b=backend(),p=create(b);b.setWriteFailure(true);
 await assert.rejects(p.storage.setItem('finance','bad'));
 b.setWriteFailure(false);
 await assert.rejects(p.storage.setItem('finance','later'));
 await p.settle('finance');
 assert.equal(b.values.has('finance'),false);
 assert.equal(b.events.filter(x=>x==='write:finance').length,1);
});
test('write failure is uncertain, not proof bytes were not saved',async()=>{
 const b=backend();
 b.setItem=async(k,v)=>{b.values.set(k,v);throw Error('ack lost');};
 const p=create(b);
 await assert.rejects(p.storage.setItem('finance','saved'));
 assert.equal(b.values.get('finance'),'saved');
 assert.equal(p.getFailure('finance').uncertain,true);
});
test('read failure is sticky and does not claim write uncertainty',async()=>{
 const b=backend(),p=create(b);b.setReadFailure(true);
 await assert.rejects(p.storage.getItem('ledger'));
 assert.equal(p.getFailure('ledger').operation,'read');
 assert.equal(p.getFailure('ledger').uncertain,false);
 await assert.rejects(p.storage.setItem('ledger','new'));
});
test('remove failure blocks later mutation',async()=>{
 const b=backend(),p=create(b);await p.storage.setItem('finance','original');
 b.setRemoveFailure(true);
 await assert.rejects(p.storage.removeItem('finance'));
 b.setRemoveFailure(false);
 await assert.rejects(p.storage.setItem('finance','replacement'));
 assert.equal(b.values.get('finance'),'original');
});
test('failure for one key does not contaminate another key',async()=>{
 const b=backend(),p=create(b);
 b.setWriteFailure(true);await assert.rejects(p.storage.setItem('finance','bad'));
 b.setWriteFailure(false);
 await p.storage.setItem('ledger','good');
 assert.equal(await p.storage.getItem('ledger'),'good');
 assert.equal(b.values.has('finance'),false);
});
test('mutation exception becomes sticky for its key',()=>{
 const b=backend(),p=create(b);
 assert.throws(()=>p.runMutation('finance',()=>{throw Error('mutation failed');}));
 assert.throws(()=>p.runMutation('finance',()=>42));
 assert.equal(p.getFailure('finance').operation,'mutation');
});
test('settle drains a rejected queue without clearing sticky failure',async()=>{
 const b=backend(),p=create(b);b.setWriteFailure(true);
 await assert.rejects(p.storage.setItem('finance','bad'));
 await p.settle('finance');
 await assert.rejects(p.flush('finance'));
});
