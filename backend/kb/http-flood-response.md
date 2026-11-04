---
id: http-flood-response
title: ควรรับมือ HTTP flood อย่างไร
kind: HTTP_FLOOD
rules: sentinel-http-flood
aspect: response
refs: D3FEND D3-ITF Inbound Traffic Filtering; D3FEND D3-NTA Network Traffic Analysis
---

1. ระดับ CRITICAL (900 คำขอขึ้นไป) ระบบบล็อกเอง 600 วินาทีเมื่อเปิด auto-approve ระดับ MEDIUM ผู้ดูแลตัดสิน
2. ตรวจว่า IP ไม่ใช่บริการที่ตั้งใจเรียกบ่อย เช่นระบบตรวจสถานะของทีมเอง ก่อนอนุมัติ
3. ถ้า flood มาจากหลาย IP พร้อมกัน ให้พิจารณาจำกัดอัตราที่ Caddy หรือใช้บริการกรองทราฟฟิก
4. หลังบล็อก ดูว่าเว็บกลับมาตอบเร็วตามปกติ
