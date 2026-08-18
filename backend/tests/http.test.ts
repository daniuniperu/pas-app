/**
 * HTTP-layer integration tests using Supertest.
 *
 * vi.mock is hoisted above all imports by Vitest, so `getDb` is replaced
 * before any route module loads. Each test gets a fresh in-memory DB via
 * `beforeEach`, and route handlers always call `getDb()` lazily (inside the
 * handler body), so they pick up the per-test instance at request time.
 */
import { vi, describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import type Database from "better-sqlite3";
import { createTestDb } from "../src/db/connection";

// Mutable reference captured by the mock factory below.
let testDb: Database.Database;

vi.mock("../src/db/connection", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../src/db/connection")>();
  return {
    ...mod,
    getDb: () => testDb,
  };
});

// Import app AFTER the mock is registered (Vitest hoists vi.mock, so by the
// time this import is evaluated the factory above is already in place).
import app from "../src/app";

function seedPolicy(db: Database.Database) {
  db.prepare(
    `INSERT INTO policies (id, homeowner_id, status, term_start, term_end, annual_premium_cents, currency)
     VALUES ('POL-HTTP', 'HOME-001', 'active', '2026-01-01', '2027-01-01', 120000, 'USD')`
  ).run();
}

// ──────────────────────────────────────────────────────────────────────────────
// Endorsement HTTP scenarios
// ──────────────────────────────────────────────────────────────────────────────
describe("POST /api/policies/:policyId/endorsements", () => {
  beforeEach(() => {
    testDb = createTestDb();
    seedPolicy(testDb);
  });

  it("new endorsement → 201 created", async () => {
    const res = await request(app)
      .post("/api/policies/POL-HTTP/endorsements")
      .send({
        idempotency_key: "END-001",
        effective_date: "2026-07-01",
        new_annual_premium_cents: 144000,
      });

    expect(res.status).toBe(201);
    expect(res.body.idempotency_result).toBe("created");
    expect(res.body.billing_document).toBeTruthy();
  });

  it("same key + same payload → 200 duplicate_ignored", async () => {
    const payload = {
      idempotency_key: "END-DUP",
      effective_date: "2026-07-01",
      new_annual_premium_cents: 144000,
    };

    await request(app).post("/api/policies/POL-HTTP/endorsements").send(payload);
    const res = await request(app)
      .post("/api/policies/POL-HTTP/endorsements")
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.body.idempotency_result).toBe("duplicate_ignored");
  });

  it("same key + different payload → 409 conflict", async () => {
    await request(app)
      .post("/api/policies/POL-HTTP/endorsements")
      .send({
        idempotency_key: "END-CONFLICT",
        effective_date: "2026-07-01",
        new_annual_premium_cents: 144000,
      });

    const res = await request(app)
      .post("/api/policies/POL-HTTP/endorsements")
      .send({
        idempotency_key: "END-CONFLICT",
        effective_date: "2026-07-01",
        new_annual_premium_cents: 999999, // different premium
      });

    expect(res.status).toBe(409);
    expect(res.body.idempotency_key).toBe("END-CONFLICT");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Payment HTTP scenarios
// ──────────────────────────────────────────────────────────────────────────────
describe("POST /api/policies/:policyId/payments", () => {
  beforeEach(() => {
    testDb = createTestDb();
    seedPolicy(testDb);
  });

  it("wrong currency → 422 unprocessable", async () => {
    const res = await request(app)
      .post("/api/policies/POL-HTTP/payments")
      .send({
        idempotency_key: "PAY-EUR",
        external_payment_id: "EXT-EUR-001",
        amount_cents: 12099,
        currency: "EUR",
        received_at: "2026-07-03T18:30:00Z",
      });

    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/currency/i);
  });

  it("same external_payment_id + different idempotency_key → 409 duplicate external", async () => {
    const base = {
      external_payment_id: "EXT-SHARED",
      amount_cents: 12099,
      currency: "USD",
      received_at: "2026-07-03T18:30:00Z",
    };

    await request(app)
      .post("/api/policies/POL-HTTP/payments")
      .send({ ...base, idempotency_key: "PAY-KEY-A" });

    const res = await request(app)
      .post("/api/policies/POL-HTTP/payments")
      .send({ ...base, idempotency_key: "PAY-KEY-B" }); // different key, same EXT id

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/duplicate external payment/i);
  });
});
