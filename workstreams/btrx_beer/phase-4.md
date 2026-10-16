# Phase 4 · Integrate & Present

**เป้าหมาย:** เชื่อมระบบ ทดสอบเชิงตัวเลข และซ้อมเดโม
**Pipeline:** Frontend / UI / Model Training

## F04 · Real API/WebSocket integration และ Reports

- รอ: F03, B07, B08
- ส่งมอบ: UI แสดง backend จริงครบ flow
- เกณฑ์ผ่าน: ไม่มี fake state ใน demo หลัก; refresh/reconnect ยังถูกต้อง; report และ timeline มาจาก records

**รายละเอียดสำหรับผู้ช่วย** — อ่าน prompt ของงานนี้:

[Prompt F04](../../prompts/tasks/F04.md)

**ส่งงาน:** ให้ AI ทำและรันทดสอบจริง เขียนรายงานพร้อมสรุปสำหรับส่ง Discord คนอ่านภาพรวมและลองตรวจตามรายงานได้เลย

## F05 · UI polish และสไลด์หลักฐานการทำงาน

- รอ: F04
- ส่งมอบ: หน้า UI พร้อมสอบและภาพประกอบ
- เกณฑ์ผ่าน: จอ projector อ่านได้, responsive, status ชัด, screenshot แสดงจริงไม่ใช่ mock

**รายละเอียดสำหรับผู้ช่วย** — อ่าน prompt ของงานนี้:

[Prompt F05](../../prompts/tasks/F05.md)

**ส่งงาน:** ให้ AI ทำและรันทดสอบจริง เขียนรายงานพร้อมสรุปสำหรับส่ง Discord คนอ่านภาพรวมและลองตรวจตามรายงานได้เลย

## F06 · Deploy เว็บจริงและทดสอบผ่าน HTTPS

- รอ: F04
- ส่งมอบ: docs/deployment.md, production config, URL ที่เปิดใช้จริง และผล smoke test
- เกณฑ์ผ่าน: มี URL HTTPS; API/WSS จริงผ่าน; login จำกัดสิทธิ์; Docker/volume/Ollama ผ่าน; ไม่มี secret ในเว็บ; มี rollback และผลเทสจาก URLจริง

**รายละเอียดสำหรับผู้ช่วย** — อ่าน prompt ของงานนี้:

[Prompt F06](../../prompts/tasks/F06.md)

**ส่งงาน:** ให้ AI ทำและรันทดสอบจริง เขียนรายงานพร้อมสรุปสำหรับส่ง Discord คนอ่านภาพรวมและลองตรวจตามรายงานได้เลย
