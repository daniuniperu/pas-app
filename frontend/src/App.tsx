import React, { useState, useEffect, useCallback } from "react";
import type { Policy, LedgerDetail, HistoryVerification } from "./types";
import PolicyView from "./components/PolicyView";
import EndorsementForm from "./components/EndorsementForm";
import PaymentForm from "./components/PaymentForm";

type Tab = "overview" | "endorse" | "payment";

export default function App() {
  const [policyId, setPolicyId] = useState("POL-1001");
  const [inputId, setInputId] = useState("POL-1001");
  const [activeTab, setActiveTab] = useState<Tab>("overview");

  const [policy, setPolicy] = useState<Policy | null>(null);
  const [ledger, setLedger] = useState<LedgerDetail | null>(null);
  const [history, setHistory] = useState<HistoryVerification | null>(null);

  const [loadingPolicy, setLoadingPolicy] = useState(false);
  const [policyError, setPolicyError] = useState("");

  const fetchAll = useCallback(async (id: string) => {
    if (!id.trim()) return;
    setLoadingPolicy(true);
    setPolicyError("");
    setPolicy(null);
    setLedger(null);
    setHistory(null);

    try {
      const [polRes, ledRes, histRes] = await Promise.all([
        fetch(`/api/policies/${id}`),
        fetch(`/api/policies/${id}/ledger`),
        fetch(`/api/policies/${id}/history/verify`),
      ]);

      if (!polRes.ok) {
        const j = await polRes.json().catch(() => ({}));
        setPolicyError((j as { error?: string }).error ?? `HTTP ${polRes.status}`);
        return;
      }

      const [polJson, ledJson, histJson] = await Promise.all([
        polRes.json(),
        ledRes.ok ? ledRes.json() : null,
        histRes.ok ? histRes.json() : null,
      ]);

      setPolicy(polJson as Policy);
      setLedger(ledJson as LedgerDetail | null);
      setHistory(histJson as HistoryVerification | null);
    } catch (err: unknown) {
      setPolicyError(err instanceof Error ? err.message : "Network error");
    } finally {
      setLoadingPolicy(false);
    }
  }, []);

  useEffect(() => {
    fetchAll(policyId);
  }, [policyId, fetchAll]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPolicyId(inputId.trim());
  };

  const handleRefresh = () => fetchAll(policyId);

  const handleMutationSuccess = () => {
    setTimeout(() => fetchAll(policyId), 300);
    setActiveTab("overview");
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>Policy Administration System</h1>
        <span className="badge">PAS · v1.0</span>
      </header>

      {/* Policy ID search */}
      <form className="search-bar" onSubmit={handleSearch}>
        <input
          value={inputId}
          onChange={(e) => setInputId(e.target.value)}
          placeholder="Policy ID (e.g. POL-1001)"
        />
        <button className="btn btn-primary" type="submit">
          Load Policy
        </button>
      </form>

      {/* Tabs */}
      <div className="tabs">
        {(["overview", "endorse", "payment"] as Tab[]).map((t) => (
          <button
            key={t}
            className={`tab${activeTab === t ? " active" : ""}`}
            onClick={() => setActiveTab(t)}
          >
            {t === "overview" && "Policy Overview"}
            {t === "endorse" && "Apply Endorsement"}
            {t === "payment" && "Record Payment"}
          </button>
        ))}
      </div>

      {/* Content */}
      {loadingPolicy && (
        <div style={{ display: "flex", justifyContent: "center", padding: 40 }}>
          <span className="spinner" style={{ width: 32, height: 32, borderWidth: 3 }} />
        </div>
      )}

      {policyError && !loadingPolicy && (
        <div className="alert error">
          <strong>Error loading policy:</strong> {policyError}
        </div>
      )}

      {!loadingPolicy && !policyError && policy && (
        <>
          {activeTab === "overview" && (
            <PolicyView
              policy={policy}
              ledger={ledger}
              history={history}
              onRefresh={handleRefresh}
            />
          )}
          {activeTab === "endorse" && (
            <EndorsementForm policyId={policyId} onSuccess={handleMutationSuccess} />
          )}
          {activeTab === "payment" && (
            <PaymentForm policyId={policyId} onSuccess={handleMutationSuccess} />
          )}
        </>
      )}
    </div>
  );
}
