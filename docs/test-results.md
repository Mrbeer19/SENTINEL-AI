# ผลตรวจ MVP — 16 ตุลาคม 2569

## Automated checks

| ตรวจ | ผล |
|---|---|
| Backend integration/policy/model-adapter/WebSocket | 7 passed (v0.1) → **395 passed (v0.2, 20 ต.ค.)** ดูหัวข้อ Backend v0.2 |
| Discord board dependency/claim/self-review/owner-review/persistence | 5 passed |
| Frontend `npm run build` | passed, Vite 8.3.4 |
| Frontend dependency install audit | 0 vulnerabilities ณเวลาติดตั้ง |

Backend tests ใช้ isolated SQLite และ deterministic model stub/fallback จึงไม่ได้อ้างว่าเป็น benchmark ความถูกต้องของ Qwen มี warning จาก Starlette TestClient เรื่องการย้ายไป httpx2 แต่ tests ผ่าน

ครอบคลุม normal/attack detection, threshold, duplicate incident, input validation, HTTP/SSH แยกชนิด, Approve/Reject, protected IP, repeated decision, unblock, persistence, remote source spoofing, real peer IP, model-selected tool handling, structured-output validation และ WebSocket event

คำสั่งทำซ้ำ:

```powershell
.\backend\.venv\Scripts\python.exe -m pytest backend/tests -q --basetemp backend/tests/.tmp
python -m unittest discover -s bot/tests -q
cd frontend
npm ci
npm run build
```

## Smoke test กับโมเดลจริง

ทดสอบผ่าน backend localhost และ Qwen ที่ติดตั้งจริงด้วย `python scripts/smoke_local.py` วันที่ 16 ตุลาคม 2569:

```json
{
  "model": "qwen3.5:4b",
  "analysis_mode": "ollama",
  "analysis_seconds": 12.106,
  "tools": ["get_recent_events", "get_active_rules"],
  "classification": "HTTP_AUTH_BRUTE_FORCE",
  "before_http": 200,
  "after_http": 403,
  "report_status": "verified",
  "evidence_labels_excluded": true
}
```

เป็นผลหนึ่งกรณี synthetic หลังโมเดลถูกโหลดแล้ว ไม่ใช่ค่าเฉลี่ย latency หรือ held-out accuracy ครั้งแรกที่โหลดโมเดลช้ากว่านี้ ต้องวัดหลายรอบก่อนใช้เป็นผลสอบ

ตรวจหน้า React ผ่านเบราว์เซอร์: แสดง events/incidents จาก SQLite, model status, analysis, tool trace, proposal, Approve และผล incident `verified` หลัง request ใหม่ แยก mockup HTML ออกจากหน้าระบบจริงชัดเจน

## Backend v0.2 — 20 ตุลาคม 2569 (พิชชากร)

เครื่อง: MacBook Pro M5 16GB · Python 3.12.10 · branch `feature/ai-backend/pitchakorn-pkt` · วิธีรันทั้งหมดอยู่ `docs/backend-runbook.md`

### เทสอัตโนมัติ — `make -C backend test`

**395 passed ~9 วิ** รันซ้ำหลายรอบผลเท่ากัน ทุกเทสปิด Ollama และชี้ไป port ปิด (เทสที่ต้องใช้โมเดลใช้ตัวจำลองที่กำหนดคำตอบเอง) จึงยืนยัน backend ไม่ใช่ความแม่นของโมเดล

| ไฟล์ | เทส | ครอบคลุม |
|---|---|---|
| `test_detection.py` | 52 | threshold ทุกกฎ, suspicious login (4 vs 5 ครั้ง, ต่างช่องทาง, นอกหน้าต่าง), traffic anomaly 99/100, หน้าต่าง 60 วิ (60 ติด/61 ไม่ติด), แยกตาม IP/ชนิด, CRITICAL ที่ 3 เท่า, ไฟล์กฎผิดรูปถูกปฏิเสธ |
| `test_policy.py` | 36 | ตาราง action × severity 8 แบบ, loopback/multicast/protected, target ≠ source, ตรวจซ้ำตอน approve |
| `test_agent.py` | 54 | args ของ tool 4 ตัว (investigator อ่านอย่างเดียว), ขอบเขต IP/incident, log ≤40, output strict 10 แบบ, เพดาน 6 tool/4 รอบ, fallback เมื่อ HTTP error/timeout |
| `test_lifecycle.py` | 38 | เส้นสถานะครบจาก audit, ตัดสินซ้ำ 409, reviewer, unblock/expiry, demo login (รวมชื่อยาว 500 ตัว), ไม่เก็บ password, reset |
| `test_audit.py` | 19 | แก้/ลบ/สลับ/ปลอมแถว → จับได้, เขียนพร้อมกัน 4 thread chain ไม่แตก |
| `test_access.py` | 85 | endpoint SOC ทุกตัว × ไม่มี key/มี key, CSRF / Host / WS จากเว็บอื่น, `/docs` `/openapi.json` ปิดจาก LAN, rate limit ต่อ IP + เลื่อนหน้าต่าง, WS, CORS |
| `test_contract.py` | 37 | รูป response ตาม `docs/api-contract.md` v0.2, scenario ครบ 6 แบบ, validation 422, username ยาว = ตัด + flag, WS stage ตามลำดับ |
| `test_soc_store.py` | 10 | MTTD/MTTR/TTV, median/p90, migrate DB v0.1 → v0.2 |
| `test_logs.py` | 21 | แปลง log sshd ดิบ (ISO/syslog, ข้ามปี, บรรทัดซ้ำไม่นับ), บรรทัดเสียไม่ทำให้ทั้งชุดล้ม, ขีดจำกัด, local only |
| `test_agents.py` | 13 | 3 agent ตามลำดับ, planner ไม่เห็นข้อความจาก log, reason → proposal, retry / ล้มแต่ละขั้น → rule_fallback |
| `test_simulation_run.py` | 8 | start/stop/state, ส่งทีละ event ตามเวลา, ซ้อนได้ 409, WS `simulation` |
| `test_app.py` + `test_v02.py` | 22 | ชุดเดิม |

