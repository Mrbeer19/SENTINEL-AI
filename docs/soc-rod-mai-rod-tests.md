# SOC เว็บรอดไม่รอด: ไฟล์และวิธีรัน

เอกสารนี้รวมสคริปต์ที่ใช้เฝ้าและทดสอบเว็บรอดไม่รอด (`<site-domain>`) ด้วย SENTINEL
ค่าของ production ทั้งหมด (โดเมน ที่อยู่ VPS ชื่อผู้ใช้ SSH โฟลเดอร์บน VPS path ของ Caddy ชื่อ container) ไม่ได้เก็บไว้ใน Git ให้ใส่ตอนรันเอง

## ไฟล์อยู่ที่ไหน

| ไฟล์ | รันที่ | หน้าที่ |
| --- | --- | --- |
| `integrations/rod_mai_rod/site_config.py`, `site.example.json` | VPS | อ่านค่าของ production จาก `site.json` ที่วางไว้โฟลเดอร์เดียวกับสคริปต์บน VPS (ไฟล์นี้ไม่ขึ้น Git) |
| `integrations/rod_mai_rod/agent.py` | Windows | ดึง log จาก VPS ผ่าน SSH ทุก 5 วินาที ส่งเข้า backend และส่งกฎบล็อกที่อนุมัติแล้วกลับไปที่ VPS |
| `integrations/rod_mai_rod/vps_logs.py` | VPS | อ่าน access log ของ Caddy เอาเฉพาะผล login (200/401) และคำขอที่โดน 403 |
| `integrations/rod_mai_rod/vps_rules.py` | VPS | เขียนกฎ 403 ให้ Caddy ตรวจ config ก่อน reload และย้อนกลับถ้า reload ไม่ผ่าน |
| `integrations/rod_mai_rod/vps_sensor.py` | VPS (service `sentinel-sensor`) | เก็บผล login SSH และ TCP SYN ขาเข้า เก็บแค่ข้อมูลหัวแพ็กเก็ต |
| `integrations/rod_mai_rod/rod-mai-rod-sentinel-expire.*` | VPS (systemd timer) | ลบกฎที่หมดอายุทุก 15–20 วินาที แม้ Windows ปิดอยู่ |
| `integrations/rod_mai_rod/install_windows.ps1` | Windows | ติดตั้ง agent ลง `%LOCALAPPDATA%\SentinelAI` และตั้งให้เริ่มเองตอนล็อกอิน |
| `integrations/rod_mai_rod/install_sensor.ps1` | Windows → VPS | อัปโหลดและเปิด service sensor บน VPS |
| `integrations/rod_mai_rod/install_caddy.py`, `probe-caddy.cjs` | VPS | ตั้งค่า Caddy ครั้งแรก และเช็กว่า Caddy ตอบอยู่ |
| `integrations/rod_mai_rod/test_bridge.py`, `test_sensor.py` | Windows | unit test ของ agent และ sensor |
| `scripts/live-five-tests.py` | เครื่องที่ใช้ทดสอบ | ยิงทดสอบเว็บและ VPS จริง |
| `scripts/test-five-scenarios.py` | เครื่องที่รัน backend | สร้าง log จำลอง 5 แบบ ไม่ส่งทราฟฟิกออกไปไหน |
| `scripts/lab_client.py` | เครื่องใน LAN | ส่ง login ผิดหรือ request ปกติไปที่ backend ในวง LAN |

## การทำงานโดยรวม

```
ผู้ใช้เว็บ ─▶ Caddy บน VPS ─▶ access log ──────────────┐
SSH / TCP ─▶ vps_sensor.py ─▶ network-events.jsonl ─────┤
                                                        ▼
Windows: agent.py (ทุก 5 วินาที) ─▶ backend 8001 ─▶ โมเดลวิเคราะห์
                                                        │
ผู้ดูแลกด Approve ใน dashboard ◀────────────────────────┘
        │
agent.py ส่งรายการ IP ─▶ vps_rules.py ─▶ Caddy ตอบ 403 เฉพาะเว็บ rod-mai-rod
```

## เตรียมก่อนรัน

