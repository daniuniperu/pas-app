import type { Policy, LedgerDetail, HistoryVerification } from "../types";
import { formatCents, fmtDate, shortHash } from "../utils";

interface Props {
  policy: Policy;
  ledger: LedgerDetail | null;
  history: HistoryVerification | null;
  onRefresh: () => void;
}

export default function PolicyView({ policy, ledger, history, onRefresh }: Props) {
  // history comes from both the inline policy.history and the separate /history/verify endpoint
  const historyValid = policy.history?.valid ?? history?.valid;
  const historyCount = policy.history?.event_count ?? history?.event_count ?? 0;

  return (
    <>
      {/* ── Policy Meta ────────────────────────────────────────────────── */}
      <div className="card">
        <div className="card-title"><span className="dot" />Policy State</div>
        <div className="meta-grid">
          <div className="meta-item">
            <label>Policy ID</label>
            <div className="val mono">{policy.policy_id}</div>
          </div>
          <div className="meta-item">
            <label>Homeowner</label>
            <div className="val mono">{policy.homeowner_id}</div>
          </div>
          <div className="meta-item">
            <label>Status</label>
            <div className="val">
              <span className={`pill ${policy.status}`}>{policy.status}</span>
            </div>
          </div>
          <div className="meta-item">
            <label>Annual Premium</label>
            <div className="val">{formatCents(policy.annual_premium_cents, policy.currency)}</div>
          </div>
          <div className="meta-item">
            <label>Currency</label>
            <div className="val">{policy.currency}</div>
          </div>
          <div className="meta-item">
            <label>Term</label>
            <div className="val" style={{ fontSize: 13 }}>
              {fmtDate(policy.term_start)} – {fmtDate(policy.term_end)}
            </div>
          </div>
          <div className="meta-item">
            <label>Ledger</label>
            <div className="val">
              <span className={`pill ${policy.ledger.balanced ? "balanced" : "error"}`}>
                {policy.ledger.balanced ? "Balanced" : "Unbalanced"}
              </span>
            </div>
          </div>
          <div className="meta-item">
            <label>History Chain</label>
            <div className="val">
              <span className={`pill ${historyValid ? "valid" : "invalid"}`}>
                {historyValid ? `Valid (${historyCount} events)` : "INVALID"}
              </span>
            </div>
          </div>
        </div>

        {/* Open balance */}
        <div className="balance-box" style={{ marginTop: 16 }}>
          <div className={`amount ${policy.open_balance_cents === 0 ? "zero" : "owed"}`}>
            {formatCents(policy.open_balance_cents, policy.currency)}
          </div>
          <div className="label">Open Balance</div>
        </div>

        <div className="alert info" style={{ marginTop: 12 }}>
          <strong>Suggested Action:</strong> {policy.suggested_action}
        </div>
      </div>

      {/* ── Endorsements ───────────────────────────────────────────────── */}
      {policy.endorsements.length > 0 && (
        <div className="card">
          <div className="card-title"><span className="dot" />Endorsements</div>
          <table className="tbl">
            <thead>
              <tr>
                <th>Endorsement ID</th>
                <th>Billing Doc</th>
                <th>Amount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {policy.endorsements.map((e) => (
                <tr key={e.id}>
                  <td className="mono">{e.id}</td>
                  <td className="mono">{e.billing_document?.id ?? "—"}</td>
                  <td className="mono">
                    {e.billing_document
                      ? formatCents(e.billing_document.amount_cents, policy.currency)
                      : "—"}
                  </td>
                  <td>
                    {e.billing_document ? (
                      <span className={`pill ${e.billing_document.status}`} style={{ fontSize: 11 }}>
                        {e.billing_document.status}
                      </span>
                    ) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Timeline ───────────────────────────────────────────────────── */}
      <div className="card">
        <div className="card-title"><span className="dot" />Activity Timeline</div>
        <ul className="timeline">
          {policy.endorsements.map((e) => (
            <li key={`end-${e.id}`}>
              <div className="tl-line"><div className="tl-dot" style={{ background: "#f59e0b" }} /><div className="tl-bar" /></div>
              <div className="tl-body">
                <div className="tl-label">Endorsement Applied · {e.id}</div>
                <div className="tl-detail">
                  {e.billing_document
                    ? `${e.billing_document.type.replace(/_/g, " ")} · ${formatCents(e.billing_document.amount_cents, policy.currency)} · `
                    : ""}
                  {e.billing_document && (
                    <span className={`pill ${e.billing_document.status}`} style={{ fontSize: 11 }}>
                      {e.billing_document.status}
                    </span>
                  )}
                </div>
              </div>
            </li>
          ))}
          {policy.payments.map((p) => (
            <li key={`pay-${p.id}`}>
              <div className="tl-line"><div className="tl-dot" style={{ background: "#22c55e" }} /><div className="tl-bar" /></div>
              <div className="tl-body">
                <div className="tl-label">Payment Received · {p.external_payment_id}</div>
                <div className="tl-detail">
                  {formatCents(p.amount_cents, p.currency)} · {p.currency} ·{" "}
                  <span className="pill paid" style={{ fontSize: 11 }}>{p.status}</span>
                  <span style={{ color: "#475569" }}> · {new Date(p.received_at).toLocaleString()}</span>
                </div>
              </div>
            </li>
          ))}
          {policy.ledger.transactions.map((tx) => (
            <li key={`ltx-${tx.id}`}>
              <div className="tl-line"><div className="tl-dot" style={{ background: "#3b82f6" }} /><div className="tl-bar" /></div>
              <div className="tl-body">
                <div className="tl-label">Ledger Tx · {tx.id}</div>
                <div className="tl-detail">
                  {tx.source_type} / {tx.source_id} · DR {formatCents(tx.debits_cents, policy.currency)} CR {formatCents(tx.credits_cents, policy.currency)} ·{" "}
                  <span className={`pill ${tx.balanced ? "balanced" : "error"}`} style={{ fontSize: 11 }}>
                    {tx.balanced ? "balanced" : "UNBALANCED"}
                  </span>
                </div>
              </div>
            </li>
          ))}
          {policy.rejected_events.map((r) => (
            <li key={`rej-${r.id}`}>
              <div className="tl-line"><div className="tl-dot" style={{ background: "#ef4444" }} /><div className="tl-bar" /></div>
              <div className="tl-body">
                <div className="tl-label">
                  <span className="pill error" style={{ fontSize: 11 }}>Rejected</span>{" "}
                  Payment · {r.id}
                </div>
                <div className="tl-detail">{r.reason}</div>
              </div>
            </li>
          ))}
          {policy.endorsements.length === 0 && policy.payments.length === 0 && policy.rejected_events.length === 0 && (
            <li>
              <div className="tl-line"><div className="tl-dot" style={{ background: "#1e2433" }} /></div>
              <div className="tl-body"><div className="tl-detail">No activity yet</div></div>
            </li>
          )}
        </ul>
      </div>

      {/* ── Rejected Events ────────────────────────────────────────────── */}
      {policy.rejected_events.length > 0 && (
        <div className="card">
          <div className="card-title"><span className="dot" style={{ background: "#ef4444" }} />Rejected Events</div>
          <table className="tbl">
            <thead>
              <tr>
                <th>Idempotency Key</th>
                <th>External ID</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {policy.rejected_events.map((r) => (
                <tr key={r.id}>
                  <td className="mono">{r.id}</td>
                  <td className="mono">{r.external_payment_id ?? "—"}</td>
                  <td style={{ color: "#f87171" }}>{r.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Ledger Detail ──────────────────────────────────────────────── */}
      {ledger && (
        <div className="card">
          <div className="card-title"><span className="dot" />Ledger Entries</div>
          <div style={{ marginBottom: 12 }}>
            <span className={`pill ${ledger.balanced ? "balanced" : "error"}`}>
              {ledger.balanced ? "All transactions balanced" : "UNBALANCED — investigate"}
            </span>
            <span style={{ color: "#475569", fontSize: 12, marginLeft: 10 }}>
              Total DR: {formatCents(ledger.total_debits_cents, policy.currency)} · Total CR: {formatCents(ledger.total_credits_cents, policy.currency)}
            </span>
          </div>
          {ledger.transactions.map((tx) => (
            <div key={tx.id} style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, color: "#60a5fa", marginBottom: 6, fontWeight: 600 }}>
                {tx.id} · {tx.source_type} · {tx.source_id}
              </div>
              <table className="tbl">
                <thead>
                  <tr><th>Account</th><th>Type</th><th>Amount</th></tr>
                </thead>
                <tbody>
                  {tx.entries.map((e) => (
                    <tr key={e.id}>
                      <td>{e.account.replace(/_/g, " ")}</td>
                      <td><span className={`pill ${e.entry_type === "debit" ? "pending" : "paid"}`} style={{ fontSize: 11 }}>{e.entry_type}</span></td>
                      <td className="mono">{formatCents(e.amount_cents, policy.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}

      {/* ── History Verification ───────────────────────────────────────── */}
      {history && (
        <div className="card">
          <div className="card-title"><span className="dot" />Event Hash Chain</div>
          <div style={{ marginBottom: 12 }}>
            <span className={`pill ${history.valid ? "valid" : "invalid"}`}>
              {history.valid
                ? `Chain valid · ${history.event_count} events`
                : `Chain INVALID at seq ${history.failedAt}: ${history.reason}`}
            </span>
          </div>
          <table className="tbl">
            <thead>
              <tr><th>#</th><th>Event Type</th><th>Prev Hash</th><th>Event Hash</th></tr>
            </thead>
            <tbody>
              {history.events.map((e) => (
                <tr key={e.sequence_number}>
                  <td>{e.sequence_number}</td>
                  <td>{e.event_type}</td>
                  <td className="mono">{shortHash(e.previous_hash)}</td>
                  <td className="mono">{shortHash(e.event_hash)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ textAlign: "right" }}>
        <button className="btn btn-secondary" onClick={onRefresh}>↻ Refresh</button>
      </div>
    </>
  );
}
