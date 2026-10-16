# Phase 3 · Approve & Defend

**เป้าหมาย:** คนอนุมัติ แล้วตัวจำลองป้องกันและพิสูจน์ผล
**Pipeline:** Backend / Security / Agent Integration

## B06 · Policy, approval และ firewall simulator

- รอ: B02, B05
- ส่งมอบ: Approve/Reject และ blocklist
- เกณฑ์ผ่าน: Reject ไม่สร้าง rule; protected IP บล็อกไม่ได้; approve ซ้ำไม่สร้างซ้ำ; rule หมดอายุได้; audit ครบ

**คำสั่ง AI CLI** — เลือก Codex หรือ Claude และรันในโฟลเดอร์โปรเจกต์:

```powershell
python bot/export_task.py B06 | codex exec -
```

หรือ

```powershell
python bot/export_task.py B06 | claude -p "Implement the task described in the piped input"
```

**หน้าที่ของคนสั่ง AI:** อ่าน diff, ทดสอบเกณฑ์ผ่าน, ใช้ `/submit` พร้อมหลักฐาน แล้ว `/selfcheck` ด้วยตนเอง

## B07 · Verification และ realtime events

- รอ: B03, B06
- ส่งมอบ: blocked client ได้ 403 และ WebSocket แจ้งขั้นตอน
- เกณฑ์ผ่าน: ก่อน approve ping ผ่าน หลัง approve request ใหม่จาก IP เดิมได้ 403; verification บันทึกผลจริง; reconnect อ่าน state ได้

**คำสั่ง AI CLI** — เลือก Codex หรือ Claude และรันในโฟลเดอร์โปรเจกต์:

```powershell
python bot/export_task.py B07 | codex exec -
```

หรือ

```powershell
python bot/export_task.py B07 | claude -p "Implement the task described in the piped input"
```

**หน้าที่ของคนสั่ง AI:** อ่าน diff, ทดสอบเกณฑ์ผ่าน, ใช้ `/submit` พร้อมหลักฐาน แล้ว `/selfcheck` ด้วยตนเอง
