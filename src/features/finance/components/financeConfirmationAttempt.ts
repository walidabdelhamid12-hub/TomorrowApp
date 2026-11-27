/** UI-only single-flight guard. A resolved domain outcome (including false) is
 * acknowledged; undefined means the adapter could not acknowledge a save.
 * This guard never creates, rotates, or persists a financial submission ID. */
export function createFinanceConfirmationAttempt(action: () => unknown) {
  let running = false;
  let finished = false;
  return {
    isRunning: () => running,
    cancel: () => {
      if (running || finished) return false;
      finished = true;
      return true;
    },
    run: async (): Promise<boolean> => {
      if (running || finished) return false;
      running = true;
      try {
        const result = await action();
        if (result === undefined) return false;
        finished = true;
        return true;
      } finally {
        running = false;
      }
    },
  };
}
