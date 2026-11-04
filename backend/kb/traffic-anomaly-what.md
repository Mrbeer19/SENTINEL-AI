---
id: traffic-anomaly-what
title: การเชื่อมต่อถี่ผิดปกติ (traffic anomaly) คืออะไร
kind: TRAFFIC_ANOMALY
rules: sentinel-traffic-anomaly
aspect: what
refs: ATT&CK T1498 Network Denial of Service
---

คือ IP เดียวเปิดการเชื่อมต่อ TCP มาที่เครื่องจำนวนมากในเวลาสั้น กฎ `sentinel-traffic-anomaly` เปิด incident เมื่อมีตั้งแต่ 100 การเชื่อมต่อใน 60 วินาที (ไม่นับพอร์ต 80/443)

อาจเป็นการพยายามทำให้บริการรับการเชื่อมต่อไม่ไหว (connection flood) หรือเครื่องมือที่ต่อซ้ำเร็วเกินไป
