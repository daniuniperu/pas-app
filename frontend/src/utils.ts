/** Format integer cents as a currency string, e.g. 12099 → "$120.99" */
export function formatCents(cents: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

/** Truncate a hash to first 10 chars for display */
export function shortHash(hash: string): string {
  return hash.slice(0, 10) + "…";
}

/** ISO date → friendly display */
export function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}
