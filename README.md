# SENTINEL AI

ระบบช่วยงาน Security Operations Center (SOC) ที่ใช้โมเดลภาษาขนาดเล็กรันในเครื่อง ตรวจจับการโจมตี วิเคราะห์หลักฐาน เสนอการป้องกัน และพิสูจน์ผลหลังป้องกัน โดยผู้ดูแลระบบเป็นผู้อนุมัติทุกครั้ง

**Observe → Reason → Defend → Verify**

ระบบดูแล VPS ที่ใช้งานจริงทั้งเครื่อง: ทุกเว็บไซต์ที่ผ่าน Caddy ของเครื่อง, SSH และทุกพอร์ต โดยต้องไม่ทำให้เว็บไซต์ใดบนเครื่องล่ม

## ผู้จัดทำ

| ชื่อ–นามสกุล | รหัสนักศึกษา | หน้าที่ |
|---|---|---|
| นายพิชชากร พวดขุนทด | 116730462035-0 | Backend, ฐานข้อมูล, กฎตรวจจับ, LangGraph agent, การอนุมัติและการพิสูจน์ผล |
| นายประภากรณ์ ภิธรรมมา | 116730462033-5 | Dashboard, โมเดล (prompt, การประเมินผล, fine-tune), การเชื่อมต่อเว็บไซต์จริงและ VPS |

## ภาพรวมการทำงาน

| ขั้น | การทำงาน |
|---|---|
| 1. Observe | รับ security event จาก Caddy access log ของทุกเว็บไซต์ (login, คำขอรวมต่อ IP ทุก 10 วินาที, 404, path กับดัก), log การยืนยันตัวตน SSH และการเชื่อมต่อ TCP ขาเข้า (ยกเว้น 80/443) เก็บลง SQLite ไม่นับคำขอจาก IP ของ VPS เองและวง Docker ภายใน |
| 2. Detect | ตรวจด้วยกฎแบบ Sigma 9 กฎ ภายในหน้าต่างเวลา 60 วินาที แล้วเปิด incident |
| 3. Reason | agent 3 ขั้นบน LangGraph วิเคราะห์ incident ด้วยโมเดล r2 (ภัยเว็บ HTTP_FLOOD / WEB_SCAN / HONEYPOT ตรวจด้วยกฎเฉพาะทาง ไม่ผ่านโมเดล) |
| 4. Defend | ระบบสร้างข้อเสนอบล็อก IP ชั่วคราว ผู้ดูแลต้องอนุมัติก่อนทุกครั้ง |
| 5. Verify | คำขอใหม่จาก IP ที่ถูกบล็อกได้ HTTP 403 ระบบเปลี่ยนสถานะเป็น `verified` และบันทึก audit log แบบตรวจการแก้ไขย้อนหลังได้ |

### กฎตรวจจับ

| กฎ | เงื่อนไข (ภายใน 60 วินาที จาก IP เดียวกัน) |
|---|---|
| HTTP_AUTH_BRUTE_FORCE | login เว็บไซต์ไม่สำเร็จตั้งแต่ 5 ครั้ง |
| SSH_BRUTE_FORCE | ยืนยันตัวตน SSH ไม่สำเร็จตั้งแต่ 5 ครั้ง |
| SUSPICIOUS_LOGIN | login สำเร็จหลังล้มเหลวตั้งแต่ 5 ครั้งในช่องทางเดียวกัน |
| PORT_SCAN | เชื่อมต่อพอร์ตปลายทางต่างกันตั้งแต่ 8 พอร์ต |
| TRAFFIC_ANOMALY | เปิดการเชื่อมต่อตั้งแต่ 100 ครั้ง (ไม่นับพอร์ต 80/443) |
| HTTP_FLOOD | คำขอหน้าเว็บ/API (ไม่นับไฟล์ static) ตั้งแต่ 300 ครั้ง |
| WEB_SCAN | ได้ 404 ตั้งแต่ 10 ครั้ง หรือขอ path ของเครื่องมือสแกนตั้งแต่ 3 path |
| HONEYPOT | ขอ path กับดักที่เว็บไม่มีจริง 1 ครั้ง |

### Agent 3 ขั้น

