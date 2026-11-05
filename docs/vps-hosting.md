# SENTINEL บน VPS

ขอบเขต: ดูแล **ทั้ง VPS** ทุกเว็บที่ site block ใน Caddy import `sentinel-site.caddy` + SSH + ทุกพอร์ต (5 พ.ย. 2569 เจ้าของเครื่องเพิ่ม qplay.tntstudio.tech โดยไม่ import ระบบจึงไม่ดูเว็บนี้ ตกลงไม่แตะ) และห้ามทำให้เว็บใดบนเครื่องล่ม
(ตั้งแต่ 4 พ.ย. 2569 · เครื่องเดิมที่ดูแลเฉพาะ rod-mai-rod เข้าไม่ได้แล้ว)

## ส่วนประกอบ

| ส่วน | อยู่ที่ | หมายเหตุ |
| --- | --- | --- |
| backend + dashboard | container `sentinel-api-1` (Compose project `sentinel`) | `network_mode: host` ฟังที่ gateway ของ Docker network ที่ Caddy ใช้ (`UVICORN_HOST`) ไม่ฟัง IP สาธารณะ · RAM 384 MB, CPU 0.5, filesystem read-only |
| ฐานข้อมูล | volume `sentinel_sentinel-data` → `/data/sentinel.db` | backup ไว้ที่ `backups/` ใน volume เดียวกัน |
| bridge | systemd `sentinel-bridge.service` | รัน `agent.py --local` เรียก `vps_*.py` ตรง ๆ · RAM 96 MB, CPU 20% |
| sensor | systemd `sentinel-sensor.service` | SSH จาก journal ของ sshd + SYN ขาเข้าทุกพอร์ต (ยกเว้น 80/443 ซึ่งเป็นคนเข้าเว็บ ดูจาก Caddy log แทน) |
| ตั้งค่า bridge | `<bridge-dir>/site.json` (ไม่อยู่ใน Git) | ตัวอย่าง `integrations/rod_mai_rod/site.example.json` |
| key ของ bridge | `/etc/sentinel-bridge.env` (600) | ค่าเดียวกับ `SENTINEL_ADMIN_KEY` และ `SENTINEL_API_URL=http://<gateway>:8001` |
| ตั้งค่า backend | `<sentinel-dir>/deploy/vps/.env` (600, ไม่อยู่ใน Git) | ตัวอย่าง `deploy/vps/.env.example` |
| โมเดล | Ollama + `sentinel-qwen3.5-4b-r2` บน Windows RTX 4060 | VPS เรียกผ่าน reverse SSH tunnel `scripts/ollama-tunnel.ps1` ถ้าเครื่องปิดหรือไม่มี tunnel ใช้ `rule_fallback` (dashboard ขึ้น AI OFFLINE) |

ไม่เปิดพอร์ตใหม่สู่อินเทอร์เน็ต ไม่แก้ firewall ของเครื่อง และไม่แตะ sshd ของเจ้าของเครื่อง

## Caddy (ของเจ้าของเครื่อง)

- snippet ใน config volume ของ Caddy (`/config` ใน container):
  - `sentinel-block.caddy` = รายการ IP ที่ถูกบล็อก (`vps_rules.py` เขียนให้)
  - `sentinel-site.caddy` = `import /config/sentinel-block.caddy` + `log` ลง `/config/sentinel.access.log`
- **ทุก site block** import อย่างใดอย่างหนึ่ง: `import /config/sentinel-block.caddy` ตรง ๆ (บล็อกอย่างเดียว ต้องใส่ `log` เอง) หรือ `import /config/sentinel-site.caddy` (บล็อก + log ในบรรทัดเดียว แนะนำสำหรับเว็บที่เพิ่มทีหลัง)
  `vps_rules.py` รองรับทั้งสองแบบ ตอน validate จะสร้าง candidate ของ `sentinel-site.caddy` ด้วย ทุกเว็บจึงถูกทดสอบกับรายการบล็อกใหม่ก่อน reload
  (เครื่องปัจจุบันใช้แบบ import ตรงใน 2 site block)
  IP ที่อนุมัติบล็อกจะได้ 403 จากทุกเว็บที่ import · SSH/พอร์ตอื่นตรวจจับอย่างเดียว ไม่บล็อก
  บริการที่เปิดพอร์ตตรงโดยไม่ผ่าน Caddy จะเห็นแค่การเชื่อมต่อ บล็อกไม่ได้
