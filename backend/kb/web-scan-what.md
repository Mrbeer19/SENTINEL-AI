---
id: web-scan-what
title: การสแกนเว็บ (web scan) คืออะไร
kind: WEB_SCAN
rules: sentinel-web-scan-paths sentinel-web-scan-not-found
aspect: what
refs: ATT&CK T1595.003 Wordlist Scanning; ATT&CK T1595.002 Vulnerability Scanning; OWASP OAT-014 Vulnerability Scanning
---

การสแกนเว็บคือการไล่ขอ path จำนวนมากเพื่อหาหน้าที่ซ่อนอยู่ ไฟล์ตั้งค่า หรือระบบที่มีช่องโหว่ที่รู้จัก เช่น `/.env`, `/.git/config`, `/wp-admin/`, `/phpmyadmin/`, `/xmlrpc.php`

SENTINEL มีกฎ WEB_SCAN 2 กฎ
- `sentinel-web-scan-paths`: ขอ path ที่มีแต่เครื่องมือสแกนใช้ ตั้งแต่ 3 path ใน 60 วินาที
- `sentinel-web-scan-not-found`: ได้ 404 ตั้งแต่ 10 ครั้งใน 60 วินาที

เมื่อการสแกนได้ 404 และมี path ของเครื่องมือสแกนด้วย incident จะผูกกับกฎ scan-paths
