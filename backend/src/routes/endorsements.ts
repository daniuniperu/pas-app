import { Router, Request, Response } from "express";
import { getDb } from "../db";
import { calculateProratedDelta } from "../services/proration";
import {
  canonicalPayload,
  computeEventHash,
  GENESIS_HASH,
} from "../services/hashChain";
import {
  insertLedgerTransaction,
  endorsementAccounts,
} from "../services/accounting";
import { v4 as uuidv4 } from "uuid";

const router = Router({ mergeParams: true });

/**
 * POST /api/policies/:policyId/endorsements
 *
 * Idempotency rules:
 *   - Same key + same payload → return original result, no new DB rows.
 *   - Same key + different payload → 409 Conflict.
 *   - New key → process and persist.
 *
 * All writes happen inside a single SQLite transaction so there are
 * no partial writes on failure.
 */
router.post("/", (req: Request, res: Response) => {
  const { policyId } = req.params;
  const body = req.body as Record<string, unknown>;

  // --- Validate required fields ---
  const { idempotency_key, effective_date, new_annual_premium_cents, reason } = body;

  if (!idempotency_key || typeof idempotency_key !== "string") {
    return res.status(400).json({ error: "idempotency_key is required" });
  }
  if (!effective_date || typeof effective_date !== "string") {
    return res.status(400).json({ error: "effective_date is required" });
  }
  if (
    new_annual_premium_cents === undefined ||
    typeof new_annual_premium_cents !== "number" ||
    !Number.isInteger(new_annual_premium_cents) ||
    new_annual_premium_cents < 0
  ) {
    return res
      .status(400)
      .json({ error: "new_annual_premium_cents must be a non-negative integer" });
  }

  const db = getDb();

  // --- Load policy ---
  const policy = db
    .prepare("SELECT * FROM policies WHERE id = ?")
    .get(policyId) as any;

  if (!policy) {
    return res.status(404).json({ error: `Policy ${policyId} not found` });
  }
  if (policy.status !== "active") {
    return res
      .status(422)
      .json({ error: `Policy ${policyId} is not active (status: ${policy.status})` });
  }

  // --- Idempotency check ---
  const existingEvent = db
    .prepare("SELECT * FROM policy_events WHERE idempotency_key = ?")
    .get(idempotency_key) as any;

  if (existingEvent) {
    // Same key — compare normalized payload
    const incomingCanonical = canonicalPayload({
      event_type: "endorsement.applied",
      idempotency_key,
      policy_id: policyId,
      effective_date,
      new_annual_premium_cents,
      reason: reason ?? null,
    });

    if (existingEvent.payload !== incomingCanonical) {
      return res.status(409).json({
        error: "Idempotency key already used with a different payload",
        idempotency_key,
      });
    }

    // Exact duplicate — return original billing document
    const billingDoc = db
      .prepare("SELECT * FROM billing_documents WHERE endorsement_idem_key = ?")
      .get(idempotency_key) as any;

    return res.status(200).json({
      idempotency_result: "duplicate_ignored",
      event_id: existingEvent.id,
      billing_document: billingDoc
        ? {
            id: billingDoc.id,
            type: billingDoc.type,
            amount_cents: billingDoc.amount_cents,
            status: billingDoc.status,
          }
        : null,
    });
  }

  // --- Business logic ---
  let deltaCents: number;
  try {
    deltaCents = calculateProratedDelta({
      termStart: policy.term_start,
      termEnd: policy.term_end,
      effectiveDate: effective_date,
      oldAnnualPremiumCents: policy.annual_premium_cents,
      newAnnualPremiumCents: new_annual_premium_cents,
    });
  } catch (err: any) {
    return res.status(422).json({ error: err.message });
  }

  const billId = `BILL-${uuidv4()}`;
  const ledgerTxId = `LTX-${uuidv4()}`;

  const { debit_account, credit_account, ledger_amount_cents } =
    endorsementAccounts(deltaCents);

  // --- Build canonical event payload ---
  const eventPayload = canonicalPayload({
    event_type: "endorsement.applied",
    idempotency_key,
    policy_id: policyId,
    effective_date,
    new_annual_premium_cents,
    reason: reason ?? null,
  });

  // --- Determine previous hash ---
  const lastEvent = db
    .prepare(
      "SELECT event_hash, sequence_number FROM policy_events WHERE policy_id = ? ORDER BY sequence_number DESC LIMIT 1"
    )
    .get(policyId) as any;

  const previousHash = lastEvent ? lastEvent.event_hash : GENESIS_HASH;
  const nextSeq = lastEvent ? lastEvent.sequence_number + 1 : 1;
  const eventHash = computeEventHash(eventPayload, previousHash);

  // --- Atomic write ---
  const insertAll = db.transaction(() => {
    // 1. Insert policy event
    db.prepare(
      `INSERT INTO policy_events
         (policy_id, sequence_number, event_type, idempotency_key, payload, previous_hash, event_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      policyId,
      nextSeq,
      "endorsement.applied",
      idempotency_key,
      eventPayload,
      previousHash,
      eventHash
    );

    // 2. Update policy annual premium
    db.prepare(
      "UPDATE policies SET annual_premium_cents = ? WHERE id = ?"
    ).run(new_annual_premium_cents, policyId);

    // 3. Insert billing document
    db.prepare(
      `INSERT INTO billing_documents (id, policy_id, type, amount_cents, status, endorsement_idem_key)
       VALUES (?, ?, 'endorsement_adjustment', ?, 'pending', ?)`
    ).run(billId, policyId, Math.abs(deltaCents), idempotency_key);

    // 4. Insert balanced ledger entries (only if delta != 0)
    if (ledger_amount_cents > 0) {
      insertLedgerTransaction(db, {
        id: ledgerTxId,
        policy_id: policyId,
        source_type: "endorsement",
        source_id: idempotency_key,
        debit_account,
        credit_account,
        amount_cents: ledger_amount_cents,
      });
    }
  });

  try {
    insertAll();
  } catch (err: any) {
    return res.status(500).json({ error: "Database write failed", detail: err.message });
  }

  return res.status(201).json({
    idempotency_result: "created",
    endorsement_id: idempotency_key,
    prorated_delta_cents: deltaCents,
    billing_document: {
      id: billId,
      type: "endorsement_adjustment",
      amount_cents: Math.abs(deltaCents),
      status: "pending",
    },
    ledger_transaction_id: ledger_amount_cents > 0 ? ledgerTxId : null,
    new_annual_premium_cents,
  });
});

export default router;
