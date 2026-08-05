"use client";

import { useCallback, useEffect, useState } from "react";
import {
  connectWallet,
  contractAddress,
  explorerContract,
  explorerTx,
  formatGen,
  parseGen,
  readContract,
  saveContractAddress,
  writeContract,
} from "@/lib/genlayer";
import type { ContractStats, MandateRecord, TxResult } from "@/lib/types";

const emptyStats: ContractStats = {
  mandate_count: "0",
  total_bonded: "0",
  active_bond: "0",
  total_agent_paid: "0",
  total_principal_refunded: "0",
};

function short(v: string, l = 6, r = 4) {
  return v?.length > l + r + 3 ? `${v.slice(0, l)}…${v.slice(-r)}` : v || "—";
}

function parseJson<T>(v: unknown): T {
  return typeof v === "string" ? JSON.parse(v) as T : v as T;
}

const STEPS = [
  { key: "OPEN", label: "Post Mandate", desc: "Principal bonds reward" },
  { key: "BANDS", label: "Lock Band", desc: "Set partial %" },
  { key: "ACCEPT", label: "Accept", desc: "Agent takes mandate" },
  { key: "DELIVER", label: "Deliver", desc: "Agent submits work" },
  { key: "CHALLENGE", label: "Challenge", desc: "Principal reviews" },
  { key: "ADJUDICATE", label: "Adjudicate", desc: "AI jury decides" },
  { key: "SETTLE", label: "Settle", desc: "Bond distributed" },
] as const;

type StepKey = typeof STEPS[number]["key"];

function stepForStatus(s?: string): number {
  if (!s) return 0;
  if (s === "DRAFT") return 1;
  if (s === "OFFERED") return 2;
  if (s === "ACTIVE") return 3;
  if (s === "DELIVERED" || s === "CHALLENGED" || s === "REVIEW_READY") return 4;
  if (s === "RULING_READY") return 5;
  if (s === "SETTLED" || s === "RECOVERED" || s === "CANCELLED" || s === "EXPIRED") return 6;
  return 0;
}

