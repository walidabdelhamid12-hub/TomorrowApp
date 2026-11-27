const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=name=>fs.readFileSync(path.join(__dirname,'..','src',name),'utf8');
const debt=read('app/finance/debts.tsx');
test('R6 payment and collection share a safe-area form; edit uses the same form',()=>{
  assert.match(debt,/function ModalPayment[\s\S]*?return <FormModal visible=\{visible\}/);
  assert.match(debt,/function ModalEditPayment[\s\S]*?<FormModal visible=\{visible\}/);
  assert.match(debt,/isReceivable \? t\('Record collection'/);
  const modal=read('features/finance/components/FormModal.tsx');
  assert.match(modal,/Math\.max\(insets\.bottom, Platform\.OS === 'android' \? 24 : 0\)/);
});
test('R6 manual debt rate remains manual-only and date changes clear stale FX inputs',()=>{
  assert.match(debt,/manualMode manualOnly compact/);
  assert.match(debt,/setPaymentDate\(value\); setPaymentFxRate\(''\); setPaymentActual\(''\)/);
  assert.match(debt,/obligation\/quote/);
  assert.match(debt,/onSave\(amount, date, note, crossDebt \? fxRate : undefined, crossDebt \? fxActual : undefined\)/);
});
test('R6 loan repayment uses shared form and retains repayment and cancellation handlers',()=>{
 const loan=read('app/finance/loans.tsx');
 assert.match(loan,/<FormModal visible=\{!!selectedLoan\}[\s\S]*?onPress=\{confirmPayment\}[\s\S]*?onPress=\{closePayment\}[\s\S]*?<\/FormModal>/);
});
test('R6 transaction category icons are separate from signed amount colors',()=>{
 const screen=read('features/finance/screens/IncomeExpensesScreen.tsx');
 assert.match(screen,/categoryIcon = category\?\.icon/);
 assert.match(screen,/color: isRefund \? '#209B70' : accent/);
 assert.equal((screen.match(/<FinanceActionButtons /g)||[]).length,1);
});

test('R6 final asset card matches Accounts and keeps original and converted amounts separate',()=>{
 const src=read('features/finance/components/AssetCard.tsx');
 assert.match(src,/backgroundColor: colors\.finance\.account\.surface/);
 assert.ok(src.indexOf('style={styles.type}')<src.indexOf('style={styles.name}'));
 assert.ok(src.indexOf('style={styles.name}')<src.indexOf('style={styles.value}'));
 assert.match(src,/getCurrencyFlag\(currency\)/);
 assert.match(src,/valuationText \?\? balanceText/);
 assert.match(src,/<FinanceActionButtons label=\{asset.name\}/);
});
test('R6 final loan list owns both disclosures; payment and settlement actions are inside details',()=>{
 const src=read('app/finance/loans.tsx'), details=src.slice(src.indexOf('<LoanDetails '),src.indexOf('</LoanDetails>'));
 const list=src.slice(src.indexOf('visibleLoans.map(loan =>'),src.indexOf('{editingLoan !== null &&'));
 assert.match(details,/Record payment/); assert.match(details,/Early settlement/); assert.match(details,/Close without payment/);
 assert.doesNotMatch(list,/Record payment|Early settlement/);
 assert.ok(list.indexOf('Deposit distribution')<list.indexOf('Payment history'));
 assert.match(list,/expandedSections\[depositKey\]/); assert.match(list,/expandedSections\[historyKey\]/);
 assert.match(list,/canEditLoanPayment\(loan\)/); assert.match(list,/canReverseLoanPayment\(loan, payment.id\)/);
 assert.match(list,/getCurrencyFlag\(loan.currencyCode\)/);
 assert.doesNotMatch(read('features/finance/components/LoanDetails.tsx'),/<FinanceDisclosure[^>]*Payment history/);
});
test('R6 final installment tile keeps the monthly value and removes only the visual extra row',()=>{
 const src=read('features/finance/components/TotalCard.tsx');
 assert.match(src,/amount: scheduledThisMonth \?\? undefined/);
 assert.match(src,/accessibilityHint=\{visible \? item.amountLabel : undefined\}/);
 assert.doesNotMatch(src,/\{item.amountLabel \? <AppText/);
});
test('R6 final loan edit and deletion are revision checked; deletion retains existing protected store',()=>{
 const src=read('app/finance/loans.tsx');
 const edit=src.slice(src.indexOf('const saveLoanMetadata ='),src.indexOf('const canDeleteDraftLoan ='));
 const del=src.slice(src.indexOf('const canDeleteDraftLoan ='),src.indexOf('const resetLoanForm ='));
 assert.match(edit,/patch = \{ name: editName.trim\(\), lenderName: editLender.trim\(\) \}/);
 assert.match(edit,/submitFinanceForm\('loan.metadata.edit'/); assert.match(edit,/matchesUniqueRevision/);
 assert.match(del,/!loan.payments.length/); assert.match(del,/!loan.receivedAt/); assert.match(del,/!loan.receiptTransactionId/);
 assert.match(del,/confirm\(/); assert.match(del,/matchesUniqueRevision/); assert.match(del,/store.deleteLoan\(loan.id\)/);
});

function loanHandler(name, env) {
 const ts=require('typescript'), src=ts.createSourceFile('loans.tsx',read('app/finance/loans.tsx'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 let found;
 function walk(n){if(ts.isVariableDeclaration(n)&&n.name.getText(src)===name)found=n;ts.forEachChild(n,walk);} walk(src);
 assert.ok(found);
 const js=ts.transpileModule('const '+found.getText(src)+';',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 return new Function(...Object.keys(env),js+'\nreturn '+name+';')(...Object.values(env));
}
test('R6 metadata edit executes only explicit name/lender change and rejects a stale revision',()=>{
 const record={id:'loan',updatedAt:'a',name:'old',lenderName:'bank',principalAmount:100,receivedAmount:100,payments:[{id:'p',amount:10}]};
 const original=structuredClone(record); const records=[record]; let closed=0,rejected=0,changed=0;
 const env={editingLoan:structuredClone(record),editName:' new ',editLender:' other ',t:x=>x,Alert:{alert:()=>rejected++},setEditingLoan:()=>closed++,
  matchesUniqueRevision:(rows,id,revision)=>rows.filter(r=>r.id===id).length===1&&rows.find(r=>r.id===id).updatedAt===revision,
  formPayload:(kind,id,data,extra)=>({kind,id,data,extra}),submitFinanceForm:(_scope,payload,mutate,ok,no)=>{assert.deepEqual(payload.data,{name:'new',lenderName:'other'});const result=mutate();result?ok(result):no();return result;},
  useFinanceStore:{getState:()=>({loans:records,updateLoan:(id,patch)=>{assert.equal(id,'loan');Object.assign(record,patch,{updatedAt:'b'});changed++;}})}};
 const save=loanHandler('saveLoanMetadata',env);assert.equal(changed,0);assert.equal(save(),true);assert.equal(closed,1);assert.deepEqual(record,{...original,name:'new',lenderName:'other',updatedAt:'b'});
 assert.equal(save(),false);assert.equal(changed,1);assert.equal(rejected,1);
});
test('R6 draft loan delete requires explicit confirmation and blocks received, paid or linked loans',()=>{
 const record={id:'loan',updatedAt:'a',status:'active',payments:[]};let rows=[record],pending,deleted=0,blocked=0;const transactions=[];
 const env={transactions,t:x=>x,Alert:{alert(title){if(title==='Loan cannot be deleted')blocked++;}},confirm:(_title,_message,fn)=>{pending=fn;},matchesUniqueRevision:(rs,id,rev)=>rs.length===1&&rs[0].id===id&&rs[0].updatedAt===rev,
 formPayload:(kind,id,data,extra)=>({kind,id,data,extra}),submitFinanceForm:(_scope,payload,mutate,ok,no)=>{assert.equal(payload.id,'loan');const result=mutate();result?ok(result):no();return result;},
 useFinanceStore:{getState:()=>({loans:rows,deleteLoan:id=>{assert.equal(id,'loan');deleted++;rows=[];return true;}})}};
 const guard=loanHandler('canDeleteDraftLoan',env);const remove=loanHandler('deleteDraftLoan',{...env,canDeleteDraftLoan:guard});
 for(const variant of [{receivedAt:'2026-11-01'},{receivedAmount:100},{receiptTransactionId:'tx'},{payments:[{id:'p'}]},{status:'settled'}]){remove({...record,...variant});assert.equal(pending,undefined);}
 transactions.push({linkedEntityId:'loan'});remove(record);assert.equal(pending,undefined);transactions.pop();assert.equal(blocked,6);
 remove(record);assert.equal(deleted,0);assert.equal(typeof pending,'function');rows=[{...record,updatedAt:'b'}];assert.equal(pending(),false);assert.equal(deleted,0);
 rows=[record];remove(record);assert.equal(pending(),true);assert.equal(deleted,1);
});

test('R6 Fix3 asset amount precedes currency and loan delete is always visible with protected guard',()=>{
 const asset=read('features/finance/components/AssetCard.tsx'); const mid=asset.slice(asset.indexOf('style={styles.name}'),asset.indexOf('style={styles.value}'));
 assert.ok(mid.indexOf('original.endsWith')<mid.indexOf("flag + ' ' + currency"));
 assert.doesNotMatch(mid,/flexDirection: 'row'/);
 const loan=read('app/finance/loans.tsx'); assert.match(loan,/onDelete=\{\(\) => deleteDraftLoan\(loan\)\}/);
 assert.match(loan,/metric: \{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'/);
 assert.match(loan,/if \(!canDeleteDraftLoan\(loan\)\) \{[\s\S]*?Alert.alert[\s\S]*?return;/);
});

test('R6 Fix4 compact transaction rows keep original amounts on the right and reuse the home heading and gold filters',()=>{
 const screen=read('features/finance/screens/IncomeExpensesScreen.tsx');
 assert.match(screen,/name="receipt" size=\{21\} color=\{colors.finance.balance.accent\}/);
 assert.match(screen,/fontWeight: '800'/);
 assert.match(screen,/styles.iconColumn[\s\S]*?t\('Refund'/);
 assert.match(screen,/styles.amountColumn[\s\S]*?formatAmount\(item.originalAmount, item.originalCurrencyCode\)/);
 assert.match(read('features/finance/components/reporting/ReportPrimitives.tsx'),/minHeight: inline \? 40 : 44, borderWidth: 1, borderColor: '#D6B777'/);
 assert.match(read('features/finance/components/TransactionsSection.tsx'),/money\(tx.originalAmount, tx.originalCurrencyCode\)/);
});
