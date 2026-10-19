# API contract — v0.2

OpenAPI ที่ `/docs` และ `/openapi.json` (เปิดได้จาก localhost หรือมี `X-Admin-Key` เท่านั้น) สะท้อน schema ปัจจุบัน ก่อนแก้ field/status ให้แก้ contract, backend และ tests ใน PR เดียวกัน แล้วแจ้งฝั่ง frontend เจ้าของ contract: Obeto · ร่างที่ใช้รวม: `docs/api-contract-v0.2-draft.md` (Beer)

## เปลี่ยนจาก v0.1

| เรื่อง | v0.1 | v0.2 |
|---|---|---|
| `analysis` | string JSON `classification, severity(ตัวเล็ก), summary, evidence, recommendation` · fallback เป็นข้อความ | object ตาม [Analysis](#analysis) ทั้งผลโมเดลและ fallback |
| `incident.severity` | `low/medium/high` | `LOW/MEDIUM/HIGH/CRITICAL` |
| proposal | สร้างทุกครั้งหลังวิเคราะห์ | สร้างเฉพาะเมื่อ `recommended_action` เป็นการบล็อกและผ่าน policy |
| `proposal.source_ip` | IP เป้าหมาย | ใช้ `target_ip` · `source_ip` ยังส่งเป็น alias ถึง v0.3 |
| `trace[]` | `tool, input, output` | เพิ่ม `operation, status, duration_ms, source` |
| status | 5 ค่า | เพิ่ม `analyzing, needs_review, monitoring, closed` |
| เครื่องอื่นอ่าน API | ได้ทุก GET และ `/ws` | ได้แค่ `/api/health`, `/api/demo/login`, `/api/demo/traffic` |
| tools ของโมเดล | `get_recent_events`, `get_active_rules` | 5 ตัวตาม benchmark ([Tools](#tools)) |
| WS | `{stage, payload}` | `{v: 2, stage, ts, payload}` + stage `analysis_step`, `reset` |

ไม่เปลี่ยน: path ทั้งหมด · `incident.kind` · demo login/traffic · `/api/simulations` · `uvicorn backend.app:app`

## Event

`POST /api/events` → 201 `{ "event": EventRecord, "incident": Incident | null }`

```json
{
  "source_ip": "192.0.2.25",
  "event_type": "HTTP_AUTH",
  "outcome": "failed",
  "destination_port": null,
  "timestamp": "2026-10-16T15:00:00+07:00",
  "label": "unknown",
  "username": "admin"
}
```

- `event_type` = `HTTP_AUTH | SSH_AUTH | CONNECTION` · `outcome` = `failed | success | attempt` · port 1–65535 (optional)
- `timestamp` ต้องมี timezone ไม่เกินอนาคต 5 นาที **เก็บเป็น UTC เสมอ** (`+00:00`) ไม่ส่ง = เวลารับ
- `username` optional รับได้ ≤1024 ตัว (เกิน = 422) **เก็บแค่ 80 ตัวแรก** ตัวพิมพ์ได้เท่านั้น · ถูกตัดเมื่อไหร่ `username_truncated = 1` (event ไม่หายจากการตรวจจับ) · ไม่เก็บ password · `label` ใช้ประเมินเท่านั้น ไม่ส่งให้โมเดล
- Record เพิ่ม `id`, `ocsf_class_uid` ([OCSF](#ocsf)) และ `username_truncated` (0/1 · แถวเก่าก่อนเพิ่ม field = `null`) · `GET /api/events?limit=100` ใหม่ก่อน สูงสุด 500

### Raw log ingest

`POST /api/logs` `{ "format": "sshd", "lines": ["2026-10-20T12:00:01+07:00 m5 sshd[1200]: Failed password for invalid user admin from 192.0.2.25 port 51234 ssh2", ...], "label": "unknown" }` (1–1000 บรรทัด, บรรทัดละ ≤1000 ตัว · localhost/admin key เท่านั้น)

- เวลา: ISO (rsyslog Ubuntu 24.04) หรือ `Oct 20 12:00:01` (ไม่มีปี/โซน → เวลาท้องถิ่นของ server)
- `Failed password|publickey` → `SSH_AUTH failed` · `Accepted password|publickey` → `SSH_AUTH success` · port 22 · ผ่าน validation + detection เดียวกับ `POST /api/events`
- บรรทัด sshd อื่น (`Invalid user`, `Connection closed`, pam) = `skipped` (ไม่นับซ้ำ) · อ่านไม่ได้/ไม่ผ่าน validation = `rejected` ไม่ทำให้ทั้งชุดล้ม
- ตอบ `{lines, accepted, skipped, rejected, errors: [{line, error}] (≤20), incident_ids}`

## Detection

กฎอยู่ที่ `backend/rules/*.yml` รูปแบบอิง Sigma (selection + correlation ในไฟล์เดียว) เปลี่ยนเกณฑ์ได้โดยไม่แก้โค้ด

| rule id | kind | เงื่อนไข | ATT&CK | level |
|---|---|---|---|---|
| `sentinel-http-auth-bruteforce` | `HTTP_AUTH_BRUTE_FORCE` | `HTTP_AUTH` failed ≥5 / 60 วิ / IP | T1110.001 | HIGH |
| `sentinel-ssh-auth-bruteforce` | `SSH_BRUTE_FORCE` | `SSH_AUTH` failed ≥5 / 60 วิ / IP (log replay) | T1110.001 | HIGH |
| `sentinel-port-scan` | `PORT_SCAN` | `CONNECTION` ≥8 พอร์ตต่างกัน / 60 วิ / IP | T1046 | MEDIUM |
| `sentinel-traffic-anomaly` | `TRAFFIC_ANOMALY` | `CONNECTION` ≥100 ครั้ง / 60 วิ / IP (พอร์ตใดก็ได้) · สเปก scenario E (เสริม) | T1498 | MEDIUM |
| `sentinel-suspicious-login` | `SUSPICIOUS_LOGIN` | login **success** หลัง failed ≥5 ช่องทางเดียวกัน (HTTP/SSH) / 60 วิ / IP · `event_count` = จำนวน failed | T1078 | HIGH |

- หน้าต่างเวลานับย้อนจาก **เวลาของ event** (UTC)
- ≥3 เท่าของเกณฑ์ → `CRITICAL`
- brute force ที่เข้าได้ในที่สุด = **2 incident** จาก IP เดียวกัน: `*_BRUTE_FORCE` (ตอน failed ครั้งที่ 5) + `SUSPICIOUS_LOGIN` (ตอน success) · UI แสดงแยกกัน อนุมัติบล็อกอันไหนก็บล็อก IP เดียวกัน
- incident ที่ยังเปิดของ (IP, kind) เดิมจะถูกอัปเดต `event_count` · incident ที่จบแล้ว (`verified | rejected | closed`) ไม่ถูกใช้ซ้ำ → เปิดใหม่

## Incident

Field: `id, kind, source_ip, status, severity, event_count, created_at, updated_at, rule_id, attack_technique, analysis, analysis_mode, analysis_meta`
`GET /api/incidents/{id}` เพิ่ม `trace[]`, `timeline[]`, `proposal | null`

```
detected → analyzing → awaiting_approval → blocked → verified
                     ↘ needs_review | monitoring | closed
awaiting_approval → rejected
blocked → closed (ปลดกฎก่อน verify)
ทุกสถานะที่ยังเปิด → closed (demo reset)
```

เปลี่ยนนอกเส้นนี้ → 409 · ทุกการเปลี่ยนเขียน audit 1 แถว

## Analysis

`POST /api/incidents/{id}/analyze` รอจนเสร็จแล้วคืน incident detail (บน M5 ~30 วิ) ระหว่างนั้นส่ง WS `analysis_step` ทุกขั้น เรียกซ้ำเมื่อมีผลแล้ว = คืนผลเดิม · incident ที่จบแล้ว → 409

```json
{
  "threat_type": "HTTP_AUTH_BRUTE_FORCE",
  "severity": "HIGH",
  "confidence": 0.86,
  "evidence": ["20 failed logins to /api/demo/login within 60 s", "No successful login"],
  "recommended_action": "TEMP_BLOCK_IP",
  "explanation_th": "IP นี้ลองรหัสผ่านผิดซ้ำ 20 ครั้งใน 1 นาที เข้าข่ายเดารหัสผ่าน"
}
```

| field | ค่า |
|---|---|
| `threat_type` | `HTTP_AUTH_BRUTE_FORCE \| SSH_BRUTE_FORCE \| PORT_SCAN \| SUSPICIOUS_LOGIN \| TRAFFIC_ANOMALY \| BENIGN \| UNKNOWN` |
| `severity` | `LOW \| MEDIUM \| HIGH \| CRITICAL` |
| `confidence` | 0–1 จากโมเดล · **`null` เมื่อ `rule_fallback`** · ใช้แสดงผลเท่านั้น ไม่ใช้แทนการอนุมัติ |
| `evidence` | string 1–10 รายการ |
| `recommended_action` | `NO_ACTION \| MONITOR \| INVESTIGATE \| TEMP_BLOCK_IP \| BLOCK_IP` |
| `explanation_th` | string ไม่ว่าง |

ห้ามมี key อื่น (strict) · ถ้าโมเดลพิมพ์ข้อความล้อม object จะดึง `{...}` ออกมาแล้ว validate strict เหมือนเดิม (ตกลงกับ Beer 20 ต.ค.) · ผิด → retry 1 ครั้งพร้อม error → ยังผิด → `rule_fallback`

`analysis_mode`: `ollama` (เรียก tool แล้ว JSON ผ่าน) · `ollama_retry` (ผ่านหลัง retry) · `ollama_no_tools` · `rule_fallback`
**ห้ามนับ `rule_fallback` เป็นผลของโมเดล**

`analysis_meta`: `{ model, model_digest, prompt_version, rules_version }` — `prompt_version` = `<ชื่อไฟล์>@<sha256 12 ตัว>` ของ `model/prompts/analyst_system_v1.md`

`format=schema` ของ Ollama ปิดเป็นค่าเริ่มต้น (ได้ 501 บน MLX runner) เปิดด้วย `SENTINEL_OLLAMA_FORMAT=1`

### Action → ผล

| `recommended_action` | backend ทำ | status |
|---|---|---|
| `TEMP_BLOCK_IP` / `BLOCK_IP` ผ่าน policy | สร้าง proposal `pending` | `awaiting_approval` |
| `TEMP_BLOCK_IP` / `BLOCK_IP` ไม่ผ่าน policy | ไม่สร้าง · เหตุผลใน timeline stage `policy` | `needs_review` |
| `INVESTIGATE` | ไม่สร้าง | `needs_review` |
| `MONITOR` | ไม่สร้าง | `monitoring` |
| `NO_ACTION` | ไม่สร้าง | `closed` |

`rule_fallback` เสนอ `TEMP_BLOCK_IP` เสมอ แต่ proposal ติด `source = "rule_fallback"` ให้คนเห็น

## Tools

ทั้งหมด scope ฝั่ง server ตาม incident ที่วิเคราะห์ ไม่มี shell ไม่มี SQL อิสระ ชื่อและ args ตรงกับ `model/eval/agent_bench.py`

| tool | args | คืน |
|---|---|---|
| `get_incident_logs` | `incident_id` (`INC-0001`) | `{incident_id, untrusted_log_records[≤40], returned}` · username ตัดเหลือ 64 |
| `get_ip_activity` | `ip_address` (ต้องเป็น source ของ incident) | first/last seen, total, failed/success logins, ports_touched |
| `get_related_incidents` | `ip_address` | incident อื่นของ IP นี้ ≤10 |
| `get_firewall_status` | `ip_address` | `{ip, status: ALLOWED/BLOCKED, protected}` |
| `propose_block_ip` | `ip_address, minutes, reason` | policy pre-check เท่านั้น ไม่บล็อก · IP อื่น/protected → `REJECTED_BY_POLICY` |

เพดาน: tool 6 ครั้ง / 4 รอบ · เรียก `propose_block_ip` แล้วจบการสืบทันที

## Trace

| field | ค่า |
|---|---|
| `operation` | `invoke_agent` (ทั้งรอบ) · `chat` (เรียกโมเดล 1 ครั้ง) · `execute_tool` — ตามชื่อ OpenTelemetry GenAI |
| `tool` | ชื่อ tool / ชื่อโมเดล / `investigation` / `rule_fallback` |
| `status` | `ok \| error \| rejected_by_policy \| invalid_output \| fallback` |
| `source` | `model \| fallback` |
| `duration_ms`, `input`, `output` (JSON string), `created_at` | |

## Proposal และ policy

Field: `id, incident_id, target_ip, source_ip (alias), action, duration_seconds, status=pending|approved|rejected, reviewer, created_at, source=model|rule_fallback, d3fend="D3-ITF", reason, policy_notes[]`

Policy (`backend/policy.py`) ตรวจตอนสร้างและตอนอนุมัติซ้ำอีกรอบ:
1. action ต้องเป็น `TEMP_BLOCK_IP | BLOCK_IP`
2. **`target_ip` ต้องเท่ากับ `source_ip` ของ incident**
3. ไม่อยู่ใน protected: loopback, `0.0.0.0`, `::`, multicast และ `SENTINEL_PROTECTED_IPS`
4. `TEMP_BLOCK_IP` = 600 วิ · `BLOCK_IP` = 3600 วิ เฉพาะ incident `CRITICAL` (ไม่ใช่ → ลดเป็น TEMP + note)

- `GET /api/proposals`
- `POST /api/proposals/{id}/approve` body `{ "reviewer": "SOC operator" }` → incident detail · สร้างกฎ · `blocked`
- `POST /api/proposals/{id}/reject` → incident detail · ไม่สร้างกฎ · `rejected`
- ตัดสินซ้ำ 409 · policy ไม่ผ่านตอนอนุมัติ 400

## Firewall และ verification

- `GET /api/rules` → array มี `active` · `DELETE /api/rules/{id}` ปิดกฎ (incident `blocked` → `closed`)
- บล็อกระดับแอปเฉพาะ demo login/traffic ไม่แตะ firewall ของ OS
- **`verified` เฉพาะเมื่อ request ใหม่จริงจาก IP เดิมโดน 403** การมีกฎอย่างเดียวไม่นับ

## Demo

- `POST /api/demo/login` `{ "username": "student", "password": "wrong" }` → 200 / 401 / 403 (โดนบล็อก) · ใช้ IP จาก connection · บัญชีถูก = `student` / `sentinel-demo`
- `POST /api/demo/traffic` `{}` → 200 `{source_ip, decision: "allowed", rule_id: null}` / **403** `decision: "denied"` · local เท่านั้นส่ง `source_ip` จำลองได้
- `POST /api/demo/reset` (local) → `{rules_disabled, incidents_closed}` ปิดกฎ active, ปิด incident ที่ยังเปิด, ปฏิเสธ proposal ค้าง · ไม่ลบประวัติ
- `POST /api/simulations` `{ "scenario": "http_brute_force | ssh_brute_force_logs | port_scan | suspicious_login | traffic_anomaly | normal", "source_ip": "192.0.2.25" }` → ส่ง event ทั้งหมดทันที · จำนวน event: 6 / 6 / 9 / 7 / 120 / 2
- **ส่งทีละ event (ดูสดบน dashboard):** `POST /api/simulations/start` body เดียวกัน + `interval_ms` (50–10000, ค่าเริ่มต้น 500) → **202** state · รันได้ทีละอัน ซ้อน = 409 · `POST /api/simulations/stop` → state (`stopped: true`) · `GET /api/simulations/state` → `{running, scenario, source_ip, sent, total, interval_ms, started_at, finished_at, stopped, incident_ids, source_note}` · ทุก event ส่ง WS stage `simulation` พร้อม state
- `GET /api/traffic` → 100 ล่าสุด

## Audit

`audit_log`: `id, ts, actor, action, incident_id, detail (JSON string), prev_hash, hash` — `hash = sha256([ts, actor, action, incident_id, detail, prev_hash])` แถวแรกใช้ prev = `0×64`
- `GET /api/audit?limit=200`
- `GET /api/audit/verify` → `{valid, entries, broken_at}` แก้/ลบ/สลับแถวใดก็ตาม chain ขาด
- action: `incident_created, status_changed, analysis_recorded, proposal_created, proposal_rejected, rule_applied, rule_disabled, verification_passed, demo_reset`
- `timeline` เดิมยังอยู่สำหรับ UI (ไม่มี hash)

## Reports, health และ realtime

- `GET /api/health` (เปิดให้ Neo) → `status, version, model, model_ready, ai_mode`
- `GET /api/metrics` · `GET /api/reports/{id}` (incident detail + events + traffic + audit)
- `WS /ws` → `{ "v": 2, "stage": "...", "ts": "...", "payload": {...} }`
- stage: `connected | event | incident | analysis_step | analysis | approval | firewall | traffic | verification | reset | simulation`
- `analysis_step.payload` = trace row 1 แถว · reconnect แล้ว refetch REST

## Access และ errors

| ใคร | เข้าได้ |
|---|---|
| localhost (M5) | ทุก endpoint |
| เครื่องอื่นที่มี `X-Admin-Key` = `SENTINEL_ADMIN_KEY` | ทุก endpoint รวม `/ws` |
| เครื่องอื่น (Neo) | `/api/health`, `/api/demo/login`, `/api/demo/traffic` เท่านั้น · จำกัด 30 ครั้ง / 10 วิ / IP (429) · `/docs` `/redoc` `/openapi.json` = 403 |

**กันเว็บอื่นในเบราว์เซอร์บน M5:** POST/PUT/PATCH/DELETE ที่มี `Origin` ไม่ใช่ `localhost` / `127.0.0.1` / `SENTINEL_ALLOWED_HOSTS` (พอร์ตใดก็ได้) → 403 `Cross-site request refused` · ไม่มี `Origin` (curl, terminal) ผ่าน · `Host` ไม่อยู่ในรายการ → 400 `Invalid host header` · WS ใช้กฎ `Origin` เดียวกัน · `make run-lan HOST=…` เพิ่ม IP M5 ให้เอง

ห้ามเปิด Vite dev server ให้ LAN เพราะ proxy ทำให้ request ดูเหมือน localhost · ตรวจเครื่องก่อนเดโม: `python -m backend.preflight --host <M5 LAN IP>`

Errors: 422 validation · 404 ไม่พบ · 400 policy / Host ไม่อนุญาต · 403 สิทธิ์/spoof/โดนบล็อก · 409 ตัดสินซ้ำ/สถานะผิดลำดับ · 429 เกินอัตรา · รูปแบบ `{ "detail": string | ValidationError[] }`

## OCSF

อิงชื่อ class ของ OCSF (ไม่ได้ส่งออกเต็มสเปก)

| ของเรา | OCSF |
|---|---|
| `HTTP_AUTH`, `SSH_AUTH` | Authentication (`class_uid` 3002) |
| `CONNECTION` | Network Activity (`class_uid` 4001) |
| `source_ip` | `src_endpoint.ip` |
| `destination_port` | `dst_endpoint.port` |
| `outcome` | `status` (Success / Failure) |
| `username` | `user.name` |
| `timestamp` | `time` |
