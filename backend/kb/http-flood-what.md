---
id: http-flood-what
title: HTTP flood คืออะไร
kind: HTTP_FLOOD
rules: sentinel-http-flood
aspect: what
refs: ATT&CK T1499.002 Service Exhaustion Flood; ATT&CK T1499.003 Application Exhaustion Flood; OWASP OAT-015 Denial of Service
---

HTTP flood คือการส่งคำขอหน้าเว็บหรือ API จำนวนมากในเวลาสั้นจนเซิร์ฟเวอร์ตอบผู้ใช้ปกติไม่ทัน

SENTINEL นับคำขอที่ไม่ใช่ไฟล์ static ต่อ IP กฎ `sentinel-http-flood` เปิด incident เมื่อมีตั้งแต่ 300 คำขอใน 60 วินาที และเป็น CRITICAL เมื่อถึง 900 คำขอ (3 เท่าของเกณฑ์) ไฟล์ static และ tile แผนที่ไม่นับ เพราะการเลื่อนแผนที่ครั้งเดียวขอได้หลายร้อยไฟล์
