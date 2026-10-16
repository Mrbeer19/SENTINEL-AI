# Phase 1 · Observe & Detect

**เป้าหมาย:** รับ event จริง สร้าง incident และแสดงบน UI
**Pipeline:** Frontend / UI / Model Training

## F01 · Dashboard และ Incident UI

- รอ: F00, B00
- ส่งมอบ: Dashboard และ incident detail จาก mock data
- เกณฑ์ผ่าน: สถิติ กราฟ ตาราง incident, severity, evidence และสถานะตรง contract; ไม่มีข้อมูลสุ่มปลอมเป็น backend

**คำสั่ง AI CLI** — เลือก Codex หรือ Claude และรันในโฟลเดอร์โปรเจกต์:

```powershell
python bot/export_task.py F01 | codex exec -
```

หรือ

```powershell
python bot/export_task.py F01 | claude -p "Implement the task described in the piped input"
```

**หน้าที่ของคนสั่ง AI:** อ่าน diff, ทดสอบเกณฑ์ผ่าน, ใช้ `/submit` พร้อมหลักฐาน แล้ว `/selfcheck` ด้วยตนเอง
