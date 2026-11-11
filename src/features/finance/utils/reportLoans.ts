import type { Loan } from '../types/finance';

export interface LoanReportPeriod { from: string; to: string }
export type LoanReportStatus = 'available' | 'historical_data_unavailable';
export interface LoanReportRow {
  loanId: string;
  loanName: string;
  currencyCode: string;
  status: LoanReportStatus;
  originalPrincipal: number | null;
  contractualTotal: number | null;
  periodPaid: number | null;
  periodLateFees: number | null;
  totalPaid: number | null;
  currentContractualRemaining: number | null;
  currentPrincipalRemaining: number | null;
  remainingAtPeriodEnd: number | null;
  reason?: string;
}
function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y,m,d] = value.split('-').map(Number);
  if (y < 100 || m < 1 || m > 12) return false;
  const leap = y%4===0 && (y%100!==0 || y%400===0);
  return d>=1 && d<=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31][m-1];
}
function units(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
  const x=value*1000, n=Math.round(x);
  return Number.isSafeInteger(n) && Math.abs(x-n)<=1e-8 ? n : null;
}
function safeSum(a:number,b:number):number|null {
  const n=a+b;
  return Number.isSafeInteger(n)?n:null;
}
/** Read-only loan reporting. Historical contract revisions and unrecorded settlement
 * allocation are not reconstructed. Never posts to accounts or the ledger. */
export function aggregateLoansReport(loans: readonly Loan[], period: LoanReportPeriod): LoanReportRow[] {
  if (!period || !validDate(period.from) || !validDate(period.to) || period.from>period.to) throw new Error('Invalid loan report period');
  if (!Array.isArray(loans)) throw new Error('Invalid loans collection');
  const seen=new Set<string>(), duplicate=new Set<string>();
  for (const l of loans) { if (seen.has(l.id)) duplicate.add(l.id); seen.add(l.id); }
  return loans.map(l=>{
    const base={loanId:l.id,loanName:l.name,currencyCode:l.currencyCode};
    const unavailable=(reason:string):LoanReportRow=>({
      ...base,status:'historical_data_unavailable',originalPrincipal:null,contractualTotal:null,
      periodPaid:null,periodLateFees:null,totalPaid:null,currentContractualRemaining:null,
      currentPrincipalRemaining:null,remainingAtPeriodEnd:null,reason,
    });
    if (!l.id || duplicate.has(l.id) || !l.currencyCode?.trim() || !Array.isArray(l.payments)) return unavailable('Invalid loan identity, currency or payments');
    if (!validDate(l.firstDueDate) || !Number.isSafeInteger(l.numberOfInstallments) || l.numberOfInstallments<=0) return unavailable('Invalid loan schedule');
    const monthly=units(l.monthlyInstallment);
    const total= l.totalRepaymentAmount===undefined
      ? (monthly===null?null:(Number.isSafeInteger(monthly*l.numberOfInstallments)?monthly*l.numberOfInstallments:null))
      : units(l.totalRepaymentAmount);
    const principal=units(l.receivedAmount??l.principalAmount);
    if (monthly===null || monthly===0 || total===null || total===0 || principal===null || principal>total) return unavailable('Unverified principal or contractual total');
    if (!validDate(l.createdAt?.slice(0,10)) || !validDate(l.updatedAt?.slice(0,10))) return unavailable('Invalid loan timestamps');
    if (l.receivedAt!==undefined && !validDate(l.receivedAt)) return unavailable('Invalid receipt date');
    const ids=new Set<string>();
    let paid=0, periodPaid=0, periodFees=0, paidAtEnd=0;
    let principalReduction=0;
    let principalKnown=true;
    for (const p of l.payments) {
      if (typeof p.id !== 'string' || !p.id || ids.has(p.id) || !validDate(p.date)) return unavailable('Invalid or duplicate loan payment');
      ids.add(p.id);
      const amount=units(p.amount), fee=units(p.latePaymentFee??0);
      if (amount===null || amount===0 || fee===null) return unavailable('Invalid loan payment or late fee');
      const next=safeSum(paid,amount);
      if (next===null || next>total) return unavailable('Unsafe or excessive payments');
      paid=next;
      if (p.date<=period.to) {
        const n=safeSum(paidAtEnd,amount); if(n===null)return unavailable('Unsafe historical payments'); paidAtEnd=n;
      }
      if(p.date>=period.from && p.date<=period.to) {
        const a=safeSum(periodPaid,amount), f=safeSum(periodFees,fee);
        if(a===null||f===null)return unavailable('Unsafe period payments');periodPaid=a;periodFees=f;
      }
      if (p.paymentMode==='split' || p.principalAmount!==undefined || p.interestAmount!==undefined) {
        const split=units(p.principalAmount);
        const interest=p.interestAmount===undefined?null:units(p.interestAmount);
        if(split===null || split>amount || (interest!==null && (interest<0 || split+interest!==amount))) principalKnown=false;
        else principalReduction+=split;
      } else principalReduction+=(amount/total)*principal;
      if (!Number.isFinite(principalReduction) || principalReduction>principal) principalKnown=false;
    }
    const terminal=l.status==='settled'||l.status==='closed'||l.status==='completed';
    if (l.settlementDate!==undefined && !validDate(l.settlementDate)) return unavailable('Invalid settlement date');
    if (l.closureDate!==undefined && !validDate(l.closureDate)) return unavailable('Invalid closure date');
    const lifecycleDate=l.status==='settled'?l.settlementDate:l.status==='closed'?l.closureDate:undefined;
    const currentContractual=terminal?0:total-paid;
    const currentPrincipal=terminal?0:principalKnown?Math.max(0,principal-principalReduction)/1000:null;
    // Historical closing is unsafe when contract terms were revised after the
    // period or terminal lifecycle lacks a dated event.
    const changedAfter=l.updatedAt.slice(0,10)>period.to;
    const lifecycleUnverified=terminal && (!lifecycleDate || (lifecycleDate<=period.to && l.status==='closed'));
    const historicalUnknown=changedAfter || lifecycleUnverified ||
      (terminal && l.status==='completed' && paidAtEnd<total && l.createdAt.slice(0,10)<=period.to);
    let closing:number|null=null;
    if(!historicalUnknown) {
      if(l.createdAt.slice(0,10)>period.to) closing=0;
      else if(lifecycleDate && lifecycleDate<=period.to) closing=0;
      else closing=(total-paidAtEnd)/1000;
    }
    return {...base,status:closing===null?'historical_data_unavailable':'available',
      originalPrincipal:principal/1000,contractualTotal:total/1000,
      periodPaid:periodPaid/1000,periodLateFees:periodFees/1000,totalPaid:paid/1000,
      currentContractualRemaining:currentContractual/1000,currentPrincipalRemaining:currentPrincipal,
      remainingAtPeriodEnd:closing,
      ...(closing===null?{reason:'Historical contract or lifecycle evidence unavailable'}:{})};
  });
}
