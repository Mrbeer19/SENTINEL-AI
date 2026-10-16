# Phase 3 · Approve & Defend

**เป้าหมาย:** คนอนุมัติ แล้วตัวจำลองป้องกันและพิสูจน์ผล
**Pipeline:** Backend / Security / Agent Integration

## B06 · Policy, approval และ firewall simulator

- รอ: B02, B05
- ส่งมอบ: Approve/Reject และ blocklist
- เกณฑ์ผ่าน: Reject ไม่สร้าง rule; protected IP บล็อกไม่ได้; approve ซ้ำไม่สร้างซ้ำ; rule หมดอายุได้; audit ครบ

**รายละเอียดสำหรับผู้ช่วย** — อ่าน prompt ของงานนี้:

[Prompt B06](../../prompts/tasks/B06.md)

**ส่งงาน:** ให้ AI ทำและรันทดสอบจริง เขียนรายงานพร้อมสรุปสำหรับส่ง Discord คนอ่านภาพรวมและลองตรวจตามรายงานได้เลย

## B07 · Verification และ realtime events

- รอ: B03, B06
- ส่งมอบ: blocked client ได้ 403 และ WebSocket แจ้งขั้นตอน
- เกณฑ์ผ่าน: ก่อน approve ping ผ่าน หลัง approve request ใหม่จาก IP เดิมได้ 403; verification บันทึกผลจริง; reconnect อ่าน state ได้

**รายละเอียดสำหรับผู้ช่วย** — อ่าน prompt ของงานนี้:

[Prompt B07](../../prompts/tasks/B07.md)

**ส่งงาน:** ให้ AI ทำและรันทดสอบจริง เขียนรายงานพร้อมสรุปสำหรับส่ง Discord คนอ่านภาพรวมและลองตรวจตามรายงานได้เลย
