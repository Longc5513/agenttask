<div align="center">

<img src="https://raw.githubusercontent.com/Longc5513/agenttask/master/frontend/public/agentbot.gif" width="120" alt="AgentTask AgentBot"/>

# AgentTask

### Bonded Mandate Lifecycle for Autonomous Agent Work on GenLayer

[![GenLayer](https://img.shields.io/badge/GenLayer-StudioNet_61999-6366f1?style=flat-square&logo=ethereum&logoColor=white)](https://explorer-studio.genlayer.com/address/0x33E354284635b4462Eb3e9491923D7EC259a7712)
[![License: MIT](https://img.shields.io/badge/License-MIT-10b981?style=flat-square)](LICENSE)
[![Deploy](https://img.shields.io/badge/Deploy-Vercel-000?style=flat-square&logo=vercel&logoColor=white)](https://agenttask.vercel.app)

A principal posts a mandate with a **GEN bond**. An agent accepts, delivers, and gets paid — or the bond is slashed. **AI adjudication** resolves disputes through validator consensus.

<br/>

[**🚀 Live App**](https://agenttask.vercel.app) · [**🔍 Explorer**](https://explorer-studio.genlayer.com/address/0x33E354284635b4462Eb3e9491923D7EC259a7712) · [**📄 Contract**](contracts/AgentTask.py)

</div>

---

## Lifecycle

<img src="docs/lifecycle.svg" alt="AgentTask Lifecycle" width="100%"/>

| Phase | Who Acts | What Happens |
|:------|:---------|:-------------|
| **DRAFT** | Principal | Posts mandate + GEN bond, sets partial band |
| **OFFERED** | Agent | Accepts mandate within deadline |
| **ACTIVE** | Agent | Submits deliverable with immutable proof |
| **DELIVERED** | Principal | Reviews or challenges with counter-evidence |
| **CHALLENGED** | Either | AI jury adjudicates via validator consensus |
| **RULING_READY** | Either | Settles bond distribution |
| **SETTLED** | — | Done. Real GEN transferred. |

---

## AI Adjudication

<img src="docs/outcomes.svg" alt="Adjudication Outcomes" width="100%"/>

The contract uses **GenLayer's equivalence principle** — validators independently fetch evidence via `gl.nondet.web.render()` and reach consensus through `gl.eq_principle.prompt_comparative()`.

```
Validators fetch brief + delivery + counter-evidence
independently INSIDE the consensus block — no single backend opinion.
```

---

## Architecture

<img src="docs/architecture.svg" alt="System Architecture" width="100%"/>

---

## Contract

```
0x33E354284635b4462Eb3e9491923D7EC259a7712  (StudioNet 61999)
```

### Write (payable)
```python
open_mandate(agent, title, brief_url, brief_commitment, evidence_url, evidence_commitment)
```

### Write
```python
lock_partial_band(mid, pct)      accept_mandate(mid)
submit_deliverable(mid, ...)     challenge_deliverable(mid, ...)
close_review(mid)                adjudicate(mid)
settle(mid)                      cancel_mandate(mid)
expire_mandate(mid)              approve_recovery(mid)
claim_recovery_timeout(mid)
```

### View
```python
get_mandate(mid)    get_stats()
```

---

## Project Structure

```
agenttask/
├── contracts/
│   └── AgentTask.py              # Intelligent contract (Python)
├── frontend/
│   ├── src/
│   │   ├── app/page.tsx          # Main UI — 3 tabs
│   │   └── lib/genlayer.ts       # genlayer-js SDK wrapper
│   ├── public/
│   │   ├── sample-data.json      # 20 test scenarios
│   │   ├── agentbot.gif          # AgentBot mascot
│   │   └── bg.gif                # Animated background
│   └── package.json              # genlayer-js 1.1.8
├── tests/
│   └── test_agenttask.py         # Contract tests
├── docs/
│   ├── lifecycle.svg             # Lifecycle diagram
│   ├── architecture.svg          # Architecture diagram
│   └── outcomes.svg              # Adjudication outcomes
└── README.md
```

---

## Quick Start

### Prerequisites
- OKX or MetaMask wallet
- GEN tokens on StudioNet (chain `61999`)

### Run Locally
```bash
git clone https://github.com/Longc5513/agenttask.git
cd agenttask/frontend
npm install
npm run dev
```

### Deploy Contract
```bash
genlayer deploy --contract contracts/AgentTask.py
```

### Run Tests
```bash
python -m pytest tests/ -v
```

---

## Key Design Decisions

| Decision | Rationale |
|:---------|:----------|
| **Content-addressed evidence** | Briefs, deliveries, and counter-evidence use IPFS/Arweave hashes — immutable and verifiable |
| **Real GEN transfers** | `emit_transfer()` for actual value movement, not synthetic accounting |
| **genlayer-js SDK** | Official SDK for proper GenLayer transaction serialization |
| **Equivalence principle** | Validators compare material interpretation, not surface wording |
| **Bounded recovery** | Both parties can agree to 50/50 split if evidence is unavailable |

---

<div align="center">

**Built on [GenLayer](https://genlayer.com)** · [MIT License](LICENSE)

</div>
