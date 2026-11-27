import { Alert } from 'react-native';
import { financeRequest } from '../store/durableFinanceOperations';
import { isFinanceAdmissionRejection } from '../store/financeSubmissionIdentity';
import { financeSubmissions } from '../store/productionFinancePersistence';

let effects: (() => void)[] | undefined;
let executingIdentity: string | undefined;
const pending = new Map<string, {request: string; promise: Promise<unknown>}>();
export function afterFinanceSave(effect: () => void): void {
  if (effects) effects.push(effect);
  else effect();
}
export type FinanceSubmissionContract = {
  /** Full canonical financial payload, including target IDs, amounts, dates and FX evidence. */
  payload: unknown;
  /** UI-only, idempotent completion; also called when a persisted receipt is returned. */
  onCommitted?: (result: unknown) => void;
  /** R4 adapter passes this persisted identity to its existing domain submission field. */
  mutate?: (operationId: string) => unknown;
};
/** Retained scope identifies a retry. Only startNew(scope) creates an independent submission. */
export function acknowledgedFinanceHandler<A extends unknown[]>(label: string, action: (...args: A) => unknown, contract?: FinanceSubmissionContract) {
  return (...args: A): unknown => {
    if (effects) return contract?.mutate ? contract.mutate(executingIdentity!) : action(...args);
    const payload = contract ? {handler:label,payload:contract.payload}
      : {handler:label,arguments:args.slice(0,action.length)};
    let request: string;
    try { request=financeRequest(payload); }
    catch(error) { Alert.alert('Finance submission requires review',String(error));return Promise.resolve(undefined); }
    const running = pending.get(label);
    if (running) {
      if (running.request===request) return running.promise;
      Alert.alert('Conflicting Finance submission','A different payload cannot reuse the pending submission identity.');
      return Promise.resolve(undefined);
    }
    const deferred: (()=>void)[]=[];
    const result=financeSubmissions.run(label,payload,(operationId)=>{
      effects=deferred;executingIdentity=operationId;
      try{return contract?.mutate ? contract.mutate(operationId) : action(...args);}finally{effects=undefined;executingIdentity=undefined;}
    }).then(value=>{
      for(const effect of deferred)effect();
      contract?.onCommitted?.(value);
      return value;
    }).catch(error=>{
      const local = isFinanceAdmissionRejection(error);
      const slot = local ? financeSubmissions.getSnapshot().slots.find(item => item.scope === label && item.state === 'completed') : undefined;
      if (slot) {
        Alert.alert('Conflicting Finance submission',
          'A different operation was previously saved. Prepare a new independent operation, then review the current form and save again. Nothing will be recorded by this choice.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Prepare new operation', onPress: () => {
              void financeSubmissions.startNew(label, slot.operationId).then(() => {
                Alert.alert('New operation prepared', 'Review the current form and save again. No accounting change has been made.');
              }).catch(reason => Alert.alert('Finance submission requires review', reason instanceof Error ? reason.message : 'Review the saved operation.'));
            } },
          ]);
        return undefined;
      }
      Alert.alert(local ? 'Conflicting Finance submission' : 'Finance save requires review',
        error instanceof Error?error.message:'Review saved records before retrying.');
      return undefined;
    }).finally(()=>{if(pending.get(label)?.promise===result)pending.delete(label);});
    pending.set(label,{request,promise:result});return result;
  };
}

/** Explicit completion of a previously saved operation; no current form payload is submitted. */
export async function completeRetainedFinanceSubmission(scope: string): Promise<unknown> {
  const slot = financeSubmissions.getSnapshot().slots.find(item => item.scope === scope);
  if (!slot || slot.state !== 'completed' || slot.request === null) throw new Error('No verified saved operation is available.');
  return financeSubmissions.run(scope, JSON.parse(slot.request), () => { throw new Error('Saved operation receipt is unavailable; accounting will not be replayed.'); });
}
