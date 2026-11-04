---
id: ssh-bruteforce-risk
title: การเดารหัส SSH อันตรายแค่ไหน
kind: SSH_BRUTE_FORCE
rules: sentinel-ssh-auth-bruteforce
aspect: risk
refs: ATT&CK T1110 Brute Force; ATT&CK T1021.004 Remote Services: SSH
---

ถ้าเดาสำเร็จ ผู้โจมตีได้ shell บนเครื่อง ซึ่งร้ายแรงที่สุดในภัยที่ระบบตรวจ เพราะควบคุมทุกเว็บบนเครื่องได้ ความเสี่ยงต่ำถ้าเครื่องปิดการเข้าด้วยรหัสผ่านและใช้ key อย่างเดียว

ข้อจำกัดของ SENTINEL: การบล็อกทำที่ Caddy ระดับเว็บ IP ที่ถูกบล็อกจะเข้าเว็บไม่ได้ แต่ยังเดารหัส SSH ต่อได้ เพราะระบบไม่แก้ firewall ของเครื่องที่ใช้ร่วมกับผู้อื่น
