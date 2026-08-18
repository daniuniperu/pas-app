import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb } from "../src/db/connection";
import type Database from "better-sqlite3";
import { insertLedgerTransaction, endorsementAccounts } from "../src/domain/accounting";
import crypto from "crypto";

function seedPolicy(db: Database.Database) {
  db.prepare(
    `INSERT INTO policies (id, homeowner_id, status, term_start, term_end, annual_premium_cents, currency)
     VALUES ('POL-TEST', 'HOME-001', 'active', '2026-01-01', '2027-01-01', 120000, 'USD')`
  ).run();
}

describe("ledger balance invariant", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
    seedPolicy(db);
  });

  it("endorsement transaction is balanced (debits == credits)", () => {
    const txId = `LTX-${crypto.randomBytes(4).toString("hex")}`;
    const { debit_account, credit_account, ledger_amount_cents } =
      endorsementAccounts(12099);

    insertLedgerTransaction(db, {
      id: txId,
      policy_id: "POL-TEST",
      source_type: "endorsement",
      source_id: "END-001",
      debit_account,
      credit_account,
      amount_cents: ledger_amount_cents,
    });

    const entries = db
      .prepare("SELECT entry_type, SUM(amount_cents) as total FROM ledger_entries WHERE ledger_transaction_id = ? GROUP BY entry_type")
      .all(txId) as any[];

    const debits = entries.find((e) => e.entry_type === "debit")?.total ?? 0;
    const credits = entries.find((e) => e.entry_type === "credit")?.total ?? 0;
    expect(debits).toBe(credits);
    expect(debits).toBe(12099);
  });

  it("payment transaction is balanced", () => {
    const txId = `LTX-${crypto.randomBytes(4).toString("hex")}`;

    insertLedgerTransaction(db, {
      id: txId,
      policy_id: "POL-TEST",
      source_type: "payment",
      source_id: "PAY-001",
      debit_account: "cash",
      credit_account: "premium_receivable",
      amount_cents: 12099,
    });

    const entries = db
      .prepare("SELECT entry_type, SUM(amount_cents) as total FROM ledger_entries WHERE ledger_transaction_id = ? GROUP BY entry_type")
      .all(txId) as any[];

    const debits = entries.find((e) => e.entry_type === "debit")?.total ?? 0;
    const credits = entries.find((e) => e.entry_type === "credit")?.total ?? 0;
    expect(debits).toBe(credits);
  });

  it("endorsementAccounts uses correct accounts for positive delta", () => {
    const { debit_account, credit_account } = endorsementAccounts(5000);
    expect(debit_account).toBe("premium_receivable");
    expect(credit_account).toBe("written_premium");
  });

  it("endorsementAccounts uses correct accounts for negative delta (return premium)", () => {
    const { debit_account, credit_account, ledger_amount_cents } = endorsementAccounts(-5000);
    expect(debit_account).toBe("written_premium");
    expect(credit_account).toBe("premium_receivable");
    expect(ledger_amount_cents).toBe(5000); // amount is positive
  });

  it("throws if amount_cents is zero or negative", () => {
    expect(() =>
      insertLedgerTransaction(db, {
        id: "LTX-ERR",
        policy_id: "POL-TEST",
        source_type: "payment",
        source_id: "PAY-ERR",
        debit_account: "cash",
        credit_account: "premium_receivable",
        amount_cents: 0,
      })
    ).toThrow();
  });
});
