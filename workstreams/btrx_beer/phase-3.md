# Phase 3 · Approve & Defend

**เป้าหมาย:** คนอนุมัติ แล้วตัวจำลองป้องกันและพิสูจน์ผล
**Pipeline:** Frontend / UI / Model Training

## F03 · Approval, Firewall และ Simulator UI

- รอ: F02, B00
- ส่งมอบ: ผู้ใช้อนุมัติ/ปฏิเสธและเห็น before/after
- เกณฑ์ผ่าน: แสดง policy, target, duration; ไม่กดซ้ำ; reject ไม่มี rule; before/after อ้างข้อมูล verification

**คำสั่ง AI CLI** — เลือก Codex หรือ Claude และรันในโฟลเดอร์โปรเจกต์:

```powershell
python bot/export_task.py F03 | codex exec -
```

หรือ

```powershell
python bot/export_task.py F03 | claude -p "Implement the task described in the piped input"
```

**หน้าที่ของคนสั่ง AI:** อ่าน diff, ทดสอบเกณฑ์ผ่าน, ใช้ `/submit` พร้อมหลักฐาน แล้ว `/selfcheck` ด้วยตนเอง
