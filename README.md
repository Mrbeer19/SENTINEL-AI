# SENTINEL AI

ระบบช่วยงาน Security Operations Center (SOC) ที่ใช้โมเดลภาษาขนาดเล็กรันในเครื่อง ตรวจจับการโจมตี วิเคราะห์หลักฐาน เสนอการป้องกัน และพิสูจน์ผลหลังป้องกัน โดยผู้ดูแลระบบเป็นผู้อนุมัติทุกครั้ง

**Observe → Reason → Defend → Verify**

ระบบใช้ป้องกันเว็บไซต์ rod-mai-rod ที่ใช้งานจริงบน VPS ซึ่งมีเว็บไซต์อื่นใช้งานร่วมอยู่ การป้องกันจึงจำกัดเฉพาะเว็บไซต์นี้และต้องไม่กระทบเว็บไซต์อื่น

## ผู้จัดทำ

| ชื่อ–นามสกุล | รหัสนักศึกษา | หน้าที่ |
|---|---|---|
| นายพิชชากร พวดขุนทด | 116730462035-0 | Backend, ฐานข้อมูล, กฎตรวจจับ, LangGraph agent, การอนุมัติและการพิสูจน์ผล |
| นายประภากรณ์ ภิธรรมมา | 116730462033-5 | Dashboard, โมเดล (prompt, การประเมินผล, fine-tune), การเชื่อมต่อเว็บไซต์จริงและ VPS |

## ภาพรวมการทำงาน

| ขั้น | การทำงาน |
|---|---|
| 1. Observe | รับ security event จาก log การ login ของเว็บไซต์ (Caddy access log), log การยืนยันตัวตน SSH และข้อมูลการเชื่อมต่อ TCP ของ VPS เก็บลง SQLite |
| 2. Detect | ตรวจด้วยกฎแบบ Sigma 5 กฎ ภายในหน้าต่างเวลา 60 วินาที แล้วเปิด incident |
| 3. Reason | agent 3 ขั้นบน LangGraph วิเคราะห์ incident ด้วยโมเดล r3 |
| 4. Defend | ระบบสร้างข้อเสนอบล็อก IP ชั่วคราว ผู้ดูแลต้องอนุมัติก่อนทุกครั้ง |
| 5. Verify | คำขอใหม่จาก IP ที่ถูกบล็อกได้ HTTP 403 ระบบเปลี่ยนสถานะเป็น `verified` และบันทึก audit log แบบตรวจการแก้ไขย้อนหลังได้ |

### กฎตรวจจับ

| กฎ | เงื่อนไข (ภายใน 60 วินาที จาก IP เดียวกัน) |
|---|---|
| HTTP_AUTH_BRUTE_FORCE | login เว็บไซต์ไม่สำเร็จตั้งแต่ 5 ครั้ง |
| SSH_BRUTE_FORCE | ยืนยันตัวตน SSH ไม่สำเร็จตั้งแต่ 5 ครั้ง |
| SUSPICIOUS_LOGIN | login สำเร็จหลังล้มเหลวตั้งแต่ 5 ครั้งในช่องทางเดียวกัน |
| PORT_SCAN | เชื่อมต่อพอร์ตปลายทางต่างกันตั้งแต่ 8 พอร์ต |
| TRAFFIC_ANOMALY | เปิดการเชื่อมต่อตั้งแต่ 100 ครั้ง |

### Agent 3 ขั้น

| ขั้น | หน้าที่ | ข้อจำกัด |
|---|---|---|
| Investigator | สืบค้นหลักฐานด้วยเครื่องมืออ่านอย่างเดียว 4 ตัว (`get_incident_logs`, `get_ip_activity`, `get_related_incidents`, `get_firewall_status`) | เรียกเครื่องมือได้ไม่เกิน 6 ครั้ง / 4 รอบ |
| Threat Analyst | สรุปชนิดภัย ความรุนแรง ความมั่นใจ และหลักฐาน เป็น JSON ตาม schema แบบ strict | ข้อความใน log ถือเป็นข้อมูลที่ไม่น่าเชื่อถือ |
| Defense Planner | เลือกการตอบสนองและเรียก `propose_block_ip` | เห็นเฉพาะผลจากขั้นที่ 2 ไม่เห็น log ดิบ เพื่อลดผลของ prompt injection |

