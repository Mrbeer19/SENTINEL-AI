"""Agent tools (server-scoped, allowlisted), output validation and the tool loop limits."""

import json

import httpx
import pytest
from conftest import ATTACKER, analysis, connect, event, simulate
from pydantic import ValidationError

from backend.app import create_app
from backend.agent import LOG_LIMIT, MAX_ROUNDS, MAX_TOOL_CALLS, Agent, parse_analysis, rule_fallback
from backend.config import load_settings
from backend.store import Store

OTHER = "192.0.2.99"


@pytest.fixture
def tools(tmp_path):
    """(client, agent, incident) on one DB file, so the tools see what the API wrote."""
    db = tmp_path / "tools.db"
    client = connect(create_app(db))
    incident = simulate(client)
    return client, Agent(load_settings(), Store(db)), incident


def run(tools, name, **args):
    _, agent, incident = tools
    return agent.run_tool(incident, name, args)


# ---- argument validation ----

def test_unknown_tool_is_an_error(tools):
    assert run(tools, "delete_all_rules") == ("error", {"error": "unknown tool delete_all_rules"})


def test_arguments_must_be_an_object(tools):
    _, agent, incident = tools
    assert agent.run_tool(incident, "get_ip_activity", "192.0.2.25")[0] == "error"


@pytest.mark.parametrize("name", ["get_incident_logs", "get_ip_activity", "get_related_incidents", "get_firewall_status", "propose_block_ip"])
def test_missing_arguments_are_errors(tools, name):
    status, output = run(tools, name)
    assert status == "error" and "must be" in output["error"]


@pytest.mark.parametrize("minutes", ["10", 10.0, True, None])
def test_minutes_must_be_a_real_integer(tools, minutes):
    assert run(tools, "propose_block_ip", ip_address=ATTACKER, minutes=minutes, reason="x")[0] == "error"


@pytest.mark.parametrize("value", ["", "   ", 5, ["192.0.2.25"]])
def test_string_arguments_must_be_non_empty_strings(tools, value):
    assert run(tools, "get_ip_activity", ip_address=value)[0] == "error"


# ---- get_incident_logs ----

@pytest.mark.parametrize("ref", ["INC-0001", "inc-0001", " INC-0001 ", "1"])
def test_incident_logs_accept_own_reference_forms(tools, ref):
    status, output = run(tools, "get_incident_logs", incident_id=ref)
    assert status == "ok" and output["incident_id"] == "INC-0001" and output["returned"] == 6


@pytest.mark.parametrize("ref", ["INC-0002", "2", "INC-1", "../1"])
def test_incident_logs_refuse_other_incidents(tools, ref):
    assert run(tools, "get_incident_logs", incident_id=ref) == ("error", {"error": "incident not found"})


def test_incident_logs_are_scoped_to_source_and_hide_labels(tools):
    client, _, _ = tools
    client.post("/api/events", json=event(ip=OTHER, outcome="success"))
    _, output = run(tools, "get_incident_logs", incident_id="INC-0001")
    assert {r["src"] for r in output["untrusted_log_records"]} == {ATTACKER}
    assert all("label" not in r for r in output["untrusted_log_records"])


def test_incident_logs_cap_and_keep_newest_in_time_order(tools):
    client, _, _ = tools
    for i in range(LOG_LIMIT + 10):
        client.post("/api/events", json=event(outcome="success", username=f"u{i}"))
    _, output = run(tools, "get_incident_logs", incident_id="INC-0001")
    users = [r.get("user") for r in output["untrusted_log_records"]]
    assert output["returned"] == LOG_LIMIT and users[-1] == f"u{LOG_LIMIT + 9}" and users[0] == "u10"


def test_incident_logs_truncate_usernames(tools):
    client, _, _ = tools
    client.post("/api/events", json=event(username="a" * 80))
    _, output = run(tools, "get_incident_logs", incident_id="INC-0001")
    assert len(output["untrusted_log_records"][-1]["user"]) == 64


# ---- other read tools ----