| ขั้น | หน้าที่ | ข้อจำกัด |
|---|---|---|
| Investigator | สืบค้นหลักฐานด้วยเครื่องมืออ่านอย่างเดียว 4 ตัว (`get_incident_logs`, `get_ip_activity`, `get_related_incidents`, `get_firewall_status`) | เรียกเครื่องมือได้ไม่เกิน 6 ครั้ง / 4 รอบ |
| Threat Analyst | สรุปชนิดภัย ความรุนแรง ความมั่นใจ และหลักฐาน เป็น JSON ตาม schema แบบ strict | ข้อความใน log ถือเป็นข้อมูลที่ไม่น่าเชื่อถือ |
| Defense Planner | เลือกการตอบสนองและเรียก `propose_block_ip` | เห็นเฉพาะผลจากขั้นที่ 2 ไม่เห็น log ดิบ เพื่อลดผลของ prompt injection |

หลังโมเดลเสนอ policy ในโค้ดจะตรวจซ้ำอีกชั้น เช่น บล็อกได้เฉพาะ IP ต้นทางของ incident, ห้ามบล็อก IP ที่ป้องกันไว้ และ `BLOCK_IP` ใช้ได้กับ incident ระดับ CRITICAL เท่านั้น ถ้าโมเดลใช้งานไม่ได้ ระบบเปลี่ยนเป็น `rule_fallback` และแสดงสถานะนี้บน dashboard

### การบังคับใช้กฎกับเว็บไซต์จริง

กฎบล็อกที่อนุมัติแล้วทุกชนิด รวมถึง incident SSH และ port scan ถูกบังคับใช้ที่ Caddy ด้วย snippet เดียวที่ **ทุก site block** import (`import /config/sentinel-site.caddy`) IP ที่ถูกบล็อกได้ 403 จากทุกเว็บไซต์บน VPS ระบบไม่แก้ไข firewall ของเครื่อง SSH และพอร์ตอื่นจึงตรวจจับได้แต่ไม่บล็อก กฎคงอยู่จนผู้ดูแลกดปลดบล็อกบน dashboard (`SENTINEL_MANUAL_UNBLOCK=1`)

## สถาปัตยกรรม

| ส่วน | ที่ตั้ง | เทคโนโลยี |
|---|---|---|
| Backend + Dashboard | VPS, container แยก ฟังเฉพาะ gateway ของ Docker network ที่ Caddy ใช้ (port 8001) จำกัด RAM 384 MB / CPU 0.5 | FastAPI, SQLite, LangGraph, React 19, Vite 8 |
| Bridge และ sensor | VPS (systemd) | อ่าน log ของ Caddy/SSH/TCP ส่งเข้า backend และส่งกฎไปที่ Caddy |
| โมเดล r2 | Workstation RTX 4060 เชื่อมกับ VPS ผ่าน reverse SSH tunnel (dashboard แสดง AI ONLINE / OFFLINE) | Ollama, Qwen 3.5 4B + QLoRA |
| ผู้ดูแลระบบ | เปิด dashboard ผ่าน HTTPS (Caddy) และ login ด้วยบัญชี admin | session cookie แบบ Secure, รหัสผ่านเก็บเป็น scrypt hash, จำกัด login ผิดต่อ IP |

backend และ Ollama ไม่เปิดพอร์ตสู่อินเทอร์เน็ตโดยตรง dashboard ออกผ่าน Caddy ด้วย HTTPS เท่านั้น รายละเอียดการติดตั้งและการย้อนกลับอยู่ที่ [docs/vps-hosting.md](docs/vps-hosting.md)

## โมเดล

ใช้ Qwen 3.5 4B (`qwen3.5:4b`) เป็นโมเดลตั้งต้น และ fine-tune ด้วย QLoRA จากข้อมูลสังเคราะห์ที่สร้างด้วย seed แยกจากชุดทดสอบ ไม่ใช้ชุดทดสอบใดในการฝึก

| รุ่น | การฝึก | ผล |
|---|---|---|
| r1 | QLoRA บน RTX 4060 (VRAM 8 GB) | ไม่สำเร็จ เครื่องหยุดทำงานระหว่างฝึก จึงย้ายการฝึกไปใช้ GPU บนคลาวด์ |
| r2 | QLoRA บน Kaggle T4 × 2 (fp32) ใช้ checkpoint-150 | eval loss 0.0022 หลัง epoch แรก **โมเดลที่ใช้งานปัจจุบัน** (`sentinel-qwen3.5-4b-r2`, กลับมาใช้ 4 พ.ย. 2569 ดูผล v5/v6) |
| r3 | เพิ่มข้อมูลกรณี SSH login สำเร็จ, รายการพอร์ตยาว และคำอธิบายที่หลากหลายขึ้น ฝึกครบ 238/238 step | eval loss 0.0073 ใช้งาน 22 ต.ค.–3 พ.ย. เลิกใช้เพราะคำอธิบายแต่งข้อเท็จจริงบนชุดที่ไม่เคยเห็น (v5/v6) |

