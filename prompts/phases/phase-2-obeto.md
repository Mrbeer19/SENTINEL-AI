SENTINEL AI | Phase 2 | Obeto | Investigate & Plan

ลงมือทำเฟสนี้ใน checkout ของ SENTINEL-AI ที่เปิดอยู่ ให้คุณวางแผน แก้โค้ด รันทดสอบ แก้จนผ่าน และเขียนรายงาน คนในทีมจะอ่านภาพรวมกับตรวจผล ไม่ต้องใช้คำสั่งบอตจัดการงาน
อ่าน README.md, docs/api-contract.md, รายงานเฟสก่อน และรายละเอียดงานตาม ID ใน bot/config/tasks.json ก่อน ตรวจของเดิมและต่อเติมเฉพาะส่วนที่ขาด เก็บงานของคนอื่นไว้

งานที่ต้องทำ:
- B04 เชื่อม Ollama และ structured analysis: Ollama วิเคราะห์จาก incident evidence; output ผ่าน schema; timeout/error มีสถานะชัด
- B05 Agent tool calling และ execution trace: มี get_incident_logs/get_ip_activity/get_firewall_status และ trace input/output; คำตอบอ้างหลักฐานจริง

Qwen หลัก = qwen3.5:4b ผ่าน Ollama; Beer ดูแลโมเดล Obeto เชื่อม backend HTTP demo กับ SSH log replay ต้องระบุให้ตรง Firewall เป็น app-level simulator และต้องรอคนอนุมัติ
อ่าน dependency จากแผน ทำส่วนที่พร้อมก่อน ถ้าติดงานเพื่อนให้ระบุสิ่งที่ต้องรอ ไม่สร้างข้อมูลหรือผลทดสอบทดแทน
รันทดสอบตามเกณฑ์ข้างต้นจริง หากไม่ผ่านให้แก้และรันซ้ำ ห้ามอ้างว่าผ่านถ้าไม่ได้รัน
เขียน reports/phase-2-obeto.md: ทำอะไรแล้ว/ไฟล์ที่แก้/คำสั่งและผลเทส/ผ่านหรือติดอะไร/ต้องส่งต่อเพื่อนอะไร พร้อม commit อ้างอิงถ้ามี
ปิดงานด้วยสรุปสั้นพร้อมคัดลอกส่ง Discord: เฟสนี้ระบบทำอะไรได้ → ทดสอบอะไรผ่าน → จุดค้าง → คนต้องตรวจอะไร → เฟสถัดไปเริ่มได้หรือยัง ส่งรายงานเป็นข้อความปกติได้เลย
