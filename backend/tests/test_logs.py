"""Raw sshd log ingestion (spec D: log parser, validate, normalize)."""

from datetime import datetime, timedelta, timezone

import pytest

from backend.logparse import Skip, parse_line

NOW = datetime(2026, 10, 20, 12, 0, tzinfo=timezone.utc)


def iso(offset_s=0):
    return (datetime.now(timezone.utc) - timedelta(seconds=30 - offset_s)).isoformat()


def failed(ip="192.0.2.25", user="admin", offset_s=0, invalid=True):
    who = f"invalid user {user}" if invalid else user
    return f"{iso(offset_s)} m5 sshd[1200]: Failed password for {who} from {ip} port 5{offset_s:04d} ssh2"


@pytest.mark.parametrize("line,outcome,user", [
    ("2026-10-20T11:59:00+07:00 m5 sshd[1]: Failed password for invalid user oracle from 192.0.2.7 port 40000 ssh2", "failed", "oracle"),
    ("2026-10-20T11:59:00.123456+07:00 m5 sshd[1]: Failed password for root from 192.0.2.7 port 40000 ssh2", "failed", "root"),
    ("2026-10-20T04:59:00Z m5 sshd[1]: Accepted publickey for student from 192.0.2.7 port 40000 ssh2: ED25519 SHA256:x", "success", "student"),
    ("2026-10-20T11:59:00+0700 m5 sshd[1]: Accepted password for student from 192.0.2.7 port 40000 ssh2", "success", "student"),
])
def test_parse_auth_results(line, outcome, user):
    event = parse_line(line, NOW)
    assert event["outcome"] == outcome and event["username"] == user and event["source_ip"] == "192.0.2.7"
    assert event["event_type"] == "SSH_AUTH" and event["destination_port"] == 22
    assert event["timestamp"].astimezone(timezone.utc).replace(microsecond=0) == datetime(2026, 10, 20, 4, 59, tzinfo=timezone.utc)


def test_parse_classic_syslog_uses_local_time_and_current_year():
    event = parse_line("Oct 20 11:59:00 m5 sshd[1]: Failed password for root from 192.0.2.7 port 1 ssh2", NOW)
    assert event["timestamp"].year == 2026 and event["timestamp"].utcoffset() is not None


def test_december_line_read_in_january_is_last_year():
    event = parse_line("Dec 31 23:59:00 m5 sshd[1]: Failed password for root from 192.0.2.7 port 1 ssh2",
                       datetime(2027, 1, 1, 0, 5, tzinfo=timezone.utc))
    assert event["timestamp"].year == 2026


@pytest.mark.parametrize("message", ["Invalid user admin from 192.0.2.7 port 1", "Connection closed by 192.0.2.7 port 1 [preauth]",
                                     "pam_unix(sshd:auth): authentication failure; rhost=192.0.2.7"])
def test_non_result_sshd_lines_are_skipped(message):
    with pytest.raises(Skip):
        parse_line(f"2026-10-20T11:59:00+07:00 m5 sshd[1]: {message}", NOW)


@pytest.mark.parametrize("line", ["", "hello", "2026-10-20T11:59:00+07:00 m5 nginx[1]: GET /", "Oct 99 11:59:00 m5 sshd[1]: Failed password for a from 1.2.3.4 port 1"])
def test_unreadable_lines_are_errors(line):
    with pytest.raises(ValueError):
        parse_line(line, NOW)


def test_brute_force_from_raw_lines_opens_ssh_incident(client):
    result = client.post("/api/logs", json={"format": "sshd", "lines": [failed(offset_s=i) for i in range(6)]}).json()
    assert result["accepted"] == 6 and result["rejected"] == 0 and len(result["incident_ids"]) == 1
    incident = client.get(f"/api/incidents/{result['incident_ids'][0]}").json()
    assert incident["kind"] == "SSH_BRUTE_FORCE" and incident["source_ip"] == "192.0.2.25"


def test_echo_lines_do_not_double_count(client):
    lines = []
    for i in range(4):
        lines += [f"{iso(i)} m5 sshd[1]: Invalid user admin from 192.0.2.25 port 1", failed(offset_s=i)]
    result = client.post("/api/logs", json={"format": "sshd", "lines": lines}).json()
    assert result["accepted"] == 4 and result["skipped"] == 4 and result["incident_ids"] == []


def test_bad_lines_are_reported_without_dropping_good_ones(client):
    future = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()
    lines = [failed(), "garbage", f"{future} m5 sshd[1]: Failed password for root from 192.0.2.25 port 1 ssh2",
             f"{iso()} m5 sshd[1]: Failed password for root from not-an-ip port 1 ssh2", "x" * 1001]
    result = client.post("/api/logs", json={"format": "sshd", "lines": lines}).json()
    assert result["accepted"] == 1 and result["rejected"] == 4
    assert [e["line"] for e in result["errors"]] == [2, 3, 4, 5]
    assert "future" in result["errors"][1]["error"]


def test_long_usernames_in_logs_are_cut(client):
    client.post("/api/logs", json={"format": "sshd", "lines": [failed(user="u" * 200)]})
    event = client.get("/api/events?limit=1").json()[0]
    assert len(event["username"]) == 80 and event["username_truncated"] == 1


@pytest.mark.parametrize("body", [{"format": "nginx", "lines": ["x"]}, {"format": "sshd", "lines": []},
                                  {"format": "sshd", "lines": ["x"] * 1001}])
def test_request_limits(client, body):
    assert client.post("/api/logs", json=body).status_code == 422


def test_logs_endpoint_is_local_only(make_app):
    from conftest import connect
    assert connect(make_app(), "192.168.1.90").post("/api/logs", json={"format": "sshd", "lines": [failed()]}).status_code == 401
