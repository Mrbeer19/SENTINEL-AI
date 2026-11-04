---
id: port-scan-response
title: การสแกนพอร์ตอันตรายแค่ไหนและควรรับมืออย่างไร
kind: PORT_SCAN
rules: sentinel-port-scan
aspect: response
refs: ATT&CK T1046 Network Service Discovery; D3FEND D3-NTA Network Traffic Analysis; D3FEND D3-ITF Inbound Traffic Filtering
---

การสแกนเองไม่ทำความเสียหาย อันตรายอยู่ที่ว่าพบบริการที่ไม่ควรเปิดสู่อินเทอร์เน็ตหรือไม่ ถ้าฐานข้อมูลหรือ Redis เปิดโดยไม่มีรหัส ข้อมูลอาจหลุดได้ทันที

1. ดูรายการพอร์ตใน incident ว่ามีพอร์ตใดที่เครื่องเปิดอยู่จริง
2. บริการภายใน (ฐานข้อมูล, cache) ควรฟังเฉพาะเครือข่ายภายใน ไม่เปิดสู่อินเทอร์เน็ต
3. การอนุมัติบล็อกของ SENTINEL กันเฉพาะเว็บ การเชื่อมต่อพอร์ตอื่นยังเข้าได้ (ตรวจจับได้แต่ไม่บล็อก)