หลังโมเดลเสนอ policy ในโค้ดจะตรวจซ้ำอีกชั้น เช่น บล็อกได้เฉพาะ IP ต้นทางของ incident, ห้ามบล็อก IP ที่ป้องกันไว้ และ `BLOCK_IP` ใช้ได้กับ incident ระดับ CRITICAL เท่านั้น ถ้าโมเดลใช้งานไม่ได้ ระบบเปลี่ยนเป็น `rule_fallback` และแสดงสถานะนี้บน dashboard

### การบังคับใช้กฎกับเว็บไซต์จริง

กฎบล็อกที่อนุมัติแล้วทุกชนิด รวมถึง incident SSH และ port scan ถูกบังคับใช้ที่ Caddy **ภายใน site block ของ rod-mai-rod เท่านั้น** IP ที่ถูกบล็อกได้ 403 จาก rod-mai-rod แต่ยังเข้าเว็บไซต์อื่นบนเครื่องเดียวกันได้ตามปกติ ระบบไม่แก้ไข firewall ของเครื่อง และกฎหมดอายุอัตโนมัติด้วย systemd timer บน VPS แม้ส่วนอื่นของระบบจะออฟไลน์

## สถาปัตยกรรม

| ส่วน | ที่ตั้ง | เทคโนโลยี |
|---|---|---|
| Backend + Dashboard | VPS, container แยก ฟังเฉพาะ `127.0.0.1:8001` จำกัด RAM 384 MB / CPU 0.5 | FastAPI, SQLite, LangGraph, React 19, Vite 8 |
| Bridge และ sensor | VPS (systemd) | อ่าน log ของ Caddy/SSH/TCP ส่งเข้า backend และส่งกฎไปที่ Caddy |
| โมเดล r3 | Workstation RTX 4060 เชื่อมกับ VPS ผ่าน reverse SSH tunnel | Ollama, Qwen 3.5 4B + QLoRA |
| ผู้ดูแลระบบ | เปิด dashboard ผ่าน SSH tunnel และ login ด้วยบัญชี admin | session cookie, รหัสผ่านเก็บเป็น scrypt hash |

ไม่มีพอร์ตของ SENTINEL หรือ Ollama เปิดสู่อินเทอร์เน็ต รายละเอียดการติดตั้งและการย้อนกลับอยู่ที่ [docs/vps-hosting.md](docs/vps-hosting.md)

## โมเดล

ใช้ Qwen 3.5 4B (`qwen3.5:4b`) เป็นโมเดลตั้งต้น และ fine-tune ด้วย QLoRA จากข้อมูลสังเคราะห์ที่สร้างด้วย seed แยกจากชุดทดสอบ ไม่ใช้ชุดทดสอบใดในการฝึก

| รุ่น | การฝึก | ผล |
|---|---|---|
| r1 | QLoRA บน RTX 4060 (VRAM 8 GB) | ไม่สำเร็จ เครื่องหยุดทำงานระหว่างฝึก จึงย้ายการฝึกไปใช้ GPU บนคลาวด์ |
| r2 | QLoRA บน Kaggle T4 × 2 (fp32) ใช้ checkpoint-150 | eval loss 0.0022 หลัง epoch แรก ใช้เป็นโมเดลหลักตั้งแต่ 20 ต.ค. 2569 |
| r3 | เพิ่มข้อมูลกรณี SSH login สำเร็จ, รายการพอร์ตยาว และคำอธิบายที่หลากหลายขึ้น ฝึกครบ 238/238 step | eval loss 0.0073 **โมเดลที่ใช้งานปัจจุบัน** (`sentinel-qwen3.5-4b-r3`) |

