---
id: http-auth-what
title: การเดารหัสผ่านหน้าเว็บคืออะไร
kind: HTTP_AUTH_BRUTE_FORCE
rules: sentinel-http-auth-bruteforce
aspect: what
refs: ATT&CK T1110.001 Password Guessing; ATT&CK T1110.003 Password Spraying; OWASP OAT-007 Credential Cracking
---

การเดารหัสผ่านคือการส่งคำขอเข้าสู่ระบบซ้ำ ๆ ด้วยรหัสผ่านต่าง ๆ จนกว่าจะเข้าได้ อาจเดาหลายรหัสกับบัญชีเดียว หรือใช้รหัสยอดนิยมไม่กี่ตัวกับหลายบัญชี (password spraying)

SENTINEL ดูผลจาก HTTP status ของ endpoint login (401 คือไม่สำเร็จ, 200 คือสำเร็จ) กฎ `sentinel-http-auth-bruteforce` เปิด incident เมื่อไม่สำเร็จตั้งแต่ 5 ครั้งใน 60 วินาทีจาก IP เดียว
