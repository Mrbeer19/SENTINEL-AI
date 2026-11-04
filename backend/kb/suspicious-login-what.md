---
id: suspicious-login-what
title: การเข้าสู่ระบบที่น่าสงสัยคืออะไร
kind: SUSPICIOUS_LOGIN
rules: sentinel-suspicious-login
aspect: what
refs: ATT&CK T1078 Valid Accounts; ATT&CK T1110 Brute Force
---

คือการเข้าสู่ระบบสำเร็จหลังจากล้มเหลวหลายครั้งในช่องทางเดียวกัน กฎ `sentinel-suspicious-login` เปิด incident เมื่อสำเร็จหลังล้มเหลวตั้งแต่ 5 ครั้งภายใน 60 วินาที

รูปแบบนี้ตรงกับการเดารหัสที่สำเร็จ ผู้โจมตีได้บัญชีที่ใช้งานได้จริง (valid account) แล้ว แต่ก็อาจเป็นผู้ใช้จริงที่พิมพ์ผิดหลายครั้งก่อนจำได้
