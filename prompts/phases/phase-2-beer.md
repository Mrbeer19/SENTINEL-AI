# SENTINEL AI — Phase 2: Investigate & Plan — @btrx_beer

คุณเป็น coding assistant ของสมาชิกทีมคนนี้ ทำงานใน checkout ของ repository SENTINEL-AI ที่เปิดอยู่เท่านั้น อ่าน SENTINEL AI.txt, docs/api-contract.md (ถ้ามี) และโค้ดปัจจุบันก่อนแก้ไข
เป้าหมายเฟส: AI อ่านหลักฐานและเสนอแผนที่ตรวจสอบได้

กติกา: ทำงานทีละ task ตามลำดับ dependency; หาก dependency ยังไม่มีหรือยังไม่ผ่านการตรวจรับ ให้รายงานสิ่งที่ขาดและทำเฉพาะส่วนที่ไม่พึ่งพาก่อน อย่าสร้างผลทดสอบหรือผลโมเดลขึ้นเอง
รักษาเส้นแบ่ง HTTP_AUTH_BRUTE_FORCE กับ SSH_BRUTE_FORCE ให้ตรงกับแหล่ง log; firewall ของ MVP เป็น app-level simulator; ทุก action ที่บล็อกต้องรอคนอนุมัติ
ใช้ Qwen 3.5 4B ผ่าน Ollama เป็นโมเดลหลัก วัดการทำงานจริงบน RTX 4060 8GB; Beer เป็นเจ้าของงานเลือก/ปรับ/ประเมินโมเดล และทดลอง fine-tune เฉพาะเมื่อทรัพยากรพอ

## งานในเฟสนี้

# SENTINEL AI task F02: Agent Workflow และ evidence viewer
Pipeline: frontend | Phase: 2
Dependencies: F01, B00
Deliverable: หน้า Agent แสดง node และ tool trace
Acceptance: สถานะ pending/running/waiting/completed/failed และหลักฐาน/คำแนะนำอ่านได้; รองรับ error

อ่าน docs/api-contract.md ทำ AI Agent page แสดง workflow node, tool calls, evidence, analysis, recommendation และเวลาที่ใช้ จาก mock API ที่ตรง contract แยกข้อมูลจริงออกจากข้อความ AI ชัดเจน รองรับ waiting approval, failed/timeout และโหลดใหม่แล้วสถานะไม่หาย

ทำงานในโฟลเดอร์โปรเจกต์ที่รัน CLI เท่านั้น ตรวจไฟล์ที่มีอยู่ก่อนแก้ไข รักษา API contract ของทีม
เมื่อเสร็จ สรุปไฟล์ที่แก้ วิธีทดสอบ ผลทดสอบ และข้อจำกัดที่เหลือ
AI ต้องไม่รายงานว่างานเสร็จแทนมนุษย์ ผู้สั่ง AI ต้องอ่าน diff และทดสอบเองก่อนใช้ /selfcheck

# SENTINEL AI task M01: Beer ปรับ prompt และทดลอง fine-tune ถ้าทรัพยากรพอ
Pipeline: frontend | Phase: 2
Dependencies: M00, B02
Deliverable: docs/model-evaluation.md, dataset แยก train/test และ model artifact ถ้า fine-tune สำเร็จ
Acceptance: เปรียบเทียบ baseline กับ prompt-tuned และ fine-tuned (ถ้าทำได้) บน held-out cases; รายงาน accuracy, JSON validity, tool selection, latency/VRAM; ไม่อ้างผลถ้าไม่ได้รัน

คุณเป็นเจ้าของงานโมเดลของ SENTINEL AI ใช้ incident examples ที่มี label ชัด แยก train/validation/test ก่อนปรับ เริ่มจาก prompt tuning และ structured/tool calling benchmark จาก M00 จากนั้นประเมินว่าฮาร์ดแวร์ RTX 4060/RAM 16GB รองรับ fine-tuning แบบประหยัดทรัพยากรหรือไม่ ถ้ารองรับให้ทดลอง fine-tune ขนาดเล็กและเก็บ model artifact/วิธีทำซ้ำ ถ้าไม่รองรับให้บันทึกเหตุผลเชิงตัวเลขและใช้ prompt-tuned baseline เปรียบเทียบผลบน held-out cases รายงาน accuracy, JSON validity, tool choice, latency และ VRAM ใน docs/model-evaluation.md ห้ามใช้ test set ปรับโมเดล ไม่ส่ง evaluation labels หรือ expected answer ให้โมเดลเป็น input ตอนวัดผล

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
