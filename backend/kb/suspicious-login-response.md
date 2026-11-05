---
id: suspicious-login-response
title: ควรรับมือการเข้าสู่ระบบที่น่าสงสัยอย่างไร
kind: SUSPICIOUS_LOGIN
rules: sentinel-suspicious-login
aspect: response
refs: D3FEND D3-AL Account Locking; D3FEND D3-MFA Multi-factor Authentication
---

ถือว่าอันตรายสูง เพราะถ้าเป็นผู้โจมตี เขาเข้าบัญชีได้แล้ว
1. ติดต่อเจ้าของบัญชีว่าเป็นคนเข้าเองหรือไม่
2. ถ้าไม่ใช่ เปลี่ยนรหัสผ่าน ยกเลิก session ที่เปิดอยู่ และตรวจสิ่งที่บัญชีทำหลังเข้าสู่ระบบ
3. อนุมัติบล็อก IP ชั่วคราว
4. ระยะยาว เปิดการยืนยันตัวตนสองขั้นสำหรับบัญชีสำคัญ
