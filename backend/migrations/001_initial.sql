-- Migration 001: Initial schema for Policy Administration System
-- All money stored as integer cents. No floats in financial columns.

CREATE TABLE IF NOT EXISTS policies (
  id                   TEXT    PRIMARY KEY,
  homeowner_id         TEXT    NOT NULL,
  status               TEXT    NOT NULL CHECK (status IN ('active','cancelled','expired')),
  term_start           TEXT    NOT NULL,  -- ISO date YYYY-MM-DD
  term_end             TEXT    NOT NULL,
  annual_premium_cents INTEGER NOT NULL CHECK (annual_premium_cents >= 0),
  currency             TEXT    NOT NULL DEFAULT 'USD',
  created_at           TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Append-only, hash-chained event log for every policy event.
-- event_hash = SHA-256(canonical_json_payload || "|" || previous_hash)
CREATE TABLE IF NOT EXISTS policy_events (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  policy_id         TEXT    NOT NULL REFERENCES policies(id),
  sequence_number   INTEGER NOT NULL,
  event_type        TEXT    NOT NULL,
  idempotency_key   TEXT    UNIQUE,                  -- NULL for internal events
  payload           TEXT    NOT NULL,                -- canonical JSON string
  previous_hash     TEXT    NOT NULL DEFAULT '0000000000000000000000000000000000000000000000000000000000000000',
  event_hash        TEXT    NOT NULL,
  created_at        TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE (policy_id, sequence_number)
);

-- Billing documents produced by endorsements (and future billing cycles).
CREATE TABLE IF NOT EXISTS billing_documents (
  id                    TEXT    PRIMARY KEY,
  policy_id             TEXT    NOT NULL REFERENCES policies(id),
  type                  TEXT    NOT NULL CHECK (type IN ('endorsement_adjustment','new_business','renewal')),
  amount_cents          INTEGER NOT NULL,            -- positive = amount owed
  status                TEXT    NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','void')),
  endorsement_idem_key  TEXT,                        -- links back to endorsement idempotency_key
  created_at            TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Received payment records (data-ingestion only; no payment-provider integration).
CREATE TABLE IF NOT EXISTS payments (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  policy_id            TEXT    NOT NULL REFERENCES policies(id),
  idempotency_key      TEXT    NOT NULL UNIQUE,
  external_payment_id  TEXT    NOT NULL,
  amount_cents         INTEGER NOT NULL CHECK (amount_cents > 0),
  currency             TEXT    NOT NULL,
  received_at          TEXT    NOT NULL,
  status               TEXT    NOT NULL DEFAULT 'applied',
  created_at           TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Groups debit+credit entries that must balance (sum debits == sum credits).
CREATE TABLE IF NOT EXISTS ledger_transactions (
  id          TEXT    PRIMARY KEY,
  policy_id   TEXT    NOT NULL REFERENCES policies(id),
  source_type TEXT    NOT NULL CHECK (source_type IN ('endorsement','payment')),
  source_id   TEXT    NOT NULL,  -- idempotency_key of the source event
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Individual debit or credit lines inside a ledger_transaction.
-- Accounts: premium_receivable, written_premium, cash
CREATE TABLE IF NOT EXISTS ledger_entries (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  ledger_transaction_id TEXT  NOT NULL REFERENCES ledger_transactions(id),
  account             TEXT    NOT NULL CHECK (account IN ('premium_receivable','written_premium','cash')),
  entry_type          TEXT    NOT NULL CHECK (entry_type IN ('debit','credit')),
  amount_cents        INTEGER NOT NULL CHECK (amount_cents > 0),
  created_at          TEXT    NOT NULL DEFAULT (datetime('now'))
);
