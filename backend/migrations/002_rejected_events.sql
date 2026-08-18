-- Migration 002: Add rejected_events table
-- Stores payment attempts that failed validation (e.g. wrong currency)
-- so they can be surfaced in the policy state response.

CREATE TABLE IF NOT EXISTS rejected_events (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  policy_id           TEXT    NOT NULL REFERENCES policies(id),
  idempotency_key     TEXT    NOT NULL,
  external_payment_id TEXT,
  reason              TEXT    NOT NULL,
  payload             TEXT    NOT NULL,  -- original request JSON for auditability
  created_at          TEXT    NOT NULL DEFAULT (datetime('now'))
);
