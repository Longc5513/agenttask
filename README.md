<p align="center">
  <img src="https://img.shields.io/badge/GenLayer-StudioNet_61999-6366f1?style=for-the-badge&logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PHBhdGggZmlsbD0iI2ZmZiIgZD0iTTEyIDJMMyA3djEwbDkgNSA5LTVIN0wxMiAyeiIvPjwvc3ZnPg==" alt="GenLayer" />
  <img src="https://img.shields.io/badge/Contract-LIVE-10b981?style=for-the-badge&logo=ethereum&logoColor=white" alt="Live" />
  <img src="https://img.shields.io/badge/Frontend-Next.js-000000?style=for-the-badge&logo=next.js&logoColor=white" alt="Next.js" />
  <img src="https://img.shields.io/badge/License-MIT-blue?style=for-the-badge" alt="MIT" />
</p>

<h1 align="center">AgentTask</h1>

<p align="center">
  <strong>Bonded mandate lifecycle for autonomous agent work on GenLayer</strong>
</p>

<p align="center">
  A principal posts a mandate with a GEN bond.<br/>
  An agent accepts, delivers, and gets paid — or the bond is slashed.<br/>
  AI adjudication resolves disputes through validator consensus.
</p>

<p align="center">
  <a href="https://agenttask.vercel.app">🔗 Live App</a> · <a href="https://explorer-studio.genlayer.com/address/0x33E354284635b4462Eb3e9491923D7EC259a7712">📜 Explorer</a> · <a href="#api">📖 API</a>
</p>

---

## Why GenLayer?

AgentTask could not work as a traditional smart contract. The AI jury independently fetches evidence from immutable sources (IPFS/Arweave), interprets delivery against a locked brief, and selects a financial outcome — all inside validator consensus. No single party controls the verdict.

---

## Architecture

<p align="center">
  <img src="https://agenttask.vercel.app/architecture.svg" alt="AgentTask Architecture" width="100%" />
</p>

---

## Lifecycle

```
DRAFT ──▶ OFFERED ──▶ ACTIVE ──▶ DELIVERED ──▶ CHALLENGED ──▶ RULING_READY ──▶ SETTLED
  │          │           │            │              │
  └─cancel   └─cancel    └─expire     └─close_review └─adjudicate
```

| # | Phase | Actor | Action | Bond Status |
|---|-------|-------|--------|-------------|
| 1 | `DRAFT` | Principal | Post mandate + GEN bond | Locked in contract |
| 2 | `OFFERED` | Principal | Lock partial band % | Band set |
| 3 | `ACTIVE` | Agent | Accept mandate | 30-day window |
| 4 | `DELIVERED` | Agent | Submit immutable snapshot | Delivery locked |
| 5 | `CHALLENGED` | Principal | Challenge with counter-evidence | Ready for AI |
| 6 | `RULING_READY` | Either | AI jury adjudicates | Verdict selected |
| 7 | `SETTLED` | Either | Settle bond distribution | Transferred |

---

## Adjudication Outcomes

| Outcome | Agent Receives | Principal Receives | Trigger |
|---------|---------------|-------------------|---------|
| `FULFILLED` | 100% bond | 0% | Delivery meets all requirements |
| `PARTIAL` | partial_pct% | remainder | Delivery meets some requirements |
| `REJECTED` | 0% | 100% bond | Delivery fails requirements |
| `UNAVAILABLE` | Recovery window | Recovery window | Evidence cannot be fetched |

---

## Consensus

Uses `gl.eq_principle.prompt_comparative()` with the equivalence principle:

> *"Two AgentTask rulings are equivalent only when they select the same outcome: FULFILLED, PARTIAL, REJECTED, or UNAVAILABLE."*

Both leader and validator independently fetch brief + delivery + counter-evidence inside consensus via `gl.nondet.web.render()`.

---

## Contract

```
0x33E354284635b4462Eb3e9491923D7EC259a7712  (StudioNet 61999)
```

| Method | Type | Description |
|--------|------|-------------|
| `open_mandate` | `@write.payable` | Post mandate with GEN bond |
| `lock_partial_band` | `@write` | Set partial completion % |
| `accept_mandate` | `@write` | Agent accepts the mandate |
| `submit_deliverable` | `@write` | Agent submits proof-of-work |
| `challenge_deliverable` | `@write` | Principal challenges delivery |
| `close_review` | `@write` | Close review window (auto-adjudicate) |
| `adjudicate` | `@write` | Run AI jury with consensus |
| `settle` | `@write` | Distribute bond per verdict |
| `cancel_mandate` | `@write` | Cancel unaccepted mandate |
| `expire_mandate` | `@write` | Expire past-deadline mandate |
| `approve_recovery` | `@write` | Both parties approve equal split |
| `claim_recovery_timeout` | `@write` | Claim after timeout |
| `get_mandate` | `@view` | Read mandate details |
| `get_stats` | `@view` | Read contract statistics |

---

## Settlement

Real GEN transfers via `_Recipient(addr).emit_transfer()`. No synthetic accounting — every settlement moves actual token value.

---

## Quick Start

```bash
# Clone
git clone https://github.com/Longc5513/agenttask.git
cd agenttask

# Install frontend
cd frontend && npm install

# Run dev server
npm run dev

# Run contract tests
cd ../tests && python -m pytest -v
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Contract | GenLayer Intelligent Contract (Python) |
| Consensus | `gl.eq_principle.prompt_comparative()` |
| Evidence | `gl.nondet.web.render()` — IPFS/Arweave fetch |
| Settlement | `emit_transfer()` — real GEN transfers |
| Frontend | Next.js 16 + TypeScript |
| SDK | `genlayer-js` 1.1.8 |
| Chain | StudioNet 61999 |
| Deploy | Vercel |

---

## Evidence Flow

```
Principal                    Contract                      Agent
    │                           │                            │
    │  open_mandate(bond)       │                            │
    │  + brief_url              │                            │
    │  + brief_commitment       │                            │
    │  + evidence_url           │                            │
    │  + evidence_commitment    │                            │
    │──────────────────────────▶│                            │
    │                           │                            │
    │  lock_partial_band(%)     │                            │
    │──────────────────────────▶│                            │
    │                           │                            │
    │                           │◀── accept_mandate ─────────│
    │                           │                            │
    │                           │◀── submit_deliverable ─────│
    │                           │    (delivery_url           │
    │                           │     delivery_commitment)   │
    │                           │                            │
    │  challenge_deliverable    │                            │
    │  (counter_url             │                            │
    │   counter_commitment)     │                            │
    │──────────────────────────▶│                            │
    │                           │                            │
    │                           │──▶ ADJUDICATE              │
    │                           │   gl.nondet.web.render()   │
    │                           │   fetch brief ────────────▶│ IPFS
    │                           │   fetch delivery ─────────▶│ IPFS
    │                           │   fetch counter ──────────▶│ Arweave
    │                           │                            │
    │                           │◀── FULFILLED/PARTIAL/      │
    │                           │    REJECTED/UNAVAILABLE    │
    │                           │                            │
    │                           │──▶ SETTLE                  │
    │                           │   emit_transfer(agent)     │
    │                           │   emit_transfer(principal) │
    │◀──────────────────────────│                            │
```

---

## License

MIT

---

<p align="center">
  Built on <a href="https://genlayer.com">GenLayer</a> — The Intelligence Layer of the Internet
</p>