export default function Page() {
  const [account, setAccount] = useState("");
  const [stats, setStats] = useState<ContractStats>(emptyStats);
  const [mandateId, setMandateId] = useState("0");
  const [mandate, setMandate] = useState<MandateRecord | null>(null);
  const [tx, setTx] = useState<TxResult>({ success: true });
  const [loading, setLoading] = useState(false);
  const [contractAddr, setContractAddr] = useState("");
  const [activeStep, setActiveStep] = useState<StepKey>("OPEN");

  // Form fields
  const [agentAddr, setAgentAddr] = useState("");
  const [title, setTitle] = useState("");
  const [briefUrl, setBriefUrl] = useState("");
  const [briefCommit, setBriefCommit] = useState("");
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [evidenceCommit, setEvidenceCommit] = useState("");
  const [bondAmount, setBondAmount] = useState("1");
  const [partialPct, setPartialPct] = useState("50");
  const [deliveryNote, setDeliveryNote] = useState("");
  const [deliveryUrl, setDeliveryUrl] = useState("");
  const [deliveryCommit, setDeliveryCommit] = useState("");
  const [counterNote, setCounterNote] = useState("");
  const [counterUrl, setCounterUrl] = useState("");
  const [counterCommit, setCounterCommit] = useState("");

  const ca = contractAddr || contractAddress();

  const sync = useCallback(async () => {
    if (!ca) return;
    try {
      const s = await readContract("get_stats", [[]]);
      if (s) setStats(parseJson<ContractStats>(s));
    } catch {}
  }, [ca]);

  useEffect(() => { sync(); }, [sync]);

  const loadMandate = async () => {
    if (!ca) return;
    try {
      const r = await readContract("get_mandate", [[parseInt(mandateId)]]);
      if (r) setMandate(parseJson<MandateRecord>(r));
    } catch { setMandate(null); }
  };

  const doConnect = async () => {
    const r = await connectWallet();
    if (r.success && r.data) {
      setAccount(r.data as string);
      sync();
    }
  };

  const wr = async (fn: string, args: unknown[], value = BigInt(0)) => {
    if (!ca || !account) return;
    setLoading(true);
    const r = await writeContract(fn, args, value);
    setLoading(false);
    setTx(r);
    if (r.success) setTimeout(sync, 3000);
  };

  const currentStep = mandate ? stepForStatus(mandate.status) : 0;

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0f", color: "#e0e0e0", fontFamily: "system-ui, sans-serif" }}>
      {/* Header */}
      <header style={{ padding: "1.5rem 2rem", borderBottom: "1px solid #1a1a2e", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, margin: 0, color: "#fff" }}>
            <span style={{ color: "#6366f1" }}>Agent</span>Task
          </h1>
          <p style={{ fontSize: "0.75rem", color: "#666", margin: "0.25rem 0 0" }}>Bonded mandates for autonomous work</p>
        </div>
        <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
          {ca && <a href={explorerContract(ca)} target="_blank" rel="noopener" style={{ fontSize: "0.75rem", color: "#6366f1", textDecoration: "none" }}>{short(ca)}</a>}
          <button onClick={doConnect} style={{ background: account ? "#10b981" : "#6366f1", color: "#fff", border: "none", padding: "0.5rem 1.25rem", borderRadius: "0.5rem", cursor: "pointer", fontSize: "0.8rem", fontWeight: 600 }}>
            {account ? short(account) : "Connect"}
          </button>
        </div>
      </header>

      <main style={{ maxWidth: "960px", margin: "0 auto", padding: "2rem" }}>
        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "1rem", marginBottom: "2rem" }}>
          {[
            { label: "Mandates", value: stats.mandate_count },
            { label: "Bonded", value: formatGen(stats.total_bonded) },
            { label: "Active", value: formatGen(stats.active_bond) },
            { label: "Paid Out", value: formatGen(stats.total_agent_paid) },
          ].map((s) => (
            <div key={s.label} style={{ background: "#12121f", borderRadius: "0.75rem", padding: "1rem", border: "1px solid #1a1a2e" }}>
              <div style={{ fontSize: "0.7rem", color: "#666", textTransform: "uppercase", letterSpacing: "0.05em" }}>{s.label}</div>
              <div style={{ fontSize: "1.25rem", fontWeight: 700, color: "#fff", marginTop: "0.25rem" }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Contract address input */}
        <div style={{ background: "#12121f", borderRadius: "0.75rem", padding: "1.25rem", border: "1px solid #1a1a2e", marginBottom: "1.5rem" }}>
          <label style={{ fontSize: "0.7rem", color: "#666", textTransform: "uppercase" }}>Contract Address</label>
          <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
            <input value={contractAddr} onChange={(e) => setContractAddr(e.target.value)} placeholder="0x..." style={{ flex: 1, background: "#0a0a0f", border: "1px solid #2a2a3e", borderRadius: "0.5rem", padding: "0.6rem 0.75rem", color: "#fff", fontSize: "0.85rem", outline: "none" }} />
            <button onClick={() => { saveContractAddress(contractAddr); sync(); }} style={{ background: "#1e1e2e", color: "#6366f1", border: "1px solid #6366f1", padding: "0.6rem 1rem", borderRadius: "0.5rem", cursor: "pointer", fontSize: "0.8rem" }}>Set</button>
          </div>
        </div>

        {/* Stepper */}
        <div style={{ background: "#12121f", borderRadius: "0.75rem", padding: "1.5rem", border: "1px solid #1a1a2e", marginBottom: "1.5rem" }}>
          <h2 style={{ fontSize: "0.8rem", color: "#666", textTransform: "uppercase", marginBottom: "1rem" }}>Mandate Lifecycle</h2>
          <div style={{ display: "flex", gap: "0.25rem" }}>
            {STEPS.map((step, i) => (
              <div key={step.key} onClick={() => setActiveStep(step.key)} style={{
                flex: 1, textAlign: "center", padding: "0.75rem 0.25rem", borderRadius: "0.5rem", cursor: "pointer",
                background: i <= currentStep ? (i === currentStep ? "#6366f1" : "#1e1e2e") : "#0a0a0f",
                border: `1px solid ${i <= currentStep ? "#6366f1" : "#1a1a2e"}`,
                opacity: i <= currentStep ? 1 : 0.4,
              }}>
                <div style={{ fontSize: "0.65rem", color: i <= currentStep ? "#fff" : "#444" }}>{step.label}</div>
                <div style={{ fontSize: "0.55rem", color: "#888", marginTop: "0.25rem" }}>{step.desc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Load mandate */}
        <div style={{ background: "#12121f", borderRadius: "0.75rem", padding: "1.25rem", border: "1px solid #1a1a2e", marginBottom: "1.5rem" }}>
          <h2 style={{ fontSize: "0.8rem", color: "#666", textTransform: "uppercase", marginBottom: "1rem" }}>Load Mandate</h2>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <input value={mandateId} onChange={(e) => setMandateId(e.target.value)} placeholder="Mandate ID" style={{ width: "100px", background: "#0a0a0f", border: "1px solid #2a2a3e", borderRadius: "0.5rem", padding: "0.6rem 0.75rem", color: "#fff", fontSize: "0.85rem", outline: "none" }} />
            <button onClick={loadMandate} style={{ background: "#6366f1", color: "#fff", border: "none", padding: "0.6rem 1.5rem", borderRadius: "0.5rem", cursor: "pointer", fontSize: "0.8rem", fontWeight: 600 }}>Load</button>
          </div>
          {mandate && (
            <div style={{ marginTop: "1rem", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", fontSize: "0.8rem" }}>
              {[
                ["Status", mandate.status],
                ["Decision", mandate.decision],
                ["Bond", formatGen(mandate.bond)],
                ["Partial %", mandate.partial_pct + "%"],
                ["Principal", short(mandate.principal)],
                ["Agent", short(mandate.agent)],
              ].map(([k, v]) => (
                <div key={k}><span style={{ color: "#666" }}>{k}:</span> <span style={{ color: "#fff" }}>{v}</span></div>
              ))}
              {mandate.reason && <div style={{ gridColumn: "1 / -1", color: "#888", fontSize: "0.75rem", fontStyle: "italic" }}>{mandate.reason}</div>}
            </div>
          )}
        </div>

        {/* Actions */}
        {activeStep === "OPEN" && (
          <div style={{ background: "#12121f", borderRadius: "0.75rem", padding: "1.5rem", border: "1px solid #1a1a2e" }}>
            <h2 style={{ fontSize: "0.9rem", color: "#6366f1", marginBottom: "1rem" }}>Post New Mandate</h2>
            <div style={{ display: "grid", gap: "0.75rem" }}>
              <Field label="Agent Wallet" v={agentAddr} set={setAgentAddr} ph="0x..." />
              <Field label="Mandate Title" v={title} set={setTitle} ph="What needs to be done" />
              <Field label="Brief URL (IPFS/Arweave)" v={briefUrl} set={setBriefUrl} ph="https://arweave.net/..." />
              <Field label="Brief Commitment" v={briefCommit} set={setBriefCommit} ph="content:..." />
              <Field label="Evidence Origin URL" v={evidenceUrl} set={setEvidenceUrl} ph="https://arweave.net/..." />
              <Field label="Evidence Commitment" v={evidenceCommit} set={setEvidenceCommit} ph="content:..." />
              <Field label="Bond (GEN)" v={bondAmount} set={setBondAmount} ph="1" />
              <button onClick={() => wr("open_mandate", [agentAddr, title, briefUrl, briefCommit, evidenceUrl, evidenceCommit], parseGen(bondAmount))} disabled={loading || !account} style={btnStyle}>
                {loading ? "Signing…" : "Post Mandate + Bond"}
              </button>
            </div>
          </div>
        )}

        {activeStep === "BANDS" && (
          <ActionCard title="Lock Partial Band">
            <Field label="Partial %" v={partialPct} set={setPartialPct} ph="50" />
            <p style={{ fontSize: "0.7rem", color: "#666" }}>Agent gets this % on PARTIAL verdict. Principal gets remainder.</p>
            <button onClick={() => wr("lock_partial_band", [parseInt(mandateId), parseInt(partialPct)])} disabled={loading || !account} style={btnStyle}>
              {loading ? "Signing…" : "Lock Band"}
            </button>
          </ActionCard>
        )}

        {activeStep === "ACCEPT" && (
          <ActionCard title="Accept Mandate">
            <p style={{ fontSize: "0.8rem", color: "#888" }}>Accept this mandate and start the delivery window.</p>
            <button onClick={() => wr("accept_mandate", [parseInt(mandateId)])} disabled={loading || !account} style={btnStyle}>
              {loading ? "Signing…" : "Accept Mandate"}
            </button>
          </ActionCard>
        )}

        {activeStep === "DELIVER" && (
          <ActionCard title="Submit Deliverable">
            <Field label="Delivery Note" v={deliveryNote} set={setDeliveryNote} ph="Describe what you delivered…" wide />
            <Field label="Delivery Snapshot URL" v={deliveryUrl} set={setDeliveryUrl} ph="https://arweave.net/..." />
            <Field label="Delivery Commitment" v={deliveryCommit} set={setDeliveryCommit} ph="content:..." />
            <button onClick={() => wr("submit_deliverable", [parseInt(mandateId), deliveryNote, deliveryUrl, deliveryCommit])} disabled={loading || !account} style={btnStyle}>
              {loading ? "Signing…" : "Submit Deliverable"}
            </button>
          </ActionCard>
        )}

        {activeStep === "CHALLENGE" && (
          <ActionCard title="Challenge or Review">
            <p style={{ fontSize: "0.8rem", color: "#888", marginBottom: "1rem" }}>If delivery is unsatisfactory, submit counter-evidence. Otherwise, close the review window.</p>
            <Field label="Counter-Evidence URL" v={counterUrl} set={setCounterUrl} ph="https://arweave.net/..." />
            <Field label="Counter Commitment" v={counterCommit} set={setCounterCommit} ph="content:..." />
            <Field label="Counter Note" v={counterNote} set={setCounterNote} ph="Why the delivery fails…" wide />
            <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
              <button onClick={() => wr("challenge_deliverable", [parseInt(mandateId), counterUrl, counterCommit, counterNote])} disabled={loading || !account} style={{ ...btnStyle, background: "#ef4444" }}>
                {loading ? "Signing…" : "Challenge"}
              </button>
              <button onClick={() => wr("close_review", [parseInt(mandateId)])} disabled={loading || !account} style={{ ...btnStyle, background: "#10b981" }}>
                {loading ? "Signing…" : "Close Review (no challenge)"}
              </button>
            </div>
          </ActionCard>
        )}

        {activeStep === "ADJUDICATE" && (
          <ActionCard title="Run AI Adjudication">
            <p style={{ fontSize: "0.8rem", color: "#888" }}>3 validators independently fetch evidence and judge delivery. Real bond value depends on the ruling.</p>
            <button onClick={() => wr("adjudicate", [parseInt(mandateId)])} disabled={loading || !account} style={btnStyle}>
              {loading ? "Adjudicating…" : "Run Jury"}
            </button>
          </ActionCard>
        )}

        {activeStep === "SETTLE" && (
          <ActionCard title="Settle or Recover">
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              <button onClick={() => wr("settle", [parseInt(mandateId)])} disabled={loading || !account} style={btnStyle}>
                {loading ? "Signing…" : "Settle Bond"}
              </button>
              <button onClick={() => wr("approve_recovery", [parseInt(mandateId)])} disabled={loading || !account} style={{ ...btnStyle, background: "#f59e0b" }}>
                Approve Recovery
              </button>
              <button onClick={() => wr("claim_recovery_timeout", [parseInt(mandateId)])} disabled={loading || !account} style={{ ...btnStyle, background: "#6b7280" }}>
                Claim Timeout
              </button>
            </div>
          </ActionCard>
        )}

        {/* TX result */}
        {tx.hash && (
          <div style={{ marginTop: "1.5rem", background: tx.success ? "#064e3b" : "#450a0a", borderRadius: "0.75rem", padding: "1rem", border: `1px solid ${tx.success ? "#10b981" : "#ef4444"}` }}>
            <div style={{ fontSize: "0.8rem", color: tx.success ? "#34d399" : "#f87171" }}>{tx.success ? "Transaction Confirmed" : tx.error || "Transaction Failed"}</div>
            {tx.hash && <a href={explorerTx(tx.hash)} target="_blank" rel="noopener" style={{ fontSize: "0.75rem", color: "#6366f1", display: "block", marginTop: "0.5rem" }}>View on Explorer →</a>}
          </div>
        )}
      </main>
    </div>
  );
}

function Field({ label, v, set, ph, wide }: { label: string; v: string; set: (s: string) => void; ph: string; wide?: boolean }) {
  return (
    <div>
      <label style={{ fontSize: "0.7rem", color: "#666", textTransform: "uppercase", display: "block", marginBottom: "0.25rem" }}>{label}</label>
      {wide ? (
        <textarea value={v} onChange={(e) => set(e.target.value)} placeholder={ph} rows={3} style={{ width: "100%", background: "#0a0a0f", border: "1px solid #2a2a3e", borderRadius: "0.5rem", padding: "0.6rem 0.75rem", color: "#fff", fontSize: "0.85rem", outline: "none", resize: "vertical" }} />
      ) : (
        <input value={v} onChange={(e) => set(e.target.value)} placeholder={ph} style={{ width: "100%", background: "#0a0a0f", border: "1px solid #2a2a3e", borderRadius: "0.5rem", padding: "0.6rem 0.75rem", color: "#fff", fontSize: "0.85rem", outline: "none" }} />
      )}
    </div>
  );
}

function ActionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "#12121f", borderRadius: "0.75rem", padding: "1.5rem", border: "1px solid #1a1a2e" }}>
      <h2 style={{ fontSize: "0.9rem", color: "#6366f1", marginBottom: "1rem" }}>{title}</h2>
      {children}
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  background: "#6366f1",
  color: "#fff",
  border: "none",
  padding: "0.75rem 1.5rem",
  borderRadius: "0.5rem",
  cursor: "pointer",
  fontSize: "0.85rem",
  fontWeight: 600,
  marginTop: "0.5rem",
};
