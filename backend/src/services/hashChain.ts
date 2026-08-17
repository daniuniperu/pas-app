import crypto from "crypto";

/**
 * Hash-chain service for append-only policy event history.
 *
 * Each event's hash covers its canonical payload plus the previous event's
 * hash, forming a chain that makes tampering detectable.
 *
 * event_hash = SHA-256(canonical_payload + "|" + previous_hash)
 *
 * The sentinel previous_hash for the very first event is 64 zeros.
 */

export const GENESIS_HASH =
  "0000000000000000000000000000000000000000000000000000000000000000";

/**
 * Build the canonical JSON string for a policy event.
 * Keys are sorted to ensure determinism across runtimes.
 */
export function canonicalPayload(payload: Record<string, unknown>): string {
  return JSON.stringify(payload, Object.keys(payload).sort());
}

/** Compute SHA-256 and return lowercase hex. */
function sha256(input: string): string {
  return crypto.createHash("sha256").update(input, "utf8").digest("hex");
}

/** Compute the event_hash for a new event. */
export function computeEventHash(
  canonicalJson: string,
  previousHash: string
): string {
  return sha256(canonicalJson + "|" + previousHash);
}

export interface StoredEvent {
  sequence_number: number;
  event_type: string;
  payload: string;       // canonical JSON string
  previous_hash: string;
  event_hash: string;
}

/**
 * Verify the full hash chain for a list of events (ordered by sequence_number
 * ascending). Returns { valid: boolean; failedAt?: number }.
 */
export function verifyChain(events: StoredEvent[]): {
  valid: boolean;
  event_count: number;
  failedAt?: number;
  reason?: string;
} {
  if (events.length === 0) {
    return { valid: true, event_count: 0 };
  }

  let expectedPrevHash = GENESIS_HASH;

  for (const ev of events) {
    // 1. The previous_hash stored on this event must equal what we tracked.
    if (ev.previous_hash !== expectedPrevHash) {
      return {
        valid: false,
        event_count: events.length,
        failedAt: ev.sequence_number,
        reason: `previous_hash mismatch at sequence ${ev.sequence_number}`,
      };
    }

    // 2. Recompute the event_hash and compare.
    const recomputed = computeEventHash(ev.payload, ev.previous_hash);
    if (recomputed !== ev.event_hash) {
      return {
        valid: false,
        event_count: events.length,
        failedAt: ev.sequence_number,
        reason: `event_hash mismatch at sequence ${ev.sequence_number}`,
      };
    }

    expectedPrevHash = ev.event_hash;
  }

  return { valid: true, event_count: events.length };
}
