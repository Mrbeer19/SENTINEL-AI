# SENTINEL AI — Phase 0: Contract & Setup — @btrx_beer

คุณเป็น coding assistant ของสมาชิกทีมคนนี้ ทำงานใน checkout ของ repository SENTINEL-AI ที่เปิดอยู่เท่านั้น อ่าน SENTINEL AI.txt, docs/api-contract.md (ถ้ามี) และโค้ดปัจจุบันก่อนแก้ไข
เป้าหมายเฟส: ตกลงข้อมูลกลางและเปิดโครงโปรเจกต์

กติกา: ทำงานทีละ task ตามลำดับ dependency; หาก dependency ยังไม่มีหรือยังไม่ผ่านการตรวจรับ ให้รายงานสิ่งที่ขาดและทำเฉพาะส่วนที่ไม่พึ่งพาก่อน อย่าสร้างผลทดสอบหรือผลโมเดลขึ้นเอง
รักษาเส้นแบ่ง HTTP_AUTH_BRUTE_FORCE กับ SSH_BRUTE_FORCE ให้ตรงกับแหล่ง log; firewall ของ MVP เป็น app-level simulator; ทุก action ที่บล็อกต้องรอคนอนุมัติ
ใช้ Qwen 3.5 4B ผ่าน Ollama เป็นโมเดลหลัก วัดการทำงานจริงบน RTX 4060 8GB; Beer เป็นเจ้าของงานเลือก/ปรับ/ประเมินโมเดล และทดลอง fine-tune เฉพาะเมื่อทรัพยากรพอ

## งานในเฟสนี้

# SENTINEL AI task F00: สร้าง React shell และ navigation
Pipeline: frontend | Phase: 0
Dependencies: none
Deliverable: frontend เปิดได้และสลับหน้าได้
Acceptance: มี Dashboard, Incidents, Agent, Firewall, Simulator, Reports เป็นหน้าว่าง/placeholder ที่ชัด; responsive; ไม่สมมติ API schema ก่อน B00

อ่าน SENTINEL AI.txt และ mockup/index.html เพื่อดูแนวภาพ สร้าง frontend React+Vite shell พร้อม navigation สำหรับ Dashboard, Incidents, AI Agent, Firewall, Simulator, Reports ทำ layout responsive แบบ SOC สีเข้ม ใช้ placeholder ที่ระบุชัด ไม่สร้าง mock API schema ก่อน B00 สรุปวิธีรันและไฟล์ที่เปลี่ยน

ทำงานในโฟลเดอร์โปรเจกต์ที่รัน CLI เท่านั้น ตรวจไฟล์ที่มีอยู่ก่อนแก้ไข รักษา API contract ของทีม
เมื่อเสร็จ สรุปไฟล์ที่แก้ วิธีทดสอบ ผลทดสอบ และข้อจำกัดที่เหลือ
AI ต้องไม่รายงานว่างานเสร็จแทนมนุษย์ ผู้สั่ง AI ต้องอ่าน diff และทดสอบเองก่อนใช้ /selfcheck

# SENTINEL AI task M00: Beer สำรวจ Local Model และสร้าง baseline
Pipeline: frontend | Phase: 0
Dependencies: none
Deliverable: docs/model-baseline.md และ model config ที่เลือก
Acceptance: รัน Ollama บนเครื่องได้จริง; วัด latency/RAM/VRAM; ทดสอบ structured output และ tool calling; ระบุ tag โมเดลที่ใช้

คุณรับผิดชอบโมเดล AI ของ SENTINEL AI อ่าน SENTINEL AI.txt ตรวจ GPU/VRAM จริง แล้วทดลอง Qwen 3.5 4B ด้วย Ollama tag qwen3.5:4b ที่ผู้ใช้เลือกเป็นโมเดลหลัก วัด latency, RAM/VRAM, structured JSON validity และ tool calling บนตัวอย่าง incident เดียวกัน บันทึก model tag, prompt, hardware, วิธีทำซ้ำ และข้อจำกัดใน docs/model-baseline.md ไม่ฝึกโมเดลจากศูนย์

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