ส่งออกเป็น GGUF สำหรับ Ollama ด้วย `model/finetune/export_gguf.py`

## การทดสอบ

### 1. ทดสอบอัตโนมัติ

| ชุด | ผล |
|---|---|
| Backend (`backend/tests`): detection, policy, agent, API contract, การเข้าถึง, WebSocket, audit log | 423 passed |
| Bridge เว็บไซต์จริง (`integrations/rod_mai_rod/test_bridge.py`) | passed |
| ตัวให้คะแนนโมเดล (`model/eval/test_agent_bench.py`) | passed |
| Frontend `npm run build` | passed |

GitHub Actions รัน CI ของ backend และ frontend ทุก pull request และต้องผ่านก่อน merge

### 2. ประเมินโมเดล

`model/eval/agent_bench.py` จำลองการทำงานเหมือน backend ทุกขั้น (เพดานการเรียกเครื่องมือ, schema แบบ strict) วัดว่าระบุชนิดภัยและการตอบสนองถูกต้องหรือไม่ นับ false positive (เสนอบล็อกในกรณีที่ห้ามบล็อก) และนับ prompt injection ที่สำเร็จ ใช้ชุดทดสอบ 6 ชุด

| ชุดทดสอบ | จำนวนกรณี | ที่มา |
|---|---|---|
| v1 test | 28 | generator หลัก ปรับ prompt ด้วยชุด dev 19 กรณีที่แยกต่างหาก |
| v2 | 40 | generator ใหม่ ค่า IP/ชื่อผู้ใช้ไม่ซ้ำกับข้อมูลฝึก |
| v3 | 34 | generator อิสระที่เขียนแยก (seed 61106) |
| v4 | 33 | generator อิสระรุ่นถัดมา สร้างหลังฝึก r3 |
| v5 | 72 | สร้าง 3 พ.ย. หลัง r3: 29 กรณี "กฎจับแต่ไม่ควรบล็อก", เว็บ login ไม่มี username, `ip_activity` รูปเดียวกับ backend |
| v6 | 85 | generator ของ v5 แต่เปลี่ยน seed, เครือข่าย, ชื่อบัญชี, ข้อความ injection และขนาดทั้งหมด ไม่ซ้ำกับข้อมูลฝึกหรือ v5 (IP 0/85, ชื่อบัญชี 0, injection 0/6) |

ผลบน MacBook Pro M5 16 GB:

| โมเดล | v1 test | v2 | v3 | v4 | False positive | Injection สำเร็จ (v1) | เวลาต่อกรณี (มัธยฐาน) |
|---|---|---|---|---|---|---|---|
| qwen3.5:4b (prompt v1) | 26/28 | 33/40 | 28/34 | – | 2–3 ต่อชุด | 0/3 | 29 วินาที |
| r2 | 28/28 | 38/40 | 32/34 | – | 0 | 0/3 | 11.5–12.6 วินาที |
| **r3** | **28/28** | **40/40** | **32/34** | **30/33** | **0** | **0/3** | 11.9–14.4 วินาที |

ผลของ r3 บน M5 และบน RTX 4060 ตรงกันทุกกรณี (บน RTX 4060 ใช้เวลาประมาณ 7 วินาทีต่อกรณี) Injection วัดเฉพาะกรณี injection 3 กรณีในชุด v1 ข้อมูลฝึก r3 ปรับหลังดูข้อผิดพลาดของ r2 ในชุด v2/v3 ผล r3 บน v2/v3 จึงเป็นการตรวจถดถอย ไม่ใช่ชุดทดสอบอิสระ ชุดที่เป็นอิสระสำหรับ r3 คือ v4 (base และ r2 ไม่ได้รันบน v4) ผลดิบเก็บไว้ที่ `model/eval/results/`

ผลบน RTX 4060 ชุด v5/v6 (`--pipeline --backend-hints`, prompt v1, temperature 0 เท่ากับ backend):

