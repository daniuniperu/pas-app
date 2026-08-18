import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb } from "../src/db/connection";
import type Database from "better-sqlite3";
import {
  canonicalPayload,
  computeEventHash,
  verifyChain,
  GENESIS_HASH,
  StoredEvent,
} from "../src/domain/hashChain";

describe("verifyChain", () => {
  it("accepts an empty event list as valid", () => {
    const result = verifyChain([]);
    expect(result.valid).toBe(true);
    expect(result.event_count).toBe(0);
  });

  it("validates a correctly chained sequence", () => {
    const p1 = canonicalPayload({ event_type: "endorsement.applied", seq: 1 });
    const h1 = computeEventHash(p1, GENESIS_HASH);

    const p2 = canonicalPayload({ event_type: "payment.received", seq: 2 });
    const h2 = computeEventHash(p2, h1);

    const events: StoredEvent[] = [
      { sequence_number: 1, event_type: "endorsement.applied", payload: p1, previous_hash: GENESIS_HASH, event_hash: h1 },
      { sequence_number: 2, event_type: "payment.received", payload: p2, previous_hash: h1, event_hash: h2 },
    ];

    const result = verifyChain(events);
    expect(result.valid).toBe(true);
    expect(result.event_count).toBe(2);
  });

  it("detects a tampered payload (hash mismatch)", () => {
    const p1 = canonicalPayload({ event_type: "endorsement.applied", seq: 1 });
    const h1 = computeEventHash(p1, GENESIS_HASH);

    // Tamper: store different payload but keep original hash
    const tamperedPayload = canonicalPayload({ event_type: "endorsement.applied", seq: 1, TAMPERED: true });

    const events: StoredEvent[] = [
      {
        sequence_number: 1,
        event_type: "endorsement.applied",
        payload: tamperedPayload,
        previous_hash: GENESIS_HASH,
        event_hash: h1, // hash doesn't match tampered payload
      },
    ];

    const result = verifyChain(events);
    expect(result.valid).toBe(false);
    expect(result.failedAt).toBe(1);
  });

  it("detects a broken previous_hash link", () => {
    const p1 = canonicalPayload({ seq: 1 });
    const h1 = computeEventHash(p1, GENESIS_HASH);

    const p2 = canonicalPayload({ seq: 2 });
    const wrongPrev = "a".repeat(64);
    const h2 = computeEventHash(p2, wrongPrev); // computed with wrong prev

    const events: StoredEvent[] = [
      { sequence_number: 1, event_type: "e", payload: p1, previous_hash: GENESIS_HASH, event_hash: h1 },
      { sequence_number: 2, event_type: "e", payload: p2, previous_hash: wrongPrev, event_hash: h2 },
    ];

    const result = verifyChain(events);
    expect(result.valid).toBe(false);
    expect(result.failedAt).toBe(2);
  });
});

describe("canonicalPayload determinism", () => {
  it("produces the same string regardless of key insertion order", () => {
    const a = canonicalPayload({ z: 1, a: 2, m: 3 });
    const b = canonicalPayload({ m: 3, z: 1, a: 2 });
    expect(a).toBe(b);
  });
});
