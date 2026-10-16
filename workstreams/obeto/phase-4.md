# Phase 4 · Integrate & Present

**เป้าหมาย:** เชื่อมระบบ ทดสอบเชิงตัวเลข และซ้อมเดโม
**Pipeline:** Backend / Security / Agent Integration

## B08 · Dataset, metrics และ incident report

- รอ: B07, M01
- ส่งมอบ: test results และ report API
- เกณฑ์ผ่าน: มี normal/attack labeled data, precision/recall/F1, latency, verification และ report จาก records จริง

**รายละเอียดสำหรับผู้ช่วย** — อ่าน prompt ของงานนี้:

[Prompt B08](../../prompts/tasks/B08.md)

**ส่งงาน:** ให้ AI ทำและรันทดสอบจริง เขียนรายงานพร้อมสรุปสำหรับส่ง Discord คนอ่านภาพรวมและลองตรวจตามรายงานได้เลย

## B09 · ซ้อมเดโมข้ามเครื่องและแก้จุดล้มเหลว

- รอ: B08, F04
- ส่งมอบ: runbook เดโมและผลซ้อม
- เกณฑ์ผ่าน: สองเครื่องผ่าน private LAN; source IP ถูก; approve แล้ว blocked; reject ไม่ blocked; offline model fallback ระบุชัด

**รายละเอียดสำหรับผู้ช่วย** — อ่าน prompt ของงานนี้:

[Prompt B09](../../prompts/tasks/B09.md)

**ส่งงาน:** ให้ AI ทำและรันทดสอบจริง เขียนรายงานพร้อมสรุปสำหรับส่ง Discord คนอ่านภาพรวมและลองตรวจตามรายงานได้เลย
