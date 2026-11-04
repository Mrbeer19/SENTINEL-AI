---
id: ssh-bruteforce-what
title: การเดารหัส SSH คืออะไร
kind: SSH_BRUTE_FORCE
rules: sentinel-ssh-auth-bruteforce
aspect: what
refs: ATT&CK T1110.001 Password Guessing; ATT&CK T1021.004 Remote Services: SSH
---

การเดารหัส SSH คือการลองเข้าสู่ระบบเครื่องเซิร์ฟเวอร์ผ่านพอร์ต 22 ซ้ำ ๆ ด้วยชื่อผู้ใช้และรหัสผ่านต่าง ๆ มักเป็น bot ที่ไล่ทุก IP บนอินเทอร์เน็ตด้วยชื่อทั่วไป เช่น root, admin, ubuntu

SENTINEL อ่าน log ของ sshd กฎ `sentinel-ssh-auth-bruteforce` เปิด incident เมื่อไม่สำเร็จตั้งแต่ 5 ครั้งใน 60 วินาที sshd ระดับ INFO บันทึก Failed password แต่ไม่บันทึก Failed publickey
