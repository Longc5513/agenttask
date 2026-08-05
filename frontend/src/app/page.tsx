"use client";

import {
  Activity,
  ArrowRight,
  CheckCircle2,
  CircleDollarSign,
  CloudCog,
  ExternalLink,
  FileLock2,
  Gauge,
  LoaderCircle,
  RadioTower,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Siren,
  Wallet,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PulseField } from "@/components/PulseField";
import { Reveal } from "@/components/Reveal";
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

type ActionKey =
  | "OPEN"
  | "BANDS"
  | "ACTIVATE"
  | "DELIVERY"
  | "CHALLENGE"
  | "CLOSE"
  | "REVIEW"
  | "SETTLE"
  | "RECOVERY"
  | "TIMEOUT";

const emptyStats: ContractStats = {
  mandate_count: "0",
  total_bonded: "0",
  active_bond: "0",
  agent_paid: "0",
  principal_refunded: "0",
};

function parseJson<T>(value: unknown): T {
  if (typeof value === "string") return JSON.parse(value) as T;
  return value as T;
}

function short(value: string, left = 7, right = 5) {
  if (!value || value.length <= left + right + 3) return value || "Not set";
  return `${value.slice(0, left)}...${value.slice(-right)}`;
}

function nextAction(status?: string): ActionKey {
  if (!status) return "OPEN";
  if (status === "DRAFT") return "BANDS";
  if (status === "OFFERED") return "ACTIVATE";
  if (status === "ACTIVE") return "DELIVERY";
  if (status === "DELIVERED") return "CHALLENGE";
  if (status === "REVIEW_READY") return "REVIEW";
  if (status === "RULING_READY") return "SETTLE";
  if (status === "EVIDENCE_UNAVAILABLE") return "RECOVERY";
  return "OPEN";
}

