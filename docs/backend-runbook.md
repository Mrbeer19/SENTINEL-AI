# Backend runbook — v0.2 (M5 = server)

ใช้คู่กับ `docs/demo-runbook.md` (ภาพรวมเดโมของทีม) ไฟล์นี้เฉพาะฝั่ง backend บน MacBook M5 · คำสั่งทั้งหมดรันจาก root ของ repo · อัปเดต 20 ต.ค. 2569

## 1. ติดตั้งครั้งแรก

```sh
make -C backend venv            # สร้าง backend/.venv + ติดตั้ง requirements
cp backend/.env.example backend/.env
make -C backend test            # ต้องได้ 395 passed
```

โมเดล (ทำครั้งเดียว ~3.7 GB): `brew install ollama` → `ollama serve` (ค้างไว้อีกหน้าต่าง) → `ollama pull qwen3.5:4b`

## 2. ค่าใน `backend/.env`

| ตัวแปร | ค่าวันเดโม | ทำไม |
|---|---|---|
| `SENTINEL_PROTECTED_IPS` | `<gateway ของ hotspot>,<IP ของ M5>` | ห้ามบล็อกตัวเอง/router · preflight จะ FAIL ถ้าว่าง |
| `SENTINEL_ADMIN_KEY` | ว่าง (ใช้ dashboard บน M5 เอง) | ใส่เฉพาะเมื่อต้องคุม SOC จากเครื่องอื่น · ≥24 ตัว |
| `SENTINEL_OLLAMA_FORMAT` | `0` | MLX runner ตอบ 501 เมื่อส่ง `format` |
| `SENTINEL_DEMO_RATE_LIMIT` / `_WINDOW` | `30` / `10` | เครื่องยิงส่งได้ 30 req / 10 วิ · `lab_client.py` ส่ง 6 ครั้งห่าง 0.3 วิ ไม่ชน |

ดู IP: `ipconfig getifaddr en0` (IP ของ M5) · `route -n get default | grep gateway` (gateway)

## 3. รัน

| สถานการณ์ | คำสั่ง | ใครเข้าได้ |
|---|---|---|
| พัฒนา/ซ้อมเครื่องเดียว | `make -C backend run` | เฉพาะ M5 (127.0.0.1:8000) |
| เดโม 2 เครื่อง | `make -C backend run-lan HOST=<IP ของ M5>` | M5 + เครื่องยิงใน hotspot เดียวกัน |

`run-lan` รัน preflight ก่อน ถ้าไม่ผ่านจะไม่เปิด server · **ห้าม bind `0.0.0.0` บน Mac** (preflight ปฏิเสธ) เพราะจะเปิดทุก interface

เมื่อใช้ `run-lan` server ฟังที่ IP M5 อย่างเดียว ไม่ได้ฟังที่ `127.0.0.1` → บน M5 เปิด dashboard และเรียก `curl` ที่ `http://<IP M5>:8000` (ไม่ใช่ `localhost`) · request ที่มาจาก IP M5 เอง (`SENTINEL_LAN_HOST`) นับเป็นเครื่อง SOC เหมือน `127.0.0.1` จึงกดปุ่มบน dashboard ได้โดยไม่ต้องใช้ `X-Admin-Key`

**ห้ามวาง reverse proxy บน M5 ที่ส่งต่อมาที่ `<IP M5>:8000`** (เช่น nginx/Caddy/sidecar) เพราะ request ทุกตัวที่ผ่าน proxy จะมี IP ต้นทางเป็น M5 และถูกนับเป็นเครื่อง SOC ทั้งหมด ใครก็ตามที่เข้าถึง proxy ได้จะเรียก endpoint ของ SOC ได้โดยไม่ต้องมี key · ถ้าต้องมี proxy ให้รันอีกเครื่อง หรือรัน `make -C backend run` (127.0.0.1) แล้วให้ proxy แนบ `X-Admin-Key` เอง

ตรวจระบบที่รันอยู่ (อีกหน้าต่าง):

