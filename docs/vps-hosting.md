# SENTINEL บน VPS

ขอบเขต: ป้องกันเว็บ rod-mai-rod เว็บเดียว และห้ามกระทบเว็บอื่นบน VPS เดียวกัน

## ส่วนประกอบ

| ส่วน | อยู่ที่ | หมายเหตุ |
| --- | --- | --- |
| backend + dashboard | container `sentinel-api-1` (Compose project `sentinel`) | ฟัง `127.0.0.1:8001` บน VPS เท่านั้น จำกัด RAM 384 MB, CPU 0.5, filesystem read-only |
| ฐานข้อมูล | volume `sentinel_sentinel-data` → `/data/sentinel.db` | |
| bridge | systemd `sentinel-bridge.service` บน VPS | รัน `agent.py --local` เรียก `vps_*.py` ตรง ๆ ไม่ต้อง SSH จำกัด RAM 96 MB, CPU 20% |
| key ของ bridge | `/etc/sentinel-bridge.env` (สิทธิ์ 600) | ค่าเดียวกับ `SENTINEL_ADMIN_KEY` ใน `deploy/vps/.env` |
| ตั้งค่า backend | `<sentinel-dir>/deploy/vps/.env` (สิทธิ์ 600, ไม่อยู่ใน Git) | ตัวอย่าง `deploy/vps/.env.example` |
| โมเดล r3 | Ollama บนเครื่อง Windows RTX 4060 | VPS เรียกผ่าน reverse SSH tunnel `scripts/ollama-tunnel.ps1` ถ้าเครื่องปิดหรือไม่มี tunnel จะใช้ rule fallback |

ไม่เปิดพอร์ตใหม่สู่อินเทอร์เน็ต และไม่แก้ firewall ของเครื่อง dashboard ออกทางพอร์ต 443 ของ Caddy เดิมผ่าน site block ของตัวเอง การบล็อกยังทำที่ Caddy ใน site block ของ rod-mai-rod เหมือนเดิม

## เปิด dashboard

ผ่านลิงก์ HTTPS แล้ว login ด้วยบัญชี admin ไม่ต้องใช้ SSH:

- backend ฟังที่ gateway ของเครือข่าย Docker ที่ Caddy ใช้ (`UVICORN_HOST`) ไม่ใช่ IP สาธารณะ
- `UVICORN_PROXY_HEADERS=true` และ `FORWARDED_ALLOW_IPS=<IP ของ container Caddy>` ให้ระบบเห็น IP จริงของผู้ใช้ (จำกัด login ผิด 10 ครั้ง / 5 นาที ต่อ IP)
- `SENTINEL_ALLOWED_HOSTS` ต้องมีทั้งชื่อเว็บ และ gateway IP ที่ bridge ใช้เรียก
- `SENTINEL_COOKIE_SECURE=1`
- bridge ใช้ `SENTINEL_API_URL=http://<gateway>:8001` ใน `/etc/sentinel-bridge.env`
- Caddy: เพิ่ม site block ใหม่ที่ `reverse_proxy <gateway>:8001` ในทั้ง Caddyfile ของเครื่องและ active config ให้เหมือนกันทุกตัวอักษร (ไม่อย่างนั้นสคริปต์กฎของ rod-mai-rod จะไม่ยอม reload) validate ก่อน แล้ว reload แบบ graceful ไม่ต้องแก้ block ของเว็บอื่น

ถ้าไม่เปิดลิงก์สาธารณะ ใช้ SSH tunnel แทน:

```powershell
ssh -N -L 8001:<gateway หรือ 127.0.0.1>:8001 -i $HOME\.ssh\sentinel_rod_mai_rod <user>@<vps>
```

## ต่อโมเดล r3

บนเครื่อง Windows ที่เปิด Ollama ไว้:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\ollama-tunnel.ps1 -VpsHost <vps> -VpsUser <user>
```

ฝั่ง VPS จะ bind แค่ `127.0.0.1:11434` (sshd `GatewayPorts no`) Ollama จึงไม่ถูกเปิดออกอินเทอร์เน็ต ตรวจได้จาก `/api/health` ว่า `ai_mode` เป็น `ollama`

## build และ deploy

build บนเครื่อง Windows เพื่อไม่ให้กิน CPU ของ VPS ที่เว็บอื่นใช้ร่วม:

```sh
docker build -f deploy/vps/Dockerfile --platform linux/amd64 --build-arg VITE_PROTECTED_SITE_HOST=<site> -t sentinel-api:local .
docker save sentinel-api:local | gzip -1 | ssh <user>@<vps> 'nice -n 19 docker load'
ssh <user>@<vps> 'cd <sentinel-dir>/deploy/vps && docker compose up -d --no-build'
```

bridge: copy `integrations/rod_mai_rod/agent.py` ไปไว้ในโฟลเดอร์เดียวกับ `vps_*.py` แล้วติดตั้ง `sentinel-bridge.service` โดยแทน `__VPS_DIR__` ด้วยโฟลเดอร์นั้น

## rollback กลับไปรันบน Windows

1. บน VPS: `systemctl disable --now sentinel-bridge` และ `docker compose -p sentinel stop`
2. คัด DB ออกจาก volume ถ้าต้องการเก็บ incident ที่เกิดบน VPS
3. ลบ site block ของ dashboard ออกจาก Caddyfile ทั้งสองไฟล์ แล้ว reload
4. บน Windows: เปลี่ยนชื่อ `SENTINEL rod-mai-rod bridge.lnk.disabled-moved-to-vps` ใน Startup กลับเป็น `.lnk` แล้วเปิด backend 8001 ตามเดิม

rollback ไม่ต้องหยุด container ของเว็บอื่น

## ผลตรวจ 30 ต.ค. 2026

- SSH ทดสอบ (key ที่ไม่ได้รับอนุญาต 6 อัน) → incident SSH_BRUTE_FORCE → r3 เสนอ TEMP_BLOCK_IP → approve → rod-mai-rod 403, เว็บอื่นบน Caddy เดียวกัน 200 → verified → unblock → rod-mai-rod 200
- หลังย้ายขึ้น VPS: login ผิด 6 ครั้ง → incident HTTP_AUTH_BRUTE_FORCE → approve → rod-mai-rod 403, เว็บอื่น 200 → verified → unblock → 200
- ใช้ทรัพยากร: container ~69 MB, bridge ~15 MB
- ข้อสังเกต: ตอน bridge รันบน Windows จะ SSH เข้า VPS ทุก 5 วินาที ทำให้ IP ของเครื่อง SOC มี login สำเร็จหลักพันครั้งในข้อมูล sensor และโมเดลจัด SSH test เป็น SUSPICIOUS_LOGIN การย้าย bridge มารันบน VPS ทำให้ไม่มี login ชุดนี้อีก
