import { Router, Request, Response } from "express";
import { getDb } from "../db";

const router = Router({ mergeParams: true });

/**
 * GET /api/policies/:policyId
 *
 * Returns the full current state of a policy including:
 *   - policy fields
 *   - billing documents
 *   - payments (applied)
 *   - open balance in cents
 *   - ledger summary
 *   - suggested action
 */
router.get("/", (req: Request, res: Response) => {
  const { policyId } = req.params;
  const db = getDb();

  const policy = db
    .prepare("SELECT * FROM policies WHERE id = ?")
    .get(policyId) as any;

  if (!policy) {
    return res.status(404).json({ error: `Policy ${policyId} not found` });
  }

  const billingDocs = db
    .prepare(
      "SELECT * FROM billing_documents WHERE policy_id = ? ORDER BY created_at ASC"
    )
    .all(policyId) as any[];

  const payments = db
    .prepare(
      "SELECT * FROM payments WHERE policy_id = ? ORDER BY created_at ASC"
    )
    .all(policyId) as any[];

  // Open balance = sum of pending billing documents
  const pendingRow = db
    .prepare(
      "SELECT COALESCE(SUM(amount_cents), 0) AS total FROM billing_documents WHERE policy_id = ? AND status = 'pending'"
    )
    .get(policyId) as any;
  const openBalanceCents: number = pendingRow.total;

  // Endorsement IDs from billing docs
  const endorsementIds = [
    ...new Set(
      billingDocs
        .filter((d) => d.endorsement_idem_key)
        .map((d) => d.endorsement_idem_key as string)
    ),
  ];

  // Ledger summary
  const ledgerTxs = db
    .prepare(
      "SELECT * FROM ledger_transactions WHERE policy_id = ? ORDER BY created_at ASC"
    )
    .all(policyId) as any[];

  const ledgerSummary = ledgerTxs.map((tx: any) => {
    const entries = db
      .prepare(
        "SELECT entry_type, SUM(amount_cents) AS total FROM ledger_entries WHERE ledger_transaction_id = ? GROUP BY entry_type"
      )
      .all(tx.id) as any[];

    const debits = entries.find((e) => e.entry_type === "debit")?.total ?? 0;
    const credits = entries.find((e) => e.entry_type === "credit")?.total ?? 0;

    return {
      id: tx.id,
      source_type: tx.source_type,
      source_id: tx.source_id,
      debits_cents: debits,
      credits_cents: credits,
      balanced: debits === credits,
    };
  });

  const allBalanced =
    ledgerSummary.length === 0 || ledgerSummary.every((tx: any) => tx.balanced);

  // Suggested action
  let suggestedAction = "No action required";
  if (openBalanceCents > 0) {
    suggestedAction = `Outstanding balance of ${openBalanceCents} cents — payment required`;
  } else if (!allBalanced) {
    suggestedAction = "Ledger is unbalanced — investigate accounting entries";
  }

  return res.status(200).json({
    policy_id: policy.id,
    homeowner_id: policy.homeowner_id,
    status: policy.status,
    term_start: policy.term_start,
    term_end: policy.term_end,
    annual_premium_cents: policy.annual_premium_cents,
    currency: policy.currency,
    endorsement_ids: endorsementIds,
    billing_documents: billingDocs.map((d) => ({
      id: d.id,
      type: d.type,
      amount_cents: d.amount_cents,
      status: d.status,
      endorsement_id: d.endorsement_idem_key,
    })),
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
      transaction_count: ledgerSummary.length,
      transactions: ledgerSummary,
    },
    suggested_action: suggestedAction,
  });
});

export default router;
