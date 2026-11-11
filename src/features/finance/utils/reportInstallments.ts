import type { PropertyContract, PropertyInstallment, PropertyInstallmentPayment } from '../types/propertyInstallments';

export interface InstallmentsReportPeriod { from: string; to: string }
export interface InstallmentsReportRow {
  contractId: string;
  projectName: string;
  currencyCode: string;
  status: 'available' | 'historical_data_unavailable';
  contractPrice: number | null;
  scheduledTotal: number | null;
  scheduledInPeriod: number | null;
  paidInPeriod: number | null;
  totalConfirmedPaid: number | null;
  currentScheduledRemaining: number | null;
  remainingAtPeriodEnd: number | null;
  reason?: string;
}
function dateOK(v: unknown): v is string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [y,m,d] = v.split('-').map(Number);
  if (y<100 || m<1 || m>12) return false;
  const leap=y%4===0&&(y%100!==0||y%400===0);
  return d>=1 && d<=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31][m-1];
}
function units(v: unknown): number | null {
  if (typeof v!=='number' || !Number.isFinite(v) || v<=0) return null;
  const x=v*1000, n=Math.round(x);
  return Number.isSafeInteger(n) && Math.abs(x-n)<=1e-8 ? n : null;
}
function sum(a:number,b:number):number|null { const n=a+b; return Number.isSafeInteger(n)?n:null; }
/** Read-only schedule and confirmed-payment reporting. No posting, no FX conversion. */
export function aggregateInstallmentsReport(
  contracts: readonly PropertyContract[],
  installments: readonly PropertyInstallment[],
  payments: readonly PropertyInstallmentPayment[],
  period: InstallmentsReportPeriod,
): InstallmentsReportRow[] {
  if (!period || !dateOK(period.from) || !dateOK(period.to) || period.from>period.to) throw new Error('Invalid report period');
  if (![contracts,installments,payments].every(Array.isArray)) throw new Error('Invalid installments collections');
  const count=(values: readonly {id:string}[],id:string)=>values.filter(x=>x.id===id).length;
  return contracts.map(c=>{
    const base={contractId:c.id,projectName:c.projectName,currencyCode:c.currencyCode};
    const unavailable=(reason:string):InstallmentsReportRow=>({...base,status:'historical_data_unavailable',contractPrice:null,scheduledTotal:null,scheduledInPeriod:null,paidInPeriod:null,totalConfirmedPaid:null,currentScheduledRemaining:null,remainingAtPeriodEnd:null,reason});
    if (typeof c.id!=='string'||!c.id||count(contracts,c.id)!==1||!c.currencyCode?.trim()||!dateOK(c.contractDate)) return unavailable('Invalid or duplicate contract');
    const price=units(c.contractPrice);
    if (price===null) return unavailable('Invalid contract price');
    const own=installments.filter(i=>i.contractId===c.id);
    const ownPayments=payments.filter(p=>p.contractId===c.id);
    let scheduled=0,scheduledPeriod=0,paid=0,paidPeriod=0;
    const dueById=new Map<string,number>(),paidById=new Map<string,number>();
    for (const i of own) {
      if (!i.id || count(installments,i.id)!==1 || !dateOK(i.dueDate)) return unavailable('Invalid or duplicate installment');
      const amount=units(i.amount);
      if (amount===null) return unavailable('Invalid installment amount');
      const next=sum(scheduled,amount);if(next===null)return unavailable('Unsafe scheduled total');scheduled=next;
      dueById.set(i.id,amount);
      if(i.dueDate>=period.from&&i.dueDate<=period.to){const n=sum(scheduledPeriod,amount);if(n===null)return unavailable('Unsafe scheduled period');scheduledPeriod=n;}
    }
    if(scheduled>price)return unavailable('Schedule exceeds contract price');
    if (installments.some(i=>i.contractId===c.id && count(contracts,i.contractId)!==1)) return unavailable('Invalid installment owner');
    if (payments.some(p=>p.installmentId && own.some(i=>i.id===p.installmentId) && p.contractId!==c.id)) return unavailable('Conflicting payment owner');
    for (const p of ownPayments) {
      if (!p.id||count(payments,p.id)!==1||!p.ledgerTransactionId||!p.accountId||!dateOK(p.date)||p.date<c.contractDate||!dueById.has(p.installmentId))return unavailable('Unverified payment reference');
      if (payments.filter(x=>x.ledgerTransactionId===p.ledgerTransactionId).length!==1) return unavailable('Duplicate ledger reference');
      const amount=units(p.amount);if(amount===null)return unavailable('Invalid payment amount');
      const next=sum(paid,amount),byInstallment=sum(paidById.get(p.installmentId)??0,amount);
      if(next===null||byInstallment===null||byInstallment>dueById.get(p.installmentId)!)return unavailable('Unsafe or excessive payment');
      paid=next;paidById.set(p.installmentId,byInstallment);
      if(p.date>=period.from&&p.date<=period.to){const n=sum(paidPeriod,amount);if(n===null)return unavailable('Unsafe period payments');paidPeriod=n;}
    }
    // Current schedule may have been edited without revision history. A prior
    // historical closing cannot be reconstructed safely from current records.
    return {...base,status:'historical_data_unavailable',contractPrice:price/1000,scheduledTotal:scheduled/1000,scheduledInPeriod:scheduledPeriod/1000,paidInPeriod:paidPeriod/1000,totalConfirmedPaid:paid/1000,currentScheduledRemaining:(scheduled-paid)/1000,remainingAtPeriodEnd:null,reason:'Historical schedule revisions are not recorded'};
  });
}
