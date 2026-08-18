import Database from "better-sqlite3";

/**
 * Double-entry accounting helpers.
 *
 * Every financial mutation produces a balanced pair of ledger entries
 * (sum of debits == sum of credits) inside a single database transaction.
 *
 * Accounts used:
 *   premium_receivable  — what the policyholder owes us
 *   written_premium     — earned/written revenue
 *   cash                — money received
 *
 * Rules (per spec):
 *   Endorsement (positive delta):  DR premium_receivable / CR written_premium
 *   Endorsement (negative delta):  DR written_premium    / CR premium_receivable
 *   Payment received:              DR cash               / CR premium_receivable
 */

interface LedgerTransactionInput {
  id: string;
  policy_id: string;
  source_type: "endorsement" | "payment";
  source_id: string;
  debit_account: string;
  credit_account: string;
  amount_cents: number;
}

/**
 * Insert a balanced ledger_transaction + two ledger_entries.
 * Must be called inside an already-open SQLite transaction.
 */
export function insertLedgerTransaction(
  db: Database.Database,
  input: LedgerTransactionInput
): void {
  const { id, policy_id, source_type, source_id, debit_account, credit_account, amount_cents } = input;

  if (amount_cents <= 0) {
    throw new Error(`Ledger amount must be positive; got ${amount_cents}`);
  }

  db.prepare(
    `INSERT INTO ledger_transactions (id, policy_id, source_type, source_id)
     VALUES (?, ?, ?, ?)`
  ).run(id, policy_id, source_type, source_id);

  db.prepare(
    `INSERT INTO ledger_entries (ledger_transaction_id, account, entry_type, amount_cents)
     VALUES (?, ?, 'debit', ?)`
  ).run(id, debit_account, amount_cents);

  db.prepare(
    `INSERT INTO ledger_entries (ledger_transaction_id, account, entry_type, amount_cents)
     VALUES (?, ?, 'credit', ?)`
  ).run(id, credit_account, amount_cents);
}

/**
 * Derive the debit/credit accounts for an endorsement based on the sign of
 * the prorated delta (positive delta = premium increase).
 */
export function endorsementAccounts(deltaCents: number): {
  debit_account: string;
  credit_account: string;
  ledger_amount_cents: number;
} {
  if (deltaCents >= 0) {
    return {
      debit_account: "premium_receivable",
      credit_account: "written_premium",
      ledger_amount_cents: deltaCents,
    };
  } else {
    return {
      debit_account: "written_premium",
      credit_account: "premium_receivable",
      ledger_amount_cents: -deltaCents,
    };
  }
}
