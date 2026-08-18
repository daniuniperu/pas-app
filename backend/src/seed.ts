/**
 * Seed script: inserts the sample policy from policy.json.
 * Run with: npm run seed
 * Safe to run multiple times (INSERT OR IGNORE).
 */

import { getDb } from "./db/connection";

const POLICY = {
  policy_id: "POL-1001",
  homeowner_id: "HOME-204",
  status: "active" as const,
  term_start: "2026-01-01",
  term_end: "2027-01-01",
  annual_premium_cents: 120000,
  currency: "USD",
};

function seed() {
  const db = getDb();

  db.prepare(
    `INSERT OR IGNORE INTO policies
       (id, homeowner_id, status, term_start, term_end, annual_premium_cents, currency)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    POLICY.policy_id,
    POLICY.homeowner_id,
    POLICY.status,
    POLICY.term_start,
    POLICY.term_end,
    POLICY.annual_premium_cents,
    POLICY.currency
  );

  console.log(`Seeded policy: ${POLICY.policy_id}`);
}

seed();
