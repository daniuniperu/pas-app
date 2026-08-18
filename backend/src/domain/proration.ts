/**
 * Proration service.
 *
 * All calculations use integer arithmetic to avoid floating-point drift.
 * The only floating-point operation is the final division, which is
 * immediately rounded with round_half_away_from_zero.
 */

/** Round x to the nearest integer, rounding .5 away from zero. */
export function roundHalfAwayFromZero(x: number): number {
  return Math.sign(x) * Math.round(Math.abs(x));
}

/**
 * Parse an ISO date string (YYYY-MM-DD) without timezone shifting.
 * Validates format strictly before parsing to prevent unexpected
 * behaviour from the Date constructor's loose input handling.
 */
export function parseDate(iso: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    throw new Error(`Invalid date format: "${iso}" — expected YYYY-MM-DD`);
  }
  const d = new Date(iso + "T00:00:00Z");
  if (isNaN(d.getTime())) {
    throw new Error(`Invalid date: ${iso}`);
  }
  return d;
}

/** Days between two dates (b - a). Both should be UTC midnight dates. */
export function daysBetween(a: Date, b: Date): number {
  const ms = b.getTime() - a.getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

/**
 * Calculate the prorated premium delta for a mid-term endorsement.
 *
 * Formula (per spec):
 *   term_days      = term_end - term_start
 *   remaining_days = term_end - effective_date
 *   delta_cents    = round_half_away_from_0(
 *                      (new_annual_premium_cents - old_annual_premium_cents)
 *                      * remaining_days / term_days
 *                    )
 *
 * Returns a signed integer (positive = additional premium owed,
 * negative = return premium).
 */
export function calculateProratedDelta(params: {
  termStart: string;
  termEnd: string;
  effectiveDate: string;
  oldAnnualPremiumCents: number;
  newAnnualPremiumCents: number;
}): number {
  const {
    termStart,
    termEnd,
    effectiveDate,
    oldAnnualPremiumCents,
    newAnnualPremiumCents,
  } = params;

  const start = parseDate(termStart);
  const end = parseDate(termEnd);
  const effective = parseDate(effectiveDate);

  const termDays = daysBetween(start, end);
  const remainingDays = daysBetween(effective, end);

  if (termDays <= 0) {
    throw new Error("Invalid policy term: term_end must be after term_start");
  }
  if (remainingDays < 0) {
    throw new Error(
      "Effective date is after policy term end — endorsement is out of term"
    );
  }
  if (effective < start) {
    throw new Error("Effective date is before policy term start");
  }

  const annualDelta = newAnnualPremiumCents - oldAnnualPremiumCents;

  // Use floating-point only for division; immediately round.
  const raw = (annualDelta * remainingDays) / termDays;
  return roundHalfAwayFromZero(raw);
}
