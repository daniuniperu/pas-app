/**
 * TypeScript interfaces that mirror the SQLite row shapes returned by
 * better-sqlite3. Using these instead of `as any` gives full type safety
 * inside every route without an ORM.
 */

export interface PolicyRow {
  id: string;
  homeowner_id: string;
  status: string;
  term_start: string;
  term_end: string;
  annual_premium_cents: number;
  currency: string;
  created_at: string;
}

export interface PolicyEventRow {
  id: number;
  policy_id: string;
  sequence_number: number;
  event_type: string;
  idempotency_key: string | null;
  payload: string;
  previous_hash: string;
  event_hash: string;
  created_at: string;
}

export interface BillingDocumentRow {
  id: string;
  policy_id: string;
  type: string;
  amount_cents: number;
  status: string;
  endorsement_idem_key: string | null;
  created_at: string;
}

export interface PaymentRow {
  id: number;
  policy_id: string;
  idempotency_key: string;
  external_payment_id: string;
  amount_cents: number;
  currency: string;
  received_at: string;
  status: string;
  created_at: string;
}

export interface LedgerTransactionRow {
  id: string;
  policy_id: string;
  source_type: string;
  source_id: string;
  created_at: string;
}

export interface LedgerEntryRow {
  id: number;
  ledger_transaction_id: string;
  account: string;
  entry_type: "debit" | "credit";
  amount_cents: number;
  created_at: string;
}

export interface LedgerEntryAggRow {
  entry_type: "debit" | "credit";
  total: number;
}

export interface RejectedEventRow {
  id: number;
  policy_id: string;
  idempotency_key: string;
  external_payment_id: string | null;
  reason: string;
  payload: string;
  created_at: string;
}

export interface LastInsertRow {
  id: number;
}

export interface SumRow {
  total: number;
}
