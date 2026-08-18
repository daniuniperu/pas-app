-- Migration 003: Add UNIQUE constraint on payments.external_payment_id
--
-- Rationale: idempotency_key protects against retries from the same caller.
-- external_payment_id protects against two different callers sending the same
-- upstream payment with different idempotency keys — which would silently
-- double-count the same money. Both constraints together make the payments
-- table safe against all known duplicate-ingestion vectors.

CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_external_payment_id
  ON payments (external_payment_id);
