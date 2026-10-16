# obeto — Backend / Security / Agent Integration pipeline

ไฟล์ในโฟลเดอร์นี้สร้างจาก `bot/config/tasks.json` เพื่อให้อ่านงานแยกตามคนและ phase ได้ง่าย
ถ้าแก้แผนงานหลัก ให้รัน `python bot/generate_workstreams.py` เพื่อสร้างไฟล์ใหม่

## ลำดับ phase

- [Phase 0 · Contract & Setup](phase-0.md): B00
- [Phase 1 · Observe & Detect](phase-1.md): B01, B02, B03
- [Phase 2 · Investigate & Plan](phase-2.md): B04, B05
- [Phase 3 · Approve & Defend](phase-3.md): B06, B07
- [Phase 4 · Integrate & Present](phase-4.md): B08, B09

## รับงานแทนเพื่อน

เมื่ออีกคนไม่ว่าง ส่ง prompt ของเฟสนั้นให้ผู้ช่วยของคนที่ว่างทำแทนได้ ระบุในรายงานว่าใครทำและส่วนใดต้องรอเพื่อน
เจ้าของงานอ่านรายงานและตรวจผลเชื่อมระบบก่อนใช้ต่อ ส่งรายงานใน Discord เป็นข้อความปกติได้เลย
