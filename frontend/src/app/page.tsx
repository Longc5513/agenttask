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

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "#6b7280",
  OFFERED: "#8b5cf6",
  ACTIVE: "#3b82f6",
  DELIVERED: "#f59e0b",
  CHALLENGED: "#ef4444",
  REVIEW_READY: "#f59e0b",
  RULING_READY: "#8b5cf6",
  SETTLED: "#10b981",
  CANCELLED: "#6b7280",
  EXPIRED: "#6b7280",
  EVIDENCE_UNAVAILABLE: "#ef4444",
  RECOVERED: "#10b981",
};

const DECISION_COLORS: Record<string, string> = {
  FULFILLED: "#10b981",
  PARTIAL: "#f59e0b",
  REJECTED: "#ef4444",
  UNAVAILABLE: "#6b7280",
  PENDING: "#6b7280",
};

export default function Page() {
  const [account, setAccount] = useState("");
  const [stats, setStats] = useState<ContractStats>(emptyStats);
  const [mandates, setMandates] = useState<MandateRecord[]>([]);
  const [selected, setSelected] = useState<MandateRecord | null>(null);
  const [mandateId, setMandateId] = useState("0");
  const [tx, setTx] = useState<TxResult>({ success: true });
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<"ledger" | "action" | "guide">("ledger");

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

  const ca = contractAddress();

  const sync = useCallback(async () => {
    if (!ca) return;
    try {
      const s = await readContract("get_stats", []);
      if (s?.success && s.data) {
        const st = parseJson<ContractStats>(s.data);
        setStats(st);
        const count = parseInt(st.mandate_count);
        const loaded: MandateRecord[] = [];
        for (let i = 0; i < Math.min(count, 20); i++) {
          try {
            const r = await readContract("get_mandate", [i]);
            if (r?.success && r.data) loaded.push(parseJson<MandateRecord>(r.data));
          } catch {}
        }
        setMandates(loaded.reverse());
      }
    } catch {}
  }, [ca]);

  useEffect(() => { sync(); }, [sync]);

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
    if (r.success) {
      setTimeout(async () => {
        await sync();
        // Auto-load mandate after write
        if (fn === "open_mandate") {
          const statsR = await readContract("get_stats", []);
          if (statsR?.success && statsR.data) {
            const st = parseJson<ContractStats>(statsR.data);
            const newId = parseInt(st.mandate_count) - 1;
            if (newId >= 0) {
              setMandateId(String(newId));
              const mr = await readContract("get_mandate", [newId]);
              if (mr?.success && mr.data) {
                setSelected(parseJson<MandateRecord>(mr.data));
                setTab("action");
              }
            }
          }
        } else {
          // Reload current mandate
          const mr = await readContract("get_mandate", [parseInt(mandateId)]);
          if (mr?.success && mr.data) {
            setSelected(parseJson<MandateRecord>(mr.data));
          }
        }
      }, 5000);
    }
  };

  const loadMandate = async () => {
    if (!ca) return;
    try {
      const r = await readContract("get_mandate", [parseInt(mandateId)]);
      if (r?.success && r.data) {
        const m = parseJson<MandateRecord>(r.data);
        setSelected(m);
        setTab("action");
      } else {
        setSelected(null);
        setTx({ success: false, error: r?.error || "Mandate not found" });
      }
    } catch { setSelected(null); setTx({ success: false, error: "Failed to load mandate" }); }
  };

  const nextAction = (status?: string) => {
    if (!status) return "POST";
    if (status === "DRAFT") return "LOCK_BAND";
    if (status === "OFFERED") return "ACCEPT";
    if (status === "ACTIVE") return "DELIVER";
    if (status === "DELIVERED") return "CHALLENGE_OR_CLOSE";
    if (status === "CHALLENGED" || status === "REVIEW_READY") return "ADJUDICATE";
    if (status === "RULING_READY") return "SETTLE";
    if (status === "EVIDENCE_UNAVAILABLE") return "RECOVERY";
    return "DONE";
  };

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0f", color: "#e0e0e0", fontFamily: "'Inter', system-ui, sans-serif" }}>
      {/* Header */}
      <header style={{ padding: "1rem 2rem", borderBottom: "1px solid #1a1a2e", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 800, margin: 0 }}>
            <span style={{ color: "#6366f1" }}>Agent</span><span style={{ color: "#fff" }}>Task</span>
          </h1>
          <span style={{ fontSize: "0.65rem", color: "#4b5563", background: "#1a1a2e", padding: "0.2rem 0.6rem", borderRadius: "999px" }}>STUDIONET</span>
        </div>
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
          {ca && <a href={explorerContract(ca)} target="_blank" rel="noopener" style={{ fontSize: "0.7rem", color: "#6366f1", textDecoration: "none", fontFamily: "monospace" }}>{short(ca, 8, 6)}</a>}
          <button onClick={doConnect} style={{ background: account ? "#065f46" : "#6366f1", color: "#fff", border: "none", padding: "0.5rem 1.25rem", borderRadius: "0.5rem", cursor: "pointer", fontSize: "0.75rem", fontWeight: 600 }}>
            {account ? short(account) : "Connect Wallet"}
          </button>
        </div>
      </header>

      <main style={{ maxWidth: "1100px", margin: "0 auto", padding: "1.5rem 2rem" }}>
        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "0.75rem", marginBottom: "1.5rem" }}>
          {[
            { label: "Mandates", value: stats.mandate_count, color: "#fff" },
            { label: "Total Bonded", value: formatGen(stats.total_bonded) + " GEN", color: "#6366f1" },
            { label: "Active Custody", value: formatGen(stats.active_bond) + " GEN", color: "#3b82f6" },
            { label: "Agent Paid", value: formatGen(stats.total_agent_paid) + " GEN", color: "#10b981" },
            { label: "Principal Returned", value: formatGen(stats.total_principal_refunded) + " GEN", color: "#f59e0b" },
          ].map((s) => (
            <div key={s.label} style={{ background: "#111118", borderRadius: "0.5rem", padding: "0.75rem 1rem", border: "1px solid #1e1e2e" }}>
              <div style={{ fontSize: "0.6rem", color: "#4b5563", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.25rem" }}>{s.label}</div>
              <div style={{ fontSize: "1rem", fontWeight: 700, color: s.color }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
          {(["ledger", "action", "guide"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} style={{
              background: tab === t ? "#6366f1" : "transparent",
              color: tab === t ? "#fff" : "#6b7280",
              border: `1px solid ${tab === t ? "#6366f1" : "#1e1e2e"}`,
              padding: "0.5rem 1.25rem", borderRadius: "0.5rem", cursor: "pointer", fontSize: "0.75rem", fontWeight: 600, textTransform: "uppercase",
            }}>{t === "ledger" ? "Mandate Ledger" : t === "action" ? "Actions" : "Step-by-Step Guide"}</button>
          ))}
        </div>

        {tab === "guide" && (
          <div style={{ background: "#111118", borderRadius: "0.75rem", padding: "2rem", border: "1px solid #1e1e2e" }}>
            <h2 style={{ fontSize: "1.25rem", fontWeight: 700, color: "#fff", marginBottom: "1.5rem", textAlign: "center" }}>How to Use AgentTask — Step by Step</h2>
            
            <div style={{ marginBottom: "2rem" }}>
              <div style={{ background: "#1e1e2e", borderRadius: "0.5rem", padding: "1rem", marginBottom: "1rem", border: "1px solid #2a2a3e" }}>
                <h3 style={{ fontSize: "0.9rem", color: "#f59e0b", margin: "0 0 0.5rem" }}>⚠ Before You Start</h3>
                <p style={{ fontSize: "0.8rem", color: "#9ca3af", margin: 0 }}>You need <strong style={{ color: "#fff" }}>2 different wallets</strong> (OKX or MetaMask). One wallet acts as <strong style={{ color: "#6366f1" }}>Principal</strong> (task creator), the other as <strong style={{ color: "#10b981" }}>Agent</strong> (worker).</p>
              </div>
            </div>

            {[
              { step: "1", title: "Create Two Wallets", color: "#6366f1", desc: "Open OKX or MetaMask. Create Account 1 (Principal) and Account 2 (Agent). Copy both addresses.", action: "No transaction needed" },
              { step: "2", title: "Connect Principal Wallet", color: "#6366f1", desc: "Click 'Connect Wallet' in the top right. Select Account 1 (Principal).", action: "Connect wallet only" },
              { step: "3", title: "Post a Mandate", color: "#6366f1", desc: "Go to Actions tab. Fill in: Agent Wallet = Account 2 address, Title = task description, Brief URL = Arweave link with task requirements, Brief Commitment = content:HASH, Evidence URL = Arweave link for evidence origin, Evidence Commitment = content:HASH, Bond = GEN amount to stake.", action: "Sends GEN bond to contract" },
              { step: "4", title: "Lock Partial Band", color: "#6366f1", desc: "Load your mandate. Set Partial % (e.g., 50 = agent gets 50% if PARTIAL verdict). Click Lock Band.", action: "Sets payout percentage" },
              { step: "5", title: "Switch to Agent Wallet", color: "#10b981", desc: "Disconnect Principal wallet. Connect Account 2 (Agent). Load the mandate.", action: "Switch wallet only" },
              { step: "6", title: "Accept Mandate", color: "#10b981", desc: "Click 'Accept Mandate'. This starts the 30-day delivery window.", action: "Agent accepts the task" },
              { step: "7", title: "Submit Deliverable", color: "#10b981", desc: "Fill in Delivery Note (describe what you delivered), Snapshot URL (Arweave link with proof-of-work), Commitment = content:HASH. Click Submit Deliverable.", action: "Agent submits proof" },
              { step: "8", title: "Switch to Principal Wallet", color: "#6366f1", desc: "Disconnect Agent wallet. Connect Account 1 (Principal). Load the mandate.", action: "Switch wallet only" },
              { step: "9", title: "Review Delivery", color: "#6366f1", desc: "If satisfied: click 'Close Review'. If not: fill Counter-Evidence URL + note, click 'Challenge'.", action: "Principal reviews or challenges" },
              { step: "10", title: "Run AI Adjudication", color: "#8b5cf6", desc: "Either party can click 'Run AI Jury'. 3 validators independently fetch evidence and judge: FULFILLED, PARTIAL, or REJECTED.", action: "AI evaluates evidence" },
              { step: "11", title: "Settle Bond", color: "#10b981", desc: "Click 'Settle Bond'. Distribution: FULFILLED = Agent gets 100%, PARTIAL = Agent gets partial%, REJECTED = Principal gets 100%.", action: "GEN distributed via emit_transfer" },
            ].map((s) => (
              <div key={s.step} style={{ display: "flex", gap: "1rem", marginBottom: "1rem", padding: "1rem", background: "#0a0a0f", borderRadius: "0.5rem", border: "1px solid #1e1e2e" }}>
                <div style={{ width: "40px", height: "40px", borderRadius: "50%", background: s.color, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <span style={{ fontSize: "1rem", fontWeight: 700, color: "#fff" }}>{s.step}</span>
                </div>
                <div style={{ flex: 1 }}>
                  <h3 style={{ fontSize: "0.9rem", color: "#fff", margin: "0 0 0.25rem" }}>{s.title}</h3>
                  <p style={{ fontSize: "0.75rem", color: "#9ca3af", margin: "0 0 0.5rem", lineHeight: 1.5 }}>{s.desc}</p>
                  <span style={{ fontSize: "0.65rem", color: s.color, background: s.color + "20", padding: "0.2rem 0.5rem", borderRadius: "999px" }}>{s.action}</span>
                </div>
              </div>
            ))}

            <div style={{ marginTop: "1.5rem", background: "#1e1e2e", borderRadius: "0.5rem", padding: "1rem", border: "1px solid #2a2a3e" }}>
              <h3 style={{ fontSize: "0.85rem", color: "#10b981", margin: "0 0 0.5rem" }}>💡 Tips</h3>
              <ul style={{ fontSize: "0.75rem", color: "#9ca3af", margin: 0, paddingLeft: "1.25rem", lineHeight: 1.8 }}>
                <li>Evidence must be on <strong style={{ color: "#fff" }}>IPFS or Arweave</strong> (immutable). Regular URLs won't work.</li>
                <li>Commitment format: <code style={{ color: "#6366f1", background: "#0a0a0f", padding: "0.1rem 0.3rem", borderRadius: "0.25rem" }}>content:HASH</code> where HASH matches the URL.</li>
                <li>Bond is real GEN — it gets locked in the contract until settlement.</li>
                <li>Either party can trigger adjudication after delivery.</li>
                <li>Recovery: if evidence is unavailable, both parties can approve equal-split recovery.</li>
              </ul>
            </div>
          </div>
        )}

        {tab === "ledger" && (
          <div style={{ background: "#111118", borderRadius: "0.75rem", border: "1px solid #1e1e2e", overflow: "hidden" }}>
            <div style={{ padding: "1rem 1.25rem", borderBottom: "1px solid #1e1e2e", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2 style={{ fontSize: "0.85rem", color: "#fff", margin: 0 }}>Live Mandates</h2>
              <button onClick={sync} style={{ background: "transparent", color: "#6366f1", border: "1px solid #6366f1", padding: "0.35rem 0.75rem", borderRadius: "0.35rem", cursor: "pointer", fontSize: "0.7rem" }}>Refresh</button>
            </div>
            {mandates.length === 0 ? (
              <div style={{ padding: "3rem", textAlign: "center", color: "#4b5563" }}>No mandates yet. Post the first one.</div>
            ) : (
              <div>
                {mandates.map((m) => (
                  <div key={m.mandate_id} onClick={() => { setSelected(m); setMandateId(m.mandate_id); setTab("action"); }} style={{
                    padding: "0.85rem 1.25rem", borderBottom: "1px solid #1a1a2e", cursor: "pointer",
                    background: selected?.mandate_id === m.mandate_id ? "#1a1a2e" : "transparent",
                    display: "grid", gridTemplateColumns: "60px 1fr 120px 100px 100px", alignItems: "center", gap: "0.5rem",
                  }}>
                    <span style={{ fontFamily: "monospace", fontSize: "0.75rem", color: "#6366f1" }}>#{m.mandate_id}</span>
                    <span style={{ fontSize: "0.8rem", color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.title}</span>
                    <span style={{ fontSize: "0.65rem", padding: "0.15rem 0.5rem", borderRadius: "999px", background: STATUS_COLORS[m.status] + "20", color: STATUS_COLORS[m.status], textAlign: "center", fontWeight: 600 }}>{m.status}</span>
                    <span style={{ fontSize: "0.75rem", color: "#9ca3af", textAlign: "right" }}>{formatGen(m.bond)} GEN</span>
                    <span style={{ fontSize: "0.65rem", padding: "0.15rem 0.5rem", borderRadius: "999px", background: DECISION_COLORS[m.decision] + "20", color: DECISION_COLORS[m.decision], textAlign: "center", fontWeight: 600 }}>{m.decision}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "action" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
            {/* Left: Mandate detail */}
            <div style={{ background: "#111118", borderRadius: "0.75rem", padding: "1.25rem", border: "1px solid #1e1e2e" }}>
              <h2 style={{ fontSize: "0.85rem", color: "#fff", marginBottom: "1rem" }}>Mandate Detail</h2>
              <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
                <input value={mandateId} onChange={(e) => setMandateId(e.target.value)} placeholder="ID" style={{ width: "60px", background: "#0a0a0f", border: "1px solid #2a2a3e", borderRadius: "0.35rem", padding: "0.5rem", color: "#fff", fontSize: "0.8rem", outline: "none" }} />
                <button onClick={loadMandate} style={{ background: "#6366f1", color: "#fff", border: "none", padding: "0.5rem 1rem", borderRadius: "0.35rem", cursor: "pointer", fontSize: "0.75rem" }}>Load</button>
              </div>
              {selected ? (
                <div style={{ fontSize: "0.8rem" }}>
                  <div style={{ marginBottom: "1rem" }}>
                    <div style={{ fontSize: "1rem", fontWeight: 700, color: "#fff", marginBottom: "0.25rem" }}>{selected.title}</div>
                    <span style={{ fontSize: "0.65rem", padding: "0.2rem 0.6rem", borderRadius: "999px", background: STATUS_COLORS[selected.status] + "20", color: STATUS_COLORS[selected.status], fontWeight: 600 }}>{selected.status}</span>
                    <span style={{ fontSize: "0.65rem", padding: "0.2rem 0.6rem", borderRadius: "999px", background: DECISION_COLORS[selected.decision] + "20", color: DECISION_COLORS[selected.decision], fontWeight: 600, marginLeft: "0.5rem" }}>{selected.decision}</span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem", marginBottom: "1rem" }}>
                    <div><span style={{ color: "#4b5563" }}>Bond:</span> <span style={{ color: "#6366f1", fontWeight: 600 }}>{formatGen(selected.bond)} GEN</span></div>
                    <div><span style={{ color: "#4b5563" }}>Partial:</span> <span style={{ color: "#fff" }}>{selected.partial_pct}%</span></div>
                    <div><span style={{ color: "#4b5563" }}>Principal:</span> <span style={{ color: "#fff", fontFamily: "monospace", fontSize: "0.7rem" }}>{short(selected.principal, 8, 6)}</span></div>
                    <div><span style={{ color: "#4b5563" }}>Agent:</span> <span style={{ color: "#fff", fontFamily: "monospace", fontSize: "0.7rem" }}>{short(selected.agent, 8, 6)}</span></div>
                  </div>
                  {selected.reason && <div style={{ color: "#6b7280", fontSize: "0.75rem", fontStyle: "italic", borderTop: "1px solid #1e1e2e", paddingTop: "0.75rem" }}>{selected.reason}</div>}
                  {selected.delivery_note && <div style={{ marginTop: "0.75rem" }}><span style={{ color: "#4b5563", fontSize: "0.7rem" }}>DELIVERY:</span> <span style={{ color: "#9ca3af", fontSize: "0.75rem" }}>{selected.delivery_note}</span></div>}
                </div>
              ) : (
                <div style={{ color: "#4b5563", padding: "1rem 0" }}>Load a mandate to see details.</div>
              )}
            </div>

            {/* Right: Actions */}
            <div style={{ background: "#111118", borderRadius: "0.75rem", padding: "1.25rem", border: "1px solid #1e1e2e" }}>
              <h2 style={{ fontSize: "0.85rem", color: "#6366f1", marginBottom: "1rem" }}>
                {selected ? `Next: ${nextAction(selected.status).replace(/_/g, " ")}` : "Post New Mandate"}
              </h2>

              {!selected && (
                <div style={{ display: "grid", gap: "0.6rem" }}>
                  <F label="Agent Wallet" v={agentAddr} set={setAgentAddr} ph="0x..." />
                  <F label="Title" v={title} set={setTitle} ph="What needs to be done" />
                  <F label="Brief URL (IPFS/Arweave)" v={briefUrl} set={setBriefUrl} ph="https://arweave.net/..." />
                  <F label="Brief Commitment" v={briefCommit} set={setBriefCommit} ph="content:..." />
                  <F label="Evidence Origin URL" v={evidenceUrl} set={setEvidenceUrl} ph="https://arweave.net/..." />
                  <F label="Evidence Commitment" v={evidenceCommit} set={setEvidenceCommit} ph="content:..." />
                  <F label="Bond (GEN)" v={bondAmount} set={setBondAmount} ph="1" />
                  <button onClick={() => {
                    if (!agentAddr || agentAddr.length < 42) { setTx({ success: false, error: "Invalid agent wallet address" }); return; }
                    if (!title || title.length < 4) { setTx({ success: false, error: "Title must be at least 4 characters" }); return; }
                    if (!briefUrl || !briefUrl.startsWith("https://")) { setTx({ success: false, error: "Brief URL must start with https://" }); return; }
                    if (!briefCommit || !briefCommit.startsWith("content:")) { setTx({ success: false, error: "Brief commitment must start with content:" }); return; }
                    if (!evidenceUrl || !evidenceUrl.startsWith("https://")) { setTx({ success: false, error: "Evidence URL must start with https://" }); return; }
                    if (!evidenceCommit || !evidenceCommit.startsWith("content:")) { setTx({ success: false, error: "Evidence commitment must start with content:" }); return; }
                    if (!bondAmount || parseFloat(bondAmount) <= 0) { setTx({ success: false, error: "Bond must be greater than 0" }); return; }
                    wr("open_mandate", [agentAddr, title, briefUrl, briefCommit, evidenceUrl, evidenceCommit], parseGen(bondAmount));
                  }} disabled={loading || !account} style={btn}>
                    {loading ? "Signing…" : "Post Mandate + Bond"}
                  </button>
                </div>
              )}

              {selected && nextAction(selected.status) === "LOCK_BAND" && (
                <div style={{ display: "grid", gap: "0.6rem" }}>
                  <F label="Partial %" v={partialPct} set={setPartialPct} ph="50" />
                  <p style={{ fontSize: "0.7rem", color: "#6b7280" }}>Agent gets this % on PARTIAL verdict. Remainder returns to principal.</p>
                  <button onClick={() => wr("lock_partial_band", [parseInt(mandateId), parseInt(partialPct)])} disabled={loading || !account} style={btn}>{loading ? "Signing…" : "Lock Band"}</button>
                </div>
              )}

              {selected && nextAction(selected.status) === "ACCEPT" && (
                <div>
                  <div style={{ background: "#1e1e2e", borderRadius: "0.5rem", padding: "0.75rem 1rem", marginBottom: "1rem", border: "1px solid #2a2a3e" }}>
                    <p style={{ fontSize: "0.75rem", color: "#f59e0b", margin: "0 0 0.5rem", fontWeight: 600 }}>⚠ Only the Agent wallet can accept</p>
                    <p style={{ fontSize: "0.7rem", color: "#9ca3af", margin: 0 }}>Connect with wallet: <span style={{ color: "#6366f1", fontFamily: "monospace" }}>{short(selected.agent, 10, 8)}</span></p>
                  </div>
                  <p style={{ fontSize: "0.8rem", color: "#9ca3af", marginBottom: "1rem" }}>Accept this mandate. Delivery window: 30 days.</p>
                  <button onClick={() => wr("accept_mandate", [parseInt(mandateId)])} disabled={loading || !account} style={btn}>{loading ? "Signing…" : "Accept Mandate"}</button>
                </div>
              )}

              {selected && nextAction(selected.status) === "DELIVER" && (
                <div style={{ display: "grid", gap: "0.6rem" }}>
                  <F label="Delivery Note" v={deliveryNote} set={setDeliveryNote} ph="Describe what you delivered…" wide />
                  <F label="Snapshot URL" v={deliveryUrl} set={setDeliveryUrl} ph="https://arweave.net/..." />
                  <F label="Commitment" v={deliveryCommit} set={setDeliveryCommit} ph="content:..." />
                  <button onClick={() => wr("submit_deliverable", [parseInt(mandateId), deliveryNote, deliveryUrl, deliveryCommit])} disabled={loading || !account} style={btn}>{loading ? "Signing…" : "Submit Deliverable"}</button>
                </div>
              )}

              {selected && nextAction(selected.status) === "CHALLENGE_OR_CLOSE" && (
                <div style={{ display: "grid", gap: "0.6rem" }}>
                  <p style={{ fontSize: "0.75rem", color: "#9ca3af" }}>Challenge if delivery is unsatisfactory, or close review window.</p>
                  <F label="Counter-Evidence URL" v={counterUrl} set={setCounterUrl} ph="https://arweave.net/..." />
                  <F label="Counter Commitment" v={counterCommit} set={setCounterCommit} ph="content:..." />
                  <F label="Counter Note" v={counterNote} set={setCounterNote} ph="Why delivery fails…" wide />
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <button onClick={() => wr("challenge_deliverable", [parseInt(mandateId), counterUrl, counterCommit, counterNote])} disabled={loading || !account} style={{ ...btn, background: "#ef4444" }}>{loading ? "…" : "Challenge"}</button>
                    <button onClick={() => wr("close_review", [parseInt(mandateId)])} disabled={loading || !account} style={{ ...btn, background: "#10b981" }}>{loading ? "…" : "Close Review"}</button>
                  </div>
                </div>
              )}

              {selected && nextAction(selected.status) === "ADJUDICATE" && (
                <div>
                  <p style={{ fontSize: "0.75rem", color: "#9ca3af", marginBottom: "1rem" }}>Either party can trigger AI adjudication. 3 validators fetch evidence independently.</p>
                  <button onClick={() => wr("adjudicate", [parseInt(mandateId)])} disabled={loading || !account} style={btn}>{loading ? "Adjudicating…" : "Run AI Jury"}</button>
                </div>
              )}

              {selected && nextAction(selected.status) === "SETTLE" && (
                <div>
                  <p style={{ fontSize: "0.75rem", color: "#9ca3af", marginBottom: "1rem" }}>Distribute bond according to verdict: {selected.decision}</p>
                  <button onClick={() => wr("settle", [parseInt(mandateId)])} disabled={loading || !account} style={btn}>{loading ? "Signing…" : "Settle Bond"}</button>
                </div>
              )}

              {selected && nextAction(selected.status) === "RECOVERY" && (
                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                  <button onClick={() => wr("approve_recovery", [parseInt(mandateId)])} disabled={loading || !account} style={{ ...btn, background: "#f59e0b" }}>Approve Recovery</button>
                  <button onClick={() => wr("claim_recovery_timeout", [parseInt(mandateId)])} disabled={loading || !account} style={{ ...btn, background: "#6b7280" }}>Claim Timeout</button>
                </div>
              )}

              {selected && nextAction(selected.status) === "DONE" && (
                <div style={{ color: "#10b981", fontWeight: 600 }}>Mandate settled.</div>
              )}
            </div>
          </div>
        )}

        {/* TX result */}
        {tx.hash && (
          <div style={{ marginTop: "1rem", background: tx.success ? "#064e3b" : "#450a0a", borderRadius: "0.5rem", padding: "0.75rem 1rem", border: `1px solid ${tx.success ? "#10b981" : "#ef4444"}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "0.8rem", color: tx.success ? "#34d399" : "#f87171" }}>{tx.success ? "✓ Transaction Confirmed" : tx.error || "Transaction Failed"}</span>
            {tx.hash && <a href={explorerTx(tx.hash)} target="_blank" rel="noopener" style={{ fontSize: "0.7rem", color: "#6366f1" }}>Explorer →</a>}
          </div>
        )}

        {/* Evidence Roles */}
        <section style={{ marginTop: "3rem" }}>
          <div style={{ textAlign: "center", marginBottom: "2rem" }}>
            <p style={{ fontSize: "0.65rem", color: "#4b5563", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "0.5rem" }}>Evidence Roles</p>
            <h2 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#fff", margin: 0 }}>Content-addressed evidence drives every ruling.</h2>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1rem" }}>
            {[
              { num: "01", label: "Mandate Brief", copy: "Principal locks the exact deliverables, acceptance criteria, and partial band definitions before the agent accepts." },
              { num: "02", label: "Delivery Snapshot", copy: "Agent binds a content-addressed proof-of-work to the exact mandate and delivery window." },
              { num: "03", label: "Counter-Evidence", copy: "The principal may answer with its own immutable rejection record inside a bounded review window." },
            ].map((item) => (
              <div key={item.num} style={{ background: "#111118", borderRadius: "0.75rem", padding: "1.5rem", border: "1px solid #1e1e2e" }}>
                <span style={{ fontSize: "0.65rem", color: "#6366f1", fontFamily: "monospace" }}>{item.num}</span>
                <h3 style={{ fontSize: "0.9rem", color: "#fff", margin: "0.5rem 0" }}>{item.label}</h3>
                <p style={{ fontSize: "0.75rem", color: "#6b7280", margin: 0, lineHeight: 1.5 }}>{item.copy}</p>
              </div>
            ))}
          </div>
        </section>

        {/* How It Works */}
        <section style={{ marginTop: "3rem", marginBottom: "2rem" }}>
          <div style={{ textAlign: "center", marginBottom: "2rem" }}>
            <p style={{ fontSize: "0.65rem", color: "#4b5563", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "0.5rem" }}>How It Works</p>
            <h2 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#fff", margin: 0 }}>Seven states from bond to settlement.</h2>
            <p style={{ fontSize: "0.8rem", color: "#6b7280", marginTop: "0.5rem" }}>The AI never invents an amount. It interprets evidence and selects one outcome that both parties locked beforehand.</p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "0.5rem" }}>
            {[
              ["01", "Post", "Principal funds real GEN custody and names one agent."],
              ["02", "Lock", "Principal sets the partial completion band."],
              ["03", "Accept", "Agent accepts immutable brief and evidence origin."],
              ["04", "Deliver", "Agent submits proof-of-work as immutable snapshot."],
              ["05", "Challenge", "Principal reviews. Only Principal wallet can challenge."],
              ["06", "Judge", "GenLayer validators agree on the substantive outcome."],
              ["07", "Settle", "Contract pays once, conserves value, and closes."],
            ].map(([number, title, copy]) => (
              <div key={number} style={{ background: "#111118", borderRadius: "0.5rem", padding: "1rem 0.75rem", border: "1px solid #1e1e2e", textAlign: "center" }}>
                <span style={{ fontSize: "0.6rem", color: "#6366f1", fontFamily: "monospace" }}>{number}</span>
                <h3 style={{ fontSize: "0.8rem", color: "#fff", margin: "0.4rem 0" }}>{title}</h3>
                <p style={{ fontSize: "0.6rem", color: "#6b7280", margin: 0, lineHeight: 1.4 }}>{copy}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Footer */}
        <footer style={{ borderTop: "1px solid #1a1a2e", padding: "1.5rem 0", marginTop: "2rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "#6366f1" }}>AgentTask</span>
            <span style={{ fontSize: "0.7rem", color: "#4b5563", marginLeft: "0.5rem" }}>Bonded mandate lifecycle on GenLayer.</span>
          </div>
          <button onClick={() => { saveContractAddress(""); window.location.reload(); }} style={{ background: "transparent", color: "#4b5563", border: "1px solid #1e1e2e", padding: "0.35rem 0.75rem", borderRadius: "0.35rem", cursor: "pointer", fontSize: "0.7rem" }}>Clear runtime address</button>
        </footer>
      </main>
    </div>
  );
}

function F({ label, v, set, ph, wide }: { label: string; v: string; set: (s: string) => void; ph: string; wide?: boolean }) {
  return (
    <div>
      <label style={{ fontSize: "0.65rem", color: "#4b5563", textTransform: "uppercase", display: "block", marginBottom: "0.2rem" }}>{label}</label>
      {wide ? (
        <textarea value={v} onChange={(e) => set(e.target.value)} placeholder={ph} rows={2} style={{ width: "100%", background: "#0a0a0f", border: "1px solid #2a2a3e", borderRadius: "0.35rem", padding: "0.5rem 0.6rem", color: "#fff", fontSize: "0.8rem", outline: "none", resize: "vertical", boxSizing: "border-box" }} />
      ) : (
        <input value={v} onChange={(e) => set(e.target.value)} placeholder={ph} style={{ width: "100%", background: "#0a0a0f", border: "1px solid #2a2a3e", borderRadius: "0.35rem", padding: "0.5rem 0.6rem", color: "#fff", fontSize: "0.8rem", outline: "none", boxSizing: "border-box" }} />
      )}
    </div>
  );
}

const btn: React.CSSProperties = {
  background: "#6366f1", color: "#fff", border: "none",
  padding: "0.65rem 1.25rem", borderRadius: "0.35rem",
  cursor: "pointer", fontSize: "0.8rem", fontWeight: 600,
};
