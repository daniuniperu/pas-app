import { Router, Request, Response } from "express";
import { getDb } from "../db";
import {
  canonicalPayload,
  computeEventHash,
  GENESIS_HASH,
} from "../services/hashChain";
import { insertLedgerTransaction } from "../services/accounting";
import crypto from "crypto";

const router = Router({ mergeParams: true });

/**
 * POST /api/policies/:policyId/payments
 *
 * Receives already-processed payment data (data ingestion — no payment provider).
 *
 * Idempotency rules:
 *   - Same idempotency_key + same payload → return original result.
 *   - Same idempotency_key + different payload → 409.
 *   - Wrong currency → 422.
 *
 * Double-entry effect:
 *   DR cash / CR premium_receivable
 */
router.post("/", (req: Request, res: Response) => {
  const { policyId } = req.params;
  const body = req.body as Record<string, unknown>;

  const {
    idempotency_key,
    external_payment_id,
    amount_cents,
    currency,
    received_at,
  } = body;

  // --- Validate fields ---
  if (!idempotency_key || typeof idempotency_key !== "string") {
    return res.status(400).json({ error: "idempotency_key is required" });
  }
  if (!external_payment_id || typeof external_payment_id !== "string") {
    return res.status(400).json({ error: "external_payment_id is required" });
  }
  if (
    amount_cents === undefined ||
    typeof amount_cents !== "number" ||
    !Number.isInteger(amount_cents) ||
    amount_cents <= 0
  ) {
    return res.status(400).json({ error: "amount_cents must be a positive integer" });
  }
  if (!currency || typeof currency !== "string") {
    return res.status(400).json({ error: "currency is required" });
  }
  if (!received_at || typeof received_at !== "string") {
    return res.status(400).json({ error: "received_at is required" });
  }

  const db = getDb();

  // --- Load policy ---
  const policy = db
    .prepare("SELECT * FROM policies WHERE id = ?")
    .get(policyId) as any;

  if (!policy) {
    return res.status(404).json({ error: `Policy ${policyId} not found` });
  }

  // --- Wrong currency check (before idempotency so we fail atomically) ---
  if (currency.toUpperCase() !== policy.currency.toUpperCase()) {
    return res.status(422).json({
      error: "Currency mismatch",
      detail: `Policy currency is ${policy.currency}, payment currency is ${currency}`,
    });
  }

  // --- Idempotency check ---
  const existing = db
    .prepare("SELECT * FROM payments WHERE idempotency_key = ?")
    .get(idempotency_key) as any;

  if (existing) {
    // Build canonical incoming payload for comparison
    const incomingCanonical = canonicalPayload({
      amount_cents,
      currency: currency.toUpperCase(),
      external_payment_id,
      idempotency_key,
      policy_id: policyId,
      received_at,
    });

    // Rebuild canonical from stored values to compare
    const storedCanonical = canonicalPayload({
      amount_cents: existing.amount_cents,
      currency: existing.currency,
      external_payment_id: existing.external_payment_id,
      idempotency_key: existing.idempotency_key,
      policy_id: existing.policy_id,
      received_at: existing.received_at,
    });

    if (incomingCanonical !== storedCanonical) {
      return res.status(409).json({
        error: "Idempotency key already used with a different payload",
        idempotency_key,
      });
    }

    return res.status(200).json({
      idempotency_result: "duplicate_ignored",
      payment_id: existing.id,
      external_payment_id: existing.external_payment_id,
      amount_cents: existing.amount_cents,
      currency: existing.currency,
      status: existing.status,
    });
  }

  const ledgerTxId = `LTX-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;

  // --- Build canonical event payload for hash chain ---
  const eventPayload = canonicalPayload({
    amount_cents,
    currency: currency.toUpperCase(),
    event_type: "payment.received",
    external_payment_id,
    idempotency_key,
    policy_id: policyId,
    received_at,
  });

  const lastEvent = db
    .prepare(
      "SELECT event_hash, sequence_number FROM policy_events WHERE policy_id = ? ORDER BY sequence_number DESC LIMIT 1"
    )
    .get(policyId) as any;

  const previousHash = lastEvent ? lastEvent.event_hash : GENESIS_HASH;
  const nextSeq = lastEvent ? lastEvent.sequence_number + 1 : 1;
  const eventHash = computeEventHash(eventPayload, previousHash);

  // --- Update matching billing document status if amount covers it ---
  // Find oldest pending billing document
  const pendingBill = db
    .prepare(
      "SELECT * FROM billing_documents WHERE policy_id = ? AND status = 'pending' ORDER BY created_at ASC LIMIT 1"
    )
    .get(policyId) as any;

  const insertAll = db.transaction(() => {
    // 1. Insert payment record
    db.prepare(
      `INSERT INTO payments (policy_id, idempotency_key, external_payment_id, amount_cents, currency, received_at, status)
       VALUES (?, ?, ?, ?, ?, ?, 'applied')`
    ).run(
      policyId,
      idempotency_key,
      external_payment_id,
      amount_cents,
      currency.toUpperCase(),
      received_at
    );

    const inserted = db
      .prepare("SELECT last_insert_rowid() as id")
      .get() as any;

    // 2. Update billing document if payment covers it
    if (pendingBill && amount_cents >= pendingBill.amount_cents) {
      db.prepare(
        "UPDATE billing_documents SET status = 'paid' WHERE id = ?"
      ).run(pendingBill.id);
    }

    // 3. Insert balanced ledger entries: DR cash / CR premium_receivable
    insertLedgerTransaction(db, {
      id: ledgerTxId,
      policy_id: policyId,
      source_type: "payment",
      source_id: idempotency_key,
      debit_account: "cash",
      credit_account: "premium_receivable",
      amount_cents,
    });

    // 4. Append policy event
    db.prepare(
      `INSERT INTO policy_events
         (policy_id, sequence_number, event_type, idempotency_key, payload, previous_hash, event_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      policyId,
      nextSeq,
      "payment.received",
      idempotency_key,
      eventPayload,
      previousHash,
      eventHash
    );

    return inserted.id;
  });

  let paymentRowId: number;
  try {
    paymentRowId = insertAll();
  } catch (err: any) {
    return res.status(500).json({ error: "Database write failed", detail: err.message });
  }

  const saved = db
    .prepare("SELECT * FROM payments WHERE rowid = ?")
    .get(paymentRowId) as any;

  return res.status(201).json({
    idempotency_result: "created",
    payment_id: saved?.id ?? paymentRowId,
    external_payment_id,
    amount_cents,
    currency: currency.toUpperCase(),
    status: "applied",
    ledger_transaction_id: ledgerTxId,
  });
});

export default router;
