---
id: port-scan-what
title: การสแกนพอร์ตคืออะไร
kind: PORT_SCAN
rules: sentinel-port-scan
aspect: what
refs: ATT&CK T1046 Network Service Discovery; ATT&CK T1595.001 Scanning IP Blocks
---

การสแกนพอร์ตคือการเชื่อมต่อไปยังพอร์ตต่าง ๆ ของเครื่องเพื่อดูว่ามีบริการอะไรเปิดอยู่ เช่นฐานข้อมูล (3306, 5432), Redis (6379), remote desktop (3389)

SENTINEL ดู SYN ขาเข้า (ไม่นับพอร์ต 80/443 ซึ่งดูจาก log เว็บแทน) กฎ `sentinel-port-scan` เปิด incident เมื่อ IP เดียวเชื่อมต่อพอร์ตต่างกันตั้งแต่ 8 พอร์ตใน 60 วินาที เครื่องบนอินเทอร์เน็ตถูกสแกนแบบนี้ตลอดเวลาจาก bot ทั่วโลก
