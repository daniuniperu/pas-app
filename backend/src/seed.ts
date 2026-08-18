/**
 * Seed script: inserts a sample policy with one endorsement and one payment.
 * Run with: npm run seed
 * Safe to run multiple times (INSERT OR IGNORE / idempotency checks).
 */

import { getDb } from "./db/connection";
import { calculateProratedDelta } from "./domain/proration";
import {
  canonicalPayload,
  computeEventHash,
  GENESIS_HASH,
} from "./domain/hashChain";
import { insertLedgerTransaction, endorsementAccounts } from "./domain/accounting";
import { v4 as uuidv4 } from "uuid";

const POLICY = {
  policy_id:              "POL-1001",
  homeowner_id:           "HOME-204",
  status:                 "active" as const,
  term_start:             "2026-01-01",
  term_end:               "2027-01-01",
  annual_premium_cents:   120000,
  currency:               "USD",
};

const ENDORSEMENT = {
  idempotency_key:          "END-SEED-001",
  effective_date:           "2026-04-01",
  new_annual_premium_cents: 144000,   // $1,440 — +$240/yr
  reason:                   "Coverage upgrade: water-backup rider added",
};

const PAYMENT = {
  idempotency_key:    "PAY-SEED-001",
  external_payment_id:"EXT-STRIPE-7823",
  amount_cents:       6000,           // prorated portion
  currency:           "USD",
  received_at:        "2026-04-05T14:22:00Z",
};

