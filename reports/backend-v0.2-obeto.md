# Backend v0.2 — Obeto

**Phase / ผู้รับผิดชอบ:** B00–B07 (ส่วน backend) · Obeto
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

## ไฟล์ที่เปลี่ยน

`backend/` ทั้งหมด (app, agent, config, detection, policy, store, preflight, rules, tests, requirements, .env.example) · `docs/api-contract.md` (v0.2) · `docs/threat-model.md` (ใหม่) · รายงานนี้
ไม่ได้แตะ `frontend/`, `model/`, `datasets/`, ร่าง contract, plan, prompts, bot

## ทดสอบจริง

```sh
python -m pytest backend/tests -q --basetemp backend/tests/.tmp
```
→ **22 passed** (7 ข้อเดิมปรับเป็น v0.2 + 15 ข้อใหม่: protected env, goal hijack, action→status ×3, BLOCK_IP/CRITICAL, retry, fallback, เปิด incident ใหม่, reset, audit tamper, timezone, remote read/WS, rate limit, rule YAML)

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
- ยังไม่มีกฎ `SUSPICIOUS_LOGIN` / honeypot (โมเดลจำแนกได้ แต่ detection ยังไม่สร้าง incident ประเภทนี้)
- ยังไม่จำกัดขนาด body ระดับ server · rate limit อยู่ในหน่วยความจำ

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

B08–B09 เริ่มได้หลัง UI อ่าน v0.2 ได้ · ระหว่างนี้: benchmark บน M5 + กฎ suspicious login
