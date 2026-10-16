# Phase 4 · Integrate & Present

**เป้าหมาย:** เชื่อมระบบ ทดสอบเชิงตัวเลข และซ้อมเดโม
**Pipeline:** Backend / Security / Agent Integration

## B08 · Dataset, metrics และ incident report

- รอ: B07, M01
- ส่งมอบ: test results และ report API
- เกณฑ์ผ่าน: มี normal/attack labeled data, precision/recall/F1, latency, verification และ report จาก records จริง

**คำสั่ง AI CLI** — เลือก Codex หรือ Claude และรันในโฟลเดอร์โปรเจกต์:

```powershell
python bot/export_task.py B08 | codex exec -
```

หรือ

```powershell
python bot/export_task.py B08 | claude -p "Implement the task described in the piped input"
```

**หน้าที่ของคนสั่ง AI:** อ่าน diff, ทดสอบเกณฑ์ผ่าน, ใช้ `/submit` พร้อมหลักฐาน แล้ว `/selfcheck` ด้วยตนเอง

## B09 · ซ้อมเดโมข้ามเครื่องและแก้จุดล้มเหลว

- รอ: B08, F04
- ส่งมอบ: runbook เดโมและผลซ้อม
- เกณฑ์ผ่าน: สองเครื่องผ่าน private LAN; source IP ถูก; approve แล้ว blocked; reject ไม่ blocked; offline model fallback ระบุชัด

**คำสั่ง AI CLI** — เลือก Codex หรือ Claude และรันในโฟลเดอร์โปรเจกต์:

```powershell
python bot/export_task.py B09 | codex exec -
```

หรือ

```powershell
python bot/export_task.py B09 | claude -p "Implement the task described in the piped input"
```

**หน้าที่ของคนสั่ง AI:** อ่าน diff, ทดสอบเกณฑ์ผ่าน, ใช้ `/submit` พร้อมหลักฐาน แล้ว `/selfcheck` ด้วยตนเอง
