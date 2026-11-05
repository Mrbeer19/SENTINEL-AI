---
id: http-flood-risk
title: HTTP flood อันตรายแค่ไหน
kind: HTTP_FLOOD
rules: sentinel-http-flood
aspect: risk
refs: ATT&CK T1499.002 Service Exhaustion Flood; OWASP OAT-015 Denial of Service
---

ผลกระทบคือเว็บช้าหรือล่มสำหรับผู้ใช้ทุกคน VPS นี้ใช้ร่วมกับเว็บอื่น การ flood เว็บหนึ่งจึงกระทบเว็บอื่นบนเครื่องได้ด้วย

flood จาก IP เดียวป้องกันได้ด้วยการบล็อก IP แต่ flood จากหลายพัน IP (DDoS) การบล็อกทีละ IP ไม่พอ ต้องใช้ผู้ให้บริการกรองทราฟฟิกต้นทาง

ข้อจำกัดที่รู้อยู่: คำขอแบบ cross-site ยังนับใน HTTP_FLOOD เว็บอื่นจึงอาจสั่งเบราว์เซอร์ผู้ใช้ให้ยิงจนถูกบล็อก 600 วินาทีได้ (ไม่เกิน 10 IP ต่อชั่วโมง)
