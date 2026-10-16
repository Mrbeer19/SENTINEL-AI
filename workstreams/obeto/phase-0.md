# Phase 0 · Contract & Setup

**เป้าหมาย:** ตกลงข้อมูลกลางและเปิดโครงโปรเจกต์
**Pipeline:** Backend / Security / Agent Integration

## B00 · กำหนด Event, Incident และ API contract

- รอ: ไม่ต้องรอ
- ส่งมอบ: docs/api-contract.md และตัวอย่าง JSON
- เกณฑ์ผ่าน: Schema ครอบคลุม security event, incident, proposal, approval, error และ WebSocket event; frontend ใช้ mock ตาม contract ได้

**คำสั่ง AI CLI** — เลือก Codex หรือ Claude และรันในโฟลเดอร์โปรเจกต์:

```powershell
python bot/export_task.py B00 | codex exec -
```

หรือ

```powershell
python bot/export_task.py B00 | claude -p "Implement the task described in the piped input"
```

**หน้าที่ของคนสั่ง AI:** อ่าน diff, ทดสอบเกณฑ์ผ่าน, ใช้ `/submit` พร้อมหลักฐาน แล้ว `/selfcheck` ด้วยตนเอง
