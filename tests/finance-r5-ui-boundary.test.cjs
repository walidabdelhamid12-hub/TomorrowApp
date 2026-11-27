const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ts=require('typescript');
const root=path.resolve(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const contract=read('src/app/finance/installment-contract.tsx');
const debts=read('src/app/finance/debts.tsx');
function extract(source,name,env){
  const ast=ts.createSourceFile('screen.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  const found=[];const walk=n=>{if(ts.isVariableDeclaration(n)&&n.name.getText(ast)===name)found.push(n);ts.forEachChild(n,walk);};walk(ast);
  assert.equal(found.length,1);
  const code=ts.transpileModule('const '+found[0].getText(ast)+';', {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
  return new Function(...Object.keys(env),code+'\nreturn '+name+';')(...Object.values(env));
}
test('R5 installment count increments unique draft rows, preserves irregular dates and never saves',()=>{
  const original=[{key:1,kind:'irregular',amount:'20',dueDate:'2026-11-27'},{key:2,kind:'regular',amount:'20',dueDate:'2026-11-28'}];
  let rows=structuredClone(original),selected=1;
  const nextKey={current:3};
  const add=extract(contract,'appendRow',{saveBusy:false,saveInFlight:{current:false},nextKey,setRows:f=>rows=f(rows),setSelectedRowKey:k=>selected=k,setDraftSummary:()=>{},setDraftError:()=>{}});
  add();add();
  assert.deepEqual(rows.slice(0,2),original);assert.deepEqual(rows.map(r=>r.key),[1,2,3,4]);assert.equal(selected,4);
  assert.equal(rows[2].dueDate,'');assert.equal(rows[3].amount,'');
});
test('R5 removing existing installment requires confirmation and preserves all other rows',()=>{
  const before=[{key:1,originalId:'a',amount:'20',dueDate:'2026-11-27'},{key:2,originalId:'b',amount:'20',dueDate:'2026-11-28'}];
  let rows=before,selected=1,confirmAction;
  const remove=extract(contract,'removeSelectedRow',{saveBusy:false,saveInFlight:{current:false},rows,selectedRow:rows[0],selectedIndex:0,setRows:r=>rows=r,setSelectedRowKey:k=>selected=k,setDraftSummary:()=>{},setDraftError:()=>{},t:x=>x,confirm:(_title,_message,action)=>{confirmAction=action;}});
  remove();assert.equal(rows,before);assert.equal(typeof confirmAction,'function');assert.equal(confirmAction(),true);assert.deepEqual(rows,[before[1]]);assert.equal(selected,2);
});
test('R5 debt create and edit use shared FX fields before the date, without promising unavailable API quotes',()=>{
  assert.equal((debts.match(/<DebtFxForm /g)||[]).length,2);
  assert.match(debts,/<DebtFxForm[^\n]+\n\s*\{visible && <FinanceDateField/g);
  assert.match(debts,/<DirectHistoricalFxField[\s\S]*?manualMode manualOnly compact/);
  const field=read('src/features/finance/components/DirectHistoricalFxField.tsx');
  assert.match(field,/!readOnly && !manualOnly && onFetch && onManualMode/);
});
test('R5 transaction list has no direct mutation buttons; protected details retain owner routing',()=>{
  const recent=read('src/features/finance/components/TransactionsSection.tsx');
  const history=read('src/features/finance/screens/IncomeExpensesScreen.tsx');
  assert.equal((recent.match(/<FinanceActionButtons /g)||[]).length,1);
  assert.equal((history.match(/<FinanceActionButtons /g)||[]).length,1);
  assert.match(recent,/<FinanceDetailsModal[\s\S]*?<FinanceActionButtons[\s\S]*?<\/FinanceDetailsModal>/);
  assert.match(history,/<FinanceDetailsModal[\s\S]*?<FinanceActionButtons[\s\S]*?<\/FinanceDetailsModal>/);
  assert.match(recent,/isProtectedTransaction\(matches\[0\], useFinanceStore.getState\(\)\)/);
  assert.match(history,/latestEditable\(id, false\)/);
});
