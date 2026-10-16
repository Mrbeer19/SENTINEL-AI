# Phase 1 · Observe & Detect

**เป้าหมาย:** รับ event จริง สร้าง incident และแสดงบน UI
**Pipeline:** Backend / Security / Agent Integration

## B01 · FastAPI, SQLite และ event ingestion

- รอ: B00
- ส่งมอบ: POST /api/events และ GET /api/events
- เกณฑ์ผ่าน: รับ JSON ที่ valid, บันทึก SQLite, อ่านย้อนหลังได้, invalid input ได้ 422, restart แล้วยังมีข้อมูล

**คำสั่ง AI CLI** — เลือก Codex หรือ Claude และรันในโฟลเดอร์โปรเจกต์:

```powershell
python bot/export_task.py B01 | codex exec -
```

หรือ

```powershell
python bot/export_task.py B01 | claude -p "Implement the task described in the piped input"
```

**หน้าที่ของคนสั่ง AI:** อ่าน diff, ทดสอบเกณฑ์ผ่าน, ใช้ `/submit` พร้อมหลักฐาน แล้ว `/selfcheck` ด้วยตนเอง

## B02 · Rule-based detection และ incident lifecycle

- รอ: B01
- ส่งมอบ: ตรวจ auth brute force, SSH brute force และ port scan จาก event ที่ตรงประเภทได้
- เกณฑ์ผ่าน: สร้าง incident จาก threshold ที่กำหนด, normal traffic ไม่เตือน, event ซ้ำไม่สร้าง incident ซ้ำ; HTTP และ SSH ไม่สับสนกัน

**คำสั่ง AI CLI** — เลือก Codex หรือ Claude และรันในโฟลเดอร์โปรเจกต์:

```powershell
python bot/export_task.py B02 | codex exec -
```

หรือ

```powershell
python bot/export_task.py B02 | claude -p "Implement the task described in the piped input"
```

**หน้าที่ของคนสั่ง AI:** อ่าน diff, ทดสอบเกณฑ์ผ่าน, ใช้ `/submit` พร้อมหลักฐาน แล้ว `/selfcheck` ด้วยตนเอง

## B03 · บริการเดโมข้ามสองเครื่อง

- รอ: B01, B02
- ส่งมอบ: demo login/ping พร้อมบันทึก source IP
- เกณฑ์ผ่าน: เครื่องอื่นใน private LAN เรียกได้; source IP มาจาก connection; login ผิดเข้า event pipeline; จำกัดจำนวนครั้งและไม่ใช้บัญชีจริง

**คำสั่ง AI CLI** — เลือก Codex หรือ Claude และรันในโฟลเดอร์โปรเจกต์:

```powershell
python bot/export_task.py B03 | codex exec -
```

หรือ

```powershell
python bot/export_task.py B03 | claude -p "Implement the task described in the piped input"
```

**หน้าที่ของคนสั่ง AI:** อ่าน diff, ทดสอบเกณฑ์ผ่าน, ใช้ `/submit` พร้อมหลักฐาน แล้ว `/selfcheck` ด้วยตนเอง
