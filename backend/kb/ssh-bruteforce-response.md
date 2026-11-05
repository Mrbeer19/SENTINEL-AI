---
id: ssh-bruteforce-response
title: ควรรับมือการเดารหัส SSH อย่างไร
kind: SSH_BRUTE_FORCE
rules: sentinel-ssh-auth-bruteforce
aspect: response
refs: D3FEND D3-SPP Strong Password Policy; D3FEND D3-ITF Inbound Traffic Filtering
---

1. อนุมัติบล็อกที่เว็บเพื่อตัดช่องทางเว็บของ IP นั้น และรู้ว่า SSH ยังไม่ถูกบล็อก
2. ตรวจว่ามีการเข้าสู่ระบบสำเร็จจาก IP นั้นหรือไม่ ถ้ามี ให้ถือเป็นเหตุร้ายแรง เปลี่ยนรหัส ตรวจ key ที่อนุญาต และ process ที่รันอยู่
3. ที่ sshd (ต้องได้รับอนุญาตจากเจ้าของเครื่อง): ปิดการเข้าด้วยรหัสผ่าน ปิด root login ด้วยรหัส ใช้ key อย่างเดียว OpenSSH รุ่นใหม่มี PerSourcePenalties ที่หน่วง IP ที่ผิดบ่อยอยู่แล้ว
