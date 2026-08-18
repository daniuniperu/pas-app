import { describe, it, expect } from "vitest";
import {
  calculateProratedDelta,
  roundHalfAwayFromZero,
  daysBetween,
  parseDate,
} from "../src/domain/proration";

describe("roundHalfAwayFromZero", () => {
  it("rounds positive .5 up", () => {
    expect(roundHalfAwayFromZero(2.5)).toBe(3);
  });

  it("rounds negative .5 down (away from zero)", () => {
    expect(roundHalfAwayFromZero(-2.5)).toBe(-3);
  });

  it("rounds normally below .5", () => {
    expect(roundHalfAwayFromZero(2.4)).toBe(2);
    expect(roundHalfAwayFromZero(-2.4)).toBe(-2);
  });

  it("handles zero", () => {
    expect(roundHalfAwayFromZero(0)).toBe(0);
  });
});

describe("daysBetween", () => {
  it("counts 365 days for 2026 full year", () => {
    const start = parseDate("2026-01-01");
    const end = parseDate("2027-01-01");
    expect(daysBetween(start, end)).toBe(365);
  });

  it("counts 184 days from 2026-07-01 to 2027-01-01", () => {
    const from = parseDate("2026-07-01");
    const to = parseDate("2027-01-01");
    expect(daysBetween(from, to)).toBe(184);
  });
});

describe("calculateProratedDelta — sample from spec", () => {
  const BASE = {
    termStart: "2026-01-01",
    termEnd: "2027-01-01",
    effectiveDate: "2026-07-01",
    oldAnnualPremiumCents: 120000,
    newAnnualPremiumCents: 144000,
  };

  it("produces 12099 cents for the spec example", () => {
    // (144000 - 120000) * 184 / 365 = 4416000 / 365 ≈ 12098.63 → rounds to 12099
    const delta = calculateProratedDelta(BASE);
    expect(delta).toBe(12099);
  });

  it("returns 0 when premium is unchanged", () => {
    const delta = calculateProratedDelta({
      ...BASE,
      newAnnualPremiumCents: BASE.oldAnnualPremiumCents,
    });
    expect(delta).toBe(0);
  });

  it("returns a negative delta for a premium decrease", () => {
    const delta = calculateProratedDelta({
      ...BASE,
      newAnnualPremiumCents: 96000, // decrease
    });
    expect(delta).toBeLessThan(0);
    // (96000 - 120000) * 184 / 365 = -24000 * 184 / 365 ≈ -12098.63 → -12099
    expect(delta).toBe(-12099);
  });

  it("throws when effective_date is after term_end", () => {
    expect(() =>
      calculateProratedDelta({ ...BASE, effectiveDate: "2027-06-01" })
    ).toThrow();
  });

  it("throws when effective_date is before term_start", () => {
    expect(() =>
      calculateProratedDelta({ ...BASE, effectiveDate: "2025-06-01" })
    ).toThrow();
  });

  it("handles effective_date equal to term_start (full term remaining)", () => {
    const delta = calculateProratedDelta({
      ...BASE,
      effectiveDate: "2026-01-01",
    });
    // remaining == term_days so delta == annual delta
    expect(delta).toBe(24000);
  });

  it("handles effective_date equal to term_end (zero remaining)", () => {
    const delta = calculateProratedDelta({
      ...BASE,
      effectiveDate: "2027-01-01",
    });
    expect(delta).toBe(0);
  });
});