def test_ip_activity_summarises_own_source(tools):
    client, _, _ = tools
    client.post("/api/events", json=event(event_type="CONNECTION", outcome="attempt", destination_port=22))
    status, output = run(tools, "get_ip_activity", ip_address=ATTACKER)
    assert status == "ok" and output["total_events"] == 7 and output["failed_logins"] == 6 and output["ports_touched"] == [22]


def test_ip_activity_refuses_other_ips(tools):
    assert run(tools, "get_ip_activity", ip_address=OTHER)[0] == "error"


def test_related_incidents_exclude_self_and_other_ips(tools):
    client, _, _ = tools
    for port in range(1, 9):
        client.post("/api/events", json=event(event_type="CONNECTION", outcome="attempt", destination_port=port))
    simulate(client, ip=OTHER)
    status, output = run(tools, "get_related_incidents", ip_address=ATTACKER)
    assert status == "ok" and [i["kind"] for i in output] == ["PORT_SCAN"]
    assert run(tools, "get_related_incidents", ip_address=OTHER) == ("ok", [])


def test_firewall_status_reports_block_and_protection(tools):
    client, _, incident = tools
    assert run(tools, "get_firewall_status", ip_address=ATTACKER)[1] == {"ip": ATTACKER, "status": "ALLOWED", "protected": False}
    proposal = client.post(f"/api/incidents/{incident['id']}/analyze").json()["proposal"]
    client.post(f"/api/proposals/{proposal['id']}/approve", json={"reviewer": "teacher"})
    assert run(tools, "get_firewall_status", ip_address=ATTACKER)[1]["status"] == "BLOCKED"
    assert run(tools, "get_firewall_status", ip_address="127.0.0.1")[1]["protected"] is True
    assert run(tools, "get_firewall_status", ip_address="nope")[0] == "error"


# ---- propose_block_ip ----

def test_propose_block_of_own_source_waits_for_human(tools):
    assert run(tools, "propose_block_ip", ip_address=ATTACKER, minutes=10, reason="brute force")[1]["status"] == "WAITING_APPROVAL"


def test_propose_block_never_creates_a_proposal_or_rule(tools):
    client, _, _ = tools
    run(tools, "propose_block_ip", ip_address=ATTACKER, minutes=10, reason="brute force")
    assert client.get("/api/proposals").json() == [] and client.get("/api/rules").json() == []


@pytest.mark.parametrize("ip", [OTHER, "127.0.0.1", "not-an-ip"])
def test_propose_block_of_anything_else_is_rejected_by_policy(tools, ip):
    status, output = run(tools, "propose_block_ip", ip_address=ip, minutes=10, reason="x")
    assert status == "rejected_by_policy" and output["status"] == "REJECTED_BY_POLICY"


# ---- output parsing ----

def test_parse_accepts_fenced_json():
    assert parse_analysis("```json\n" + json.dumps(analysis()) + "\n```").severity == "HIGH"


@pytest.mark.parametrize("bad", [
    {**analysis(), "summary": "extra key"},
    analysis(confidence=1.5),
    analysis(confidence=-0.1),
    analysis(evidence=[]),
    analysis(evidence=["x"] * 11),
    analysis(threat_type="SQL_INJECTION"),
    analysis(severity="high"),
    analysis(recommended_action="SHUTDOWN"),
    analysis(explanation_th=""),
    {k: v for k, v in analysis().items() if k != "evidence"},
])
def test_parse_rejects_contract_violations(bad):
    with pytest.raises(ValidationError):
        parse_analysis(json.dumps(bad))


def test_rule_fallback_marks_itself_and_has_no_confidence():
    result = rule_fallback({"kind": "SOMETHING_NEW", "severity": "LOW", "rule_id": "r", "event_count": 5, "source_ip": ATTACKER}, 5)
    assert result.threat_type == "UNKNOWN" and result.confidence is None and result.recommended_action == "TEMP_BLOCK_IP"


# ---- the loop (scripted model through the API) ----

def analyze(client, incident):
    return client.post(f"/api/incidents/{incident['id']}/analyze").json()


def test_tool_calls_are_capped_per_investigation(make_app, script_model):
    script_model(rounds=[[("get_ip_activity", {"ip_address": ATTACKER})] * 10], finals=[analysis()])
    client = connect(make_app())
    result = analyze(client, simulate(client))
    assert sum(t["operation"] == "execute_tool" for t in result["trace"]) == MAX_TOOL_CALLS


