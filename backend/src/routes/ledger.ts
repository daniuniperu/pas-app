import { Router, Request, Response } from "express";
import { getDb } from "../db/connection";

const router = Router({ mergeParams: true });

/**
 * GET /api/policies/:policyId/ledger
 *
 * Returns all ledger transactions and their entries, plus a proof that
 * every transaction is balanced (debits == credits).
 */
router.get("/", (req: Request, res: Response) => {
  const { policyId } = req.params;
  const db = getDb();

  const policy = db
    .prepare("SELECT id FROM policies WHERE id = ?")
    .get(policyId) as any;

  if (!policy) {
    return res.status(404).json({ error: `Policy ${policyId} not found` });
  }

  const transactions = db
    .prepare(
      "SELECT * FROM ledger_transactions WHERE policy_id = ? ORDER BY created_at ASC"
    )
    .all(policyId) as any[];

  let totalDebits = 0;
  let totalCredits = 0;
  let allBalanced = true;

  const txDetails = transactions.map((tx: any) => {
    const entries = db
      .prepare(
        "SELECT * FROM ledger_entries WHERE ledger_transaction_id = ? ORDER BY entry_type ASC"
      )
      .all(tx.id) as any[];

    const txDebits = entries
      .filter((e: any) => e.entry_type === "debit")
      .reduce((s: number, e: any) => s + e.amount_cents, 0);
    const txCredits = entries
      .filter((e: any) => e.entry_type === "credit")
      .reduce((s: number, e: any) => s + e.amount_cents, 0);

    totalDebits += txDebits;
    totalCredits += txCredits;

    const balanced = txDebits === txCredits;
    if (!balanced) allBalanced = false;

    return {
      id: tx.id,
      source_type: tx.source_type,
      source_id: tx.source_id,
      created_at: tx.created_at,
      debits_cents: txDebits,
      credits_cents: txCredits,
      balanced,
      entries: entries.map((e: any) => ({
        id: e.id,
        account: e.account,
        entry_type: e.entry_type,
        amount_cents: e.amount_cents,
      })),
    };
  });

  return res.status(200).json({
    policy_id: policyId,
    balanced: allBalanced && totalDebits === totalCredits,
    total_debits_cents: totalDebits,
    total_credits_cents: totalCredits,
    transaction_count: transactions.length,
    transactions: txDetails,
  });
});

export default router;
