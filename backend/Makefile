# Backend shortcuts. Usable from anywhere: make -C backend <target>
# Every command runs from the repo root and loads backend/.env when it exists (copy backend/.env.example).

ROOT := $(abspath $(dir $(lastword $(MAKEFILE_LIST)))/..)
PY   := $(ROOT)/backend/.venv/bin/python
PORT ?= 8000
ENV  := set -a; [ -f backend/.env ] && . backend/.env; set +a;

.PHONY: help venv test run run-lan preflight smoke reset bench eval

help:
	@echo "venv       create backend/.venv and install requirements"
	@echo "test       run the backend test suite"
	@echo "run        serve on 127.0.0.1:$(PORT) (this Mac only)"
	@echo "run-lan    HOST=<M5 LAN IP>: preflight, then serve on the lab network"
	@echo "preflight  readiness check (Ollama, model, protected IPs, rules, DB)"
	@echo "smoke      end-to-end check against the running server (SMOKE_ARGS=--require-model on demo day)"
	@echo "reset      close open incidents and disable rules on the running server (history kept)"
	@echo "bench      ingest throughput v0.1 vs v0.2 (BENCH_ARGS=--events 2000)"
	@echo "eval       replay datasets/sentinel_cases_v1.json through the detection rules"

venv:
	cd $(ROOT) && python3 -m venv backend/.venv && backend/.venv/bin/pip install -q -r backend/requirements.txt

test:
	cd $(ROOT) && $(PY) -m pytest backend/tests -q --basetemp backend/tests/.tmp

run:
	cd $(ROOT) && $(ENV) $(PY) -m uvicorn backend.app:app --host 127.0.0.1 --port $(PORT)

run-lan:
	@[ -n "$(HOST)" ] || { echo "usage: make run-lan HOST=192.168.x.y (the M5 address on the hotspot)"; exit 2; }
	cd $(ROOT) && $(ENV) export SENTINEL_ALLOWED_HOSTS="$(HOST)$${SENTINEL_ALLOWED_HOSTS:+,$$SENTINEL_ALLOWED_HOSTS}" SENTINEL_LAN_HOST="$(HOST)"; \
	$(PY) -m backend.preflight --host $(HOST) && $(PY) -m uvicorn backend.app:app --host $(HOST) --port $(PORT)

preflight:
	cd $(ROOT) && $(ENV) $(PY) -m backend.preflight $(if $(HOST),--host $(HOST))

smoke:
	cd $(ROOT) && $(PY) backend/scripts/smoke.py --base http://127.0.0.1:$(PORT) $(SMOKE_ARGS)

reset:
	curl -fsS -X POST http://127.0.0.1:$(PORT)/api/demo/reset && echo

bench:
	cd $(ROOT) && $(PY) backend/scripts/bench_ingest.py $(BENCH_ARGS)

eval:
	cd $(ROOT) && $(PY) backend/scripts/eval_detection.py
