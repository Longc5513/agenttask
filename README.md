# AgentTask

Bonded mandate lifecycle for autonomous agent work on GenLayer.

A principal posts a mandate with a GEN bond. An agent accepts, delivers, and gets paid — or the bond is slashed. AI adjudication resolves disputes.

## Contract

```
0x33E354284635b4462Eb3e9491923D7EC259a7712  (StudioNet 61999)
```

## Lifecycle

```
DRAFT ──→ OFFERED ──→ ACTIVE ──→ DELIVERED ──→ CHALLENGED/REVIEW_READY ──→ RULING_READY ──→ SETTLED
  │           │          │            │                    │
  └─ cancel   └─ cancel  └─ expire    └─ close_review      └─ adjudicate
```

| Phase | Who acts | What happens |
|-------|----------|-------------|
| DRAFT | Principal | Posts mandate + bond, sets partial band |
| OFFERED | Agent | Accepts mandate |
| ACTIVE | Agent | Submits deliverable |
| DELIVERED | Principal | Reviews or challenges |
| CHALLENGED | Either | AI adjudicates via consensus |
| RULING_READY | Either | Settles bond distribution |
| SETTLED | — | Done |

## Adjudication outcomes

| Outcome | Agent gets | Principal gets |
|---------|-----------|---------------|
| FULFILLED | 100% bond | 0% |
| PARTIAL | partial_pct% | remainder |
| REJECTED | 0% | 100% bond |
| UNAVAILABLE | recovery window | recovery window |

## API

### Write (payable)

```
open_mandate(agent, title, brief_url, brief_commitment, evidence_url, evidence_commitment)
```

### Write

```
lock_partial_band(mid, pct)     accept_mandate(mid)
submit_deliverable(mid, ...)    challenge_deliverable(mid, ...)
close_review(mid)               adjudicate(mid)
settle(mid)                     cancel_mandate(mid)
expire_mandate(mid)             approve_recovery(mid)
claim_recovery_timeout(mid)
```

### View

```
get_mandate(mid)    get_stats()
```

## Consensus

Uses `gl.eq_principle.prompt_comparative()` with equivalence principle:
> Two AgentTask rulings are equivalent only when they select the same outcome: FULFILLED, PARTIAL, REJECTED, or UNAVAILABLE.

Both leader and validator fetch brief + delivery + counter-evidence independently inside consensus via `gl.nondet.web.render()`.

## Settlement

Real GEN transfers via `_Recipient(addr).emit_transfer()`. No synthetic accounting.

## Tests

```
python -m pytest tests/ -v
```
