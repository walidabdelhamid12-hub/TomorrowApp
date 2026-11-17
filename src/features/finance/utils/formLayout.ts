/** Use two columns only when each field has room at the current text scale. */
export function shouldStackFinanceFields(width: number, fontScale: number) {
  return width / Math.max(fontScale, 1) < 360;
}
