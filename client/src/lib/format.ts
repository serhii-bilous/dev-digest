/**
 * USD cost, adaptive precision — a sub-cent per-call cost stays visible
 * instead of rounding to "$0.00" (2 decimals by default, extended up to 4
 * when needed). Returns "—" when the cost is unknown/unset.
 */
export function formatCost(usd: number | null | undefined): string {
  if (usd == null) return "—";
  if (usd === 0) return "$0.00";
  for (const decimals of [2, 3, 4]) {
    const fixed = usd.toFixed(decimals);
    if (Number(fixed) !== 0) return `$${fixed}`;
  }
  return `$${usd.toFixed(4)}`;
}

/** Combined token count with a space thousands-separator, e.g. "9 119 tok". */
export function formatTokenCount(total: number): string {
  return `${total.toLocaleString("en-US").replace(/,/g, " ")} tok`;
}
