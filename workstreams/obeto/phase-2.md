# Phase 2 · Investigate & Plan

**เป้าหมาย:** AI อ่านหลักฐานและเสนอแผนที่ตรวจสอบได้
**Pipeline:** Backend / Security / Agent Integration

## B04 · เชื่อม Ollama และ structured analysis

- รอ: B02, M00
- ส่งมอบ: AI analysis JSON ที่ validate ได้
- เกณฑ์ผ่าน: Ollama วิเคราะห์จาก incident evidence; output ผ่าน schema; timeout/error มีสถานะชัด

**รายละเอียดสำหรับผู้ช่วย** — อ่าน prompt ของงานนี้:

[Prompt B04](../../prompts/tasks/B04.md)

**ส่งงาน:** ให้ AI ทำและรันทดสอบจริง เขียนรายงานพร้อมสรุปสำหรับส่ง Discord คนอ่านภาพรวมและลองตรวจตามรายงานได้เลย

## B05 · Agent tool calling และ execution trace

- รอ: B04
- ส่งมอบ: Agent เรียก read-only tools จริง
- เกณฑ์ผ่าน: มี get_incident_logs/get_ip_activity/get_firewall_status และ trace input/output; คำตอบอ้างหลักฐานจริง

**รายละเอียดสำหรับผู้ช่วย** — อ่าน prompt ของงานนี้:

[Prompt B05](../../prompts/tasks/B05.md)

**ส่งงาน:** ให้ AI ทำและรันทดสอบจริง เขียนรายงานพร้อมสรุปสำหรับส่ง Discord คนอ่านภาพรวมและลองตรวจตามรายงานได้เลย
