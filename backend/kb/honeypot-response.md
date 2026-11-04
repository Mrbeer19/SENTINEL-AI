---
id: honeypot-response
title: ควรรับมือ honeypot อย่างไร
kind: HONEYPOT
rules: sentinel-web-honeypot
aspect: response
refs: D3FEND D3-ITF Inbound Traffic Filtering; D3FEND D3-DF Decoy File
---

1. บล็อก IP ชั่วคราวที่เว็บ เมื่อเปิด `SENTINEL_AUTO_APPROVE=1` ระบบบล็อกเอง 600 วินาทีโดยไม่รอผู้ดูแล แล้วแสดงแจ้งเตือนให้รับทราบ
2. ตรวจว่าเว็บไม่มีไฟล์สำรอง ไฟล์ `.env` หรือ credential จริงอยู่ใน path ที่เปิดถึงได้
3. ดู incident อื่นของ IP เดียวกันว่ามีการสแกนหรือเดารหัสตามมาหรือไม่
4. ถ้าเป็น IP ของผู้ใช้จริงที่ถูกเว็บอื่นหลอกให้ขอ ให้ปลดบล็อกที่หน้า Protection