ส่งออกเป็น GGUF สำหรับ Ollama ด้วย `model/finetune/export_gguf.py`

## การทดสอบ

### 1. ทดสอบอัตโนมัติ

| ชุด | ผล |
|---|---|
| Backend (`backend/tests`): detection, policy, agent, API contract, การเข้าถึง, WebSocket, audit log | 421 passed |
| Bridge เว็บไซต์จริง (`integrations/rod_mai_rod/test_bridge.py`) | passed |
| ตัวให้คะแนนโมเดล (`model/eval/test_agent_bench.py`) | passed |
| Frontend `npm run build` | passed |

GitHub Actions รัน CI ของ backend และ frontend ทุก pull request และต้องผ่านก่อน merge

### 2. ประเมินโมเดล

`model/eval/agent_bench.py` จำลองการทำงานเหมือน backend ทุกขั้น (เพดานการเรียกเครื่องมือ, schema แบบ strict) วัดว่าระบุชนิดภัยและการตอบสนองถูกต้องหรือไม่ นับ false positive (เสนอบล็อกในกรณีที่ห้ามบล็อก) และนับ prompt injection ที่สำเร็จ ใช้ชุดทดสอบ 4 ชุด

| ชุดทดสอบ | จำนวนกรณี | ที่มา |
|---|---|---|
| v1 test | 28 | generator หลัก ปรับ prompt ด้วยชุด dev 19 กรณีที่แยกต่างหาก |
| v2 | 40 | generator ใหม่ ค่า IP/ชื่อผู้ใช้ไม่ซ้ำกับข้อมูลฝึก |
| obeto-v3 | 34 | generator อิสระที่เขียนแยก (seed 61106) |
| obeto-v4 | 33 | generator อิสระรุ่นถัดมา |

ผลบน MacBook Pro M5 16 GB:

| โมเดล | v1 test | v2 | obeto-v3 | obeto-v4 | False positive | Injection สำเร็จ | เวลาต่อกรณี (มัธยฐาน) |
|---|---|---|---|---|---|---|---|
| qwen3.5:4b (prompt v1) | 26/28 | 33/40 | 28/34 | – | 2–4 ต่อชุด | 0/3 | 29 วินาที |
| r2 | 28/28 | 38/40 | 32/34 | – | 0 | 0/3 | 11.5–12.6 วินาที |
| **r3** | **28/28** | **40/40** | **32/34** | **30/33** | **0** | **0/3** | ~7 วินาที (RTX 4060) |

ผลของ r3 บน M5 และบน RTX 4060 ตรงกันทุกกรณี ผลดิบเก็บไว้ที่ `model/eval/results/`

### 3. ทดสอบกับระบบจริง

ยิงทดสอบจริงไปที่ VPS ด้วย `scripts/live-five-tests.py` (HTTP login ผิด, SSH ด้วย key ที่ไม่ได้รับอนุญาต, login สำเร็จหลังล้มเหลว, port scan, traffic) ผลวันที่ 30 ต.ค. 2569:

| สถานการณ์ | ผล |
|---|---|
| SSH brute force (key ไม่ได้รับอนุญาต 6 ครั้ง) | เกิด incident → r3 เสนอ `TEMP_BLOCK_IP` → อนุมัติ → rod-mai-rod ตอบ 403 เว็บไซต์อื่นตอบ 200 → `verified` → ยกเลิกบล็อกแล้ว rod-mai-rod ตอบ 200 |
| HTTP login ผิด 6 ครั้ง หลังย้ายระบบขึ้น VPS | เกิด incident → อนุมัติ → 403 / เว็บไซต์อื่น 200 → `verified` → ยกเลิกบล็อกแล้วตอบ 200 |
| การสแกนจริงจากอินเทอร์เน็ต | ตรวจพบ PORT_SCAN และ SSH brute force จาก IP ภายนอก 14 incident ผู้ดูแลอนุมัติบล็อก 10 นาที เว็บไซต์อื่นตอบ 200 ตลอด |

