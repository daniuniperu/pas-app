import React, { useState } from "react";

interface Props {
  policyId: string;
  onSuccess: () => void;
}

interface FormState {
  idempotency_key: string;
  effective_date: string;
  new_annual_premium_cents: string;
  reason: string;
}

type Status = "idle" | "loading" | "success" | "error" | "conflict";

export default function EndorsementForm({ policyId, onSuccess }: Props) {
  const [form, setForm] = useState<FormState>({
    idempotency_key: "",
    effective_date: "",
    new_annual_premium_cents: "",
    reason: "",
  });
  const [status, setStatus] = useState<Status>("idle");
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  const set = (field: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("loading");
    setResult(null);
    setErrorMsg("");

    const premiumCents = parseInt(form.new_annual_premium_cents, 10);
    if (isNaN(premiumCents) || premiumCents < 0) {
      setErrorMsg("new_annual_premium_cents must be a non-negative integer");
      setStatus("error");
      return;
    }

    try {
      const res = await fetch(`/api/policies/${policyId}/endorsements`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idempotency_key: form.idempotency_key,
          effective_date: form.effective_date,
          new_annual_premium_cents: premiumCents,
          reason: form.reason || undefined,
        }),
      });

      const json = await res.json();

      if (res.status === 409) {
        setStatus("conflict");
        setErrorMsg(json.error ?? "Idempotency conflict");
        return;
      }
      if (!res.ok) {
        setStatus("error");
        setErrorMsg(json.error ?? `HTTP ${res.status}`);
        return;
      }

      setResult(json as Record<string, unknown>);
      setStatus("success");
      onSuccess();
    } catch (err: unknown) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "Network error");
    }
  };

  return (
    <div className="card">
      <div className="card-title"><span className="dot" />Apply Endorsement</div>
      <form onSubmit={handleSubmit}>
        <div className="form-grid">
          <div className="form-field">
            <label>Idempotency Key *</label>
            <input
              required
              placeholder="e.g. END-2001"
              value={form.idempotency_key}
              onChange={set("idempotency_key")}
            />
          </div>
          <div className="form-field">
            <label>Effective Date *</label>
            <input
              required
              type="date"
              value={form.effective_date}
              onChange={set("effective_date")}
            />
          </div>
          <div className="form-field">
            <label>New Annual Premium (cents) *</label>
            <input
              required
              type="number"
              min={0}
              placeholder="e.g. 144000"
              value={form.new_annual_premium_cents}
              onChange={set("new_annual_premium_cents")}
            />
          </div>
          <div className="form-field">
            <label>Reason</label>
            <input
              placeholder="e.g. Water-shutoff discount removed"
              value={form.reason}
              onChange={set("reason")}
            />
          </div>
        </div>

        <div style={{ marginTop: 16, display: "flex", gap: 8, alignItems: "center" }}>
          <button className="btn btn-primary" type="submit" disabled={status === "loading"}>
            {status === "loading" ? <><span className="spinner" /> Submitting…</> : "Submit Endorsement"}
          </button>
          {status === "success" && (
            <span className="pill valid" style={{ fontSize: 12 }}>✓ Success</span>
          )}
          {status === "conflict" && (
            <span className="pill error" style={{ fontSize: 12 }}>Conflict</span>
          )}
        </div>
      </form>

      {status === "success" && result && (
        <div className="alert success">
          <strong>Result</strong>
          <pre>{JSON.stringify(result, null, 2)}</pre>
        </div>
      )}
      {(status === "error" || status === "conflict") && (
        <div className="alert error">
          <strong>{status === "conflict" ? "Idempotency Conflict" : "Error"}</strong>: {errorMsg}
        </div>
      )}
    </div>
  );
}
