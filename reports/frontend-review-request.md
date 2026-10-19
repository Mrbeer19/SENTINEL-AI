# ขอรีวิว Frontend — SENTINEL AI

ส่งให้ Obeto / Beer ตรวจ snapshot ปัจจุบันของหน้า SOC ก่อนนำไปลองกับ Mac M5 และ Neo

## ข้อตกลงล่าสุด

- M5 เปิด SOC Dashboard; Neo ส่งคำขอจาก Terminal
- ไม่มีลิงก์ Neo Demo ในเมนู M5 และ production build เป็นหน้า SOC entry เดียว
- ขนาด UI เน้นสมส่วนที่ zoom 100%; ตอนนำเสนอค่อยซูมเพิ่ม
- ลูกโลกแสดง Live network หรือพรีวิวหมุดที่ติดป้าย DEMO ไม่มี GeoIP lookup จริงในงานชุดนี้
- ไม่มี Jev

## ในชุดแนบ

- `frontend/`: source ปัจจุบัน, package lock, config และ README สำหรับเปิดตรวจในโฟลเดอร์แยก
- `frontend-changes.patch`: diff ของไฟล์ tracked เทียบกับ commit ฐาน ดูควบคู่กับ source เพราะไฟล์ใหม่อยู่ใน snapshot
- `screenshots/`: ภาพครบ 8 หน้าและพรีวิวหมุดแดง ข้อมูลในภาพ QA มาจากฐานข้อมูลทดสอบแยก
- `reports/frontend-review-2026-10-19.md`: ผลตรวจและข้อจำกัด
- `scripts/neo/README.md`: คำสั่งทดสอบจาก Neo และคำสั่ง replay บน M5

งานนี้เป็น snapshot ของ working tree ที่รวมการปรับหน้าจอปัจจุบัน ยังไม่ใช่หลักฐานว่า merge ขึ้น Git แล้ว ให้เทียบกับ branch ที่แต่ละคนทำอยู่ก่อนนำไปใช้

## อยากให้ตรวจ

1. **หน้าตา:** ทั้ง 8 หน้า, ความชัดที่ zoom 100%, หัวข้อ/ตาราง/ปุ่ม, ขอบล่างการ์ดเสมอกัน และจอ 1366×768/1920×1080
2. **สถานะ:** pending → approved ยังไม่ใช่ verified; ต้องมี request ใหม่ถูก deny จริง, rejected ต้องไม่เพิ่มกฎ, expired/unblocked ต้องไม่แสดง active
3. **ข้อมูล:** ตาราง/กราฟมาจาก backend, เวลาและ IP ตรงกัน, rule fallback แยกจากผลโมเดล
4. **การเชื่อมต่อ:** refresh หลัง approve/reject/unblock ไม่ค้างสถานะเก่า, WebSocket reconnect และ API errors อ่านรู้เรื่อง
5. **ลูกโลก:** DEMO ชัด, พรีวิวแดง/เขียวไม่สร้าง incident หรือเพิ่มกฎ, อย่าอ้างว่า private IP มีพิกัดจริง
6. **สองเครื่อง:** M5 เปิด backend + production web; Neo เรียก LAN IP ของ M5 ที่ backend port โดยตรง เพื่อให้ source_ip เป็น Neo จริง ไม่ใช่ proxy/loopback
7. **ความสามารถจริง:** Neo HTTP baseline 200 → login ผิด 6 ครั้ง → M5 วิเคราะห์/คนอนุมัติ → request ใหม่ 403 → ปลดกฎกลับ 200; SSH/port scan ยังเป็น log/event replay บน M5

## สิ่งที่ตรวจไปแล้ว

Build ผ่าน; เปิดครบ 8 หน้า × 3 ขนาดจอ; ตรวจรายการว่าง; ทดสอบ approve/reject/unblock และ request ใหม่ในฐานข้อมูลแยก ผล analysis ใน QA เป็น rule fallback ไม่ได้นับเป็นผล AI

**ยังต้องลองจริง:** Mac M5 + Neo สองเครื่อง, model runtime บน M5, hotspot/firewall และการอ่านผ่านโปรเจคเตอร์

## ส่งผลกลับ

ตอบในห้องเดิม: หน้า/ขั้นตอน → วิธีทำให้เจอ → ผลที่คาด/ผลที่เห็น → ภาพหรือ error → ระดับความสำคัญ

ถ้าไม่พบปัญหา ให้ระบุหน้าที่เปิดและขั้นตอนที่ลองจริง พร้อม OS/ขนาดจอ อย่าสรุปว่าผ่านทุกอย่างจาก build อย่างเดียว
