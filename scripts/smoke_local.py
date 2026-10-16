"""Run the real local model and approval flow against localhost."""

import argparse
import json
import time
import urllib.error
import urllib.request


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-ip", default="192.0.2.26", help="Use a new documentation-range IP for each run")
    args = parser.parse_args()
    base = "http://127.0.0.1:8000"

    def call(path, body=None):
        data = json.dumps(body).encode() if body is not None else None
        request = urllib.request.Request(base + path, data=data, headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(request, timeout=190) as response:
                return response.status, json.load(response)
        except urllib.error.HTTPError as response:
            return response.code, json.load(response)

    health = call("/api/health")[1]
    assert health["model_ready"], "Selected Qwen model is not installed or Ollama is unavailable"
    before = call("/api/demo/traffic", {"source_ip": args.source_ip})
    assert before[0] == 200
    simulation = call("/api/simulations", {"scenario": "http_brute_force", "source_ip": args.source_ip})[1]
    incident_id = simulation["incident"]["id"]
    assert simulation["incident"]["status"] == "detected", "Use a new source IP to measure a new investigation"
    started = time.perf_counter()
    analyzed = call(f"/api/incidents/{incident_id}/analyze", {})[1]
    elapsed = round(time.perf_counter() - started, 3)
    assert analyzed["analysis_mode"] == "ollama", analyzed["analysis_mode"]
    output = json.loads(analyzed["analysis"])
    assert output["classification"] == "HTTP_AUTH_BRUTE_FORCE"
    assert analyzed["trace"]
    assert all("label" not in record for trace in analyzed["trace"] if trace["tool"] == "get_recent_events" for record in json.loads(trace["output"]))
    proposal = analyzed["proposal"]["id"]
    assert call(f"/api/proposals/{proposal}/approve", {"reviewer": "local smoke test"})[0] == 200
    after = call("/api/demo/traffic", {"source_ip": args.source_ip})
    assert after[0] == 403
    report = call(f"/api/reports/{incident_id}")[1]
    assert report["status"] == "verified"
    print(json.dumps({"model": health["model"], "analysis_mode": analyzed["analysis_mode"], "analysis_seconds": elapsed, "tools": [trace["tool"] for trace in analyzed["trace"]], "classification": output["classification"], "before_http": before[0], "after_http": after[0], "report_status": report["status"], "evidence_labels_excluded": True}, indent=2))


if __name__ == "__main__":
    main()