```sh
make -C backend smoke                              # ทั้งลูปด้วย simulation (ไม่ต้องมีเครื่องที่สอง)
make -C backend smoke SMOKE_ARGS=--require-model   # วันเดโม: ต้องใช้โมเดลจริง ไม่ใช่ fallback
```

ผ่าน = บรรทัดสุดท้าย `SMOKE PASS` และ `analysis_mode` เป็น `ollama` (บน M5 ~26–33 วิ) · smoke ปลดบล็อกให้เองหลังจบ

## 4. เส้นเดโมจริง (เครื่องยิง → M5)

| ขั้น | ใคร | ทำอะไร | ต้องเห็น |
|---|---|---|---|
| 0 | M5 | `make -C backend reset` | `{"rules_disabled":…, "incidents_closed":…}` |
| 1 | เครื่องยิง | `python scripts/lab_client.py --server http://<IP M5>:8000 --action traffic` | `1 200 … "decision":"allowed"` |
| 2 | เครื่องยิง | `… --action login` | 6 บรรทัด `401` · ครั้งที่ 5 เปิด incident |
| 3 | M5 | dashboard: incident `HTTP_AUTH_BRUTE_FORCE` source = IP เครื่องยิง → กด Analyze | trace ทีละขั้น · proposal `TEMP_BLOCK_IP` 600 วิ `pending` |
| 4 | M5 | กด Approve (ใส่ชื่อผู้ตรวจ) | สถานะ `blocked` |
| 5 | เครื่องยิง | `… --action traffic` | `403` `"decision":"denied"` → สถานะ `verified` |
| 6 | M5 | `curl -s http://<IP M5>:8000/api/audit/verify` | `"valid": true` |

ฝั่งเครื่องยิงใช้ `curl` ตาม `scripts/neo/README.md` (ของ Beer, branch `beer/dashboard-v1`) แทน `lab_client.py` ได้ ผลที่ต้องเห็นเหมือนตารางนี้ · **ฝั่ง M5 ให้รันด้วย `make -C backend run-lan HOST=<IP M5>` ไม่ใช่ `--host 0.0.0.0`**

ทางเลือกที่ต้องโชว์ได้: **Reject** ที่ขั้น 4 → ขั้น 5 ได้ `200` ไม่โดนบล็อก · **ปิด Ollama** ก่อนขั้น 3 → `analysis_mode = rule_fallback`, `confidence = null`, proposal `source = rule_fallback` (ยังต้องคนอนุมัติ)

### Scenario จำลองบน M5 (ไม่ต้องใช้เครื่องยิง)

```sh
# ส่งทีละ event ทุก 0.5 วิ ให้ dashboard เห็นไหลเข้า (scenario: http_brute_force | ssh_brute_force_logs | port_scan | suspicious_login | traffic_anomaly | normal)
curl -s -X POST localhost:8000/api/simulations/start -H 'Content-Type: application/json' -d '{"scenario":"suspicious_login","source_ip":"192.0.2.40"}'
curl -s localhost:8000/api/simulations/state     # ดูความคืบหน้า
curl -s -X POST localhost:8000/api/simulations/stop
# log sshd ดิบ (สเปก D)
curl -s -X POST localhost:8000/api/logs -H 'Content-Type: application/json' -d '{"format":"sshd","lines":["'"$(date -Iseconds)"' m5 sshd[1]: Failed password for invalid user admin from 192.0.2.41 port 50000 ssh2"]}'
```

`suspicious_login` เปิด 2 incident (brute force + suspicious login) ตามออกแบบ · `traffic_anomaly` 120 event ที่ 0.5 วิ ใช้เวลา 1 นาที (เปิด incident ที่ event ที่ 100)

## 5. reset และข้อมูล

