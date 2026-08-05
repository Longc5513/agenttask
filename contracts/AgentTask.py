# v1.0.0
# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
from genlayer import *
import typing
import json


@gl.evm.contract_interface
class _Recipient:
    class View:
        pass

    class Write:
        pass


class AgentTask(gl.Contract):
    mandate_count: u256
    mandate_principal: TreeMap[u256, str]
    mandate_agent: TreeMap[u256, str]
    mandate_title: TreeMap[u256, str]
    mandate_brief_url: TreeMap[u256, str]
    mandate_brief_commitment: TreeMap[u256, str]
    mandate_evidence_url: TreeMap[u256, str]
    mandate_evidence_commitment: TreeMap[u256, str]
    mandate_bond: TreeMap[u256, u256]
    mandate_partial_pct: TreeMap[u256, u256]
    mandate_status: TreeMap[u256, str]
    mandate_decision: TreeMap[u256, str]
    mandate_reason: TreeMap[u256, str]
    mandate_deadline: TreeMap[u256, u256]
    mandate_delivery_note: TreeMap[u256, str]
    mandate_delivery_url: TreeMap[u256, str]
    mandate_delivery_commitment: TreeMap[u256, str]
    mandate_counter_url: TreeMap[u256, str]
    mandate_counter_commitment: TreeMap[u256, str]
    mandate_counter_note: TreeMap[u256, str]
    mandate_agent_paid: TreeMap[u256, u256]
    mandate_principal_refunded: TreeMap[u256, u256]

    total_bonded: u256
    active_bond: u256
    total_agent_paid: u256
    total_principal_refunded: u256

    def __init__(self):
        self.mandate_count = u256(0)
        self.total_bonded = u256(0)
        self.active_bond = u256(0)
        self.total_agent_paid = u256(0)
        self.total_principal_refunded = u256(0)

    def _now(self) -> u256:
        raw = str(gl.message_raw["datetime"])
        year = int(raw[0:4])
        month = int(raw[5:7])
        day = int(raw[8:10])
        hour = int(raw[11:13])
        minute = int(raw[14:16])
        second = int(raw[17:19])
        adjusted_year = year - (1 if month <= 2 else 0)
        era = adjusted_year // 400
        year_of_era = adjusted_year - era * 400
        shifted_month = month - 3 if month > 2 else month + 9
        day_of_year = (153 * shifted_month + 2) // 5 + day - 1
        day_of_era = (
            year_of_era * 365
            + year_of_era // 4
            - year_of_era // 100
            + day_of_year
        )
        days_since_epoch = era * 146097 + day_of_era - 719468
        return u256(days_since_epoch * 86400 + hour * 3600 + minute * 60 + second)

    def _valid_address(self, value: str) -> bool:
        return value.startswith("0x") and len(value) == 42

    def _valid_https(self, value: str) -> bool:
        return value.startswith("https://") and len(value) <= 500

    def _source_id(self, value: str) -> str:
        lowered = value.lower()
        if lowered.startswith("https://ipfs.io/ipfs/"):
            return lowered[len("https://ipfs.io/ipfs/"):].split("/")[0]
        if lowered.startswith("https://arweave.net/"):
            return lowered[len("https://arweave.net/"):].split("/")[0]
        return ""

    def _valid_source(self, value: str) -> bool:
        source_id = self._source_id(value)
        return (
            len(value) <= 500
            and len(source_id) >= 32
            and "example" not in source_id
            and "replace" not in source_id
        )

    def _valid_commitment(self, url: str, commitment: str) -> bool:
        source_id = self._source_id(url)
        return source_id != "" and commitment.lower() == ("content:" + source_id)

    def _is_party(self, mid: u256, sender: str) -> bool:
        return (
            sender == self.mandate_principal[mid]
            or sender == self.mandate_agent[mid]
        )

    def _refund_principal(self, mid: u256, terminal_status: str, reason: str) -> str:
        amount = self.mandate_bond[mid]
        if amount == u256(0) or amount > self.balance:
            raise gl.vm.UserError("BOND_INVARIANT_BROKEN")
        principal = self.mandate_principal[mid]
        self.mandate_bond[mid] = u256(0)
        self.active_bond = self.active_bond - amount
        self.total_principal_refunded = self.total_principal_refunded + amount
        self.mandate_principal_refunded[mid] = amount
        self.mandate_status[mid] = terminal_status
        self.mandate_reason[mid] = reason
        _Recipient(Address(principal)).emit_transfer(value=amount)
        return terminal_status

    @gl.public.write.payable
    def open_mandate(
        self,
        agent_address: str,
        mandate_title: str,
        brief_url: str,
        brief_commitment: str,
        evidence_url: str,
        evidence_commitment: str,
    ) -> typing.Any:
        principal = gl.message.sender_address.as_hex.lower()
        agent = agent_address.lower()
        amount = gl.message.value
        if not self._valid_address(agent) or agent == principal:
            raise gl.vm.UserError("INVALID_AGENT")
        if len(mandate_title) < 4 or len(mandate_title) > 120:
            raise gl.vm.UserError("INVALID_TITLE")
        if not self._valid_source(brief_url):
            raise gl.vm.UserError("IMMUTABLE_BRIEF_REQUIRED")
        if not self._valid_commitment(brief_url, brief_commitment):
            raise gl.vm.UserError("BRIEF_COMMITMENT_MISMATCH")
        if not self._valid_source(evidence_url):
            raise gl.vm.UserError("IMMUTABLE_EVIDENCE_ORIGIN_REQUIRED")
        if not self._valid_commitment(evidence_url, evidence_commitment):
            raise gl.vm.UserError("EVIDENCE_COMMITMENT_MISMATCH")
        if amount == u256(0):
            raise gl.vm.UserError("BOND_REQUIRED")

        mid = self.mandate_count
        self.mandate_principal[mid] = principal
        self.mandate_agent[mid] = agent
        self.mandate_title[mid] = mandate_title
        self.mandate_brief_url[mid] = brief_url
        self.mandate_brief_commitment[mid] = brief_commitment.lower()
        self.mandate_evidence_url[mid] = evidence_url
        self.mandate_evidence_commitment[mid] = evidence_commitment.lower()
        self.mandate_bond[mid] = amount
        self.mandate_partial_pct[mid] = u256(0)
        self.mandate_status[mid] = "DRAFT"
        self.mandate_decision[mid] = "PENDING"
        self.mandate_reason[mid] = "Principal bond received; partial band must be locked."
        self.mandate_deadline[mid] = self._now() + u256(172800)
        self.mandate_delivery_note[mid] = ""
        self.mandate_delivery_url[mid] = ""
        self.mandate_delivery_commitment[mid] = ""
        self.mandate_counter_url[mid] = ""
        self.mandate_counter_commitment[mid] = ""
        self.mandate_counter_note[mid] = ""
        self.mandate_agent_paid[mid] = u256(0)
        self.mandate_principal_refunded[mid] = u256(0)
        self.total_bonded = self.total_bonded + amount
        self.active_bond = self.active_bond + amount
        self.mandate_count = mid + u256(1)
        return mid

    @gl.public.write
    def lock_partial_band(
        self,
        mid: u256,
        partial_pct: u256,
    ) -> str:
        if mid >= self.mandate_count:
            raise gl.vm.UserError("MANDATE_NOT_FOUND")
        if gl.message.sender_address.as_hex.lower() != self.mandate_principal[mid]:
            raise gl.vm.UserError("PRINCIPAL_ONLY")
        if self.mandate_status[mid] != "DRAFT":
            raise gl.vm.UserError("BAND_ALREADY_LOCKED")
        if partial_pct == u256(0) or partial_pct >= u256(100):
            raise gl.vm.UserError("INVALID_PARTIAL_PCT")
        self.mandate_partial_pct[mid] = partial_pct
        self.mandate_status[mid] = "OFFERED"
        self.mandate_reason[mid] = "Partial band locked; mandate is open for agent acceptance."
        return "OFFERED"

    @gl.public.write
    def accept_mandate(self, mid: u256) -> str:
        if mid >= self.mandate_count:
            raise gl.vm.UserError("MANDATE_NOT_FOUND")
        if gl.message.sender_address.as_hex.lower() != self.mandate_agent[mid]:
            raise gl.vm.UserError("AGENT_ONLY")
        if self.mandate_status[mid] != "OFFERED":
            raise gl.vm.UserError("MANDATE_NOT_OFFERED")
        if self._now() > self.mandate_deadline[mid]:
            raise gl.vm.UserError("OFFER_EXPIRED")
        self.mandate_status[mid] = "ACTIVE"
        self.mandate_deadline[mid] = self._now() + u256(2592000)
        self.mandate_reason[mid] = "Agent accepted the mandate; delivery window is 30 days."
        return "ACTIVE"

    @gl.public.write
    def submit_deliverable(
        self,
        mid: u256,
        delivery_note: str,
        delivery_url: str,
        delivery_commitment: str,
    ) -> str:
        if mid >= self.mandate_count:
            raise gl.vm.UserError("MANDATE_NOT_FOUND")
        if gl.message.sender_address.as_hex.lower() != self.mandate_agent[mid]:
            raise gl.vm.UserError("AGENT_ONLY")
        if self.mandate_status[mid] != "ACTIVE":
            raise gl.vm.UserError("MANDATE_NOT_ACTIVE")
        if self._now() > self.mandate_deadline[mid]:
            raise gl.vm.UserError("DELIVERY_DEADLINE_PASSED")
        if len(delivery_note) < 40 or len(delivery_note) > 1200:
            raise gl.vm.UserError("INVALID_DELIVERY_NOTE")
        if not self._valid_source(delivery_url):
            raise gl.vm.UserError("IMMUTABLE_DELIVERY_SNAPSHOT_REQUIRED")
        if not self._valid_commitment(delivery_url, delivery_commitment):
            raise gl.vm.UserError("DELIVERY_COMMITMENT_MISMATCH")

        self.mandate_delivery_note[mid] = delivery_note
        self.mandate_delivery_url[mid] = delivery_url
        self.mandate_delivery_commitment[mid] = delivery_commitment.lower()
        self.mandate_status[mid] = "DELIVERED"
        self.mandate_deadline[mid] = self._now() + u256(86400)
        self.mandate_reason[mid] = "Agent deliverable locked; principal review window is open."
        return "DELIVERED"

    @gl.public.write
    def challenge_deliverable(
        self,
        mid: u256,
        counter_url: str,
        counter_commitment: str,
        counter_note: str,
    ) -> str:
        if mid >= self.mandate_count:
            raise gl.vm.UserError("MANDATE_NOT_FOUND")
        if gl.message.sender_address.as_hex.lower() != self.mandate_principal[mid]:
            raise gl.vm.UserError("PRINCIPAL_ONLY")
        if self.mandate_status[mid] != "DELIVERED":
            raise gl.vm.UserError("DELIVERABLE_NOT_SUBMITTED")
        if self._now() > self.mandate_deadline[mid]:
            raise gl.vm.UserError("REVIEW_WINDOW_CLOSED")
        if not self._valid_source(counter_url):
            raise gl.vm.UserError("IMMUTABLE_COUNTER_EVIDENCE_REQUIRED")
        if not self._valid_commitment(counter_url, counter_commitment):
            raise gl.vm.UserError("COUNTER_COMMITMENT_MISMATCH")
        if len(counter_note) < 30 or len(counter_note) > 1000:
            raise gl.vm.UserError("INVALID_COUNTER_NOTE")

        self.mandate_counter_url[mid] = counter_url
        self.mandate_counter_commitment[mid] = counter_commitment.lower()
        self.mandate_counter_note[mid] = counter_note
        self.mandate_status[mid] = "CHALLENGED"
        self.mandate_deadline[mid] = self._now() + u256(3600)
        self.mandate_reason[mid] = "Both evidence roles locked; validator adjudication is ready."
        return "CHALLENGED"

    @gl.public.write
    def close_review(self, mid: u256) -> str:
        if mid >= self.mandate_count:
            raise gl.vm.UserError("MANDATE_NOT_FOUND")
        if gl.message.sender_address.as_hex.lower() != self.mandate_principal[mid]:
            raise gl.vm.UserError("PRINCIPAL_ONLY")
        if self.mandate_status[mid] != "DELIVERED":
            raise gl.vm.UserError("DELIVERABLE_NOT_SUBMITTED")
        if self._now() <= self.mandate_deadline[mid]:
            raise gl.vm.UserError("REVIEW_WINDOW_OPEN")
        self.mandate_status[mid] = "REVIEW_READY"
        self.mandate_deadline[mid] = self._now() + u256(3600)
        self.mandate_reason[mid] = "Principal review window expired; adjudication uses locked agent evidence."
        return "REVIEW_READY"

    @gl.public.write
    def adjudicate(self, mid: u256) -> str:
        if mid >= self.mandate_count:
            raise gl.vm.UserError("MANDATE_NOT_FOUND")
        sender = gl.message.sender_address.as_hex.lower()
        if not self._is_party(mid, sender):
            raise gl.vm.UserError("PARTY_ONLY")
        if self.mandate_status[mid] != "CHALLENGED" and self.mandate_status[mid] != "REVIEW_READY":
            raise gl.vm.UserError("NOT_READY_FOR_ADJUDICATION")

        title = self.mandate_title[mid]
        brief_url = self.mandate_brief_url[mid]
        brief_commitment = self.mandate_brief_commitment[mid]
        delivery_note = self.mandate_delivery_note[mid]
        delivery_url = self.mandate_delivery_url[mid]
        delivery_commitment = self.mandate_delivery_commitment[mid]
        counter_url = self.mandate_counter_url[mid]
        counter_commitment = self.mandate_counter_commitment[mid]
        counter_note = self.mandate_counter_note[mid]

        def evaluate() -> str:
            def read_source(url: str, label: str) -> str:
                if url == "":
                    return label + "_NONE"
                try:
                    content = gl.nondet.web.render(url, mode="text").strip()
                    if len(content) < 80:
                        return label + "_UNAVAILABLE"
                    return content[:3000]
                except Exception:
                    return label + "_UNAVAILABLE"

            brief = read_source(brief_url, "BRIEF")
            delivery = read_source(delivery_url, "DELIVERY")
            counter = read_source(counter_url, "COUNTER")
            if (
                brief == "BRIEF_UNAVAILABLE"
                or delivery == "DELIVERY_UNAVAILABLE"
            ):
                return "UNAVAILABLE"

            prompt = f"""You are the independent GenLayer agent mandate jury.
Real bond value depends on this ruling.

MANDATE: {title}
DELIVERY NOTE: {delivery_note}

LOCKED CONTENT IDENTIFIERS
Brief: {brief_commitment}
Delivery snapshot: {delivery_commitment}
Principal counter-evidence: {counter_commitment}

IMMUTABLE MANDATE BRIEF
{brief}

AGENT DELIVERY SNAPSHOT
{delivery}

PRINCIPAL COUNTER-EVIDENCE
Note: {counter_note}
Evidence: {counter}

Choose one outcome:
FULFILLED: the delivery satisfies all locked mandate requirements.
PARTIAL: the delivery satisfies some requirements but misses key deliverables.
REJECTED: the delivery fails to meet the locked requirements.
UNAVAILABLE: required evidence is absent, contradictory, or cannot be safely read.

Do not invent requirements, deadlines, or quality thresholds. Apply only the locked brief.
Return exactly one token: FULFILLED, PARTIAL, REJECTED, or UNAVAILABLE."""
            raw = str(gl.nondet.exec_prompt(prompt)).strip().upper()
            if raw in ("FULFILLED", "PARTIAL", "REJECTED", "UNAVAILABLE"):
                return raw
            return "UNAVAILABLE"

        principle = """Two AgentTask rulings are equivalent only when they select
the same outcome: FULFILLED, PARTIAL, REJECTED, or UNAVAILABLE.
Each outcome moves a different pre-committed amount of real bond value and the outcomes
are never interchangeable. Compare the material interpretation of the locked brief,
delivery snapshot, and optional principal counter-evidence. Ignore harmless wording differences."""
        result = gl.eq_principle.prompt_comparative(evaluate, principle)
        decision = str(result).strip().upper()
        if decision not in ("FULFILLED", "PARTIAL", "REJECTED", "UNAVAILABLE"):
            decision = "UNAVAILABLE"

        self.mandate_decision[mid] = decision
        if decision == "UNAVAILABLE":
            self.mandate_status[mid] = "EVIDENCE_UNAVAILABLE"
            self.mandate_deadline[mid] = self._now() + u256(172800)
            self.mandate_reason[mid] = "Evidence could not support a safe ruling; bounded recovery is open."
            return "EVIDENCE_UNAVAILABLE"
        self.mandate_status[mid] = "RULING_READY"
        self.mandate_reason[mid] = "Validators selected the " + decision + " outcome."
        return "RULING_READY"

    @gl.public.write
    def settle(self, mid: u256) -> str:
        if mid >= self.mandate_count:
            raise gl.vm.UserError("MANDATE_NOT_FOUND")
        sender = gl.message.sender_address.as_hex.lower()
        if not self._is_party(mid, sender):
            raise gl.vm.UserError("PARTY_ONLY")
        if self.mandate_status[mid] != "RULING_READY":
            raise gl.vm.UserError("RULING_NOT_READY")

        bond = self.mandate_bond[mid]
        if bond == u256(0) or bond > self.balance:
            raise gl.vm.UserError("BOND_INVARIANT_BROKEN")
        decision = self.mandate_decision[mid]
        agent_amount = u256(0)
        if decision == "FULFILLED":
            agent_amount = bond
        elif decision == "PARTIAL":
            agent_amount = bond * self.mandate_partial_pct[mid] // u256(100)
        elif decision != "REJECTED":
            raise gl.vm.UserError("INVALID_RULING")
        principal_amount = bond - agent_amount
        agent = self.mandate_agent[mid]
        principal = self.mandate_principal[mid]

        self.mandate_bond[mid] = u256(0)
        self.active_bond = self.active_bond - bond
        self.mandate_agent_paid[mid] = agent_amount
        self.mandate_principal_refunded[mid] = principal_amount
        self.total_agent_paid = self.total_agent_paid + agent_amount
        self.total_principal_refunded = self.total_principal_refunded + principal_amount
        self.mandate_status[mid] = "SETTLED"
        self.mandate_reason[mid] = "Bond distributed according to validator-selected outcome."
        if agent_amount > u256(0):
            _Recipient(Address(agent)).emit_transfer(value=agent_amount)
        if principal_amount > u256(0):
            _Recipient(Address(principal)).emit_transfer(value=principal_amount)
        return "SETTLED"

    @gl.public.write
    def cancel_mandate(self, mid: u256) -> str:
        if mid >= self.mandate_count:
            raise gl.vm.UserError("MANDATE_NOT_FOUND")
        if gl.message.sender_address.as_hex.lower() != self.mandate_principal[mid]:
            raise gl.vm.UserError("PRINCIPAL_ONLY")
        status = self.mandate_status[mid]
        if status != "DRAFT" and status != "OFFERED":
            raise gl.vm.UserError("CANCELLATION_CLOSED")
        return self._refund_principal(
            mid,
            "CANCELLED",
            "Principal withdrew the unaccepted mandate and recovered the full bond.",
        )

    @gl.public.write
    def expire_mandate(self, mid: u256) -> str:
        if mid >= self.mandate_count:
            raise gl.vm.UserError("MANDATE_NOT_FOUND")
        sender = gl.message.sender_address.as_hex.lower()
        if not self._is_party(mid, sender):
            raise gl.vm.UserError("PARTY_ONLY")
        if self.mandate_status[mid] != "ACTIVE":
            raise gl.vm.UserError("MANDATE_NOT_ACTIVE")
        if self._now() <= self.mandate_deadline[mid]:
            raise gl.vm.UserError("DEADLINE_NOT_PASSED")
        return self._refund_principal(
            mid,
            "EXPIRED",
            "Delivery deadline passed without submission; principal recovered the full bond.",
        )

    @gl.public.write
    def approve_recovery(self, mid: u256) -> str:
        if mid >= self.mandate_count:
            raise gl.vm.UserError("MANDATE_NOT_FOUND")
        status = self.mandate_status[mid]
        if status != "CHALLENGED" and status != "EVIDENCE_UNAVAILABLE":
            raise gl.vm.UserError("RECOVERY_NOT_AVAILABLE")
        sender = gl.message.sender_address.as_hex.lower()
        if sender == self.mandate_principal[mid]:
            self.mandate_principal_refunded[mid] = u256(1)
        elif sender == self.mandate_agent[mid]:
            self.mandate_agent_paid[mid] = u256(1)
        else:
            raise gl.vm.UserError("PARTY_ONLY")
        principal_approved = self.mandate_principal_refunded[mid] == u256(1)
        agent_approved = self.mandate_agent_paid[mid] == u256(1)
        if not principal_approved or not agent_approved:
            return "PARTIAL_APPROVAL"
        bond = self.mandate_bond[mid]
        if bond == u256(0) or bond > self.balance:
            raise gl.vm.UserError("BOND_INVARIANT_BROKEN")
        half = bond // u256(2)
        remainder = bond - half
        agent = self.mandate_agent[mid]
        principal = self.mandate_principal[mid]
        self.mandate_bond[mid] = u256(0)
        self.active_bond = self.active_bond - bond
        self.mandate_agent_paid[mid] = half
        self.mandate_principal_refunded[mid] = remainder
        self.total_agent_paid = self.total_agent_paid + half
        self.total_principal_refunded = self.total_principal_refunded + remainder
        self.mandate_status[mid] = "RECOVERED"
        self.mandate_reason[mid] = "Both parties approved equal-split recovery."
        _Recipient(Address(agent)).emit_transfer(value=half)
        _Recipient(Address(principal)).emit_transfer(value=remainder)
        return "RECOVERED"

    @gl.public.write
    def claim_recovery_timeout(self, mid: u256) -> str:
        if mid >= self.mandate_count:
            raise gl.vm.UserError("MANDATE_NOT_FOUND")
        status = self.mandate_status[mid]
        if status != "CHALLENGED" and status != "EVIDENCE_UNAVAILABLE":
            raise gl.vm.UserError("RECOVERY_NOT_AVAILABLE")
        if self._now() <= self.mandate_deadline[mid]:
            raise gl.vm.UserError("TIMEOUT_NOT_REACHED")
        return self._refund_principal(
            mid,
            "RECOVERY_TIMEOUT",
            "Recovery timeout reached; principal recovered the full bond.",
        )

    @gl.public.view
    def get_mandate(self, mid: u256) -> str:
        if mid >= self.mandate_count:
            raise gl.vm.UserError("MANDATE_NOT_FOUND")
        return json.dumps({
            "mandate_id": int(mid),
            "principal": self.mandate_principal[mid],
            "agent": self.mandate_agent[mid],
            "title": self.mandate_title[mid],
            "brief_url": self.mandate_brief_url[mid],
            "evidence_url": self.mandate_evidence_url[mid],
            "bond": str(self.mandate_bond[mid]),
            "partial_pct": str(self.mandate_partial_pct[mid]),
            "status": self.mandate_status[mid],
            "decision": self.mandate_decision[mid],
            "reason": self.mandate_reason[mid],
            "deadline": str(self.mandate_deadline[mid]),
            "delivery_note": self.mandate_delivery_note[mid],
            "delivery_url": self.mandate_delivery_url[mid],
            "counter_note": self.mandate_counter_note[mid],
            "agent_paid": str(self.mandate_agent_paid[mid]),
            "principal_refunded": str(self.mandate_principal_refunded[mid]),
        })

    @gl.public.view
    def get_stats(self) -> str:
        return json.dumps({
            "mandate_count": str(self.mandate_count),
            "total_bonded": str(self.total_bonded),
            "active_bond": str(self.active_bond),
            "total_agent_paid": str(self.total_agent_paid),
            "total_principal_refunded": str(self.total_principal_refunded),
        })
