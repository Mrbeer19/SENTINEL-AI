"""Before/after benchmark of the backend itself: v0.1 (6930667) vs v0.2 (HEAD), same workload.

    backend/.venv/bin/python backend/scripts/bench_ingest.py [--events 2000] [--loops 20] [--old 6930667] [--new HEAD]

Each version is extracted with `git archive` and run in its own process on a fresh SQLite file, in-process
(FastAPI TestClient) with Ollama disabled. It measures app + SQLite cost only, not network or model time:
  ingest  POST /api/events, mixed HTTP/SSH/CONNECTION from 50 IPs → events/s, p50/p95 ms
  loop    simulate → analyze (rule fallback) → approve → request denied 403 → ms per incident
"""

from __future__ import annotations

import argparse
import json
import os
import statistics
import subprocess
import sys
import tarfile
import tempfile
import time
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]


def percentile(values: list[float], p: float) -> float:
    values = sorted(values)
    return round(values[min(len(values) - 1, int(round(p * (len(values) - 1))))], 2)


def worker(events: int, loops: int) -> dict:
    """Runs inside the extracted version; `backend` resolves through PYTHONPATH."""
    from fastapi.testclient import TestClient

    from backend.app import create_app

    client = TestClient(create_app(Path(tempfile.mkdtemp()) / "bench.db"))
    kinds = [("HTTP_AUTH", "failed", None), ("SSH_AUTH", "failed", None), ("CONNECTION", "attempt", "port"), ("HTTP_AUTH", "success", None)]
    took = []
    for i in range(events):
        kind, outcome, port = kinds[i % len(kinds)]
        body = {"source_ip": f"203.0.113.{i % 50 + 1}", "event_type": kind, "outcome": outcome}
        if port:
            body["destination_port"] = 1000 + i % 30
        t = time.perf_counter()
        assert client.post("/api/events", json=body).status_code == 201
        took.append((time.perf_counter() - t) * 1000)
    loop_ms = []
    for i in range(loops):
        ip = f"198.51.100.{i + 1}"
        t = time.perf_counter()
        incident = client.post("/api/simulations", json={"scenario": "http_brute_force", "source_ip": ip}).json()["incident"]
        proposal = client.post(f"/api/incidents/{incident['id']}/analyze").json()["proposal"]
        assert client.post(f"/api/proposals/{proposal['id']}/approve", json={"reviewer": "bench"}).status_code == 200
        assert client.post("/api/demo/traffic", json={"source_ip": ip}).status_code == 403
        loop_ms.append((time.perf_counter() - t) * 1000)
    return {
        "events": events,
        "events_per_s": round(events / (sum(took) / 1000), 1),
        "ingest_p50_ms": percentile(took, 0.5),
        "ingest_p95_ms": percentile(took, 0.95),
        "incidents": len(client.get("/api/incidents").json()),
        "loop_median_ms": round(statistics.median(loop_ms), 1),
        "loop_p95_ms": percentile(loop_ms, 0.95),
    }


def run_version(ref: str, events: int, loops: int) -> dict:
    with tempfile.TemporaryDirectory() as tmp:
        archive = Path(tmp) / "src.tar"
        subprocess.run(["git", "-C", str(REPO), "archive", "-o", str(archive), ref, "backend"], check=True)
        with tarfile.open(archive) as tar:
            tar.extractall(tmp, filter="data")
        env = {**os.environ, "PYTHONPATH": tmp, "SENTINEL_DISABLE_OLLAMA": "1", "OLLAMA_URL": "http://127.0.0.1:9"}
        done = subprocess.run([sys.executable, __file__, "--worker", "--events", str(events), "--loops", str(loops)],
                              env=env, cwd=tmp, capture_output=True, text=True)
        if done.returncode:
            raise SystemExit(f"{ref} failed:\n{done.stderr[-2000:]}")
        commit = subprocess.run(["git", "-C", str(REPO), "rev-parse", "--short", ref], capture_output=True, text=True).stdout.strip()
        return {"ref": ref, "commit": commit, **json.loads(done.stdout.strip().splitlines()[-1])}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--events", type=int, default=2000)
    parser.add_argument("--loops", type=int, default=20)
    parser.add_argument("--old", default="6930667", help="v0.1 baseline commit")
    parser.add_argument("--new", default="HEAD")
    parser.add_argument("--worker", action="store_true", help=argparse.SUPPRESS)
    args = parser.parse_args()
    if args.worker:
        print(json.dumps(worker(args.events, args.loops)))
        return 0
    rows = [run_version(ref, args.events, args.loops) for ref in (args.old, args.new)]
    keys = ["commit", "events_per_s", "ingest_p50_ms", "ingest_p95_ms", "incidents", "loop_median_ms", "loop_p95_ms"]
    print("| metric | " + " | ".join(f"{r['ref']}" for r in rows) + " |")
    print("|---|" + "---|" * len(rows))
    for key in keys:
        print(f"| {key} | " + " | ".join(str(r[key]) for r in rows) + " |")
    print(f"\n{args.events} events, {args.loops} loops, in-process, Ollama disabled, Python {sys.version.split()[0]}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