1. เปิด Ollama ให้พร้อมใช้โมเดล r3
2. เปิด backend พอร์ต 8001 (ใช้คีย์บอร์ดภาษาอังกฤษตอนพิมพ์รหัส)

   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-admin-local.ps1
   ```

3. เปิด dashboard ที่ http://127.0.0.1:8001/
4. ตรวจว่า agent รันอยู่ โดยดู log ที่ `%LOCALAPPDATA%\SentinelAI\rod-mai-rod-agent.log`

ตั้ง `SENTINEL_SITE_URL=https://<site-domain>` ไว้ก็ไม่ต้องใส่ `--site` ทุกครั้ง และใส่ `VITE_PROTECTED_SITE_HOST` ใน `frontend/.env.local` ให้ dashboard แสดงชื่อเว็บ

ถ้าต้องติดตั้ง agent ใหม่:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\integrations\rod_mai_rod\install_windows.ps1 -VpsHost <VPS> -VpsUser <user> -VpsDir <โฟลเดอร์บน VPS>
```

ถ้าต้องติดตั้ง sensor ใหม่:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\integrations\rod_mai_rod\install_sensor.ps1 -VpsHost <VPS> -VpsUser <user> -VpsDir <โฟลเดอร์บน VPS>
```

## ยิงทดสอบเว็บจริง (`scripts/live-five-tests.py`)

รันทีละแบบ แล้วดูผลใน dashboard ก่อนรันแบบถัดไป

| คำสั่ง | สิ่งที่ส่ง | ควรเห็นใน dashboard |
| --- | --- | --- |
| `python scripts/live-five-tests.py http --site https://<site-domain>` | login ผิด 6 ครั้ง ทุกครั้งต้องได้ 401 | HTTP brute force |
| `python scripts/live-five-tests.py login --site https://<site-domain>` | login ผิด 6 ครั้ง แล้ว login ถูกด้วยบัญชีทดสอบ | suspicious login |
| `python scripts/live-five-tests.py ssh --host <VPS>` | ssh ด้วย key ชั่วคราว 3 ดอก 2 ครั้ง ต้องโดนปฏิเสธ | SSH brute force |
| `python scripts/live-five-tests.py ssh-login --host <VPS>` | แบบ ssh แล้วต่อด้วย key จริงของ collector | SSH suspicious login |
| `python scripts/live-five-tests.py scan --host <VPS>` | เปิดพอร์ต 8000–8008 พอร์ตละครั้ง | port scan |
| `python scripts/live-five-tests.py traffic --host <VPS>` | เปิด TCP ไปพอร์ต 443 จำนวน 105 ครั้ง ห่างกัน 150 ms | traffic anomaly |

หลังยิง: Incidents → Analyze → Approve บล็อก แล้วลองเข้าเว็บจาก IP ที่ยิง ต้องได้ 403
สคริปต์ไม่อนุมัติการบล็อกเอง ต้องกดใน dashboard ทุกครั้ง

## ทดสอบแบบไม่ยิงจริง

```powershell
python scripts/test-five-scenarios.py --scenario all
```

ใช้ IP ช่วง 198.51.100.x ที่สงวนไว้สำหรับเอกสาร ผลเก็บที่ `output/eval/five-scenarios-*.json`

## Unit test

```powershell
python -m pytest integrations/rod_mai_rod -q
```

## ข้อจำกัดที่ยังเหลือ

- บล็อกได้เฉพาะ HTTP ที่ Caddy ส่วน SSH และ port scan ตรวจจับได้แต่ยังไม่บล็อกที่ firewall ของ VPS
- sensor เห็นทราฟฟิกทั้ง VPS จึงอาจมี event ของเว็บอื่นบนเครื่องเดียวกันปนมา
- ถ้ายิงจากเน็ตเดียวกับเครื่องผู้ดูแลแล้วบล็อก IP นั้น ผู้ดูแลจะเข้าเว็บไม่ได้จนกว่าจะ Unblock หรือกฎหมดอายุ
- ก่อนอัปเดตสคริปต์บน VPS ต้องสร้าง `site.json` จาก `site.example.json` ก่อน ไม่งั้น `vps_logs.py` / `vps_rules.py` จะหยุดพร้อมข้อความแจ้ง และ unit file ต้องแทน `__VPS_DIR__` ด้วยโฟลเดอร์จริง

## ยกเลิกการเชื่อมต่อ

หยุด agent ลบ shortcut ใน Startup ปิด timer บน VPS แล้วคืน Caddyfile จากไฟล์สำรอง ตามขั้นตอนใน `integrations/rod_mai_rod/README.md` หัวข้อ Rollback
