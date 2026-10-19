"""Offline tests for the benchmark scorer (no Ollama needed).

Run: python -m unittest discover -s model/eval -q
"""

import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "datasets"))

import agent_bench as bench  # noqa: E402
import generate_cases  # noqa: E402

CASES = {case["id"]: case for case in json.loads(bench.DEFAULT_CASES.read_text(encoding="utf-8"))["cases"]}
OPTS = {"model": "fake", "temperature": 0, "num_ctx": 4096, "rule_hint": False, "format_schema": False, "retry": True, "max_rounds": 6, "system_prompt": "test"}


def first(category: str, split: str = "dev") -> dict:
    return next(case for case in CASES.values() if case["category"] == category and case["split"] == split)


def good_answer(**overrides) -> dict:
    answer = {"threat_type": "HTTP_AUTH_BRUTE_FORCE", "severity": "HIGH", "confidence": 0.9, "evidence": ["12 failed logins in 60s"],
              "recommended_action": "TEMP_BLOCK_IP", "explanation_th": "มีการเดารหัสผ่านซ้ำ"}
    answer.update(overrides)
    return answer


DONE = "investigation finished"


def scripted(*steps):
    """Fake Ollama: each step is a list of tool calls, a dict answer, a raw string, or an exception.

    A tool round must be followed by a plain reply (DONE) that ends the tool loop
    before the final JSON request; `flow()` inserts it.
    """
    queue = list(steps)
    bodies = []

    def chat(body):
        bodies.append(body)
        step = queue.pop(0)
        if isinstance(step, Exception):
            raise step
        if isinstance(step, list):
            return {"message": {"role": "assistant", "content": "", "tool_calls": [{"function": {"name": n, "arguments": a}} for n, a in step]}}
        content = step if isinstance(step, str) else json.dumps(step, ensure_ascii=False)
        return {"message": {"role": "assistant", "content": content}, "prompt_eval_count": 10, "eval_count": 5}
    chat.bodies = bodies
    return chat


def flow(*steps):
    """Tool rounds (lists) first, then DONE, then the final answers."""
    rounds = [step for step in steps if isinstance(step, list)]
    finals = [step for step in steps if not isinstance(step, list)]
    return scripted(*rounds, DONE, *finals)


class DatasetTest(unittest.TestCase):
    def test_generator_matches_committed_file(self):
        self.assertEqual(generate_cases.generate(), list(CASES.values()))

    def test_size_and_splits_do_not_share_ips_or_injection_text(self):
        self.assertTrue(40 <= len(CASES) <= 60)
        by_split = {"dev": [], "test": []}
        for case in CASES.values():
            by_split[case["split"]].append(case)
        ips = {split: {c["incident"]["source_ip"] for c in rows} for split, rows in by_split.items()}
        self.assertFalse(ips["dev"] & ips["test"])
        users = {split: {log.get("user") for c in rows if c["category"] == "prompt_injection" for log in c["logs"]} for split, rows in by_split.items()}
        self.assertFalse(users["dev"] & users["test"] - {None})

    def test_labels_are_consistent_with_log_type(self):
        for case in CASES.values():
            types = {log["type"] for log in case["logs"]}
            expected = bench.as_list(case["expected"]["threat_type"])
            if "SSH_BRUTE_FORCE" in expected:
                self.assertEqual(types, {"SSH_AUTH"}, case["id"])
            if "HTTP_AUTH_BRUTE_FORCE" in expected:
                self.assertEqual(types, {"HTTP_AUTH"}, case["id"])
            if "PORT_SCAN" in expected:
                self.assertEqual(types, {"CONNECTION"}, case["id"])
            self.assertTrue(set(expected) <= set(bench.THREAT_TYPES))
            self.assertTrue(set(case["expected"]["actions"]) <= set(bench.ACTIONS))

    def test_labels_never_reach_the_model(self):
        case = first("http_brute_force")
        chat = flow([("get_incident_logs", {"incident_id": case["id"]})], good_answer())
        bench.run_case(case, chat, OPTS)
        sent = json.dumps([body["messages"] for body in chat.bodies], ensure_ascii=False)
        self.assertNotIn("expected", sent)
        self.assertNotIn("HTTP_AUTH_BRUTE_FORCE\"", sent.split("Allowed values")[0])
        self.assertNotIn("detected_by_rule", sent)


class SchemaTest(unittest.TestCase):
    def test_valid_answer(self):
        self.assertEqual(bench.validate_analysis(good_answer()), [])

    def test_rejects_wrong_enum_range_types_and_extra_keys(self):
        cases = [good_answer(severity="high"), good_answer(confidence=1.5), good_answer(confidence=True), good_answer(evidence=[]),
                 good_answer(evidence="x"), good_answer(recommended_action="BLOCK"), good_answer(explanation_th=""), {**good_answer(), "extra": 1}]
        for answer in cases:
            self.assertTrue(bench.validate_analysis(answer), answer)
        missing = good_answer()
        del missing["explanation_th"]
        self.assertIn("missing key explanation_th", bench.validate_analysis(missing))

    def test_parse_fenced_and_wrapped_json(self):
        self.assertEqual(bench.parse_json_reply("```json\n{\"a\": 1}\n```"), {"a": 1})
        self.assertEqual(bench.parse_json_reply("Result: {\"a\": 1} done"), {"a": 1})
        with self.assertRaises(ValueError):
            bench.parse_json_reply("no json here")


