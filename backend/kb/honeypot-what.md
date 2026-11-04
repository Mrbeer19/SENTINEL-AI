---
id: honeypot-what
title: การขอ path กับดัก (honeypot) คืออะไร
kind: HONEYPOT
rules: sentinel-web-honeypot
aspect: what
refs: ATT&CK T1595.003 Wordlist Scanning; D3FEND D3-DF Decoy File; OWASP OAT-018 Footprinting
---

path กับดักคือ URL ที่เว็บไม่มีจริงและไม่มีลิงก์ใดชี้ไป เช่น `/backup.sql`, `/admin-backup.zip`, `/.aws/credentials`, `/config.php.bak` ผู้ใช้ทั่วไปจึงไม่มีเหตุให้ขอ path เหล่านี้

คนที่ขอมักเป็นเครื่องมือสแกนที่ไล่รายชื่อไฟล์สำรองหรือไฟล์ความลับที่ผู้ดูแลเว็บลืมไว้ (wordlist scanning) เพื่อหาข้อมูลไปใช้โจมตีขั้นต่อไป

SENTINEL นับเป็น incident HONEYPOT ตั้งแต่การขอครั้งแรก (กฎ `sentinel-web-honeypot` เกณฑ์ 1 ครั้งขึ้นไปใน 60 วินาที)
