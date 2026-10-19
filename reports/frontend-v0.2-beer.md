# Frontend v0.2 — Beer (20 ต.ค. 2569)

**สถานะ:** ใช้กับ backend v0.2 (PR #4) ได้ · ทดสอบกับ backend จริงด้วย rule fallback · ยังไม่ได้ลองกับโมเดลจริงและ M5 + Neo
**Branch:** `beer/dashboard-v1` (PR #2 → `dev`) · contract: `docs/api-contract.md` v0.2

## เปลี่ยนอะไร

| เรื่อง | ทำแล้ว |
|---|---|
| `analysis` เป็น object | `parseAnalysis` อ่าน `threat_type, severity, confidence, evidence, recommended_action, explanation_th` (string แบบ v0.1 ยังอ่านได้) · Incident Detail แสดง threat type, confidence, action, model/prompt version |
| severity ตัวใหญ่ | `SeverityBadge` รองรับ `CRITICAL`, ตัวกรอง Incidents ใช้ 4 ระดับ, การนับ High / critical |
| status ใหม่ | `analyzing, needs_review, monitoring, closed` ใน badge, ตัวกรอง, stepper, "ขั้นตอนถัดไป", การนับ incident ที่ยังเปิด · incident ที่ปิดก่อนวิเคราะห์ (reset) ไม่ให้กดวิเคราะห์ |
| proposal เป็น `null` ได้ | แสดง "ไม่มีข้อเสนอบล็อก" พร้อมเหตุผลตาม status แทน "ยังไม่ได้วิเคราะห์" · verification ขึ้น Not applicable |
| `target_ip`, action, policy | ใช้ `target_ip` (fallback `source_ip`) · แสดง action (`TEMP_BLOCK_IP` / `BLOCK_IP`), `policy_notes`, `reason`, D3FEND |
| ป้าย rule fallback | ขึ้นเมื่อ `analysis_mode = rule_fallback`, `confidence = null` หรือ `proposal.source = rule_fallback` ใน Incident Detail, Agent Trace, Approvals, Reports, Overview · ลูกโลกไม่นับ fallback เป็น AI finding |
| trace ใหม่ | Agent Trace แสดง operation (Agent run / Model call / Tool), status, duration, source · แถว `rejected_by_policy` ขึ้นแบนเนอร์ "Policy ปฏิเสธคำขอของโมเดล" · `untrusted_log_records` แสดงเป็นตาราง |
| ระหว่างวิเคราะห์ | ปุ่มบอกเวลา ~30 วิบน M5 · trace ขึ้นทีละแถวจาก WS `analysis_step` (REST refetch) |
| kind ใหม่ | `SUSPICIOUS_LOGIN`, `TRAFFIC_ANOMALY` |
| Demo Lab | scenario ใหม่ 2 ตัว · ส่งทีละ event (`/api/simulations/start`, หยุดได้, แสดง sent/total) · ปุ่ม Reset (`/api/demo/reset`) ยืนยันก่อนกด |
| Reports | rule id + ATT&CK, recommended action, ป้าย local replay สำหรับ IP TEST-NET, การ์ด Audit Chain (`/api/audit/verify`) |

## ทดสอบจริง

เครื่อง Windows (RTX 4060) · backend v0.2 จาก branch PR #4 (`ed25e36`) รันแยก worktree port 8003 · `SENTINEL_DISABLE_OLLAMA=1` (rule fallback) · DB ใหม่ใน `backend/tests/.tmp/` · UI จาก `npm run build`

- `npm run build` ผ่าน
- 192.0.2.25: baseline 200 → HTTP replay → analyze (fallback, `confidence: null`, proposal `source: rule_fallback`) → approve → request ใหม่ **403** → `verified`
- port scan 192.0.2.62 → reject → `rejected` ไม่มีกฎ
- suspicious_login 192.0.2.70 → เปิด `HTTP_AUTH_BRUTE_FORCE` + `SUSPICIOUS_LOGIN`
- SSH replay จาก `127.0.0.1` → fallback เสนอ TEMP_BLOCK → policy ปฏิเสธ (protected) → **`needs_review`, proposal `null`** · UI แสดง "No block proposed · Needs human review"
- paced port scan (100 ms) → 9/9 events, incident เปิด · reset → ปิดกฎ 1, ปิด incident 4 · UI แสดง Closed ถูก
- ภาพ 1440 px: `mockup/frontend-v02/`

## ยังไม่ได้ทดสอบ

- **โมเดลจริง** (ไม่มี trace แบบ `chat` / `execute_tool` / `rejected_by_policy` จริงให้ดู — ทดสอบแค่ว่าโค้ดอ่าน field ได้)
- จอ 390 px ตอนมีข้อมูล (headless โหลดข้อมูลใน iframe ไม่ได้ เห็นแค่ layout ว่าง) — layout ไม่ได้เปลี่ยนโครง แต่ควรเช็คบน M5/มือถือ
- M5 + Neo ข้ามเครื่อง, เปิด dashboard จากเครื่องอื่นด้วย `X-Admin-Key` (UI ยังไม่ส่ง header นี้ — ใช้บน M5 localhost เท่านั้น)