- `make -C backend reset` = ปิดกฎที่ยัง active + ปิด incident ที่ยังเปิด + proposal ที่ค้างเป็น rejected · **ไม่ลบประวัติ** audit ยัง valid
- เริ่ม DB ใหม่หมด: หยุด server แล้ว `rm backend/data/sentinel.db*` (ประวัติ + audit หายทั้งหมด)
- IP ที่โดนบล็อกจะได้ 403 ทุก request จนกฎหมดอายุ (10 นาที) หรือปลด/reset · หลังจากนั้นโจมตีซ้ำ = incident ใหม่ (incident ที่จบแล้วไม่ถูกใช้ซ้ำ)

## 6. แก้ปัญหา

| อาการ | สาเหตุ | แก้ |
|---|---|---|
| preflight `Ollama reachable` FAIL | ยังไม่ได้ `ollama serve` | เปิดอีกหน้าต่าง |
| preflight `protected IPs` FAIL | `.env` ไม่มี gateway/M5 | ข้อ 2 |
| เครื่องยิงได้ `403 Remote access … X-Admin-Key` | เรียก endpoint SOC จากเครื่องยิง | เครื่องยิงใช้ได้แค่ `/api/demo/*` + `/api/health` ตามออกแบบ |
| เครื่องยิงได้ `429` | ยิงเกิน 30 req/10 วิ | รอ 10 วิ |
| เครื่องยิงได้ `403 source override requires localhost` | ส่ง `source_ip` ใน body | ห้ามส่ง ระบบใช้ IP จริงของ connection |
| login ไม่เปิด incident | ยิงห่างกันเกิน 60 วิ หรือไม่ถึง 5 ครั้ง | ยิงใหม่ภายใน 60 วิ |
| analyze ได้ `rule_fallback` ทั้งที่เปิดโมเดล | โมเดลตอบ JSON ผิด 2 ครั้ง / timeout 90 วิ / ชื่อโมเดลไม่ตรง | ดู trace แถว `invalid_output` · `ollama list` |
| approve ได้ `400 … protected` | IP นั้นถูกเพิ่มเป็น protected หลังเสนอ | ถูกต้องตาม policy (ตรวจซ้ำตอนอนุมัติ) |
| `/api/audit/verify` `valid:false` | มีคนแก้ DB ตรง | `broken_at` บอกแถวแรกที่ถูกแก้ |
| เบราว์เซอร์ได้ `400 Invalid host header` | เปิดด้วยชื่อ/IP ที่ไม่อยู่ใน `SENTINEL_ALLOWED_HOSTS` | ใช้ `127.0.0.1` (`make run`) หรือ `<IP M5>` (`make run-lan HOST=…`) |
| ปุ่มบน dashboard ได้ `403 Cross-site request refused` | หน้า dashboard มาจาก origin อื่น (เช่นเปิดผ่านชื่อเครื่อง) | เปิด dashboard ที่ `127.0.0.1:8000` (`make run`), `http://<IP M5>:8000` (`make run-lan`) หรือ `localhost:5173` |
| เปิด `localhost:8000` บน M5 ไม่ขึ้น ระหว่าง `run-lan` | server ฟังที่ IP M5 อย่างเดียว | ใช้ `http://<IP M5>:8000` |
| เครื่องยิงเปิด `/docs` ได้ 403 | ปิดไว้ตั้งใจ (Beer ตกลง 20 ต.ค.) | เปิดดูบน M5 ที่ `127.0.0.1:8000/docs` หรือ `http://<IP M5>:8000/docs` ระหว่าง `run-lan` |
| event มี `username_truncated = 1` | username ยาวเกิน 80 ตัว (มักเป็นการลองยัดข้อความ) | ปกติ · เก็บ 80 ตัวแรกและยังนับเข้ากฎตรวจจับ · เกิน 1024 ตัว = 422 |

## 7. ตรวจผล/วัดผล (ไม่ต้องเปิด server)

```sh
make -C backend test    # 395 เทส ~9 วิ
make -C backend eval    # replay 47 เคสใน datasets/ ผ่านกฎตรวจจับ → precision/recall/F1
make -C backend bench   # v0.1 เทียบ v0.2 workload เดียวกัน
```

ผลล่าสุดอยู่ `docs/test-results.md` หัวข้อ Backend v0.2
