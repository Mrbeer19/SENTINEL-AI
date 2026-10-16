# SENTINEL AI — Phase 1: Observe & Detect — @obeto.

คุณเป็น coding assistant ของสมาชิกทีมคนนี้ ทำงานใน checkout ของ repository SENTINEL-AI ที่เปิดอยู่เท่านั้น อ่าน SENTINEL AI.txt, docs/api-contract.md (ถ้ามี) และโค้ดปัจจุบันก่อนแก้ไข
เป้าหมายเฟส: รับ event จริง สร้าง incident และแสดงบน UI

กติกา: ทำงานทีละ task ตามลำดับ dependency; หาก dependency ยังไม่มีหรือยังไม่ผ่านการตรวจรับ ให้รายงานสิ่งที่ขาดและทำเฉพาะส่วนที่ไม่พึ่งพาก่อน อย่าสร้างผลทดสอบหรือผลโมเดลขึ้นเอง
รักษาเส้นแบ่ง HTTP_AUTH_BRUTE_FORCE กับ SSH_BRUTE_FORCE ให้ตรงกับแหล่ง log; firewall ของ MVP เป็น app-level simulator; ทุก action ที่บล็อกต้องรอคนอนุมัติ
ใช้ Qwen 3.5 4B ผ่าน Ollama เป็นโมเดลหลัก วัดการทำงานจริงบน RTX 4060 8GB; Beer เป็นเจ้าของงานเลือก/ปรับ/ประเมินโมเดล และทดลอง fine-tune เฉพาะเมื่อทรัพยากรพอ

## งานในเฟสนี้

# SENTINEL AI task B01: FastAPI, SQLite และ event ingestion
Pipeline: backend | Phase: 1
Dependencies: B00
Deliverable: POST /api/events และ GET /api/events
Acceptance: รับ JSON ที่ valid, บันทึก SQLite, อ่านย้อนหลังได้, invalid input ได้ 422, restart แล้วยังมีข้อมูล

อ่าน docs/api-contract.md สร้าง FastAPI backend, SQLite schema และ POST/GET /api/events ตาม contract ใช้ Pydantic validate timestamp, IP, event type บันทึกข้อมูลจริงและมี health endpoint เพิ่ม tests ที่พิสูจน์การบันทึกและอ่านย้อนหลัง ระบุวิธีรันและผลทดสอบ

ทำงานในโฟลเดอร์โปรเจกต์ที่รัน CLI เท่านั้น ตรวจไฟล์ที่มีอยู่ก่อนแก้ไข รักษา API contract ของทีม
เมื่อเสร็จ สรุปไฟล์ที่แก้ วิธีทดสอบ ผลทดสอบ และข้อจำกัดที่เหลือ
AI ต้องไม่รายงานว่างานเสร็จแทนมนุษย์ ผู้สั่ง AI ต้องอ่าน diff และทดสอบเองก่อนใช้ /selfcheck

# SENTINEL AI task B02: Rule-based detection และ incident lifecycle
Pipeline: backend | Phase: 1
Dependencies: B01
Deliverable: ตรวจ auth brute force, SSH brute force และ port scan จาก event ที่ตรงประเภทได้
Acceptance: สร้าง incident จาก threshold ที่กำหนด, normal traffic ไม่เตือน, event ซ้ำไม่สร้าง incident ซ้ำ; HTTP และ SSH ไม่สับสนกัน

อ่าน docs/api-contract.md และ backend ปัจจุบัน ทำ detection engine สำหรับ HTTP auth brute force, SSH brute force และ port scan จาก event type ที่ตรงกัน กำหนด window/threshold เป็น config ชัดเจน เชื่อม event ingestion→incident SQLite ป้องกัน duplicate incident และเขียน tests สำหรับ positive, normal traffic, boundary, duplicate และการแยก HTTP/SSH อธิบาย precision/recall ที่จะวัดได้

ทำงานในโฟลเดอร์โปรเจกต์ที่รัน CLI เท่านั้น ตรวจไฟล์ที่มีอยู่ก่อนแก้ไข รักษา API contract ของทีม
เมื่อเสร็จ สรุปไฟล์ที่แก้ วิธีทดสอบ ผลทดสอบ และข้อจำกัดที่เหลือ
AI ต้องไม่รายงานว่างานเสร็จแทนมนุษย์ ผู้สั่ง AI ต้องอ่าน diff และทดสอบเองก่อนใช้ /selfcheck

# SENTINEL AI task B03: บริการเดโมข้ามสองเครื่อง
Pipeline: backend | Phase: 1
Dependencies: B01, B02
Deliverable: demo login/ping พร้อมบันทึก source IP
Acceptance: เครื่องอื่นใน private LAN เรียกได้; source IP มาจาก connection; login ผิดเข้า event pipeline; จำกัดจำนวนครั้งและไม่ใช้บัญชีจริง

เพิ่ม demo-only HTTP login และ ping endpoint สำหรับการสาธิตสองเครื่องใน private LAN อ่าน source IP จาก request connection ไม่เชื่อ client-supplied IP สร้าง failed-login event ผ่าน pipeline เดียวกับระบบ ระบุชัดว่าเป็น HTTP auth demo ไม่ใช่ SSH จริง ใส่ขอบเขตใช้งานเฉพาะ private LAN, rate/attempt cap และ tests

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
