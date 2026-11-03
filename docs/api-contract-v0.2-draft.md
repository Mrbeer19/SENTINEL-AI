# API contract v0.2 — ร่างให้ พิชชากร ตรวจ (ยังไม่ใช้แทน v0.1)

ร่างโดยฝั่ง ประภากรณ์ (frontend/model) เพื่อรวม 3 แหล่งที่ขัดกันตอนนี้: `SENTINEL AI.txt` (สเปก), `docs/api-contract.md` + `backend/app.py` (ของจริง v0.1) และ `model-brief.md` (ข้อเสนอ backend 17 ต.ค.) เจ้าของ contract คือ พิชชากร — ทุกข้อเปลี่ยนได้ ใช้จริงเมื่อทั้งสองคนยืนยันและแก้ backend/frontend/tests พร้อมกัน

## 0. หลักที่เสนอ

- **Endpoint/path คงตาม v0.1 ที่มีโค้ดและเทสแล้ว** (`/api/proposals/{id}/approve`, `/api/simulations`, `/ws`) แล้วแก้ตารางในสเปกให้ตรง แทนการย้ายไป `/api/defense/...` ซึ่งไม่ได้ให้อะไรเพิ่ม
- **เปลี่ยนเฉพาะผลวิเคราะห์ (analysis) และ proposal** ให้ตรง brief เพราะโมเดล, benchmark และ UI ต้องใช้ชุดเดียวกัน
- ตัวพิมพ์ใหญ่สำหรับ enum ทั้งหมด

## 1. Analysis (ผลจากโมเดล)

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

| field | ค่า | ต่างจาก v0.1 |
|---|---|---|
| `threat_type` | `HTTP_AUTH_BRUTE_FORCE \| SSH_BRUTE_FORCE \| PORT_SCAN \| SUSPICIOUS_LOGIN \| TRAFFIC_ANOMALY \| BENIGN \| UNKNOWN` | แทน `classification`; **คง `HTTP_AUTH_BRUTE_FORCE`** (brief ไม่มี แต่เดโม Neo เป็น HTTP login) |
| `severity` | `LOW \| MEDIUM \| HIGH \| CRITICAL` | v0.1 ตัวเล็ก 3 ระดับ |
| `confidence` | number 0–1 | ใหม่ ใช้แสดงผลเท่านั้น **ห้ามใช้แทนการอนุมัติ** |
| `evidence` | string 1–10 รายการ | เหมือนเดิม |
| `recommended_action` | `NO_ACTION \| MONITOR \| INVESTIGATE \| TEMP_BLOCK_IP \| BLOCK_IP` | แทน `recommendation` ข้อความอิสระ |
| `explanation_th` | string ไม่ว่าง | แทน `summary` |

ห้ามมี key อื่น (strict) Backend validate ด้วย Pydantic; ถ้าผิด retry 1 ครั้งพร้อมบอก error แล้วจึง fallback

**MLX/`format`:** ไม่ส่ง `format=schema` เป็นค่าเริ่มต้นจนกว่าจะทดสอบบน M5 ว่าใช้ได้ ให้สั่ง JSON ใน prompt + validate + retry (benchmark มี `--format-schema` ไว้วัด 501)

## 2. Analysis mode — ห้ามนับ fallback เป็นผลโมเดล

`analysis_mode` = `ollama` (เรียก tool แล้ว JSON ผ่าน) · `ollama_no_tools` · `ollama_retry` (ผ่านหลัง retry) · `rule_fallback`

เสนอให้ trace แยก `source: model | fallback` ต่อแถว ตอนนี้ถ้ารอบ tool สำเร็จแต่รอบ JSON พัง trace ของโมเดลจะปนกับ fallback (`app.py:241–249`)

## 3. Proposal — สร้างตาม action ไม่ใช่ตายตัว

