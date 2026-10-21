# SENTINEL AI

Local security operations dashboard: **Observe → Reason → Defend → Verify**.

ระบบรับ security events, ตรวจจับด้วยกฎ, ใช้ Qwen 3.5 4B สืบค้นหลักฐานผ่านเครื่องมือ, ให้คนอนุมัติ app-level block และพิสูจน์ผลด้วย request ใหม่ ข้อมูลและ timeline เก็บใน SQLite

## เริ่มรันบน Windows

ต้องมี Python 3.12 ขึ้นไป, Node.js 20.19+ หรือ 22.12+, และ Ollama ทดสอบบน Python 3.14.3 / Node.js 24.13.1

```powershell
git clone https://github.com/Mrbeer19/SENTINEL-AI.git
cd SENTINEL-AI
python -m venv backend/.venv
.\backend\.venv\Scripts\python.exe -m pip install -r backend/requirements.txt
ollama pull qwen3.5:4b
.\backend\.venv\Scripts\python.exe -m uvicorn backend.app:app --host 127.0.0.1 --port 8000
```

เปิด PowerShell อีกหน้าต่างในโฟลเดอร์ repository:

```powershell
cd frontend
npm ci
npm run dev
```

เปิด **http://127.0.0.1:5173** — API docs อยู่ที่ **http://127.0.0.1:8000/docs**

หลัง `npm run build` backend เสิร์ฟหน้าเว็บเองที่ port 8000: dashboard ผู้ดูแลเปิดบน M5 ที่ `http://127.0.0.1:8000/` ส่วนเครื่อง Neo ใช้ **Terminal เท่านั้น** ส่งคำขอไปยัง `http://<LAN IP ของ M5>:8000` ตาม [คู่มือ Neo Terminal](scripts/neo/README.md) M5 รัน backend ด้วย `make -C backend run-lan HOST=<LAN IP ของ M5>` (ไม่ใช้ `--host 0.0.0.0` เพราะเปิดทุก interface) และให้ Neo เรียก backend โดยตรง เพื่อบันทึก IP ต้นทางจริง ไม่เปิด Vite dev server ให้ LAN

## ทดลอง flow แรก

1. หน้า Demo Lab: กด “ส่งคำขอก่อนบล็อก” จาก `192.0.2.25` ก่อนป้องกัน ต้องได้ `allowed`
2. หน้า Demo Lab: เลือก HTTP login replay แล้วกด “เริ่มเหตุการณ์จำลอง”
3. เปิด incident แล้วกด “เริ่มวิเคราะห์” ในแถบขั้นตอนถัดไป
4. อ่าน analysis, evidence และ tool trace ตรวจ `analysis_mode` ก่อนอธิบายว่าเป็นผลจากโมเดล
5. เปิด “ตรวจข้อเสนอ” ตรวจ IP และผู้ตรวจทาน → “อนุมัติบล็อก 10 นาที” → “ยืนยันบล็อก IP” จากนั้นส่ง test request ใหม่ด้วย IP จำลองเดิมผ่าน Demo Lab ต้องได้ HTTP 403 และสถานะ `verified` การทดสอบข้ามเครื่องให้ Neo ส่งคำขอใหม่จาก Terminal
6. หน้า Reports: เปิด JSON report ซึ่งรวม events, analysis, proposal, timeline และ traffic จริง
7. ทดลองอีก IP แล้ว Reject ต้องไม่เกิดกฎบล็อกของ IP นั้น

SSH scenario เป็น synthetic log replay และแสดงชนิด SSH แยกจาก HTTP ส่วน app-level firewall มีผลเฉพาะ demo endpoints ของระบบนี้ · การต่อ server จริงดู [docs/real-server-integration.md](docs/real-server-integration.md)

## โครงไฟล์และคนรับผิดชอบ

| โฟลเดอร์ | หน้าที่ | เจ้าของหลัก |
|---|---|---|
| `backend/` | FastAPI, SQLite, detection, tools, approval, verification | Obeto |
| `frontend/` | React dashboard ผู้ดูแล M5 จำนวน 8 หน้า (`/`) | Beer |
| `scripts/neo/` | คำสั่ง Terminal สำหรับ Neo ทดสอบผ่าน LAN กับ M5 | ทั้งคู่ |
| `prompts/phases/` | Prompt คัดลอกใช้แยกคนและเฟส | ทั้งคู่ |
| `prompts/tasks/` | Prompt ย่อย 19 งาน รวม deployment | ทั้งคู่ |
| `workstreams/` | ลำดับงานและเกณฑ์ผ่าน | ทั้งคู่ |
| `bot/` | Discord task dispatcher | ทั้งคู่ |
| `docs/` | แผน, API contract, runbook และผลทดสอบ | ทั้งคู่ |
| `mockup/index.html` | แบบหน้าจออ้างอิง | Beer |

Beer รับผิดชอบโมเดลด้วย: baseline, prompt tuning, evaluation และ fine-tuning หากทรัพยากรพอ Obeto เชื่อมโมเดลเข้ากับ backend และ Agent tools

## อ่านก่อนแบ่งงาน

วิธีทำงานหลัก: คัดลอก prompt รายเฟสจาก Discord ให้ผู้ช่วยของแต่ละคนลงมือทำและทดสอบ แล้วส่งรายงานสั้นให้ทีม คนตรวจภาพรวมและผลที่ AI ระบุให้ลอง ไม่ต้องใช้คำสั่งบอตรับงานหรือส่งงาน ดูรูปแบบรายงานใน [reports/README.md](reports/README.md)

- [แผนพัฒนาตั้งแต่เริ่มจนพร้อมนำเสนอ](docs/project-plan.md)
- [Prompt แยกเฟส — เริ่ม Phase 0](prompts/README.md)
- [API contract ของ MVP](docs/api-contract.md)
- [วิธีซ้อมเดโมและแก้ปัญหา](docs/demo-runbook.md)
- [แผน deploy เว็บจริง — งาน F06 ของ Beer](docs/deployment-plan.md)
- [สถานะการตรวจสอบ](docs/test-results.md)
- [ตั้ง Discord bot](bot/README.md)

## ทดสอบ

```powershell
.\backend\.venv\Scripts\python.exe -m pytest backend/tests -q --basetemp backend/tests/.tmp
python -m unittest discover -s bot/tests -q
cd frontend
npm run build
```

เก็บ database ที่ `backend/data/sentinel.db` และสถานะบอตที่ `bot/data/state.json` ไฟล์เหล่านี้รวมถึง `.env`, token, การตั้งค่าทีมส่วนตัว และ virtual environments ถูก ignore จาก Git

## สถานะ MVP

มีเส้นทาง simulation → detection → investigation → proposal → approval → app-level denial → report ให้ทดสอบในเครื่องแล้ว Local model ใช้ `qwen3.5:4b` และ context 4096 หาก Ollama ใช้ไม่ได้ ระบบระบุ `rule_fallback` ชัดเจน

การทำ fine-tune, ผลประเมินบนข้อมูลที่แยกจากการพัฒนา, SSH log collector จริง, LangGraph และการซ้อม LAN สองเครื่องยังเป็นงานตรวจรับในแผน อย่านับทุก task ว่าเสร็จจากการมีโค้ดเริ่มต้นเพียงอย่างเดียว

## อ้างอิงเทคนิค

[FastAPI](https://fastapi.tiangolo.com/), [Ollama API](https://github.com/ollama/ollama/blob/main/docs/api.md), [Qwen 3.5 tags](https://ollama.com/library/qwen3.5/tags), [Vite](https://vite.dev/guide/)
