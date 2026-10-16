# Phase 0 · Contract & Setup

**เป้าหมาย:** ตกลงข้อมูลกลางและเปิดโครงโปรเจกต์
**Pipeline:** Frontend / UI / Model Training

## F00 · สร้าง React shell และ navigation

- รอ: ไม่ต้องรอ
- ส่งมอบ: frontend เปิดได้และสลับหน้าได้
- เกณฑ์ผ่าน: มี Dashboard, Incidents, Agent, Firewall, Simulator, Reports เป็นหน้าว่าง/placeholder ที่ชัด; responsive; ไม่สมมติ API schema ก่อน B00

**รายละเอียดสำหรับผู้ช่วย** — อ่าน prompt ของงานนี้:

[Prompt F00](../../prompts/tasks/F00.md)

**ส่งงาน:** ให้ AI ทำและรันทดสอบจริง เขียนรายงานพร้อมสรุปสำหรับส่ง Discord คนอ่านภาพรวมและลองตรวจตามรายงานได้เลย

## M00 · Beer สำรวจ Local Model และสร้าง baseline

- รอ: ไม่ต้องรอ
- ส่งมอบ: docs/model-baseline.md และ model config ที่เลือก
- เกณฑ์ผ่าน: รัน Ollama บนเครื่องได้จริง; วัด latency/RAM/VRAM; ทดสอบ structured output และ tool calling; ระบุ tag โมเดลที่ใช้

**รายละเอียดสำหรับผู้ช่วย** — อ่าน prompt ของงานนี้:

[Prompt M00](../../prompts/tasks/M00.md)

**ส่งงาน:** ให้ AI ทำและรันทดสอบจริง เขียนรายงานพร้อมสรุปสำหรับส่ง Discord คนอ่านภาพรวมและลองตรวจตามรายงานได้เลย
