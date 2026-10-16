# Phase 2 · Investigate & Plan

**เป้าหมาย:** AI อ่านหลักฐานและเสนอแผนที่ตรวจสอบได้
**Pipeline:** Backend / Security / Agent Integration

## B04 · เชื่อม Ollama และ structured analysis

- รอ: B02, M00
- ส่งมอบ: AI analysis JSON ที่ validate ได้
- เกณฑ์ผ่าน: Ollama วิเคราะห์จาก incident evidence; output ผ่าน schema; timeout/error มีสถานะชัด

**คำสั่ง AI CLI** — เลือก Codex หรือ Claude และรันในโฟลเดอร์โปรเจกต์:

```powershell
python bot/export_task.py B04 | codex exec -
```

หรือ

```powershell
python bot/export_task.py B04 | claude -p "Implement the task described in the piped input"
```

**หน้าที่ของคนสั่ง AI:** อ่าน diff, ทดสอบเกณฑ์ผ่าน, ใช้ `/submit` พร้อมหลักฐาน แล้ว `/selfcheck` ด้วยตนเอง

## B05 · Agent tool calling และ execution trace

- รอ: B04
- ส่งมอบ: Agent เรียก read-only tools จริง
- เกณฑ์ผ่าน: มี get_incident_logs/get_ip_activity/get_firewall_status และ trace input/output; คำตอบอ้างหลักฐานจริง

**คำสั่ง AI CLI** — เลือก Codex หรือ Claude และรันในโฟลเดอร์โปรเจกต์:

```powershell
python bot/export_task.py B05 | codex exec -
```

หรือ

```powershell
python bot/export_task.py B05 | claude -p "Implement the task described in the piped input"
```

**หน้าที่ของคนสั่ง AI:** อ่าน diff, ทดสอบเกณฑ์ผ่าน, ใช้ `/submit` พร้อมหลักฐาน แล้ว `/selfcheck` ด้วยตนเอง
