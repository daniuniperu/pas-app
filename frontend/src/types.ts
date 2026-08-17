// Shared API types for the frontend

export interface Policy {
  policy_id: string;
  homeowner_id: string;
  status: string;
  term_start: string;
  term_end: string;
  annual_premium_cents: number;
  currency: string;
  endorsement_ids: string[];
  billing_documents: BillingDocument[];
  payments: Payment[];
  open_balance_cents: number;
  ledger: LedgerSummary;
  suggested_action: string;
}

export interface BillingDocument {
  id: string;
  type: string;
  amount_cents: number;
  status: string;
  endorsement_id: string | null;
}

export interface Payment {
  id: number;
  external_payment_id: string;
  amount_cents: number;
  currency: string;
  received_at: string;
  status: string;
}

export interface LedgerSummary {
  balanced: boolean;
  transaction_count: number;
  transactions: LedgerTxSummary[];
}

export interface LedgerTxSummary {
  id: string;
  source_type: string;
  source_id: string;
  debits_cents: number;
  credits_cents: number;
  balanced: boolean;
}

export interface LedgerDetail {
  policy_id: string;
  balanced: boolean;
  total_debits_cents: number;
  total_credits_cents: number;
  transaction_count: number;
  transactions: LedgerTxDetail[];
}

export interface LedgerTxDetail {
  id: string;
  source_type: string;
  source_id: string;
  created_at: string;
  debits_cents: number;
  credits_cents: number;
  balanced: boolean;
  entries: LedgerEntry[];
}

export interface LedgerEntry {
  id: number;
  account: string;
  entry_type: string;
  amount_cents: number;
}

export interface HistoryVerification {
  policy_id: string;
  valid: boolean;
  event_count: number;
  failedAt?: number;
  reason?: string;
  events: HistoryEvent[];
}

export interface HistoryEvent {
  sequence_number: number;
  event_type: string;
  event_hash: string;
  previous_hash: string;
}
