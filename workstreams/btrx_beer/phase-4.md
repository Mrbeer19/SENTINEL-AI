# Phase 4 · Integrate & Present

**เป้าหมาย:** เชื่อมระบบ ทดสอบเชิงตัวเลข และซ้อมเดโม
**Pipeline:** Frontend / UI / Model Training

## F04 · Real API/WebSocket integration และ Reports

- รอ: F03, B07, B08
- ส่งมอบ: UI แสดง backend จริงครบ flow
- เกณฑ์ผ่าน: ไม่มี fake state ใน demo หลัก; refresh/reconnect ยังถูกต้อง; report และ timeline มาจาก records

**คำสั่ง AI CLI** — เลือก Codex หรือ Claude และรันในโฟลเดอร์โปรเจกต์:

```powershell
python bot/export_task.py F04 | codex exec -
```

หรือ

```powershell
python bot/export_task.py F04 | claude -p "Implement the task described in the piped input"
```

**หน้าที่ของคนสั่ง AI:** อ่าน diff, ทดสอบเกณฑ์ผ่าน, ใช้ `/submit` พร้อมหลักฐาน แล้ว `/selfcheck` ด้วยตนเอง

## F05 · UI polish และสไลด์หลักฐานการทำงาน

- รอ: F04
- ส่งมอบ: หน้า UI พร้อมสอบและภาพประกอบ
- เกณฑ์ผ่าน: จอ projector อ่านได้, responsive, status ชัด, screenshot แสดงจริงไม่ใช่ mock

**คำสั่ง AI CLI** — เลือก Codex หรือ Claude และรันในโฟลเดอร์โปรเจกต์:

```powershell
python bot/export_task.py F05 | codex exec -
```

หรือ

```powershell
python bot/export_task.py F05 | claude -p "Implement the task described in the piped input"
```

**หน้าที่ของคนสั่ง AI:** อ่าน diff, ทดสอบเกณฑ์ผ่าน, ใช้ `/submit` พร้อมหลักฐาน แล้ว `/selfcheck` ด้วยตนเอง