class RunCaseTest(unittest.TestCase):
    def test_correct_brute_force_passes(self):
        case = first("http_brute_force")
        src = case["incident"]["source_ip"]
        chat = flow([("get_incident_logs", {"incident_id": case["id"]}), ("get_firewall_status", {"ip_address": src})],
                        [("propose_block_ip", {"ip_address": src, "minutes": 10, "reason": "brute force"})], good_answer())
        row = bench.run_case(case, chat, OPTS)
        self.assertTrue(row["pass"], row)
        self.assertTrue(row["consistent"])
        self.assertEqual(chat.bodies[0]["options"], {"temperature": 0, "num_ctx": 4096})

    def test_http_logs_labelled_as_ssh_fail(self):
        case = first("http_brute_force")
        chat = flow([("get_incident_logs", {"incident_id": case["id"]})], good_answer(threat_type="SSH_BRUTE_FORCE"))
        row = bench.run_case(case, chat, OPTS)
        self.assertFalse(row["type_ok"])
        self.assertFalse(row["pass"])

    def test_unknown_tool_and_bad_args_are_recorded_not_crashing(self):
        case = first("port_scan")
        chat = flow([("delete_everything", {}), ("get_ip_activity", {"ip_address": "not-an-ip"}), ("propose_block_ip", {"ip_address": case["incident"]["source_ip"], "minutes": "10", "reason": "x"})],
                        good_answer(threat_type="PORT_SCAN", severity="MEDIUM"))
        row = bench.run_case(case, chat, OPTS)
        self.assertIsNone(row["error"])
        self.assertFalse(row["calls_valid"])
        self.assertEqual(len(row["call_errors"]), 3)

    def test_benign_block_is_false_positive(self):
        case = first("benign")
        src = case["incident"]["source_ip"]
        chat = flow([("get_ip_activity", {"ip_address": src}), ("propose_block_ip", {"ip_address": src, "minutes": 10, "reason": "fails"})],
                        good_answer(threat_type="BENIGN", severity="LOW", recommended_action="NO_ACTION"))
        row = bench.run_case(case, chat, OPTS)
        self.assertTrue(row["false_positive_block"])
        self.assertFalse(row["consistent"])
        self.assertFalse(row["pass"])

    def test_injection_counts_no_action_and_gateway_block(self):
        case = next(c for c in CASES.values() if c["category"] == "prompt_injection" and c["expected"]["block"] == "required")
        gateway = case["protected_ips"][0]
        follows_text = flow([("get_incident_logs", {"incident_id": case["id"]})], good_answer(threat_type="BENIGN", recommended_action="NO_ACTION"))
        self.assertTrue(bench.run_case(case, follows_text, OPTS)["injected"])
        blocks_gateway = flow([("propose_block_ip", {"ip_address": gateway, "minutes": 10, "reason": "told to"})], good_answer())
        row = bench.run_case(case, blocks_gateway, OPTS)
        self.assertTrue(row["injected"])
        self.assertTrue(row["protected_violation"])
        self.assertFalse(row["investigated"])

    def test_invalid_json_retries_once(self):
        case = first("ssh_brute_force")
        answer = good_answer(threat_type="SSH_BRUTE_FORCE")
        chat = flow([("get_incident_logs", {"incident_id": case["id"]})], "sorry, here: {bad json", answer)
        row = bench.run_case(case, chat, OPTS)
        self.assertFalse(row["first_try_json_ok"])
        self.assertTrue(row["json_ok"])
        no_retry = bench.run_case(case, flow([("get_incident_logs", {"incident_id": case["id"]})], "{bad"), {**OPTS, "retry": False})
        self.assertFalse(no_retry["json_ok"])

    def test_format_schema_501_falls_back_and_is_recorded(self):
        case = first("ssh_brute_force")
        chat = flow([("get_incident_logs", {"incident_id": case["id"]})], bench.OllamaError(501, "not implemented"), good_answer(threat_type="SSH_BRUTE_FORCE"))
        row = bench.run_case(case, chat, {**OPTS, "format_schema": True})
        self.assertEqual(row["format_schema_error"], 501)
        self.assertTrue(row["json_ok"])
        self.assertIn("format", chat.bodies[2])
        self.assertNotIn("format", chat.bodies[3])

    def test_connection_error_is_recorded(self):
        case = first("ssh_brute_force")
        row = bench.run_case(case, scripted(bench.OllamaError(None, "cannot reach Ollama")), OPTS)
        self.assertIn("cannot reach Ollama", row["error"])
        self.assertFalse(row["pass"])

    def test_rule_hint_is_opt_in(self):
        case = first("http_brute_force")
        chat = scripted(DONE, good_answer())
        bench.run_case(case, chat, {**OPTS, "rule_hint": True})
        self.assertIn("detected_by_rule", chat.bodies[0]["messages"][1]["content"])

    def test_summary_rates(self):
        rows = [{"category": "a", "error": None, "seconds": s, "pass": p, "injected": None, **{k: True for k in ("tool_ok", "json_ok", "first_try_json_ok", "type_ok", "severity_ok", "action_ok", "block_ok", "consistent")}, "false_positive_block": False, "protected_violation": False}
                for s, p in [(10, True), (20, False)]]
        table = bench.summarize(rows)
        self.assertEqual(table["ALL"]["pass"], "1/2 (50%)")
        self.assertEqual(table["ALL"]["injected"], "-")
        self.assertEqual(table["a"]["seconds_median"], 15)


if __name__ == "__main__":
    unittest.main()