- ถ้า Caddy mount Caddyfile เป็นไฟล์เดี่ยว (`./Caddyfile:/etc/caddy/Caddyfile`) ต้อง **เขียนทับในไฟล์เดิม** (inode เดิม) ถ้าแทนด้วยไฟล์ใหม่ container จะไม่เห็น
- แก้ Caddyfile ทุกครั้ง: backup → สร้าง candidate ใน `/config` → `caddy validate` → เขียนทับ → `caddy reload` → เช็กทุกเว็บได้ 200 ถ้าไม่ได้ให้คืน backup แล้ว reload
- `site.json` สำหรับ Caddy ที่อ่าน Caddyfile ตรง: `"active_config": ""`, `"reload_config": "/etc/caddy/Caddyfile"`, `"access_log": "sentinel.access.log"`, `"block_snippet": "sentinel-block.caddy"`
- `"domains": ["*"]` = ดูทุกเว็บที่เขียน log · `"login_paths"` ต่อโดเมน: เว็บที่มีระบบ login ใส่ path (เช่น rod-mai-rod `["/api/v1/auth/login", "/api/v1/auth/google"]`) เว็บที่ไม่มีใส่ `[]` (`"*": []` เป็นค่าตั้งต้นของเว็บที่ไม่ได้ระบุ)

## ค่าใน `.env` ที่ต้องตั้งตามเครื่อง

- `UVICORN_HOST=<gateway ของ network ที่ Caddy ใช้>` (เช่น 172.18.0.1) · `UVICORN_PROXY_HEADERS=true` · `FORWARDED_ALLOW_IPS=<IP ของ container Caddy>`
- `SENTINEL_ALLOWED_HOSTS=<gateway>,<ชื่อ dashboard>` · `SENTINEL_COOKIE_SECURE=1`
- `SENTINEL_PROTECTED_IPS=<IPv4 ของ VPS>,<IPv6 ของ VPS>,<gateway>,<IP ของ Caddy>` (กันระบบเสนอบล็อกตัวเอง bridge ก็ตัด IP ของเครื่องและวง Docker ทิ้งก่อนเป็น event อยู่แล้ว)
- `SENTINEL_MODEL=sentinel-qwen3.5-4b-r2:latest` · `SENTINEL_MANUAL_UNBLOCK=1`
- รหัส admin: ทำ hash บนเครื่อง admin แล้วส่งแค่ hash ให้สคริปต์บน VPS เขียนลง `.env` (รหัสจริงไม่ออกจากเครื่อง admin)

IP ของ container Caddy เปลี่ยนได้ถ้า container ถูกสร้างใหม่ ถ้า dashboard เห็น IP ผู้ใช้เป็น 172.x ให้แก้ `FORWARDED_ALLOW_IPS` และ `SENTINEL_PROTECTED_IPS`

## ข้อจำกัดของเครื่องนี้

- `"active_config": ""` ไม่มีสำเนา active ให้เทียบ จึงไม่ตรวจว่า Caddyfile ถูกแก้ระหว่างทาง (`vps_rules.py` อ่าน Caddyfile ล่าสุดทุกครั้งแล้ว validate ก่อน reload)
- ผู้ใช้ IPv6 เข้าเว็บผ่าน docker-proxy ของเจ้าของเครื่อง Caddy จึงเห็นเป็น IP gateway ของ Docker และ bridge ตัดทิ้งเป็นการเชื่อมต่อของเครื่องเอง ผู้ใช้ IPv6 จึงมองไม่เห็นและบล็อกไม่ได้ (ต้องเปิด IPv6 ใน Docker network ของ Caddy ซึ่งเป็นการตั้งค่าของเจ้าของเครื่อง)
- sensor ไม่นับ SYN พอร์ต 80/443 (คนเข้าเว็บดูจาก Caddy log และ HTTP_FLOOD นับจาก log อยู่แล้ว) SYN flood ที่ 443 ที่ไม่ส่ง HTTP จึงมองไม่เห็น

