# SENTINEL AI — Phase 2: Investigate & Plan — @obeto.

คุณเป็น coding assistant ของสมาชิกทีมคนนี้ ทำงานใน checkout ของ repository SENTINEL-AI ที่เปิดอยู่เท่านั้น อ่าน SENTINEL AI.txt, docs/api-contract.md (ถ้ามี) และโค้ดปัจจุบันก่อนแก้ไข
เป้าหมายเฟส: AI อ่านหลักฐานและเสนอแผนที่ตรวจสอบได้

กติกา: ทำงานทีละ task ตามลำดับ dependency; หาก dependency ยังไม่มีหรือยังไม่ผ่านการตรวจรับ ให้รายงานสิ่งที่ขาดและทำเฉพาะส่วนที่ไม่พึ่งพาก่อน อย่าสร้างผลทดสอบหรือผลโมเดลขึ้นเอง
รักษาเส้นแบ่ง HTTP_AUTH_BRUTE_FORCE กับ SSH_BRUTE_FORCE ให้ตรงกับแหล่ง log; firewall ของ MVP เป็น app-level simulator; ทุก action ที่บล็อกต้องรอคนอนุมัติ
ใช้ Qwen 3.5 4B ผ่าน Ollama เป็นโมเดลหลัก วัดการทำงานจริงบน RTX 4060 8GB; Beer เป็นเจ้าของงานเลือก/ปรับ/ประเมินโมเดล และทดลอง fine-tune เฉพาะเมื่อทรัพยากรพอ

## งานในเฟสนี้

# SENTINEL AI task B04: เชื่อม Ollama และ structured analysis
Pipeline: backend | Phase: 2
Dependencies: B02, M00
Deliverable: AI analysis JSON ที่ validate ได้
Acceptance: Ollama วิเคราะห์จาก incident evidence; output ผ่าน schema; timeout/error มีสถานะชัด

อ่าน docs/api-contract.md และ docs/model-baseline.md จาก Beer สร้าง Ollama integration สำหรับวิเคราะห์ incident จากหลักฐานในฐานข้อมูล ใช้ model config ที่เปลี่ยนรุ่นได้ ไม่ hardcode tag บังคับ structured output ผ่าน Pydantic เก็บ model name, evidence, latency และ error/timeout ห้ามให้ AI เรียก shell หรือแก้ firewall โดยตรง เพิ่ม tests ด้วย mock model และเชื่อมผล baseline ที่ Beer เลือก

ทำงานในโฟลเดอร์โปรเจกต์ที่รัน CLI เท่านั้น ตรวจไฟล์ที่มีอยู่ก่อนแก้ไข รักษา API contract ของทีม
เมื่อเสร็จ สรุปไฟล์ที่แก้ วิธีทดสอบ ผลทดสอบ และข้อจำกัดที่เหลือ
AI ต้องไม่รายงานว่างานเสร็จแทนมนุษย์ ผู้สั่ง AI ต้องอ่าน diff และทดสอบเองก่อนใช้ /selfcheck

# SENTINEL AI task B05: Agent tool calling และ execution trace
Pipeline: backend | Phase: 2
Dependencies: B04
Deliverable: Agent เรียก read-only tools จริง
Acceptance: มี get_incident_logs/get_ip_activity/get_firewall_status และ trace input/output; คำตอบอ้างหลักฐานจริง

ทำ Agent workflow โดยให้ Ollama เลือกเรียก read-only tools เพื่ออ่าน incident logs, IP activity, related incidents และ firewall status บันทึกทุก tool call และผลลง agent trace จำกัด arguments และจำนวนรอบ ปฏิเสธ tool ที่ไม่อยู่ allowlist ใช้ LangGraph เมื่อมีประโยชน์กับ state/trace จริง เพิ่ม tests สำหรับ tool selection, invalid arguments และ timeout

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