ทดสอบสองเครื่องในวง LAN (เครื่อง Windows รันระบบ, MacBook Neo เป็นฝั่งยิง) ผ่านทั้ง block → 403 → verified, unblock → 200 และ reject → 200

## โครงสร้าง repository

| โฟลเดอร์ | เนื้อหา |
|---|---|
| `backend/` | FastAPI, กฎตรวจจับ (`rules/`), agent, policy, audit log, tests |
| `frontend/` | Dashboard ผู้ดูแลระบบ (React) |
| `model/prompts/` | system prompt ของ agent ทั้ง 3 ขั้น |
| `model/eval/` | ตัวประเมินโมเดลและผลดิบ |
| `model/finetune/` | สร้างข้อมูลฝึก, QLoRA, ส่งออก GGUF |
| `datasets/` | generator และชุดทดสอบ |
| `integrations/rod_mai_rod/` | bridge, sensor และตัวจัดการกฎ Caddy ของเว็บไซต์จริง |
| `deploy/vps/` | Dockerfile และ Compose สำหรับ VPS |
| `scripts/` | สคริปต์ทดสอบและสคริปต์ช่วยรัน |
| `docs/` | API contract, threat model, runbook, ผลทดสอบ |

## เริ่มใช้งานในเครื่อง (พัฒนา)

ต้องมี Python 3.12+, Node.js 22.12+ และ Ollama

```powershell
git clone https://github.com/Mrbeer19/SENTINEL-AI.git
cd SENTINEL-AI
python -m venv backend/.venv
.\backend\.venv\Scripts\python.exe -m pip install -r backend/requirements.txt
cd frontend; npm ci; npm run build; cd ..
.\backend\.venv\Scripts\python.exe -m backend.admin_auth   # ได้ค่า SENTINEL_ADMIN_PASSWORD_HASH
$env:SENTINEL_ADMIN_PASSWORD_HASH = '<ค่าที่ได้>'
$env:SENTINEL_MODEL = 'sentinel-qwen3.5-4b-r3:latest'   # หรือ qwen3.5:4b
.\backend\.venv\Scripts\python.exe -m uvicorn backend.app:app --host 127.0.0.1 --port 8001
```

เปิด `http://127.0.0.1:8001/` แล้ว login ด้วยบัญชี admin

รันชุดทดสอบ:

```powershell
.\backend\.venv\Scripts\python.exe -m pytest backend/tests -q
python -m unittest discover -s model/eval -q
cd frontend; npm run build
```

## เอกสาร

- [API contract](docs/api-contract.md)
- [Threat model](docs/threat-model.md)
- [การติดตั้งบน VPS](docs/vps-hosting.md)
- [การเชื่อมต่อเว็บไซต์จริง](integrations/rod_mai_rod/README.md)
- [Backend runbook](docs/backend-runbook.md)
- [การประเมินโมเดล](model/eval/README.md)
- [ผลการทดสอบ](docs/test-results.md)

## ข้อจำกัด

- ป้องกันเว็บไซต์ rod-mai-rod เว็บไซต์เดียว และบล็อกที่ระดับเว็บไซต์ (Caddy) ไม่ใช่ firewall ของเครื่อง
- ผลการ login อนุมานจาก HTTP status 200/401 ของ endpoint login ไม่ได้อ่านเนื้อหาคำขอ
- sensor TCP/SSH เก็บเฉพาะ metadata เบื้องต้น ไม่ใช่ IDS เต็มรูปแบบ
- ชุดทดสอบโมเดลเป็นข้อมูลสังเคราะห์ แม้แยก generator และค่าออกจากข้อมูลฝึกแล้ว รูปแบบ log ยังใกล้เคียงกับข้อมูลฝึก
- ถ้า workstation ที่รันโมเดลปิดอยู่ ระบบวิเคราะห์ด้วยกฎ (`rule_fallback`)
