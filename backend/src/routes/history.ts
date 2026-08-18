import { Router, Request, Response } from "express";
import { getDb } from "../db/connection";
import { PolicyRow } from "../db/row-types";
import { verifyChain, StoredEvent } from "../domain/hashChain";

const router = Router({ mergeParams: true });

/**
 * GET /api/policies/:policyId/history/verify
 *
 * Reads all policy events ordered by sequence_number and replays the
 * hash chain to verify no event has been tampered with or reordered.
 */
router.get("/", (req: Request, res: Response) => {
  const { policyId } = req.params;
  const db = getDb();

  const policy = db
    .prepare("SELECT id FROM policies WHERE id = ?")
    .get(policyId) as Pick<PolicyRow, "id"> | undefined;

  if (!policy) {
    return res.status(404).json({ error: `Policy ${policyId} not found` });
  }

  const events = db
    .prepare(
      `SELECT sequence_number, event_type, payload, previous_hash, event_hash, created_at
       FROM policy_events
       WHERE policy_id = ?
       ORDER BY sequence_number ASC`
    )
    .all(policyId) as StoredEvent[];

  const result = verifyChain(events);

  return res.status(200).json({
    policy_id: policyId,
    ...result,
    events: events.map((e) => ({
      sequence_number: e.sequence_number,
      event_type: e.event_type,
      event_hash: e.event_hash,
      previous_hash: e.previous_hash,
    })),
  });
});

export default router;