function actionLabel(action: ActionKey) {
  return {
    OPEN: "Open principal bond",
    BANDS: "Lock payout bands",
    ACTIVATE: "Accept MANDATE",
    DELIVERY: "Report incident",
    CHALLENGE: "Attach principal response",
    CLOSE: "Close response window",
    REVIEW: "Run GenLayer jury",
    SETTLE: "Distribute bond",
    RECOVERY: "Approve neutral recovery",
    TIMEOUT: "Claim expired recovery",
  }[action];
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  wide = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  wide?: boolean;
}) {
  return (
    <label className={wide ? "field field-wide" : "field"}>
      <span>{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}

export default function Home() {
  const [address, setAddress] = useState<string>(() => contractAddress());
  const [addressDraft, setAddressDraft] = useState<string>(() => contractAddress());
  const [wallet, setWallet] = useState("");
  const [stats, setStats] = useState<ContractStats>(emptyStats);
  const [sla, setSla] = useState<MandateRecord | null>(null);
  const [slaId, setSlaId] = useState("0");
  const [activeAction, setActiveAction] = useState<ActionKey>("OPEN");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<TxResult | null>(null);

  const [agent, setAgent] = useState("");
  const [service, setService] = useState("");
  const [termsUrl, setTermsUrl] = useState("");
  const [termsCommitment, setTermsCommitment] = useState("");
  const [statusOrigin, setStatusOrigin] = useState("");
  const [monitorOrigin, setMonitorOrigin] = useState("");
  const [bond, setBond] = useState("1");
  const [minor, setMinor] = useState("0.2");
  const [major, setMajor] = useState("0.6");
  const [windowNote, setWindowNote] = useState("");
  const [monitorSnapshot, setMonitorSnapshot] = useState("");
  const [monitorCommitment, setMonitorCommitment] = useState("");
  const [statusSnapshot, setStatusSnapshot] = useState("");
  const [statusCommitment, setStatusCommitment] = useState("");
  const [principalSnapshot, setPrincipalSnapshot] = useState("");
  const [principalCommitment, setPrincipalCommitment] = useState("");
  const [principalNote, setPrincipalNote] = useState("");

  const loadSla = useCallback(async (id = slaId) => {
    if (!contractAddress()) return;
    const result = await readContract("get_sla", [BigInt(id || "0")]);
    if (!result.success) {
      setNotice(result);
      return;
    }
    try {
      const record = parseJson<MandateRecord>(result.data);
      if (!record.id && record.id !== "0") throw new Error("MANDATE was not found.");
      setSla(record);
      setActiveAction(nextAction(record.status));
      setNotice({ success: true, data: `MANDATE #${record.id} received from Studionet.` });
    } catch (error) {
      setNotice({
        success: false,
        error: error instanceof Error ? error.message : "Could not parse the MANDATE record.",
      });
    }
  }, [slaId]);

  const syncStats = useCallback(async () => {
    const current = contractAddress();
    if (!current) return;
    const result = await readContract("get_stats");
    if (!result.success) {
      setNotice(result);
      return;
    }
    try {
      setStats(parseJson<ContractStats>(result.data));
      setNotice({ success: true, data: "Live contract telemetry refreshed." });
    } catch {
      setNotice({ success: false, error: "The contract returned unreadable telemetry." });
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void syncStats();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [syncStats]);

  async function handleWallet() {
    const result = await connectWallet();
    setNotice(result);
    if (result.success) setWallet(String(result.data));
  }

  async function useAddress() {
    const value = addressDraft.trim();
    if (!/^0x[a-fA-F0-9]{40}$/.test(value)) {
      setNotice({ success: false, error: "Enter a valid 42-character contract address." });
      return;
    }
    saveContractAddress(value);
    setAddress(value);
    setSla(null);
    await syncStats();
  }

  async function runAction() {
    setBusy(true);
    setNotice(null);
    try {
      let result: TxResult;
      const id = BigInt(slaId || "0");
      if (activeAction === "OPEN") {
        result = await writeContract(
          "open_sla",
          [agent, service, termsUrl, termsCommitment, statusOrigin, monitorOrigin],
          parseGen(bond),
        );
      } else if (activeAction === "BANDS") {
        result = await writeContract("lock_payout_bands", [
          id,
          parseGen(minor),
          parseGen(major),
        ]);
      } else if (activeAction === "ACTIVATE") {
        result = await writeContract("activate_sla", [id]);
      } else if (activeAction === "DELIVERY") {
        result = await writeContract("report_incident", [
          id,
          windowNote,
          monitorSnapshot,
          monitorCommitment,
          statusSnapshot,
          statusCommitment,
        ]);
      } else if (activeAction === "CHALLENGE") {
        result = await writeContract("respond_incident", [
          id,
          principalSnapshot,
          principalCommitment,
          principalNote,
        ]);
      } else if (activeAction === "CLOSE") {
        result = await writeContract("close_response_window", [id]);
      } else if (activeAction === "REVIEW") {
        result = await writeContract("adjudicate_incident", [id]);
      } else if (activeAction === "SETTLE") {
        result = await writeContract("settle_incident", [id]);
      } else if (activeAction === "TIMEOUT") {
        result = await writeContract("claim_recovery_timeout", [id]);
      } else {
        result = await writeContract("approve_recovery", [id]);
      }
      setNotice(result);
      if (result.success) {
        await syncStats();
        if (activeAction === "OPEN") {
          const createdId = stats.mandate_count;
          setSlaId(createdId);
          await loadSla(createdId);
        } else {
          await loadSla();
        }
      }
    } catch (error) {
      setNotice({
        success: false,
        error: error instanceof Error ? error.message : "Action failed.",
      });
    } finally {
      setBusy(false);
    }
  }

  const activeBond = useMemo(() => {
    try {
      return formatGen(sla?.bond ?? stats.active_bond);
    } catch {
      return "0.00";
    }
  }, [sla?.bond, stats.active_bond]);

  return (
    <main>
      <header className="site-header">
        <a className="brand" href="#top" aria-label="AgentTask home">
          <span className="brand-mark"><Activity size={20} /></span>
          <span>AgentTask</span>
        </a>
        <nav aria-label="Primary navigation">
          <a href="#desk">MANDATE desk</a>
          <a href="#evidence">Evidence</a>
          <a href="#how">How it works</a>
        </nav>
        <button className="wallet-button" type="button" onClick={handleWallet}>
          <Wallet size={17} />
          {wallet ? short(wallet) : "Connect wallet"}
        </button>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow"><span /> Principal-backed reliability</p>
          <h1>Uptime promises should carry consequences.</h1>
          <p className="hero-description">
            Principals lock a real GEN bond. GenLayer reads immutable incident evidence,
            interprets the MANDATE, and releases the exact pre-committed payout band.
          </p>
          <div className="hero-actions">
            <a className="primary-link" href="#desk">
              Open MANDATE desk <ArrowRight size={17} />
            </a>
            <span className="network-label">
              <span className="network-dot" /> Studionet
            </span>
          </div>
        </div>
        <PulseField
          service={sla?.service}
          status={sla?.status}
          bond={activeBond}
        />
      </section>

      <section className="metric-band" aria-label="Live contract metrics">
        <div><span>Agreements</span><strong>{stats.mandate_count}</strong></div>
        <div><span>Active custody</span><strong>{formatGen(stats.active_bond)} GEN</strong></div>
        <div><span>Agent paid</span><strong>{formatGen(stats.agent_paid)} GEN</strong></div>
        <div><span>Principal returned</span><strong>{formatGen(stats.principal_refunded)} GEN</strong></div>
      </section>

      <section className="desk-section" id="desk">
        <Reveal className="section-heading">
          <p className="eyebrow"><span /> Live contract workflow</p>
          <h2>One desk. One valid next action.</h2>
          <p>
            The console reads the selected MANDATE and exposes only the action its on-chain
            state permits.
          </p>
        </Reveal>

        <Reveal className="connection-strip">
          <div>
            <span className="connection-label">Studionet contract</span>
            <strong>{address ? short(address, 10, 8) : "Awaiting deployment"}</strong>
          </div>
          <div className="address-controls">
            <input
              aria-label="Runtime contract address"
              value={addressDraft}
              onChange={(event) => setAddressDraft(event.target.value)}
              placeholder="0x..."
            />
            <button type="button" onClick={useAddress}>
              <RefreshCw size={16} /> Use & sync
            </button>
            {address && (
              <a
                href={explorerContract(address)}
                target="_blank"
                rel="noreferrer"
                aria-label="Open contract in Explorer"
              >
                <ExternalLink size={16} />
              </a>
            )}
          </div>
        </Reveal>

        <div className="desk-grid">
          <Reveal className="record-panel">
            <div className="record-heading">
              <div>
                <span>Selected agreement</span>
                <h3>{sla ? sla.service : "No MANDATE selected"}</h3>
              </div>
              <div className="record-loader">
                <input
                  aria-label="MANDATE ID"
                  value={slaId}
                  onChange={(event) => setSlaId(event.target.value.replace(/\D/g, ""))}
                />
                <button type="button" onClick={() => void loadSla()}>
                  Load
                </button>
              </div>
            </div>

            <div className="status-row">
              <span className="status-badge">{sla?.status ?? "UNBOUND"}</span>
              <span>{sla?.decision ?? "PENDING"}</span>
            </div>

            <div className="record-data">
              <div><span>Principal</span><strong>{short(sla?.principal ?? "")}</strong></div>
              <div><span>Agent</span><strong>{short(sla?.agent ?? "")}</strong></div>
              <div><span>Bond</span><strong>{activeBond} GEN</strong></div>
              <div>
                <span>Payout bands</span>
                <strong>
                  {sla
                    ? `${formatGen(sla.partial_pct)} / ${formatGen(sla.partial_band)} / full`
                    : "Not locked"}
                </strong>
              </div>
            </div>

            <div className="reason-block">
              <RadioTower size={18} />
              <p>{sla?.reason ?? "Set a contract address, then load an agreement or open a new bond."}</p>
            </div>
          </Reveal>

          <Reveal className="action-dock">
            <div className="action-title">
              <div>
                <span>Primary action</span>
                <h3>{actionLabel(activeAction)}</h3>
              </div>
              <span className="action-code">{activeAction}</span>
            </div>

            <div className="action-switcher" aria-label="Contract action selector">
              {(["OPEN", "BANDS", "ACTIVATE", "DELIVERY", "CHALLENGE", "REVIEW", "SETTLE", "RECOVERY"] as ActionKey[]).map((item) => (
                <button
                  type="button"
                  key={item}
                  className={activeAction === item ? "active" : ""}
                  onClick={() => setActiveAction(item)}
                  title={actionLabel(item)}
                >
                  {item.slice(0, 3)}
                </button>
              ))}
            </div>

            <div className="form-grid">
              {activeAction === "OPEN" && (
                <>
                  <Field label="Agent wallet" value={agent} onChange={setAgent} placeholder="0x..." />
                  <Field label="Service name" value={service} onChange={setService} placeholder="Production API" />
                  <Field label="Immutable MANDATE terms" value={termsUrl} onChange={setTermsUrl} placeholder="https://arweave.net/..." wide />
                  <Field label="Terms commitment" value={termsCommitment} onChange={setTermsCommitment} placeholder="content:..." wide />
                  <Field label="Principal status origin" value={statusOrigin} onChange={setStatusOrigin} placeholder="https://status.vendor.com" />
                  <Field label="Independent monitor origin" value={monitorOrigin} onChange={setMonitorOrigin} placeholder="https://monitor.example.org" />
                  <Field label="Principal bond (GEN)" value={bond} onChange={setBond} type="number" />
                </>
              )}
              {activeAction === "BANDS" && (
                <>
                  <Field label="Minor payout (GEN)" value={minor} onChange={setMinor} type="number" />
                  <Field label="Major payout (GEN)" value={major} onChange={setMajor} type="number" />
                </>
              )}
              {activeAction === "DELIVERY" && (
                <>
                  <label className="field field-wide">
                    <span>Incident window and observed impact</span>
                    <textarea value={windowNote} onChange={(event) => setWindowNote(event.target.value)} />
                  </label>
                  <Field label="Monitor snapshot" value={monitorSnapshot} onChange={setMonitorSnapshot} placeholder="https://ipfs.io/ipfs/..." />
                  <Field label="Monitor commitment" value={monitorCommitment} onChange={setMonitorCommitment} placeholder="content:..." />
                  <Field label="Status snapshot" value={statusSnapshot} onChange={setStatusSnapshot} placeholder="https://arweave.net/..." />
                  <Field label="Status commitment" value={statusCommitment} onChange={setStatusCommitment} placeholder="content:..." />
                </>
              )}
              {activeAction === "CHALLENGE" && (
                <>
                  <Field label="Principal incident snapshot" value={principalSnapshot} onChange={setPrincipalSnapshot} placeholder="https://arweave.net/..." wide />
                  <Field label="Principal commitment" value={principalCommitment} onChange={setPrincipalCommitment} placeholder="content:..." wide />
                  <label className="field field-wide">
                    <span>Principal response</span>
                    <textarea value={principalNote} onChange={(event) => setPrincipalNote(event.target.value)} />
                  </label>
                  <button className="quiet-inline" type="button" onClick={() => setActiveAction("CLOSE")}>
                    Response window expired? Use timeout path
                  </button>
                </>
              )}
              {["ACTIVATE", "CLOSE", "REVIEW", "SETTLE", "RECOVERY", "TIMEOUT"].includes(activeAction) && (
                <div className="confirmation-copy">
                  <ShieldCheck size={24} />
                  <p>
                    This action uses MANDATE #{slaId || "0"} and the connected wallet.
                    The contract will enforce role, state, deadline, and custody rules.
                  </p>
                </div>
              )}
              {activeAction === "REVIEW" && (
                <button className="quiet-inline" type="button" onClick={() => setActiveAction("RECOVERY")}>
                  Jury cannot reach consensus? Approve mutual bond recovery
                </button>
              )}
              {activeAction === "RECOVERY" && (
                <button className="quiet-inline" type="button" onClick={() => setActiveAction("TIMEOUT")}>
                  Recovery deadline elapsed? Claim the neutral principal refund
                </button>
              )}
            </div>

            {notice && (
              <div className={notice.success ? "notice success" : "notice error"}>
                <span>{notice.success ? <CheckCircle2 size={17} /> : <Siren size={17} />}</span>
                <div>
                  <strong>{notice.success ? "On-chain response" : "Action stopped"}</strong>
                  <p>{String(notice.data ?? notice.error ?? "No details returned.")}</p>
                  {notice.hash && (
                    <a href={explorerTx(notice.hash)} target="_blank" rel="noreferrer">
                      View transaction <ExternalLink size={13} />
                    </a>
                  )}
                </div>
              </div>
            )}

            <button className="primary-action" type="button" onClick={runAction} disabled={busy}>
              {busy ? <LoaderCircle className="spin" size={18} /> : <CircleDollarSign size={18} />}
              {busy ? "Waiting for ACCEPTED" : actionLabel(activeAction)}
              {!busy && <ArrowRight size={18} />}
            </button>
          </Reveal>
        </div>
      </section>

      <section className="evidence-section" id="evidence">
        <Reveal className="section-heading">
          <p className="eyebrow"><span /> Evidence roles</p>
          <h2>Mutable pages inform. Immutable snapshots decide.</h2>
        </Reveal>
        <div className="evidence-grid">
          {[
            {
              icon: <FileLock2 />,
              label: "MANDATE terms",
              copy: "Principal locks the exact uptime threshold, incident window, and band definitions before acceptance.",
            },
            {
              icon: <Gauge />,
              label: "Independent monitor",
              copy: "Agent binds a content-addressed outage snapshot to the exact agreement and incident.",
            },
            {
              icon: <CloudCog />,
              label: "Principal status",
              copy: "The principal may answer with its own immutable incident record inside a bounded response window.",
            },
          ].map((item, index) => (
            <Reveal className="evidence-item" key={item.label}>
              <span className="evidence-index">0{index + 1}</span>
              <div className="evidence-icon">{item.icon}</div>
              <h3>{item.label}</h3>
              <p>{item.copy}</p>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="how-section" id="how">
        <Reveal className="how-intro">
          <p className="eyebrow"><span /> How it works</p>
          <h2>Five states from promise to consequence.</h2>
          <p>
            The AI never invents an amount. It interprets evidence and selects one
            economic band that both parties locked beforehand.
          </p>
        </Reveal>
        <div className="lifecycle">
          {[
            ["01", "Bond", "Principal funds real GEN custody and names one agent."],
            ["02", "Accept", "Agent accepts immutable terms and fixed payout bands."],
            ["03", "Capture", "Incident evidence is frozen by role and content identifier."],
            ["04", "Judge", "GenLayer validators agree on the substantive breach band."],
            ["05", "Settle", "Contract pays once, conserves value, and closes the MANDATE."],
          ].map(([number, title, copy]) => (
            <Reveal className="lifecycle-step" key={number}>
              <span>{number}</span>
              <h3>{title}</h3>
              <p>{copy}</p>
            </Reveal>
          ))}
        </div>
      </section>

      <footer>
        <div className="brand">
          <span className="brand-mark"><Activity size={18} /></span>
          <span>AgentTask</span>
        </div>
        <p>Reliability adjudication and real MANDATE custody on GenLayer.</p>
        <button type="button" onClick={() => {
          saveContractAddress("");
          setAddress("");
          setAddressDraft("");
          setSla(null);
          setStats(emptyStats);
        }}>
          <RotateCcw size={15} /> Clear runtime address
        </button>
      </footer>
    </main>
  );
}