## เปิด dashboard

ผ่าน HTTPS ของ Caddy: site block `sentinel.<ip-ขีด>.sslip.io { reverse_proxy <gateway>:8001 }` (ไม่ import snippet ของ SENTINEL เพื่อให้ admin เข้าได้แม้ IP ตัวเองโดนบล็อก) แล้ว login ด้วยบัญชี admin

## ต่อโมเดล

บนเครื่อง Windows ที่เปิด Ollama ไว้ (เปิดหน้าต่างค้างไว้):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\ollama-tunnel.ps1 -VpsHost <vps> -VpsUser <user>
```

ฝั่ง VPS bind แค่ `127.0.0.1:11434` (sshd `GatewayPorts no`) ดูสถานะได้จากป้าย AI ONLINE / OFFLINE บน dashboard หรือ `/api/health` (`ai_mode`)

## build และ deploy

build บนเครื่อง Windows เพื่อไม่กิน CPU ของ VPS ที่เว็บอื่นใช้ร่วม:

```sh
docker build -f deploy/vps/Dockerfile --platform linux/amd64 \
  --build-arg VITE_PROTECTED_SITE_HOST=<ชื่อ VPS> --build-arg VITE_PROTECTED_SITE_IP=<IP ของ VPS> -t sentinel-api:local .
docker save sentinel-api:local | gzip -1 | ssh <user>@<vps> 'nice -n 19 docker load'
ssh <user>@<vps> 'cd <sentinel-dir>/deploy/vps && docker compose up -d'
```

bridge/sensor: copy `integrations/rod_mai_rod/{agent,vps_logs,vps_rules,vps_sensor,site_config}.py` ไปไว้ในโฟลเดอร์เดียวกัน วาง `site.json` แล้วติดตั้ง `sentinel-bridge.service` และ `sentinel-sensor.service` โดยแทน `__VPS_DIR__`

การ SSH เข้าไป deploy จะถูกบันทึกเป็น SSH_AUTH จาก IP ของ admin ล้างออกก่อนสาธิต

## rollback

1. `systemctl disable --now sentinel-bridge sentinel-sensor` และ `docker compose -p sentinel stop`
2. คืน Caddyfile จาก backup (เขียนทับในไฟล์เดิม) แล้ว `caddy reload` · ลบ site block ของ dashboard
3. คัด DB ออกจาก volume ถ้าต้องการเก็บ incident

rollback ไม่ต้องหยุด container ของเว็บอื่น

## ผลบนเครื่องใหม่ (4 พ.ย. 2569)

- ติดตั้งโดยเว็บของเจ้าของเครื่องตอบ 200 ทุกขั้น (เช็กก่อน/หลัง reload Caddy ทุกครั้ง)
- ทรัพยากร: container ~68 MB, bridge ~16 MB, CPU < 1%
- port scan จริงจากอินเทอร์เน็ต (Oracle Cloud, 63 พอร์ตใน ~3 นาที) → PORT_SCAN → r2 วิเคราะห์ (`ollama`) เสนอ TEMP_BLOCK_IP ความมั่นใจ 90% → รอ admin
- ทดสอบครบวงจร (ยิง → อนุมัติ → 403 → ปลด → 200) ด้วย `scripts/vps_live_test.py` ในการซ้อม 5 พ.ย.

ผลบนเครื่องเดิม (30 ต.ค.) ดู README หัวข้อทดสอบกับระบบจริง
