---
id: web-scan-response
title: ควรรับมือ web scan อย่างไร
kind: WEB_SCAN
rules: sentinel-web-scan-paths sentinel-web-scan-not-found
aspect: response
refs: D3FEND D3-ITF Inbound Traffic Filtering; OWASP A05:2021 Security Misconfiguration
---

1. กรณีกฎ scan-paths ระบบบล็อกเองได้ 600 วินาทีเมื่อเปิด auto-approve กรณีกฎ 404 อย่างเดียว ผู้ดูแลตัดสินเอง เพราะอาจเป็นลิงก์เสีย
2. ตรวจ path ใน incident ว่าเว็บตอบอะไร ถ้ามี path ใดตอบ 200 ทั้งที่ไม่ควรเปิด ต้องปิดที่เว็บเซิร์ฟเวอร์ทันที
3. ไม่เก็บ `.env`, `.git` หรือไฟล์สำรองไว้ในโฟลเดอร์ที่เว็บให้บริการ
4. อัปเดตระบบจัดการเนื้อหาและปลั๊กอินที่ถูกสแกนหา
