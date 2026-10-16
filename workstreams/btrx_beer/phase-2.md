# Phase 2 · Investigate & Plan

**เป้าหมาย:** AI อ่านหลักฐานและเสนอแผนที่ตรวจสอบได้
**Pipeline:** Frontend / UI / Model Training

## F02 · Agent Workflow และ evidence viewer

- รอ: F01, B00
- ส่งมอบ: หน้า Agent แสดง node และ tool trace
- เกณฑ์ผ่าน: สถานะ pending/running/waiting/completed/failed และหลักฐาน/คำแนะนำอ่านได้; รองรับ error

**คำสั่ง AI CLI** — เลือก Codex หรือ Claude และรันในโฟลเดอร์โปรเจกต์:

```powershell
python bot/export_task.py F02 | codex exec -
```

หรือ

```powershell
python bot/export_task.py F02 | claude -p "Implement the task described in the piped input"
```

**หน้าที่ของคนสั่ง AI:** อ่าน diff, ทดสอบเกณฑ์ผ่าน, ใช้ `/submit` พร้อมหลักฐาน แล้ว `/selfcheck` ด้วยตนเอง

## M01 · Beer ปรับ prompt และทดลอง fine-tune ถ้าทรัพยากรพอ

- รอ: M00, B02
- ส่งมอบ: docs/model-evaluation.md, dataset แยก train/test และ model artifact ถ้า fine-tune สำเร็จ
- เกณฑ์ผ่าน: เปรียบเทียบ baseline กับ prompt-tuned และ fine-tuned (ถ้าทำได้) บน held-out cases; รายงาน accuracy, JSON validity, tool selection, latency/VRAM; ไม่อ้างผลถ้าไม่ได้รัน

**คำสั่ง AI CLI** — เลือก Codex หรือ Claude และรันในโฟลเดอร์โปรเจกต์:

```powershell
python bot/export_task.py M01 | codex exec -
```

หรือ

```powershell
python bot/export_task.py M01 | claude -p "Implement the task described in the piped input"
```

**หน้าที่ของคนสั่ง AI:** อ่าน diff, ทดสอบเกณฑ์ผ่าน, ใช้ `/submit` พร้อมหลักฐาน แล้ว `/selfcheck` ด้วยตนเอง