| recommended_action | backend ทำ |
|---|---|
| `TEMP_BLOCK_IP` / `BLOCK_IP` | สร้าง proposal `pending` (`BLOCK_IP` ใน MVP ยังเป็นกฎหมดอายุ แต่ยาวกว่า เช่น 60 นาที — ให้ พิชชากร กำหนด) |
| `INVESTIGATE` / `MONITOR` / `NO_ACTION` | **ไม่สร้าง proposal**; incident = `needs_review` / `monitoring` / `closed` |
| `rule_fallback` | สร้าง proposal ได้แต่ต้องติดป้าย fallback ให้คนเห็น (ให้ พิชชากร ตัดสิน) |

Proposal fields: `id, incident_id, action, target_ip, duration_seconds, status, reviewer, created_at, reason` — เปลี่ยน `source_ip` → `target_ip` (ตรงสเปก) หรือคงเดิมก็ได้ ขอให้เลือกชื่อเดียว

ถ้าโมเดลเรียก tool `propose_block_ip` ให้ backend ตรวจ target = incident source เท่านั้น ไม่ใช่ protected IP แล้วจึงบันทึก

## 4. Protected IPs

`SENTINEL_PROTECTED_IPS` (env, คั่นด้วย comma) รวมกับ loopback เสมอ ตั้งในวันสอบ = gateway ของ hotspot + IP LAN ของ M5 ตอนนี้ protected มีแค่ loopback/0.0.0.0 (`app.py:25`) จึงอนุมัติบล็อก gateway ได้

## 5. Incident lifecycle และซ้อมซ้ำ

`detected → analyzing → awaiting_approval → blocked → verified` · `awaiting_approval → rejected` · `needs_review | monitoring | closed`

- incident ที่ `verified | rejected | closed` ถือว่าจบ — event ใหม่ของ IP เดิมเปิด incident ใหม่ (ตอนนี้ไม่มีโค้ดตั้ง `closed` จึงใช้ incident เก่าตลอด `app.py:138` IP จริงของ Neo ซ้อมรอบสองไม่ได้)
- `POST /api/demo/reset` (localhost เท่านั้น): ปิดกฎที่ active และปิด incident ค้าง โดยเก็บประวัติไว้ ไม่ลบ DB

## 6. Event

เพิ่ม `username` (optional, ≤80 ตัวอักษร, ไม่เก็บ password) เพื่อ suspicious login / correlation ต่อบัญชี และเก็บ timestamp เป็น UTC เสมอ (`astimezone(timezone.utc)`) — ตอนนี้เทียบเวลาเป็น string ถ้า client ส่ง `+07:00` หน้าต่าง 60 วินาทีนับผิด

## 7. Tools ให้โมเดล

ตาม brief 5 ตัว: `get_incident_logs(incident_id)`, `get_ip_activity(ip_address)`, `get_related_incidents(ip_address)`, `get_firewall_status(ip_address)`, `propose_block_ip(ip_address, minutes, reason)` — ทั้งหมด scope ฝั่ง server, ไม่มี shell `datasets/` + `model/eval/agent_bench.py` ใช้ชุดนี้แล้ว ถ้า backend เลือกชุดอื่นให้บอก จะปรับ benchmark ตาม

## 8. สิ่งที่ UI จะใช้ (ประภากรณ์)

Incident list/detail, analysis ตามข้อ 1, trace แยก model/fallback, proposal ตามข้อ 3, `GET /api/traffic` สำหรับ before/after, WS stage เดิม + `analysis_step` (tool ที่กำลังเรียก) ถ้าทำได้ หน้า demo target สำหรับ Neo เรียก `/api/demo/login` และ `/api/demo/traffic` ด้วย IP จริง

## คำถามถึง พิชชากร

1. รับ path v0.1 + analysis/proposal ตามร่างนี้ได้ไหม
2. `BLOCK_IP` ใน MVP ให้ต่างจาก `TEMP_BLOCK_IP` อย่างไร
3. fallback ควรสร้าง proposal หรือไม่
4. ชื่อ `source_ip` หรือ `target_ip` ใน proposal
5. งานบน branch ของ พิชชากร ตอนนี้แก้ส่วนไหนแล้ว (remote ยังมีแค่ `main` @ `c4bd895`)
