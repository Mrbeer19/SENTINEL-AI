# Dashboard v1 + Neo Demo — Beer

> บันทึกเวอร์ชันเดิม: ปัจจุบันใช้ Neo Terminal เท่านั้น หน้า Neo ที่กล่าวถึงในรายงานนี้ถูกยกเลิกแล้ว วิธีใช้งานล่าสุดอยู่ที่ [คู่มือ Neo Terminal](../scripts/neo/README.md)

**Phase / ผู้รับผิดชอบ:** Frontend/dashboard · Beer
**สถานะ:** ผ่านบางส่วน — หน้าเว็บครบตามแบบและ flow ข้ามเครื่องผ่านบนเครื่องพัฒนา ยังไม่ได้ลองบน M5 + Neo
**Branch:** `beer/dashboard-v1` (แยกจาก `main` ไม่แก้ backend)

## ตอนนี้ทำอะไรได้

ทำตามแบบ `mockup/dashboard-suite-v1` (ภาพตาม manifest) โดยยึด API จริงของ backend v0.1

| หน้า | URL | ทำอะไรได้ |
|---|---|---|
| Overview | `/#/overview` | ตัวเลข incident/approval/rule/event จริง, แผนภาพ Tester ↔ M5 เปลี่ยนสีตามสถานะ (allowed / open incident / blocked), กราฟ request ต่อนาทีจาก `/api/traffic`, incident ล่าสุด, งานรออนุมัติ, request log |
| Incidents | `/#/incidents` | ค้นหา/กรอง severity, status/เรียงลำดับ, สรุปด้านข้าง (กราฟ event ของ IP นั้น, หลักฐานล่าสุด, stage) |
| Incident Detail | `/#/incident/{id}` | stepper 5 ขั้น, evidence timeline (ไฮไลต์ event ที่ถึง threshold), analysis + mode, proposal, verification before/after, audit timeline, Export JSON |
| Agent Trace | `/#/trace/{id}` | เลือก incident, ขั้นตอน, input/output ของแต่ละ tool (ตาราง), analysis JSON, การ์ด "No action executed" |
| Approvals | `/#/approvals/{id}` | คิว pending/history, หลักฐาน + tools ที่ใช้, ขอบเขต app-level, policy ที่ server บังคับ, ช่อง reviewer, Approve/Reject (ปิดปุ่มระหว่างส่งและหลังตัดสินใจ) |
| Rules | `/#/rules/{id}` | active/history, นับถอยหลัง TTL, Unblock แบบยืนยันสองขั้น, verified เมื่อมี request ใหม่ถูก deny ระหว่างอายุกฎ, protected sources, recent decisions |
| Reports | `/#/reports/{id}` | 4 ขั้น detection → investigation → decision → verification, before/after, evidence, limitations, Export JSON, Print |
| Demo Lab | `/#/lab` | 4 scenario ของ `/api/simulations`, baseline/verification request แบบ source override (localhost), runbook 7 ขั้นจากสถานะจริงใน server, session output |
| **Neo Demo** | **`/neo/`** | หน้าแยก (bundle แยก ไม่มีโค้ดผู้ดูแล/อนุมัติ/admin key) login, ส่ง request, แสดง 200/401/403 + JSON จริง, IP ที่ server เห็น, history ของแท็บนี้, คำสั่ง curl ที่ใช้ address ของ M5 |

States: loading, empty, backend disconnected (+Retry), WebSocket reconnecting (poll 15 วินาที), model unavailable, rule fallback (ไม่แสดงเป็นผล AI), request failure, 409 already decided, 403 remote management, rule expired, rejected
Accessibility: skip link, focus ring, `aria-current`, keyboard ใช้ปุ่ม/ลิงก์จริง, `prefers-reduced-motion`
ไม่มีกราฟปลอม ไม่มี precision/recall/F1 (ตัวเดิมเป็นแค่ exploratory) ไม่อ้าง endpoint/method ที่ไม่มี (เช่น ภาพเขียน GET แต่จริงเป็น POST, ไม่มี username ใน event จึงไม่แสดง)

