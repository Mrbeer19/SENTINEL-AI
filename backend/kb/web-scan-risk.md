---
id: web-scan-risk
title: web scan อันตรายแค่ไหน
kind: WEB_SCAN
rules: sentinel-web-scan-paths sentinel-web-scan-not-found
aspect: risk
refs: ATT&CK T1190 Exploit Public-Facing Application; OWASP A05:2021 Security Misconfiguration; OWASP A06:2021 Vulnerable and Outdated Components
---

การสแกนเป็นขั้นสำรวจก่อนโจมตีจริง ถ้าพบไฟล์ `.env` หรือโฟลเดอร์ `.git` ที่เปิดถึงได้ ผู้โจมตีอาจได้รหัสฐานข้อมูล API key หรือซอร์สโค้ดทันที ถ้าพบระบบจัดการที่ล้าสมัยอาจถูกใช้ช่องโหว่ที่เปิดเผยแล้ว (T1190)

ความแน่นอนต่างกันตามกฎ path ของเครื่องมือสแกนแทบไม่มีผู้ใช้ปกติขอ ส่วน 404 จำนวนมากอาจเกิดจากลิงก์เสียหรือรูปที่หายในเว็บเอง จึงต้องดูหลักฐานประกอบ