| โมเดล | v5 ผ่าน | v6 ผ่าน | กฎจับแต่ไม่ควรบล็อก: บล็อกผิด (v5 / v6) | Injection (v5 / v6) | คำอธิบายแต่งข้อเท็จจริง (v5 / v6) | เวลาต่อกรณี (v6) |
|---|---|---|---|---|---|---|
| qwen3.5:4b | 40/72 | 48/85 | 27/29 · 32/35 | 9/10 · 9/10 | 4% · 8% | 8.0 วินาที |
| **r2** | 40/72 | 47/85 | 29/29 · 35/35 | 9/10 · 9/10 | **4% · 4%** | **5.8 วินาที** |
| r3 | 43/72 | 47/85 | 26/29 · 34/35 | 10/10 · 10/10 | **43% · 45%** | 6.6 วินาที |

- temperature 0 ให้คำตอบเดิมทุกครั้ง (3 รอบบน v5 ตรงกัน 72/72) ขนาดตัวอย่างจึงเป็นจำนวนกรณี ไม่ใช่รอบ × กรณี
- ตัดสินใจถูกใกล้เคียงกันทุกรุ่น r2 ถูกเลือกเพราะคำอธิบายที่ผู้ดูแลใช้ประกอบการอนุมัติตรงกับ log และเร็วกว่า
- r3 แต่งข้อเท็จจริงจากประโยคแม่แบบในข้อมูลฝึก (เป้าหมายของ r3 มี "...ลองหลายบัญชี เป็นลักษณะการเดารหัส" 22 ครั้ง r2 ไม่มี) เช่นเขียนว่าลองหลายบัญชีทั้งที่ log มีบัญชีเดียว
- **ทุกรุ่นยังกรองการบล็อกผิดไม่ได้** เพราะกรณี benign ในข้อมูลฝึกล้มเหลวไม่เกิน 4 ครั้งเสมอ โมเดลจึงเรียนให้ตรงกับกฎ ระบบจึงให้ผู้ดูแลอนุมัติทุกครั้ง
- วัดการแต่งข้อเท็จจริงด้วย `model/eval/grounding.py` (ตรวจได้เฉพาะสิ่งที่เทียบกับ log ได้: ชื่อบัญชี, "หลายบัญชี", จำนวนครั้ง, login สำเร็จ, จำนวนพอร์ต)

### 3. ทดสอบกับระบบจริง

เครื่องใหม่ (4 พ.ย. 2569): port scan จริงจากอินเทอร์เน็ต 63 พอร์ต → PORT_SCAN → r2 วิเคราะห์เสนอ `TEMP_BLOCK_IP` → รอผู้ดูแล การทดสอบครบวงจรใช้ `scripts/vps_live_test.py` (เลือกการโจมตี → อนุมัติ → 403 → ปลดบล็อก → 200)

เครื่องเดิม ยิงทดสอบด้วย `scripts/live-five-tests.py` (HTTP login ผิด, SSH ด้วย key ที่ไม่ได้รับอนุญาต, login สำเร็จหลังล้มเหลว, port scan, traffic) ผลวันที่ 30 ต.ค. 2569 (ขณะนั้นป้องกันเฉพาะ rod-mai-rod ใช้ r3):

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
| `integrations/rod_mai_rod/` | bridge, sensor และตัวจัดการกฎ Caddy ของทุกเว็บบน VPS (ชื่อโฟลเดอร์มาจากเว็บแรกที่ดูแล) |
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
$env:SENTINEL_MODEL = 'sentinel-qwen3.5-4b-r2:latest'   # หรือ qwen3.5:4b
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

- บล็อกที่ระดับเว็บไซต์ (Caddy) ไม่ใช่ firewall ของเครื่อง: SSH, พอร์ตอื่น และบริการที่ไม่ผ่าน Caddy ตรวจจับได้แต่ไม่บล็อก
- โมเดลยังไม่ช่วยกรองการบล็อกผิด (v5/v6) การป้องกันการบล็อกผิดอยู่ที่ผู้ดูแลอนุมัติทุกครั้ง
- ผลการ login อนุมานจาก HTTP status 200/401 ของ endpoint login ไม่ได้อ่านเนื้อหาคำขอ
- sensor TCP/SSH เก็บเฉพาะ metadata เบื้องต้น ไม่ใช่ IDS เต็มรูปแบบ
- ชุดทดสอบโมเดลเป็นข้อมูลสังเคราะห์ แม้แยก generator และค่าออกจากข้อมูลฝึกแล้ว รูปแบบ log ยังใกล้เคียงกับข้อมูลฝึก
- ถ้า workstation ที่รันโมเดลปิดอยู่ ระบบวิเคราะห์ด้วยกฎ (`rule_fallback`)