ข้อจำกัดที่เทสยืนยันไว้: ลบ audit แถว**ล่าสุด**ออก chain ยัง valid (hash chain อย่างเดียวมองไม่เห็นการตัดท้าย) — ดู `test_known_limit_truncating_the_tail_is_not_detected`

### Detection บนชุดข้อมูลที่ติด label — `make -C backend eval`

replay log ของ 47 เคสใน `datasets/sentinel_cases_v1.json` (seed 20261019) เข้า `/api/events` ด้วยเวลาเดิม ทีละเคสบน DB ใหม่ เทียบชุดชนิด incident ที่เปิดกับที่ควรเปิด (`rule_hint` + `SUSPICIOUS_LOGIN` สำหรับหมวด suspicious_login) ต้องตรงทั้งชุดจึงนับถูก

| split | เคส | TP | FP | FN | TN | precision | recall | F1 | FP rate |
|---|---|---|---|---|---|---|---|---|---|
| test | 28 | 21 | 0 | 0 | 7 | 1.0 | 1.0 | 1.0 | 0.0 |
| dev | 19 | 13 | 0 | 0 | 6 | 1.0 | 1.0 | 1.0 | 0.0 |

**อ่านอย่างระวัง:** ชุดข้อมูลสร้างจากสคริปต์ที่ตั้งใจให้เคสโจมตีเกิน threshold และเคสปกติต่ำกว่า ผล 1.0 ยืนยันว่ากฎ + การนับเวลา + การ replay ตรงกับที่ออกแบบชุดข้อมูลไว้ ไม่ใช่ความแม่นกับ traffic จริง · ทดลองลดเกณฑ์ suspicious login เหลือ 4 → `test-22-benign` (ผิด 4 แล้วเข้าได้) ถูกเตือนผิด FP rate 0.143 ตัววัดจับได้ จึงใช้เกณฑ์ 5 · ผลโมเดลดู `reports/model-eval-v2-beer.md`

### ก่อน/หลัง v0.1 → v0.2 — `make -C backend bench`

workload เดียวกันทั้งสองเวอร์ชัน (2,000 event จาก 50 IP + 20 รอบ simulate→analyze→approve→403) แบบ in-process ปิดโมเดล วัด 3 รอบ ค่ากลาง:

| | v0.1 `6930667` | v0.2 | เปลี่ยน |
|---|---|---|---|
| ingest events/วิ | 718 | 655 | −9% |
| ingest p95 | 1.49 ms | 1.64 ms | +0.15 ms |
| incident ที่เปิด | 70 | 70 | เท่ากัน |
| ลูปเต็ม 1 incident (median) | 8.5 ms | 13.8 ms | +5 ms |
| เทส | 7 | 395 | |

v0.2 ช้าลงเพราะเขียน audit hash chain + trace ทุกขั้น (ตั้งใจแลก) · ลูป 14 ms เทียบกับเวลาโมเดล ~30 วิ ไม่มีผล · ไม่รวมเวลาเครือข่าย/โมเดล

### Smoke กับ server จริง — `make -C backend smoke`

server จริงบน port แยก + DB ชั่วคราว: `SMOKE PASS` (rule_fallback เพราะไม่ได้เปิด Ollama ในรอบนี้) · `--require-model` ตอนไม่มีโมเดล → `SMOKE FAIL: model qwen3.5:4b not ready` ตามที่ควร · ผลกับโมเดลจริงบน M5 (26–33 วิ/incident) อยู่ `reports/backend-v0.2-obeto.md`

## ยังต้องตรวจรับก่อนสอบ

- เพื่อนสองคน clone และรันจาก checkout ใหม่
- LAN สองเครื่องและ source IP ของเครื่องเพื่อนจริง
- Held-out labeled dataset, precision/recall/F1/false positives ที่ทำซ้ำได้
- Model evaluation หลาย cases, invalid output/tool behavior, latency distribution
- Fine-tuning และการเทียบ baseline ตามทรัพยากรจริง
- UI mobile/projector และ offline rehearsal เต็มรอบ
- GitHub Actions หลัง push; ผล local ข้างต้นไม่ได้ยืนยันว่า remote CI ผ่านแล้ว

อย่ารายงานว่าทุกเฟสเสร็จหรือระบบพร้อมเปิด public จากผล smoke test นี้ งานตรวจรับตาม `docs/project-plan.md` และ task board ยังต้องให้สมาชิกทีมตรวจเอง
