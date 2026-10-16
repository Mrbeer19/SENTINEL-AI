# SENTINEL AI — Phase 4: Integrate & Present — @obeto.

คุณเป็น coding assistant ของสมาชิกทีมคนนี้ ทำงานใน checkout ของ repository SENTINEL-AI ที่เปิดอยู่เท่านั้น อ่าน SENTINEL AI.txt, docs/api-contract.md (ถ้ามี) และโค้ดปัจจุบันก่อนแก้ไข
เป้าหมายเฟส: เชื่อมระบบ ทดสอบเชิงตัวเลข และซ้อมเดโม

กติกา: ทำงานทีละ task ตามลำดับ dependency; หาก dependency ยังไม่มีหรือยังไม่ผ่านการตรวจรับ ให้รายงานสิ่งที่ขาดและทำเฉพาะส่วนที่ไม่พึ่งพาก่อน อย่าสร้างผลทดสอบหรือผลโมเดลขึ้นเอง
รักษาเส้นแบ่ง HTTP_AUTH_BRUTE_FORCE กับ SSH_BRUTE_FORCE ให้ตรงกับแหล่ง log; firewall ของ MVP เป็น app-level simulator; ทุก action ที่บล็อกต้องรอคนอนุมัติ
ใช้ Qwen 3.5 4B ผ่าน Ollama เป็นโมเดลหลัก วัดการทำงานจริงบน RTX 4060 8GB; Beer เป็นเจ้าของงานเลือก/ปรับ/ประเมินโมเดล และทดลอง fine-tune เฉพาะเมื่อทรัพยากรพอ

## งานในเฟสนี้

# SENTINEL AI task B08: Dataset, metrics และ incident report
Pipeline: backend | Phase: 4
Dependencies: B07, M01
Deliverable: test results และ report API
Acceptance: มี normal/attack labeled data, precision/recall/F1, latency, verification และ report จาก records จริง

รวมผลโมเดลที่ Beer ประเมินใน docs/model-evaluation.md กับการทดสอบระบบ สร้างชุดทดสอบ labeled normal, brute force, port scan ที่ไม่ปะปนกับข้อมูลใช้ตั้งกฎ วัด precision/recall/F1/false positive และ AI latency/tool success rate สร้าง incident report จาก event→analysis→approval→verification records จริง บันทึกผลใน docs/test-results.md พร้อมวิธีทำซ้ำ

ทำงานในโฟลเดอร์โปรเจกต์ที่รัน CLI เท่านั้น ตรวจไฟล์ที่มีอยู่ก่อนแก้ไข รักษา API contract ของทีม
เมื่อเสร็จ สรุปไฟล์ที่แก้ วิธีทดสอบ ผลทดสอบ และข้อจำกัดที่เหลือ
AI ต้องไม่รายงานว่างานเสร็จแทนมนุษย์ ผู้สั่ง AI ต้องอ่าน diff และทดสอบเองก่อนใช้ /selfcheck

# SENTINEL AI task B09: ซ้อมเดโมข้ามเครื่องและแก้จุดล้มเหลว
Pipeline: backend | Phase: 4
Dependencies: B08, F04
Deliverable: runbook เดโมและผลซ้อม
Acceptance: สองเครื่องผ่าน private LAN; source IP ถูก; approve แล้ว blocked; reject ไม่ blocked; offline model fallback ระบุชัด

ทดสอบ SENTINEL AI บน private LAN สองเครื่องตามเส้น demo จริง ตรวจ request source IP, event, incident, AI tool trace, approval, app-level block และ verification บันทึกคำสั่งรัน วิธี reset, expected output และ troubleshooting ลง docs/demo-runbook.md แก้เฉพาะ bug ที่ทำให้ flow หลักไม่ผ่าน

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
