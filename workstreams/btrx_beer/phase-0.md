# Phase 0 · Contract & Setup

**เป้าหมาย:** ตกลงข้อมูลกลางและเปิดโครงโปรเจกต์
**Pipeline:** Frontend / UI / Model Training

## F00 · สร้าง React shell และ navigation

- รอ: ไม่ต้องรอ
- ส่งมอบ: frontend เปิดได้และสลับหน้าได้
- เกณฑ์ผ่าน: มี Dashboard, Incidents, Agent, Firewall, Simulator, Reports เป็นหน้าว่าง/placeholder ที่ชัด; responsive; ไม่สมมติ API schema ก่อน B00

**คำสั่ง AI CLI** — เลือก Codex หรือ Claude และรันในโฟลเดอร์โปรเจกต์:

```powershell
python bot/export_task.py F00 | codex exec -
```

หรือ

```powershell
python bot/export_task.py F00 | claude -p "Implement the task described in the piped input"
```

**หน้าที่ของคนสั่ง AI:** อ่าน diff, ทดสอบเกณฑ์ผ่าน, ใช้ `/submit` พร้อมหลักฐาน แล้ว `/selfcheck` ด้วยตนเอง

## M00 · Beer สำรวจ Local Model และสร้าง baseline

- รอ: ไม่ต้องรอ
- ส่งมอบ: docs/model-baseline.md และ model config ที่เลือก
- เกณฑ์ผ่าน: รัน Ollama บนเครื่องได้จริง; วัด latency/RAM/VRAM; ทดสอบ structured output และ tool calling; ระบุ tag โมเดลที่ใช้

**คำสั่ง AI CLI** — เลือก Codex หรือ Claude และรันในโฟลเดอร์โปรเจกต์:

```powershell
python bot/export_task.py M00 | codex exec -
```

หรือ

```powershell
python bot/export_task.py M00 | claude -p "Implement the task described in the piped input"
```

**หน้าที่ของคนสั่ง AI:** อ่าน diff, ทดสอบเกณฑ์ผ่าน, ใช้ `/submit` พร้อมหลักฐาน แล้ว `/selfcheck` ด้วยตนเอง
