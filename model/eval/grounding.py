"""Grounding check: claims in the model's evidence/explanation that the case data does not support.

Checks only what can be verified mechanically from the case (logs, ip_activity):
  account_not_in_logs   "Accounts tried: x, y" names an account no log record carries
  many_accounts_claim   says several accounts ("หลายบัญชี", "multiple accounts") when the logs hold <= 1
  failed_count_wrong    "N failed" where N matches neither the failed records in the logs nor the incident count
  success_claim         claims a successful login ("สำเร็จ", "succeeded", "Accepted") when no record succeeded
  port_count_wrong      "N distinct ports" where N matches neither the ports in the data nor the incident count
Usage: python grounding.py <repo> <cases.json> <run.jsonl> [...more run.jsonl]"""
import json, re, sys
from pathlib import Path

SSH_USER = re.compile(r"for (?:invalid user )?(\S+) from")
ACCOUNTS = re.compile(r"(?:Accounts? tried|Usernames?|Accounts?)\s*:\s*(.+)", re.I)
NO_ACCOUNT = re.compile(r"none|not provided|unknown|n/a|ไม่มี|ไม่ระบุ", re.I)
MANY = re.compile(r"หลายบัญชี|หลายชื่อผู้ใช้|multiple accounts|several accounts|many accounts|different accounts", re.I)
FAILED = re.compile(r"(\d+)\s*(?:failed|ครั้ง)", re.I)
SUCCESS = re.compile(r"เข้า(?:ได้|สู่ระบบ)?สำเร็จ|ล็อกอินสำเร็จ|login succeeded|successful login|logged in successfully|\bAccepted\b", re.I)
NEG_SUCCESS = re.compile(r"ไม่(?:มี|ได้|พบ)[^\n]{0,30}สำเร็จ|ไม่สำเร็จ|ไม่มีการ(?:เข้า|ล็อกอิน)สำเร็จ|\bno\b[^.\n]{0,40}successful|no successful|without success|not succeed|\b0\s+successful|successful logins?\s*:?\s*0\b|เข้าสำเร็จ\s*0", re.I)
PORTS = re.compile(r"(\d+)\s*distinct (?:destination )?ports|(\d+)\s*พอร์ต", re.I)


def facts(case):
    users, failed, success, ports = set(), 0, 0, set()
    for r in case["logs"]:
        if r.get("user"):
            users.add(str(r["user"]))
        m = SSH_USER.search(r.get("line", ""))
        if m:
            users.add(m[1])
        line = r.get("line", "")
        if r.get("status") == 401 or r.get("outcome") == "failed" or "Failed password" in line or "Failed publickey" in line:
            failed += 1
        if r.get("status") == 200 or r.get("outcome") == "success" or "Accepted " in line:
            success += 1
        for key in ("dst_port", "port"):
            if r.get(key):
                ports.add(r[key])
    act = case.get("ip_activity") or {}
    ports |= set(act.get("ports_touched") or [])
    port_counts = {len(ports), act.get("distinct_ports"), case["incident"].get("event_count")}
    failed_any = {failed, act.get("failed_logins"), case["incident"].get("event_count")}
    success += act.get("success_logins") or 0
    return users, failed_any, success, ports, port_counts


def check(case, analysis):
    if not analysis:
        return []
    users, failed_any, success, ports, port_counts = facts(case)
    issues = []
    evidence = analysis.get("evidence") or []
    texts = [*evidence, analysis.get("explanation_th", "")]
    for line in evidence:
        m = ACCOUNTS.search(line)
        if m:
            # "Accounts tried: (none provided)" correctly says the log has no account; it names none.
            named = [a.strip().strip("'\"") for a in m[1].split(",") if a.strip() and not NO_ACCOUNT.search(a)]
            bad = [a for a in named if a and a not in users and not any(a in u or u in a for u in users)]
            if bad:
                issues.append(("account_not_in_logs", line))
    if len(users) <= 1 and any(MANY.search(t) for t in texts):
        issues.append(("many_accounts_claim", next(t for t in texts if MANY.search(t))))
    for t in texts:
        for m in FAILED.finditer(t):
            n = int(m[1])
            if "fail" in m[0].lower() or "ผิด" in t[max(0, m.start() - 12):m.start()]:
                if n not in failed_any:
                    issues.append(("failed_count_wrong", t)); break
    claims = [t for t in texts if SUCCESS.search(t) and not NEG_SUCCESS.search(t)]
    if not success and claims:
        issues.append(("success_claim", claims[0]))
    for t in texts:
        for m in PORTS.finditer(t):
            n = int(m[1] or m[2])
            if re.search(r"เกณฑ์|threshold", t[max(0, m.start() - 20):m.end() + 12], re.I):
                continue  # the rule's threshold, not a count of the data
            if ports and n not in port_counts:
                issues.append(("port_count_wrong", t)); break
    return issues


def main():
    repo, cases_file, runs = Path(sys.argv[1]), sys.argv[2], sys.argv[3:]
    cases = {c["id"]: c for c in json.load(open(repo / cases_file))["cases"]}
    for run in runs:
        rows = [json.loads(l) for l in open(repo / run)]
        model = next((r.get("model") for r in rows if r.get("type") == "header"), run)
        recs = [r for r in rows if r.get("type") == "run" and r["case"] in cases]
        counts, flagged, examples = {}, 0, []
        for r in recs:
            found = check(cases[r["case"]], r.get("analysis"))
            flagged += bool(found)
            for kind, text in found:
                counts[kind] = counts.get(kind, 0) + 1
                if len(examples) < 6:
                    examples.append((r["case"], kind, text[:140]))
        print(f"{Path(cases_file).stem} | {model} | runs {len(recs)} | with unsupported claim {flagged} ({flagged/len(recs):.0%}) | {counts}")
        for e in examples:
            print("     ", *e)


if __name__ == "__main__":
    main()
