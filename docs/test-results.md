# ผลตรวจ MVP — 16 ตุลาคม 2569

## Automated checks

| ตรวจ | ผล |
|---|---|
| Backend integration/policy/model-adapter/WebSocket | 7 passed |
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

## ยังต้องตรวจรับก่อนสอบ

- เพื่อนสองคน clone และรันจาก checkout ใหม่
- LAN สองเครื่องและ source IP ของเครื่องเพื่อนจริง
- Held-out labeled dataset, precision/recall/F1/false positives ที่ทำซ้ำได้
- Model evaluation หลาย cases, invalid output/tool behavior, latency distribution
- Fine-tuning และการเทียบ baseline ตามทรัพยากรจริง
- UI mobile/projector และ offline rehearsal เต็มรอบ
- GitHub Actions หลัง push; ผล local ข้างต้นไม่ได้ยืนยันว่า remote CI ผ่านแล้ว

อย่ารายงานว่าทุกเฟสเสร็จหรือระบบพร้อมเปิด public จากผล smoke test นี้ งานตรวจรับตาม `docs/project-plan.md` และ task board ยังต้องให้สมาชิกทีมตรวจเอง
