# PAS — Policy Administration System

A focused take-home implementation of a homeowners-insurance Policy Administration System slice.

## What's built

| Layer | Choice | Why |
|---|---|---|
| Backend runtime | Node.js + TypeScript + Express | Straightforward, low boilerplate |
| Database | SQLite via `better-sqlite3` | Zero-setup, synchronous API, great for local dev |
| Frontend | React + Vite + TypeScript | Minimal modern setup, proxies to API |
| Tests | Vitest | Fast, TypeScript-native, no extra config |

---

## How to run

### 1 — Install

```bash
# From the project root
npm run install:all
```

### 2 — Seed the sample policy

```bash
npm run seed
```

This inserts `POL-1001` into the local SQLite database at `backend/data/pas.db`.

### 3 — Start the API server (port 3001)

```bash
npm run backend
```

### 4 — Start the frontend (port 5173)

In a second terminal:

```bash
npm run frontend
```

Open **http://localhost:5173** in your browser. The Vite dev server proxies `/api/*` to `http://localhost:3001`.

### 5 — Run tests

```bash
npm test
# 29 tests across 4 suites — all should pass
```

---

## Trying the API with curl

### Apply an endorsement (increases premium)

```bash
curl -s -X POST http://localhost:3001/api/policies/POL-1001/endorsements \
  -H 'Content-Type: application/json' \
  -d '{
    "idempotency_key": "END-2001",
    "effective_date": "2026-07-01",
    "new_annual_premium_cents": 144000,
    "reason": "Water-shutoff discount removed"
  }' | jq
```

**Expected delta:** 12 099 cents
`round_half_away_from_0((144000 − 120000) × 184 / 365) = round(12098.63…) = 12099`

### Send the payment twice (idempotency demo)

```bash
# First delivery — creates the record
curl -s -X POST http://localhost:3001/api/policies/POL-1001/payments \
  -H 'Content-Type: application/json' \
  -d '{"idempotency_key":"PAY-9001","external_payment_id":"PAY-9001","amount_cents":12099,"currency":"USD","received_at":"2026-07-03T18:30:00Z"}' | jq

# Second delivery — idempotency_result: "duplicate_ignored"
curl -s -X POST http://localhost:3001/api/policies/POL-1001/payments \
  -H 'Content-Type: application/json' \
  -d '{"idempotency_key":"PAY-9001","external_payment_id":"PAY-9001","amount_cents":12099,"currency":"USD","received_at":"2026-07-03T18:30:00Z"}' | jq
```

### Wrong-currency payment (atomic reject)

```bash
curl -s -X POST http://localhost:3001/api/policies/POL-1001/payments \
  -H 'Content-Type: application/json' \
  -d '{"idempotency_key":"PAY-9002","external_payment_id":"PAY-9002","amount_cents":5000,"currency":"EUR","received_at":"2026-07-04T10:00:00Z"}' | jq
# → 422 Currency mismatch
```

### Policy state

```bash
curl -s http://localhost:3001/api/policies/POL-1001 | jq
```

### Ledger

```bash
curl -s http://localhost:3001/api/policies/POL-1001/ledger | jq
```

### History verification

```bash
curl -s http://localhost:3001/api/policies/POL-1001/history/verify | jq
```

---

## SQL Schema

Six tables live in `backend/migrations/001_initial.sql`:

| Table | Purpose |
|---|---|
| `policies` | Master policy record; `annual_premium_cents` updated on endorsement |
| `policy_events` | Append-only, hash-chained log of every endorsement and payment event |
| `billing_documents` | One document per endorsement; status transitions `pending → paid` |
| `payments` | Received-payment records (data ingestion only) |
| `ledger_transactions` | Groups a balanced set of debit+credit entries |
| `ledger_entries` | Individual DR/CR lines; always two per transaction |

All money columns are `INTEGER NOT NULL` (no `REAL`/`FLOAT`).

---

## Business rules

### Proration formula

```
term_days      = term_end − term_start
remaining_days = term_end − effective_date
delta_cents    = round_half_away_from_zero(
                   (new_premium − old_premium) × remaining_days / term_days
                 )
```

`round_half_away_from_zero(x) = sign(x) × round(|x|)`

### Double-entry accounting

| Event | Debit | Credit |
|---|---|---|
| Endorsement (positive delta) | `premium_receivable` | `written_premium` |
| Endorsement (negative delta) | `written_premium` | `premium_receivable` |
| Payment received | `cash` | `premium_receivable` |

Every write is wrapped in a single SQLite transaction — no partial writes possible.

### Idempotency

- **Same key + same payload** → return the stored result; no new rows.
- **Same key + different payload** → `409 Conflict`.
- Canonical payload = `JSON.stringify(payload, sortedKeys)` — deterministic across runtimes.

### Policy event hash chain

```
event_hash = SHA-256(canonical_payload + "|" + previous_hash)
```

First event's `previous_hash` is 64 zeros (genesis sentinel).
`GET /api/policies/:id/history/verify` replays the chain and flags any mismatch.

---

## Tests (29 total)

| Suite | What it covers |
|---|---|
| `proration.test.ts` | `roundHalfAwayFromZero`, `daysBetween`, 7 proration scenarios including the spec example |
| `history.test.ts` | Hash-chain verification — valid chain, tampered payload, broken link, canonical determinism |
| `ledger.test.ts` | Balanced debit/credit invariant for endorsements and payments, account selection, zero-amount guard |
| `payments.test.ts` | Duplicate endorsement/payment detection, wrong-currency atomic rejection, case-insensitive currency |

---

## How AI was used

- **Cursor / Claude Sonnet** was used for initial scaffolding of boilerplate (package.json, tsconfig, Express routing setup) and for generating the CSS design system.
- All business logic (proration formula, hash-chain algorithm, double-entry account selection, idempotency comparison logic) was written and verified manually.
- Every generated file was read line-by-line and type-checked. The test cases were designed independently to verify the spec examples and edge cases.
- The SQL schema, transaction boundaries, and rounding function were written from scratch without AI generation.

---

## What I would improve with more time

1. **Partial-payment tracking** — currently a payment "covers" a billing document if `amount >= doc.amount`; a proper implementation would track remaining balance per document.
2. **Cancellation / return-premium endorsements** — the negative delta path is implemented in accounting but not tested end-to-end.
3. **Pagination** on `/ledger` and `/history/verify` for policies with many events.
4. **Database connection pooling** — `better-sqlite3` is synchronous and single-connection; for production, PostgreSQL + `pg` with a pool would be appropriate.
5. **Auth middleware** — a simple API-key header check to scope requests to an operator.
6. **Structured logging** (Pino) and a `request_id` header for distributed tracing.

## On-call monitoring and recovery

- **Health check:** `GET /health` returns 200; wire into uptime monitoring (e.g. Datadog Synthetics).
- **DB integrity:** Schedule a nightly `PRAGMA integrity_check` and alert on failure.
- **Ledger balance alert:** A cron query `SELECT COUNT(*) FROM ledger_transactions t WHERE (SELECT SUM(CASE WHEN entry_type='debit' THEN amount_cents ELSE -amount_cents END) FROM ledger_entries WHERE ledger_transaction_id = t.id) != 0` should always return 0.
- **Hash chain alert:** Run `GET /api/policies/:id/history/verify` for all active policies daily; page on `valid: false`.
- **Recovery:** Because all writes are inside transactions and the DB is append-only, recovery is a matter of identifying the failed idempotency key and replaying the request — no manual data repair needed.
