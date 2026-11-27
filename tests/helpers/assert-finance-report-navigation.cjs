const assert=require('node:assert/strict');
const ts=require('typescript');
module.exports=function assertReportNavigation(source) {
 const sf=ts.createSourceFile('reports.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 let routes;
 function visit(n){if(ts.isVariableDeclaration(n)&&n.name.getText(sf)==='ROUTES'&&ts.isObjectLiteralExpression(n.initializer)){
  routes=Object.fromEntries(n.initializer.properties.map(p=>{assert.ok(ts.isPropertyAssignment(p));assert.ok(ts.isStringLiteral(p.initializer));return [p.name.text,p.initializer.text];}));
 }ts.forEachChild(n,visit);}visit(sf);
 assert.deepEqual(routes,{Expenses:'/finance/report-expenses',Income:'/finance/report-income',Accounts:'/finance/report-accounts',Assets:'/finance/report-assets',Installments:'/finance/report-installments',Loans:'/finance/report-loans','Debts Receivable':'/finance/report-receivable','Debts Payable':'/finance/report-payable'});
 assert.match(source,/const navigate = \(label: string\) => router\.push\(ROUTES\[label\]\)/);
 assert.match(source,/onPress=\{\(\) => navigate\(item\.label\)\}/);
 assert.match(source,/onPress=\{\(\) => navigate\(last\.label\)\}/);
 assert.doesNotMatch(source,/disabled=\{[^}]*name\s*!==/);
};

