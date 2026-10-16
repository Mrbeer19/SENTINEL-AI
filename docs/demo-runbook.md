# Runbook เดโม

## เปิดและตรวจระบบ

ทำตาม README เปิด backend และ frontend แล้วดู `/api/health` ต้องระบุ model `qwen3.5:4b`, `model_ready=true` ข้อมูล backend อยู่ `backend/data/sentinel.db` ปิด server ก่อนสำรอง/เปลี่ยนชื่อ database เพื่อเริ่มรอบข้อมูลใหม่

ถ้าต้องการใช้ frontend build ผ่าน backend เดียว:

```powershell
cd frontend
npm ci
npm run build
cd ..
.\backend\.venv\Scripts\python.exe -m uvicorn backend.app:app --host 127.0.0.1 --port 8000
```

เปิด `http://127.0.0.1:8000` หลังมี `frontend/dist` backend จะเสิร์ฟ dashboard ให้โดยตรง

## เดโม local 5–7 นาที

1. Dashboard: อธิบาย rule-based detection และ local Qwen
2. Firewall: ส่ง request ของ `192.0.2.25` ให้เห็น allowed ก่อน
3. Simulator: HTTP auth brute force สร้าง 6 events
4. AI Agent: ตรวจ kind/source แล้ว Run investigation รอโมเดลจบ เปิด tool trace ดู records จริง
5. อ่าน summary/evidence/recommendation ตรวจ analysis mode ให้ถูกต้อง
6. Approve: กฎชั่วคราว 10 นาที active แต่ยังไม่อ้าง verification ผ่าน
7. Firewall: ส่ง request ใหม่ IP เดิม เห็น denied; กลับเปิด incident เพื่อดู verified และ timeline
8. Reports: เปิด JSON แล้วแสดง event→analysis→approval→verification
9. ถ้ามีเวลา ทดลอง normal และ Reject ด้วย IP ใหม่เพื่อแสดง false alarm/approval controls

## ซ้อมสองเครื่องใน private LAN

เจ้าของระบบใช้เครือข่าย private ที่ทั้งสองคนมีสิทธิ์ทดสอบ เปิด backend เฉพาะช่วงซ้อมด้วย `--host 0.0.0.0 --port 8000` และอนุญาต inbound Python เฉพาะ private network ใน Windows Firewall ไม่เปิด router port forwarding

Operator ใช้ dashboard จากเครื่อง server ที่ `127.0.0.1` ส่วนเพื่อนใช้เฉพาะ demo client ผ่าน IP LAN ของ server ตัวอย่าง:

```powershell
python scripts/lab_client.py --server http://192.168.1.10:8000 --action traffic
python scripts/lab_client.py --server http://192.168.1.10:8000 --action login
```

คำสั่ง login ส่งรหัสผิด 6 ครั้งไปที่ `/api/demo/login` ของแอปนี้ จากนั้น operator วิเคราะห์และอนุมัติ IP ที่เห็นจริง ให้เพื่อนรัน traffic อีกครั้ง ต้องได้ 403 โดยไม่ได้ส่ง source override

นี่คือ HTTP authentication demo ส่วน SSH scenario ใน UI เป็น synthetic log replay ถ้าต้องการอ้าง live SSH ต้องเพิ่ม collector จาก SSH server ที่ควบคุมและพิสูจน์ log จริงแยกต่างหาก

## เมื่อเกิดปัญหา

| อาการ | ตรวจ |
|---|---|
| UI ขึ้นเชื่อม backend ไม่ได้ | backend port 8000, Vite proxy และ error ใน terminal |
| Qwen ไม่พร้อม | `ollama list`, `ollama pull qwen3.5:4b`, `OLLAMA_URL` และ model tag |
| Analyze ได้ fallback | ดู analysis_mode, server/Ollama logs; fallback ไม่ใช่ผลโมเดล |
| ครั้งแรกช้า | cold model load; warm up ก่อนเริ่มสอบ และบันทึก latency จริง |
| ไม่มี incident ใหม่ | source/kind เดิมยังเปิดอยู่; ใช้ IP ทดสอบใหม่หรือฐานข้อมูลรอบใหม่ |
| Approve 400 | IP เป็น loopback/protected ให้เลือก IP lab ของเพื่อน |
| เปิดใหม่ยังเห็นกฎ | SQLite เก็บข้อมูล; กฎอาจยังไม่หมดอายุ |
| HTTP 403 หลัง approve | เป็นผลที่คาดหวัง ให้ตรวจ traffic/timeline ว่าบันทึก verification |
| remote management 403 | ใช้ localhost operator หรือกำหนด key และส่ง `X-Admin-Key` |
| WebSocket reconnect | frontend refetch state; ตรวจ endpoint `/ws` และ backend |

## ก่อนสอบ

ซ้อมตั้งแต่เปิดระบบใหม่อย่างน้อยหนึ่งรอบ ใช้ IP ใหม่ ตรวจ approve/reject, Ollama offline, persistence และ network ของห้องจริง สำรอง database และผลทดสอบ เก็บวิดีโอรอบที่สำเร็จพร้อมระบุว่าเป็น recorded demo หากต้องใช้แทน live