## ไฟล์

`frontend/src/{App.jsx, api.js, ui.jsx, tokens.css, style.css, main.jsx}`, `frontend/src/pages/*.jsx` (8 หน้า), `frontend/src/neo/{main.jsx, neo.css}`, `frontend/neo/index.html`, `frontend/vite.config.js` (multi-page build), `README.md` (วิธีเปิด `/neo/`)

## ทดสอบจริง

เครื่อง: **Windows RTX 4060 (server) + Mac เครื่องหนึ่งใน LAN เดียวกัน (Chrome)** — ไม่ใช่ M5/Neo, backend v0.1 จาก `main`, DB ทดสอบแยก, Ollama 0.32.15 `qwen3.5:4b`

- `npm run build` ผ่าน (Vite 8.3.4) · backend tests `7 passed`
- Mac เปิด `http://192.168.1.191:8000/neo/` → Send new request **200** → login ผิด 6 ครั้ง **401** → incident HTTP_AUTH_BRUTE_FORCE ของ `192.168.1.190` (IP จริงของ Mac จาก server)
- analyze + approve สั่งจาก localhost ของ server → Mac ส่ง request ใหม่ได้ **403 denied rule 1** → incident `verified`, หน้า Rules แสดง Verified 403, Reports ครบ 4 ขั้น
- กดปุ่มผู้ดูแลจาก Mac → แสดง 403 "Remote management requires X-Admin-Key" ตามที่ออกแบบ
- Simulation port_scan / ssh replay / normal จาก localhost → incident 2 ตัว + normal ไม่เปิด incident

## ปัญหาที่เจอ (ฝั่ง backend — ยังไม่แก้)

- **`/analyze` ตกเป็น rule_fallback ทั้ง 2 ครั้ง** Ollama `/api/chat` ใช้ 90 วินาทีจน timeout (log: `500 | 1m30s`) ครั้งที่ 2 รอบเรียก tool เสร็จใน 0.87s แต่รอบสุดท้ายที่ส่ง `format=AnalysisOut schema` ค้าง ควรลองบน M5 และพิจารณาแนวทาง JSON + retry ตามร่าง contract v0.2
- trace ของโมเดลกับ fallback ปนกัน (incident 2 มี `get_recent_events` 2 รายการ) — หน้า Agent Trace ขึ้นคำเตือนไว้แล้ว
- เวลาเครื่อง Mac กับ server ต่างกัน ~8 วินาที history ในหน้า Neo ใช้เวลาเครื่อง Neo ส่วน dashboard ใช้เวลา server
- ไม่มี `/api/demo/reset` จึงปิดปุ่ม Reset ไว้ (รอ contract v0.2)

## ยังไม่ได้ทดสอบ

- **M5 + Neo จริง** (Safari, จอ, hotspot/LAN จริง)
- layout จอมือถือ — เขียน responsive แล้ว แต่ปรับขนาดหน้าต่างทดสอบไม่ได้
- ปุ่ม Demo Lab/Approve/Unblock ผ่าน UI บน localhost (ทดสอบ endpoint เดียวกันด้วย curl จาก localhost)

## คนต้องตรวจ

1. บน M5: `npm run build` ใน `frontend/` แล้วรัน `uvicorn backend.app:app --host 0.0.0.0 --port 8000` เปิด `http://127.0.0.1:8000/`
2. บน Neo: เปิด `http://<IP ของ M5>:8000/neo/` → Send new request ต้องเห็น 200 และ Client IP เป็น IP ของ Neo (ไม่ใช่ gateway)
3. Neo login ผิด 6 ครั้ง → M5 Incidents ต้องมี incident ใหม่ → Run investigation → Approve → Neo Send new request ต้องได้ 403 และหน้า Rules ขึ้น Verified 403
4. ถ้า IP ที่เห็นเป็น gateway ห้าม approve (จะบล็อกทั้งวง) — แจ้งกลับมา
