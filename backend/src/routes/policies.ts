import { Router, Request, Response } from "express";
import { getDb } from "../db/connection";
import {
  PolicyRow,
  BillingDocumentRow,
  PaymentRow,
  LedgerTransactionRow,
  LedgerEntryAggRow,
  SumRow,
} from "../db/row-types";
import { verifyChain, StoredEvent } from "../domain/hashChain";

const router = Router({ mergeParams: true });

/**
 * GET /api/policies/:policyId
 *
 * Returns the full current state of a policy including:
 *   - policy fields
 *   - endorsements (rich array with nested billing_document)
 *   - payments with status
 *   - open balance in cents
 *   - ledger summary (balanced proof)
 *   - history verification result (inline)
 *   - rejected_events (failed payment attempts)
 *   - suggested next action
 */
router.get("/", (req: Request, res: Response) => {
  const { policyId } = req.params;
  const db = getDb();

  const policy = db
    .prepare("SELECT * FROM policies WHERE id = ?")
    .get(policyId) as PolicyRow | undefined;

  if (!policy) {
    return res.status(404).json({ error: `Policy ${policyId} not found` });
  }

  const billingDocs = db
    .prepare(
      "SELECT * FROM billing_documents WHERE policy_id = ? ORDER BY created_at ASC"
    )
    .all(policyId) as BillingDocumentRow[];

  const payments = db
    .prepare(
      "SELECT * FROM payments WHERE policy_id = ? ORDER BY created_at ASC"
    )
    .all(policyId) as PaymentRow[];

  const pendingRow = db
    .prepare(
      "SELECT COALESCE(SUM(amount_cents), 0) AS total FROM billing_documents WHERE policy_id = ? AND status = 'pending'"
    )
    .get(policyId) as SumRow;
  const openBalanceCents: number = pendingRow.total;

  // --- Rich endorsements array: each endorsement with its billing_document nested ---
  const endorsementKeys = [
    ...new Set(
      billingDocs
        .filter((d) => d.endorsement_idem_key)
        .map((d) => d.endorsement_idem_key as string)
    ),
  ];

  const endorsements = endorsementKeys.map((key) => {
    const doc = billingDocs.find((d) => d.endorsement_idem_key === key);
    return {
      id: key,
      billing_document: doc
        ? {
            id: doc.id,
            type: doc.type,
            amount_cents: doc.amount_cents,
            status: doc.status,
          }
        : null,
    };
  });

  // --- Ledger summary ---
  const ledgerTxs = db
    .prepare(
      "SELECT * FROM ledger_transactions WHERE policy_id = ? ORDER BY created_at ASC"
    )
    .all(policyId) as LedgerTransactionRow[];

  const ledgerSummary = ledgerTxs.map((tx) => {
    const entries = db
      .prepare(
        "SELECT entry_type, SUM(amount_cents) AS total FROM ledger_entries WHERE ledger_transaction_id = ? GROUP BY entry_type"
      )
      .all(tx.id) as LedgerEntryAggRow[];

    const debits = entries.find((e) => e.entry_type === "debit")?.total ?? 0;
    const credits = entries.find((e) => e.entry_type === "credit")?.total ?? 0;

    return {
      id: tx.id,
      source: tx.source_id,
      source_type: tx.source_type,
      debits_cents: debits,
      credits_cents: credits,
      balanced: debits === credits,
    };
  });

  const allBalanced =
    ledgerSummary.length === 0 || ledgerSummary.every((tx) => tx.balanced);

  // --- Inline history verification ---
  const events = db
    .prepare(
      `SELECT sequence_number, event_type, payload, previous_hash, event_hash
       FROM policy_events WHERE policy_id = ? ORDER BY sequence_number ASC`
    )
    .all(policyId) as StoredEvent[];

  const historyResult = verifyChain(events);

  // --- Suggested action ---
  let suggestedAction = "No action required";
  if (openBalanceCents > 0) {
    suggestedAction = `Outstanding balance of ${openBalanceCents} cents — payment required`;
  } else if (!allBalanced) {
    suggestedAction = "Ledger is unbalanced — investigate accounting entries";
  } else if (!historyResult.valid) {
    suggestedAction = "History chain is invalid — audit required";
  }

  return res.status(200).json({
    policy_id: policy.id,
    status: policy.status,
    annual_premium_cents: policy.annual_premium_cents,
    currency: policy.currency,
    homeowner_id: policy.homeowner_id,
    term_start: policy.term_start,
    term_end: policy.term_end,
    endorsements,
    payments: payments.map((p) => ({
      id: p.id,
      external_payment_id: p.external_payment_id,
      amount_cents: p.amount_cents,
      currency: p.currency,
      received_at: p.received_at,
      status: p.status,
    })),
    open_balance_cents: openBalanceCents,
    ledger: {
      balanced: allBalanced,
      transactions: ledgerSummary,
    },
    history: {
      valid: historyResult.valid,
      event_count: historyResult.event_count,
      ...(historyResult.failedAt !== undefined && { failed_at: historyResult.failedAt }),
    },
    suggested_action: suggestedAction,
  });
});

export default router;
