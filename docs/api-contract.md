# API contract — MVP 0.1

OpenAPI ที่ `/docs` และ `/openapi.json` สะท้อน schema ปัจจุบัน เอกสารนี้อธิบายการเชื่อมสอง pipeline ก่อนแก้ field/status ให้แก้ทั้ง contract, backend, frontend และ tests ในงานเดียวกัน

## Event

`POST /api/events` → 201: `{ "event": EventRecord, "incident": Incident | null }`

```json
{
  "source_ip": "192.0.2.25",
  "event_type": "HTTP_AUTH",
  "outcome": "failed",
  "destination_port": null,
  "timestamp": "2026-10-16T08:00:00+00:00",
  "label": "unknown"
}
```

`source_ip` ต้องเป็น IPv4/IPv6; `event_type` = `HTTP_AUTH | SSH_AUTH | CONNECTION`; `outcome` = `failed | success | attempt`; optional port 1–65535; timestamp หากส่งต้องมี timezone และไม่เกินอนาคต 5 นาที; ถ้าไม่ส่งใช้เวลารับ event; `label` = `normal | attack | unknown` ใช้ประเมินเท่านั้น ไม่ส่ง label ให้โมเดลเป็นหลักฐาน

Record เพิ่ม `id` และ timestamp จริง `GET /api/events?limit=100` คืน array ใหม่ก่อน จำกัดสูงสุด 500

## Detection และ incident

ในหน้าต่าง 60 วินาที: HTTP/SSH failed >=5 ครั้งจาก IP เดียวกันตรวจแยกชนิด; CONNECTION >=8 distinct destination ports เป็น port scan ปัจจุบัน incident เดิมของ source/kind ที่ยังไม่ `closed` จะถูกอัปเดต event_count

Incident มี `id`, `kind`, `source_ip`, `status`, `severity`, `event_count`, `created_at`, `analysis`, `analysis_mode` รายละเอียดจาก `GET /api/incidents/{id}` เพิ่ม `trace[]`, `timeline[]`, `proposal | null`

สถานะหลัก: `detected → awaiting_approval → blocked → verified` หรือ `awaiting_approval → rejected` การ unblock เปลี่ยนสถานะกฎและเพิ่ม audit record; ไม่ลบประวัติ incident เดิม

`POST /api/incidents/{id}/analyze` เรียก Ollama 2 ขั้น: model เลือก read-only tools แล้วสร้าง structured output ที่ validate ด้วย Pydantic

```json
{
  "classification": "HTTP_AUTH_BRUTE_FORCE",
  "severity": "high",
  "summary": "Repeated failed logins",
  "evidence": ["Six failures in recent records"],
  "recommendation": "Review temporary block"
}
```

`analysis` เก็บ JSON นี้เป็น string; ถ้า fallback เป็นข้อความที่ติดป้าย `Rule fallback` โหมด = `ollama` (มี tool calls), `ollama_no_tools` (โมเดลไม่เลือก tool), หรือ `rule_fallback` (โมเดลใช้ไม่ได้/ผลไม่ผ่าน validation) ไม่ใช้ fallback เป็นผลวัดความถูกต้องของโมเดล

Tool allowlist: `get_recent_events` และ `get_active_rules` scope ผูกกับ IP ของ incident ฝั่ง server; trace เก็บ tool/input/output/time จริง ไม่มี shell tool

## Human approval และ firewall

Proposal มี `id`, `incident_id`, `source_ip`, `action=TEMP_BLOCK_IP`, `duration_seconds=600`, `status=pending|approved|rejected`, `reviewer`, `created_at`

- `GET /api/proposals` → array
- `POST /api/proposals/{id}/approve` body `{ "reviewer": "SOC operator" }` → Incident detail; สร้าง rule หลังตรวจ protected IP
- `POST /api/proposals/{id}/reject` body เหมือนกัน → Incident detail; ไม่สร้าง rule
- ตัดสินใจซ้ำ → 409; protected/loopback IP → 400
- `GET /api/rules` → array มี `active` คำนวณจาก expiry
- `DELETE /api/rules/{id}` → ปิดกฎด้วย expiry และบันทึก timeline

Rule มี `id`, `proposal_id`, `source_ip`, `expires_at`, `created_at`, `active` ระบบบล็อกเฉพาะ demo traffic/login ในระดับแอป

## Demo และ verification

- `POST /api/demo/login` body `{ "username": "student", "password": "wrong" }` ใช้ IP จริงจาก connection; ทดสอบรหัสถูกด้วย `sentinel-demo`; สำเร็จ 200, auth ไม่ผ่าน 401, ถูก rule บล็อก 403; ไม่เก็บ password ใน event
- `POST /api/demo/traffic` body `{}` ใช้ IP จริง; local operator เท่านั้นที่ส่ง `{ "source_ip": "192.0.2.25" }` เพื่อจำลอง IP ได้
- Allowed → 200 `{ "source_ip": "...", "decision": "allowed", "rule_id": null }`
- Denied → **403** `{ "source_ip": "...", "decision": "denied", "rule_id": 1 }`; เพิ่ม traffic record แล้วจึงตั้ง incident `verified`
- `GET /api/traffic` → 100 records ล่าสุด
- `POST /api/simulations` body `{ "scenario": "http_brute_force", "source_ip": "192.0.2.25" }`
- Scenario = `http_brute_force | ssh_brute_force_logs | port_scan | normal`; เป็น bounded synthetic events ที่ผ่าน ingestion เดียวกัน

## Reports, health และ realtime

- `GET /api/health` → status, model, model_ready, ai_mode
- `GET /api/metrics` → events, incidents, exploratory precision/recall/F1 พร้อม note ขอบเขต
- `GET /api/reports/{id}` → incident detail + events + traffic
- `WS /ws` → `{ "stage": "event", "payload": {...} }`
- Stage = `connected | event | incident | analysis | approval | firewall | traffic | verification`
- เมื่อ reconnect ให้ refetch REST state; WebSocket แจ้งเปลี่ยนแปลง ไม่ใช่แหล่งเก็บข้อมูลหลัก

## Access และ errors

รัน local operator ที่ localhost เป็นค่าเริ่มต้น เมื่อเปิด private LAN, remote client เขียน management API ต้องมี `X-Admin-Key` ตรงกับ `SENTINEL_ADMIN_KEY` ส่วน demo login/traffic เปิดไว้รับการทดสอบจากเครื่องเพื่อน ห้ามเปิด Vite dev server ให้ LAN เพราะ proxy จะทำให้ request ดูเหมือน localhost

Validation 422, missing resource 404, policy/source spoofing 400/403, repeated decision 409 รูปแบบ error = `{ "detail": string | ValidationError[] }` ระบบนี้เป็น lab MVP ยังไม่มีบัญชีผู้ใช้/role และยังไม่ผ่านการประเมินสำหรับเปิด public internet
