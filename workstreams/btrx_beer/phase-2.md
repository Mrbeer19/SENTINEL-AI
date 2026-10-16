# Phase 2 · Investigate & Plan

**เป้าหมาย:** AI อ่านหลักฐานและเสนอแผนที่ตรวจสอบได้
**Pipeline:** Frontend / UI / Model Training

## F02 · Agent Workflow และ evidence viewer

- รอ: F01, B00
- ส่งมอบ: หน้า Agent แสดง node และ tool trace
- เกณฑ์ผ่าน: สถานะ pending/running/waiting/completed/failed และหลักฐาน/คำแนะนำอ่านได้; รองรับ error

**รายละเอียดสำหรับผู้ช่วย** — อ่าน prompt ของงานนี้:

[Prompt F02](../../prompts/tasks/F02.md)

**ส่งงาน:** ให้ AI ทำและรันทดสอบจริง เขียนรายงานพร้อมสรุปสำหรับส่ง Discord คนอ่านภาพรวมและลองตรวจตามรายงานได้เลย

## M01 · Beer ปรับ prompt และทดลอง fine-tune ถ้าทรัพยากรพอ

- รอ: M00, B02
- ส่งมอบ: docs/model-evaluation.md, dataset แยก train/test และ model artifact ถ้า fine-tune สำเร็จ
- เกณฑ์ผ่าน: เปรียบเทียบ baseline กับ prompt-tuned และ fine-tuned (ถ้าทำได้) บน held-out cases; รายงาน accuracy, JSON validity, tool selection, latency/VRAM; ไม่อ้างผลถ้าไม่ได้รัน

**รายละเอียดสำหรับผู้ช่วย** — อ่าน prompt ของงานนี้:

[Prompt M01](../../prompts/tasks/M01.md)

**ส่งงาน:** ให้ AI ทำและรันทดสอบจริง เขียนรายงานพร้อมสรุปสำหรับส่ง Discord คนอ่านภาพรวมและลองตรวจตามรายงานได้เลย