function seed() {
  const db = getDb();

  // ── 1. Policy ──────────────────────────────────────────────────────────
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
    POLICY.currency,
  );
  console.log(`✓ Policy: ${POLICY.policy_id}`);

  // ── 2. Endorsement (idempotent: skip if key already recorded) ──────────
  const existingEndorsementEvent = db
    .prepare("SELECT id FROM policy_events WHERE idempotency_key = ?")
    .get(ENDORSEMENT.idempotency_key);

  if (!existingEndorsementEvent) {
    const policy = db
      .prepare("SELECT * FROM policies WHERE id = ?")
      .get(POLICY.policy_id) as any;

    const deltaCents = calculateProratedDelta({
      termStart:              policy.term_start,
      termEnd:                policy.term_end,
      effectiveDate:          ENDORSEMENT.effective_date,
      oldAnnualPremiumCents:  policy.annual_premium_cents,
      newAnnualPremiumCents:  ENDORSEMENT.new_annual_premium_cents,
    });

    const eventPayload = canonicalPayload({
      event_type:               "endorsement.applied",
      idempotency_key:          ENDORSEMENT.idempotency_key,
      policy_id:                POLICY.policy_id,
      effective_date:           ENDORSEMENT.effective_date,
      new_annual_premium_cents: ENDORSEMENT.new_annual_premium_cents,
      reason:                   ENDORSEMENT.reason,
    });

    const lastEvent = db
      .prepare(
        "SELECT event_hash, sequence_number FROM policy_events WHERE policy_id = ? ORDER BY sequence_number DESC LIMIT 1"
      )
      .get(POLICY.policy_id) as any;

    const previousHash = lastEvent ? lastEvent.event_hash : GENESIS_HASH;
    const nextSeq      = lastEvent ? lastEvent.sequence_number + 1 : 1;
    const eventHash    = computeEventHash(eventPayload, previousHash);

    const billId     = `BILL-${uuidv4()}`;
    const ledgerTxId = `LTX-${uuidv4()}`;

    const { debit_account, credit_account, ledger_amount_cents } =
      endorsementAccounts(deltaCents);

    db.transaction(() => {
      db.prepare(
        `INSERT INTO policy_events
           (policy_id, sequence_number, event_type, idempotency_key, payload, previous_hash, event_hash)
         VALUES (?, ?, 'endorsement.applied', ?, ?, ?, ?)`
      ).run(POLICY.policy_id, nextSeq, ENDORSEMENT.idempotency_key, eventPayload, previousHash, eventHash);

      db.prepare("UPDATE policies SET annual_premium_cents = ? WHERE id = ?")
        .run(ENDORSEMENT.new_annual_premium_cents, POLICY.policy_id);

      db.prepare(
        `INSERT INTO billing_documents (id, policy_id, type, amount_cents, status, endorsement_idem_key)
         VALUES (?, ?, 'endorsement_adjustment', ?, 'pending', ?)`
      ).run(billId, POLICY.policy_id, Math.abs(deltaCents), ENDORSEMENT.idempotency_key);

      if (ledger_amount_cents > 0) {
        insertLedgerTransaction(db, {
          id:             ledgerTxId,
          policy_id:      POLICY.policy_id,
          source_type:    "endorsement",
          source_id:      ENDORSEMENT.idempotency_key,
          debit_account,
          credit_account,
          amount_cents:   ledger_amount_cents,
        });
      }
    })();

    console.log(`✓ Endorsement: ${ENDORSEMENT.idempotency_key} (Δ ${deltaCents > 0 ? "+" : ""}${deltaCents} cents)`);
  } else {
    console.log(`  Endorsement already seeded — skipped`);
  }

  // ── 3. Payment (idempotent: skip if key already recorded) ─────────────
  const existingPayment = db
    .prepare("SELECT id FROM payments WHERE idempotency_key = ?")
    .get(PAYMENT.idempotency_key);

  if (!existingPayment) {
    const eventPayload = canonicalPayload({
      event_type:          "payment.received",
      idempotency_key:     PAYMENT.idempotency_key,
      policy_id:           POLICY.policy_id,
      external_payment_id: PAYMENT.external_payment_id,
      amount_cents:        PAYMENT.amount_cents,
      currency:            PAYMENT.currency,
      received_at:         PAYMENT.received_at,
    });

    const lastEvent = db
      .prepare(
        "SELECT event_hash, sequence_number FROM policy_events WHERE policy_id = ? ORDER BY sequence_number DESC LIMIT 1"
      )
      .get(POLICY.policy_id) as any;

    const previousHash = lastEvent ? lastEvent.event_hash : GENESIS_HASH;
    const nextSeq      = lastEvent ? lastEvent.sequence_number + 1 : 1;
    const eventHash    = computeEventHash(eventPayload, previousHash);
    const ledgerTxId   = `LTX-${uuidv4()}`;

    // Find oldest pending billing doc to mark as paid
    const pendingBill = db
      .prepare(
        "SELECT * FROM billing_documents WHERE policy_id = ? AND status = 'pending' ORDER BY created_at ASC LIMIT 1"
      )
      .get(POLICY.policy_id) as any;

    db.transaction(() => {
      db.prepare(
        `INSERT INTO payments (policy_id, idempotency_key, external_payment_id, amount_cents, currency, received_at, status)
         VALUES (?, ?, ?, ?, ?, ?, 'applied')`
      ).run(
        POLICY.policy_id,
        PAYMENT.idempotency_key,
        PAYMENT.external_payment_id,
        PAYMENT.amount_cents,
        PAYMENT.currency,
        PAYMENT.received_at,
      );

      if (pendingBill && PAYMENT.amount_cents >= pendingBill.amount_cents) {
        db.prepare("UPDATE billing_documents SET status = 'paid' WHERE id = ?")
          .run(pendingBill.id);
      }

      insertLedgerTransaction(db, {
        id:             ledgerTxId,
        policy_id:      POLICY.policy_id,
        source_type:    "payment",
        source_id:      PAYMENT.idempotency_key,
        debit_account:  "cash",
        credit_account: "premium_receivable",
        amount_cents:   PAYMENT.amount_cents,
      });

      db.prepare(
        `INSERT INTO policy_events
           (policy_id, sequence_number, event_type, idempotency_key, payload, previous_hash, event_hash)
         VALUES (?, ?, 'payment.received', ?, ?, ?, ?)`
      ).run(POLICY.policy_id, nextSeq, PAYMENT.idempotency_key, eventPayload, previousHash, eventHash);
    })();

    console.log(`✓ Payment: ${PAYMENT.idempotency_key} ($${(PAYMENT.amount_cents / 100).toFixed(2)})`);
  } else {
    console.log(`  Payment already seeded — skipped`);
  }

  console.log("\nSeed complete. Visit http://localhost:5173 and load POL-1001.");
}

seed();
