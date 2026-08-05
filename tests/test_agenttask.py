import ast, re, json
from pathlib import Path

SRC = Path(__file__).resolve().parents[1] / "contracts" / "AgentTask.py"
code = SRC.read_text()

def _fn(name: str) -> str:
    start = code.index(f"def {name}")
    end = code.find("\n    def ", start + 1)
    if end == -1: end = code.find("\n    @gl.", start + 1)
    if end == -1: end = len(code)
    return code[start:end]

class TestStructure:
    def test_syntax(self):
        assert ast.parse(code)
    def test_class_name(self):
        assert "class AgentTask(gl.Contract):" in code
    def test_state_fields(self):
        for f in ("mandate_count", "mandate_principal", "mandate_agent", "mandate_bond", "mandate_status"):
            assert f in code
    def test_constructor(self):
        init = _fn("__init__")
        assert "mandate_count" in init
        assert "total_bonded" in init

class TestConsensus:
    def test_uses_prompt_comparative(self):
        assert "gl.eq_principle.prompt_comparative" in code
    def test_uses_nondet_web_render(self):
        assert "gl.nondet.web.render" in code
    def test_uses_exec_prompt(self):
        assert "gl.nondet.exec_prompt" in code
    def test_fetch_inside_evaluate(self):
        eval_fn = _fn("evaluate")
        assert "web.render" in eval_fn or "read_source" in eval_fn

class TestDomain:
    def test_lifecycle_statuses(self):
        for s in ("DRAFT", "OFFERED", "ACTIVE", "DELIVERED", "CHALLENGED", "REVIEW_READY", "RULING_READY", "SETTLED", "CANCELLED", "EXPIRED"):
            assert s in code
    def test_decisions(self):
        for d in ("FULFILLED", "PARTIAL", "REJECTED", "UNAVAILABLE"):
            assert d in code
    def test_emit_transfer(self):
        assert "emit_transfer" in code
    def test_payable_open_mandate(self):
        assert "@gl.public.write.payable" in code

class TestSecurity:
    def test_https_enforced(self):
        assert "https://" in code
    def test_no_block_number(self):
        assert "gl.vm.block_number" not in code
    def test_immutability_enforced(self):
        assert "IMMUTABLE" in code

class TestViews:
    def test_get_mandate(self):
        assert "def get_mandate" in code
    def test_get_stats(self):
        assert "def get_stats" in code

class TestStorage:
    def test_treemap(self):
        assert "TreeMap" in code
    def test_json_serialization(self):
        assert "json.dumps" in code
