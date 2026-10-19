# Frontend review — 19 ตุลาคม 2569

## งานที่ปรับ

- รูปแบบดำ–เขียวอมฟ้าและลูกโลกหมุนขนาดใหญ่ ใช้รูปทรงแผ่นดินที่เก็บในโปรเจกต์
- การ์ดเต็มความสูงของแถว รวมถึง Rules และการ์ด Approval ใน Overview
- ขนาดข้อความสมส่วนที่ซูม 100% ตามข้อตกลงล่าสุด สามารถซูมเพิ่มเพื่อนำเสนอ
- เอา Neo Demo ออกจากเมนู M5 และ production build ฝั่ง M5
- แยกคำสั่งทดสอบของ Mac Neo ไว้ที่ `scripts/neo/README.md`
- แก้ status refresh หลัง write ที่ชนกับการ refresh เดิม, การเลือก incident หลังกรอง, การแสดงป้าย fallback ใน Reports และสีพื้นข้อความขั้นตอน Agent

## ตรวจหน้าเว็บ

เปิดครบ 8 หน้า: Overview, Incidents, Incident Detail, Agent Trace, Approvals, Rules, Reports และ Demo Lab ที่ viewport 1920×1080, 1366×768 และ 390×844 รวม 24 กรณี

- ทุกหน้ารันได้ ไม่พบ Vite error overlay
- ไม่พบ panel ล้นออกนอกความกว้างหน้าจอ ตารางใหญ่เลื่อนในกรอบตาราง
- Rules: ขอบล่างการ์ดซ้ายและ stack ขวาตรงกัน (ต่าง 0px ที่ 1366px)
- Overview: ขอบล่าง Recent Incidents และ Approval stack ตรงกัน (ต่าง 0px ที่ 1366px)
- ตรวจการค้นหาไม่พบข้อมูลใน Incidents, Reports, Approvals และ Rules
- เปิดตรวจภาพทั้ง 8 หน้าบนจอใหญ่ และภาพจอแคบ
- ตรวจโหมด Sample external IP: หมุด/ป้ายเป็นสีแดงใน threat scenario และเปลี่ยนเป็นปกติเมื่อสลับสถานการณ์ มีป้าย DEMO ไม่เปลี่ยนข้อมูลจริง
- ไม่พบ console error ในหน้าทดสอบขณะตรวจลูกโลก

ภาพและข้อมูลขนาดหน้าจออยู่ที่ `mockup/frontend-review/` โดยภาพจากชุด QA เป็นข้อมูลทดสอบในฐานข้อมูลแยก ไม่ใช่ incident จริงของเครื่องผู้ใช้

## ตรวจ workflow ด้วยฐานข้อมูลแยก

ใช้ backend ของ repository กับ SQLite แยกใต้ `backend/tests/.tmp/` ไม่แก้ incident/proposal/rule เดิมของผู้ใช้

- Baseline request ได้ 200
- Replay HTTP brute force เปิด incident → analysis → approve → request ใหม่ได้ 403 และ Verified blocked
- Replay port scan → analysis → กด Reject ผ่าน UI → request ยังได้ 200
- Replay SSH → กด Run investigation ผ่าน UI → กด Approve ผ่าน UI → request ใหม่ได้ 403 และหน้า Incident แสดง Verified blocked
- กด Remove rule และ Confirm ผ่าน UI → request ใหม่กลับเป็น 200
- Normal replay ไม่เปิด incident
- ผล analysis ใน QA เป็น rule fallback เพราะปิดการเชื่อมโมเดลของเซิร์ฟเวอร์ QA ไว้ ไม่ได้นับเป็นผล AI หรือ benchmark
- `npm run build` ผ่าน โดย output เป็น M5 SOC entry เดียว

## ขอบเขตของผลตรวจ

ทดสอบบนเครื่องปัจจุบันกับ backend ภายในเครื่อง ยังไม่ได้ทดสอบบน Mac M5 + Mac Neo จริง และไม่ได้รับ Public IP จากเครือข่ายภายนอก การใช้ LAN IP, iPhone hotspot, model runtime และ firewall ของ Mac ต้องตรวจสองเครื่องก่อนนำเสนอ

Public IP GeoIP lookup ยังไม่ได้ implement หมุดเดโมไม่ใช่หลักฐาน geolocation จริง ส่วน SSH/port scan ยังคงเป็น event/log replay ตาม MVP ปัจจุบัน
