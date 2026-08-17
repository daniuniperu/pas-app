import React, { useState } from "react";

interface Props {
  policyId: string;
  onSuccess: () => void;
}

interface FormState {
  idempotency_key: string;
  external_payment_id: string;
  amount_cents: string;
  currency: string;
  received_at: string;
}

type Status = "idle" | "loading" | "success" | "error" | "conflict";

export default function PaymentForm({ policyId, onSuccess }: Props) {
  const [form, setForm] = useState<FormState>({
    idempotency_key: "",
    external_payment_id: "",
    amount_cents: "",
    currency: "USD",
    received_at: new Date().toISOString().slice(0, 16),
  });
  const [status, setStatus] = useState<Status>("idle");
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  const set = (field: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("loading");
    setResult(null);
    setErrorMsg("");

    const amountCents = parseInt(form.amount_cents, 10);
    if (isNaN(amountCents) || amountCents <= 0) {
      setErrorMsg("amount_cents must be a positive integer");
      setStatus("error");
      return;
    }

    const receivedIso = new Date(form.received_at).toISOString();

    try {
      const res = await fetch(`/api/policies/${policyId}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idempotency_key: form.idempotency_key,
          external_payment_id: form.external_payment_id,
          amount_cents: amountCents,
          currency: form.currency,
          received_at: receivedIso,
        }),
      });

      const json = await res.json();

      if (res.status === 409) {
        setStatus("conflict");
        setErrorMsg(json.error ?? "Idempotency conflict");
        return;
      }
      if (res.status === 422) {
        setStatus("error");
        setErrorMsg(`${json.error}${json.detail ? " — " + json.detail : ""}`);
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
      <div className="card-title"><span className="dot" />Record Received Payment</div>
      <div className="alert info" style={{ marginBottom: 16 }}>
        This records already-processed payment data. No real money movement occurs here.
      </div>
      <form onSubmit={handleSubmit}>
        <div className="form-grid">
          <div className="form-field">
            <label>Idempotency Key *</label>
            <input
              required
              placeholder="e.g. PAY-9001"
              value={form.idempotency_key}
              onChange={set("idempotency_key")}
            />
          </div>
          <div className="form-field">
            <label>External Payment ID *</label>
            <input
              required
              placeholder="e.g. PAY-9001"
              value={form.external_payment_id}
              onChange={set("external_payment_id")}
            />
          </div>
          <div className="form-field">
            <label>Amount (cents) *</label>
            <input
              required
              type="number"
              min={1}
              placeholder="e.g. 12099"
              value={form.amount_cents}
              onChange={set("amount_cents")}
            />
          </div>
          <div className="form-field">
            <label>Currency *</label>
            <input
              required
              placeholder="USD"
              value={form.currency}
              onChange={set("currency")}
              maxLength={3}
              style={{ textTransform: "uppercase" }}
            />
          </div>
          <div className="form-field" style={{ gridColumn: "1 / -1" }}>
            <label>Received At *</label>
            <input
              required
              type="datetime-local"
              value={form.received_at}
              onChange={set("received_at")}
            />
          </div>
        </div>

        <div style={{ marginTop: 16, display: "flex", gap: 8, alignItems: "center" }}>
          <button className="btn btn-primary" type="submit" disabled={status === "loading"}>
            {status === "loading" ? <><span className="spinner" /> Submitting…</> : "Record Payment"}
          </button>
          {status === "success" && (
            <span className="pill valid" style={{ fontSize: 12 }}>✓ Applied</span>
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