def test_tool_rounds_are_capped(make_app, script_model):
    script_model(rounds=[[("get_ip_activity", {"ip_address": ATTACKER})]] * 10, finals=[analysis()])
    client = connect(make_app())
    result = analyze(client, simulate(client))
    rounds = [t for t in result["trace"] if t["operation"] == "chat" and "round" in t["input"]]
    assert len(rounds) == MAX_ROUNDS and result["analysis_mode"] == "ollama"


def test_propose_block_ends_the_investigation(make_app, script_model):
    script_model(rounds=[[("propose_block_ip", {"ip_address": ATTACKER, "minutes": 10, "reason": "x"})],
                         [("get_ip_activity", {"ip_address": ATTACKER})]], finals=[analysis()])
    client = connect(make_app())
    result = analyze(client, simulate(client))
    assert [t["tool"] for t in result["trace"] if t["operation"] == "execute_tool"] == ["propose_block_ip"]


def test_tool_errors_are_returned_to_the_model_not_raised(make_app, script_model):
    bodies = script_model(rounds=[[("get_ip_activity", {"ip_address": OTHER})]], finals=[analysis()])
    client = connect(make_app())
    result = analyze(client, simulate(client))
    assert result["analysis_mode"] == "ollama"
    tool_msgs = [m for m in bodies[-1]["messages"] if m["role"] == "tool"]
    assert "error" in json.loads(tool_msgs[0]["content"])


def test_missing_confidence_from_model_counts_as_invalid(make_app, script_model):
    script_model(finals=[analysis(confidence=None), analysis()])
    client = connect(make_app())
    result = analyze(client, simulate(client))
    assert result["analysis_mode"] == "ollama_retry" and result["analysis"]["confidence"] == 0.9


def test_model_http_error_falls_back_to_rules(make_app, script_model):
    script_model(status=500)
    client = connect(make_app())
    result = analyze(client, simulate(client))
    assert result["analysis_mode"] == "rule_fallback" and result["proposal"]["source"] == "rule_fallback"
    assert result["trace"][-1]["input"].count("HTTPStatusError") == 1


def test_model_timeout_falls_back_to_rules(make_app, script_model):
    script_model(finals=[httpx.ReadTimeout("slow")])
    client = connect(make_app())
    assert analyze(client, simulate(client))["analysis_mode"] == "rule_fallback"


def test_request_body_is_deterministic_and_json_mode_is_opt_in(make_app, script_model):
    bodies = script_model(finals=[analysis()])
    client = connect(make_app())
    analyze(client, simulate(client))
    assert all(b["think"] is False and b["options"]["temperature"] == 0 and b["stream"] is False for b in bodies)
    assert all("format" not in b for b in bodies)

    bodies = script_model(finals=[analysis()])
    client = connect(make_app("second.db", SENTINEL_OLLAMA_FORMAT="1"))
    analyze(client, simulate(client))
    assert "format" in bodies[-1] and "tools" not in bodies[-1]


def test_model_never_sees_event_labels(make_app, script_model):
    bodies = script_model(rounds=[[("get_incident_logs", {"incident_id": "INC-0001"})]], finals=[analysis()])
    client = connect(make_app())
    analyze(client, simulate(client))
    tool_output = json.dumps([m["content"] for b in bodies for m in b["messages"] if m["role"] == "tool"])
    assert tool_output != "[]" and "label" not in tool_output and "attack" not in tool_output


def test_missing_prompt_file_uses_builtin_prompt(make_app, tmp_path):
    client = connect(make_app(SENTINEL_PROMPT_PATH=str(tmp_path / "missing.md")))
    result = analyze(client, simulate(client))
    assert result["analysis_meta"]["prompt_version"] == "builtin"


def test_prompt_version_is_file_name_and_hash(make_app, tmp_path):
    prompt = tmp_path / "p.md"
    prompt.write_text("be careful")
    client = connect(make_app(SENTINEL_PROMPT_PATH=str(prompt)))
    version = analyze(client, simulate(client))["analysis_meta"]["prompt_version"]
    assert version.startswith("p.md@") and len(version.split("@")[1]) == 12
