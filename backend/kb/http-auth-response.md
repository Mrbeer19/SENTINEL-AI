---
id: http-auth-response
title: ควรรับมือการเดารหัสผ่านหน้าเว็บอย่างไร
kind: HTTP_AUTH_BRUTE_FORCE
rules: sentinel-http-auth-bruteforce
aspect: response
refs: D3FEND D3-AL Account Locking; D3FEND D3-MFA Multi-factor Authentication; D3FEND D3-SPP Strong Password Policy; D3FEND D3-ITF Inbound Traffic Filtering
---

1. ดูจำนวนครั้งและช่วงเวลา ถ้าถี่และสม่ำเสมอแบบเครื่องยิง ให้อนุมัติบล็อกชั่วคราว ถ้าน้อยและห่างอาจเป็นผู้ใช้ลืมรหัส
2. ดูว่ามีการเข้าสู่ระบบสำเร็จตามมาหรือไม่ (incident SUSPICIOUS_LOGIN) ถ้ามี ให้ถือว่าบัญชีอาจถูกเข้าถึงแล้ว
3. ที่ระบบเว็บ: จำกัดจำนวนครั้งต่อบัญชี หน่วงเวลาหลังผิดหลายครั้ง และเปิดการยืนยันตัวตนสองขั้นสำหรับผู้ดูแล
