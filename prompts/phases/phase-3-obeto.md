# SENTINEL AI — Phase 3: Approve & Defend — @obeto.

คุณเป็น coding assistant ของสมาชิกทีมคนนี้ ทำงานใน checkout ของ repository SENTINEL-AI ที่เปิดอยู่เท่านั้น อ่าน SENTINEL AI.txt, docs/api-contract.md (ถ้ามี) และโค้ดปัจจุบันก่อนแก้ไข
เป้าหมายเฟส: คนอนุมัติ แล้วตัวจำลองป้องกันและพิสูจน์ผล

กติกา: ทำงานทีละ task ตามลำดับ dependency; หาก dependency ยังไม่มีหรือยังไม่ผ่านการตรวจรับ ให้รายงานสิ่งที่ขาดและทำเฉพาะส่วนที่ไม่พึ่งพาก่อน อย่าสร้างผลทดสอบหรือผลโมเดลขึ้นเอง
รักษาเส้นแบ่ง HTTP_AUTH_BRUTE_FORCE กับ SSH_BRUTE_FORCE ให้ตรงกับแหล่ง log; firewall ของ MVP เป็น app-level simulator; ทุก action ที่บล็อกต้องรอคนอนุมัติ
ใช้ Qwen 3.5 4B ผ่าน Ollama เป็นโมเดลหลัก วัดการทำงานจริงบน RTX 4060 8GB; Beer เป็นเจ้าของงานเลือก/ปรับ/ประเมินโมเดล และทดลอง fine-tune เฉพาะเมื่อทรัพยากรพอ

## งานในเฟสนี้

# SENTINEL AI task B06: Policy, approval และ firewall simulator
Pipeline: backend | Phase: 3
Dependencies: B02, B05
Deliverable: Approve/Reject และ blocklist
Acceptance: Reject ไม่สร้าง rule; protected IP บล็อกไม่ได้; approve ซ้ำไม่สร้างซ้ำ; rule หมดอายุได้; audit ครบ

อ่าน docs/api-contract.md ทำ defense proposal state, policy validator, approve/reject API และ firewall simulator ใน SQLite Backend เป็นผู้ execute หลัง approval เท่านั้น ตรวจ protected IP, action enum, IP validity, duration, idempotency และ audit log ห้ามแก้ Windows Firewall จริง เพิ่ม tests สำหรับ approve, reject, duplicate, protected IP และ expiry

ทำงานในโฟลเดอร์โปรเจกต์ที่รัน CLI เท่านั้น ตรวจไฟล์ที่มีอยู่ก่อนแก้ไข รักษา API contract ของทีม
เมื่อเสร็จ สรุปไฟล์ที่แก้ วิธีทดสอบ ผลทดสอบ และข้อจำกัดที่เหลือ
AI ต้องไม่รายงานว่างานเสร็จแทนมนุษย์ ผู้สั่ง AI ต้องอ่าน diff และทดสอบเองก่อนใช้ /selfcheck

# SENTINEL AI task B07: Verification และ realtime events
Pipeline: backend | Phase: 3
Dependencies: B03, B06
Deliverable: blocked client ได้ 403 และ WebSocket แจ้งขั้นตอน
Acceptance: ก่อน approve ping ผ่าน หลัง approve request ใหม่จาก IP เดิมได้ 403; verification บันทึกผลจริง; reconnect อ่าน state ได้

เชื่อม firewall simulator กับ demo ping/login endpoint ให้ rule active จาก source IP มีผลจริงในระดับแอป บันทึก verification passed เฉพาะเมื่อมี request ใหม่จาก client IP เดิมหลังอนุมัติแล้วถูก 403 จริง ไม่สรุปผ่านจากการเช็ก policy อย่างเดียว เพิ่ม WebSocket event สำหรับ incident/agent/approval/firewall/verification ตาม contract มี tests end-to-end และอธิบายว่าการบล็อกนี้เป็น app-level

ทำงานในโฟลเดอร์โปรเจกต์ที่รัน CLI เท่านั้น ตรวจไฟล์ที่มีอยู่ก่อนแก้ไข รักษา API contract ของทีม
เมื่อเสร็จ สรุปไฟล์ที่แก้ วิธีทดสอบ ผลทดสอบ และข้อจำกัดที่เหลือ
AI ต้องไม่รายงานว่างานเสร็จแทนมนุษย์ ผู้สั่ง AI ต้องอ่าน diff และทดสอบเองก่อนใช้ /selfcheck

## รายงานก่อนส่งให้คนตรวจ

1. ไฟล์ที่สร้างหรือแก้ และเหตุผลของการแก้
2. คำสั่งรันและทดสอบจริง พร้อมผลที่ได้ (ถ้าไม่ได้รันให้ระบุชัด)
3. หลักฐานตามเกณฑ์ผ่านของแต่ละ task และผลลัพธ์ที่ยังไม่ผ่าน
4. API/ไฟล์ที่อีก pipeline ต้องใช้ รวมถึงข้อขัดแย้งของ contract
5. ข้อจำกัดและงานค้าง ห้ามอ้างว่าเสร็จหรือผ่านโดยไม่มีหลักฐาน

ผู้สั่ง AI ต้องอ่าน diff และทดสอบเองก่อนกด /submit และ /selfcheck ใน Discord; ถ้าทำแทน pipeline เพื่อน เจ้าของ pipeline ต้อง /approve อีกครั้ง
