# Backend v0.2 — Obeto

**Phase / ผู้รับผิดชอบ:** B00–B07 + ส่วนที่ทำได้ก่อนของ B08–B09 · Obeto · อัปเดต 20 ต.ค. (รอบ 2)
**สถานะ:** ผ่านบางส่วน — โค้ด + เทสครบตาม contract v0.2 · ยังไม่ได้ซ้อม 2 เครื่อง และ UI ยังเป็น v0.1
**Branch:** `feature/ai-backend/pitchakorn-pkt` (แตกจาก `beer/model-eval-v2`)

## ตอนนี้ระบบทำอะไรได้

- กฎตรวจจับเป็นไฟล์ YAML อิง Sigma (`backend/rules/`) เกณฑ์เท่าเดิม นับหน้าต่างจากเวลา UTC ของ event
- incident ที่จบแล้วไม่ถูกใช้ซ้ำ · `POST /api/demo/reset` เริ่มซ้อมรอบใหม่ได้โดยไม่ลบประวัติ
- สถานะเปลี่ยนผ่านตาราง transition เดียว นอกเส้น = 409
- policy: target ต้องเท่ากับ source ของ incident · protected จาก `SENTINEL_PROTECTED_IPS` · `BLOCK_IP` เฉพาะ CRITICAL
- agent ใช้ 5 tools ตาม benchmark, analysis strict + retry 1 ครั้ง → `rule_fallback` · proposal สร้างจาก `recommended_action`
- trace ตามชื่อ OpenTelemetry GenAI + `analysis_meta` (model digest, prompt/rules version)
- audit log hash chain + `GET /api/audit/verify`
- เครื่องอื่นเข้าได้แค่ health + demo endpoints (rate limit) · ที่เหลือต้อง localhost หรือ `X-Admin-Key`
- `python -m backend.preflight --host <IP>` ตรวจเครื่องก่อนเดโม
- **agent 3 ตัว (LangGraph)** investigation → threat_analysis → defense_planning · planner ไม่เห็นข้อความจาก log · โมเดลจริงบน M5 19.4–22.2 วิ/incident (ตัวเดียว 22–23) planner 1–2 วิ · กับ prompt 3 ไฟล์ของ Beer (PR #7) 20.1–24.3 วิ 6.3 GB · investigator ใช้ tool อ่านอย่างเดียว 4 ตัว
- กฎ 5 ตัว: HTTP/SSH brute force, port scan, **suspicious login** (success หลัง failed ≥5), **traffic anomaly** (≥100 connection/60 วิ)
- scenario 6 แบบตามสเปก A–E + `POST /api/simulations/start|stop`, `GET /api/simulations/state` ส่งทีละ event ให้ dashboard เห็นสด
- `POST /api/logs` แปลง log sshd ดิบเป็น event (สเปก D: log parser)
- SOC metrics: MTTD / time to proposal / MTTR / time to verify ใน `/api/metrics.soc` และ `report.soc_timings`
- `backend/Makefile` + `backend/scripts/` (smoke, bench, eval) + `docs/backend-runbook.md`

## ไฟล์ที่เปลี่ยน

`backend/` ทั้งหมด (app, agent, config, detection, policy, store, soc, preflight, rules, tests, scripts, Makefile, requirements, .env.example) · `docs/api-contract.md` (v0.2) · `docs/threat-model.md` (ใหม่) · `docs/backend-runbook.md` (ใหม่) · `docs/test-results.md` (เพิ่มหัวข้อ Backend v0.2 + แถว backend) · รายงานนี้
ไม่ได้แตะ `frontend/`, `model/`, `datasets/` (อ่านอย่างเดียว), `scripts/`, ร่าง contract, plan, prompts, bot, `docs/demo-runbook.md`

## ทดสอบจริง

```sh
make -C backend test
```
→ **395 passed ~9 วิ** (เดิม 22) แยกตามไฟล์ใน `docs/test-results.md` หัวข้อ Backend v0.2 · ไม่มีเทสไหนเจอบั๊กของ backend

| วัด | คำสั่ง | ผล |
|---|---|---|
| detection บน 47 เคสที่ติด label | `make -C backend eval` | test 28 เคส: P/R/F1 = 1.0, FP 0 (ชุดข้อมูลออกแบบให้ตรง threshold — ไม่ใช่ traffic จริง) |
| v0.1 → v0.2 workload เดียวกัน | `make -C backend bench` | ingest 718 → 655 events/วิ (−9%) · ลูปเต็ม 8.5 → 13.8 ms · incident เท่ากัน 70 |
| server จริง | `make -C backend smoke` | `SMOKE PASS` (rule_fallback) · `--require-model` ไม่มีโมเดล → FAIL ชัดเจน |

รันจริงกับโมเดลบน **MacBook Pro M5 16GB · Ollama 0.40.5 (MLX) · qwen3.5:4b** — `http_brute_force` 1 incident ต่อรอบ:

| รอบ | เวลา analyze | mode | ผล |
|---|---|---|---|
| 1 (ก่อนแก้ลูป) | 32.7 วิ | ollama | TEMP_BLOCK_IP → proposal `model` · audit valid |
| 2 | 29.4 วิ | ollama | เหมือนกัน |
| 3 | 26.3 วิ | ollama | เหมือนกัน |

- โมเดลเรียก `get_incident_logs → get_ip_activity + get_firewall_status → propose_block_ip` แล้วตอบ JSON ผ่าน schema ครั้งแรก
- เพิ่ม: เรียก `propose_block_ip` แล้วจบการสืบทันที (ตัด 1 รอบ ~8 วิ)
- `ollama ps` หลัง 2 รอบ: 5.3 GB (ไม่ถึง 12 GB แบบที่เห็น 17 ต.ค. — รอบนั้นรัน 12 เคสติดกัน)

`python -m backend.preflight --host 192.168.137.5` ตอนไม่เปิด Ollama และไม่ใส่ IP M5 ใน protected → FAIL 2 ข้อพร้อมวิธีแก้ ตามที่ควรเป็น

## ยังไม่ได้ทดสอบ/ยังไม่ผ่าน

- ซ้อม 2 เครื่องจริงบน hotspot (Neo → M5)
- benchmark 47 เคสของ Beer บน M5 (นัดวันที่ 22)
- UI ยังอ่านรูปแบบ v0.1 (`analysis.summary`, `proposal.source_ip` ฯลฯ) จะพังบางหน้าจนกว่าฝั่ง frontend อัปเดต
- ยังไม่มีกฎ honeypot · กฎ `SUSPICIOUS_LOGIN` เพิ่มแล้ว (success หลัง failed ≥5 / 60 วิ)
- ยังไม่จำกัดขนาด body ระดับ server · rate limit อยู่ในหน่วยความจำ
- smoke + benchmark รอบนี้ไม่ได้เปิด Ollama (ผลกับโมเดลจริงยังเป็น 3 รอบด้านบน)
- Dockerfile ยังไม่ทำ (Docker Desktop ไม่ได้เปิด + CI เป็นไฟล์ร่วม รอคุยกัน)

## สิ่งที่เจอระหว่างเทส

1. ✅ **แก้แล้ว** `/docs`, `/redoc`, `/openapi.json` เคยเปิดให้เครื่องใน LAN อ่านแผนผัง API ได้ → ตอนนี้ต้อง localhost หรือ `X-Admin-Key` (Beer ตกลง 20 ต.ค.)
2. ✅ **แก้แล้ว** event ที่ `username` ยาวเกิน 80 ตัวเคยถูกปฏิเสธทั้งแถว (เจอในเคส `dev-18` ชื่อยาว 116 ตัว) = ผู้โจมตีใส่ชื่อยาวแล้วหลบการตรวจจับได้ → ตอนนี้เก็บ 80 ตัวแรก + `username_truncated = 1` ทั้ง `/api/events` และ `/api/demo/login` · เกิน 1024 ตัวยัง 422 · contract อัปเดตแล้ว
3. **ลบ audit แถวล่าสุดแล้ว verify ยัง valid** — ข้อจำกัดของ hash chain (อยู่ใน threat model แล้ว) · ลดได้โดยใส่จำนวนแถว + hash ล่าสุดในรายงาน/สไลด์ตอนจบเดโม
4. ✅ `scripts/smoke_local.py` (v0.1) Beer ลบใน PR #3 · ใช้ `make -C backend smoke` แทน · `docs/demo-runbook.md` เลิกใช้ `--host 0.0.0.0` แล้ว (Beer ให้แก้ใน PR นี้)

## สิ่งที่เพื่อนต้องใช้หรือทำต่อ (Beer)

- อ่าน `docs/api-contract.md` หัวข้อ "เปลี่ยนจาก v0.1" แล้วปรับ UI
- `proposal.source = rule_fallback` และ `analysis.confidence = null` ควรมีป้ายบนหน้าจอ
- WS เพิ่ม stage `analysis_step` (trace ทีละแถวระหว่างวิเคราะห์) และ `reset`
- ถ้าแก้ prompt ให้เป็นไฟล์ใหม่ (v2) แล้วบอก backend จะชี้ `SENTINEL_PROMPT_PATH`

## คนต้องตรวจ

1. `uvicorn backend.app:app` แล้วเปิด `/docs` — เห็น endpoint ใหม่ `/api/demo/reset`, `/api/audit`, `/api/audit/verify`
2. `POST /api/simulations` http_brute_force → `POST /api/incidents/1/analyze` → ได้ `analysis` เป็น object และ proposal `pending`
3. approve → `POST /api/demo/traffic {"source_ip":"192.0.2.25"}` ได้ 403 → incident `verified`
4. `GET /api/audit/verify` → `valid: true`

## เฟสถัดไป

- B08: ส่วน backend เสร็จ (detection P/R/F1, SOC timings, report API, benchmark) · เหลือรวมกับผลโมเดลของ Beer บน M5 (นัด 22 ต.ค.)
- B09: runbook ฝั่ง backend เสร็จ (`docs/backend-runbook.md`) · เหลือซ้อม 2 เครื่องจริง (ต้องรอ UI อ่าน v0.2)
- ค้าง: กฎ honeypot
