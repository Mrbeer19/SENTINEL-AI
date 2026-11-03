# Frontend UX review — 20 October 2026

## Scope

ปรับ frontend ในเครื่องต่อจากงานจัดหน้าตาเดิม ให้ผู้ใช้เข้าใจขั้นตอนและผลการดำเนินการ โดยรักษาธีม สัดส่วนปกติ ลูกโลก และการแยก M5 SOC / Neo Terminal

### Changes

- คู่มือพับได้ 5 ขั้น พร้อมลิงก์แต่ละหน้า และคำอธิบายภาษาไทยในหัวข้อหน้า
- แถบขั้นตอนถัดไปใน Overview / Incident Detail เลือกจากสถานะ incident, proposal และอายุกฎจริง
- แยกการอนุมัติ การยืนยันจากคำขอใหม่ และผลยืนยันในอดีตเมื่อกฎหยุดทำงาน ไม่แสดงกฎเก่าว่ายัง active
- ตรวจทาน Source IP, TTL และผู้ตัดสินใจก่อนยืนยันอนุมัติ/ปฏิเสธ ยกเลิกได้โดยไม่มี write พร้อมคืนโฟกัสคีย์บอร์ด
- ป้องกันส่งคำสั่งซ้ำขณะมีงานค้าง แสดงสถานะ/ผลลัพธ์/ข้อผิดพลาดที่มุมล่าง และซ่อนรายละเอียดเทคนิคไว้ในส่วนที่กดเปิดดูได้
- จำนวนผลค้นหา ปุ่มล้างตัวกรอง และสถานะไม่พบรายการใน Incidents / Approvals / Rules / Reports
- รายละเอียดตามรายการที่กรองอยู่ แท็บประวัติไม่แสดง pending/active จากอีกแท็บ ลิงก์ตรงเปิดแท็บที่ตรงสถานะ
- เมื่อเปลี่ยนรายงาน ให้โหลดรายงานใหม่แทนการแสดงข้อมูลของรายการก่อนหน้า
- Offline แสดงข้อความให้ตรวจ M5 พร้อมระบุ SAVED DATA หรือ NO DATA; ข้อมูลเดิมไม่หายและเชื่อมกลับได้
- Demo Lab แยกคำแนะนำ normal traffic / rejected proposal และปิดปุ่มยืนยัน 403 เมื่อไม่มีกฎที่ทำงาน
- Skip link และโฟกัสคีย์บอร์ด, focus indicator และ reduced motion สำหรับส่วนการใช้งาน

## Verification

ใช้หน้าเว็บพัฒนา port 5175 กับ backend port 8001 และฐานข้อมูลใหม่ `backend/tests/.tmp/ux-review-2026-10-20.db` เท่านั้นสำหรับการเขียนข้อมูลทดสอบ ไม่ใช้ฐานข้อมูลหลักใน workflow ทดสอบ

| Check | Result |
| --- | --- |
| Production build | `npm run build` ผ่าน |
| Whitespace check | `git diff --check` ผ่าน; มีเพียงคำเตือน LF / CRLF ของเครื่อง |
| Empty system | มีคำแนะนำเริ่ม Demo Lab ก่อนมี incident |
| Main flow | baseline 200 → replay HTTP → วิเคราะห์ fallback → ตรวจข้อเสนอ → ยืนยันอนุมัติ → คำขอใหม่ 403 → verified |
| Approval preview / cancel | ก่อนยืนยัน `/api/rules` ยังเป็น `[]`; ยกเลิกปิดกล่องและไม่สร้างกฎ |
| Keyboard | ยกเลิกคืนโฟกัสปุ่มอนุมัติ; skip link โฟกัส main โดยไม่เปลี่ยนหน้า |
| Reject | ข้อเสนอ SSH ถูกปฏิเสธ; ไม่เพิ่มกฎ; runbook ระบุ Rejected |
| Rule removal | ยืนยันปลดกฎผ่าน UI แล้วคำขอใหม่กลับเป็น HTTP 200 |
| Tabs | Approvals pending / history และ Rules active / history แสดงรายละเอียดตรงรายการ |
| Search | กรองไม่พบและล้างตัวกรองได้ทั้ง 4 หน้า; ไม่ค้าง report/rule/proposal เดิมเมื่อไม่พบรายการ |
| Invalid input | IP ไม่ถูกต้องได้ HTTP 422 พร้อมคำอธิบายที่อ่านง่ายและรายละเอียดพับได้ |
| Disconnection | หยุด backend ทดสอบ: แสดงข้อมูลเดิมพร้อมแจ้งเตือน; แท็บเปิดใหม่ไม่แสดงศูนย์ปลอม; เปิด backend กลับแล้วเชื่อมเอง |
| Responsive | 8 หน้า × 2 ขนาด: 1366×768 และ 390×844, ไม่พบ panel ล้นแนวนอนหรือ Vite error overlay |
| Mobile review | กล่องยืนยันอยู่ในความกว้างจอ และได้รับโฟกัสเมื่อเปิด |

ตรวจ 8 หน้า: Overview, Incidents, Incident Detail, Agent Trace, Approvals, Rules, Reports, Demo Lab

## Evidence

- `../mockup/frontend-ux-review/overview-1366.jpg`
- `../mockup/frontend-ux-review/overview-390.jpg`
- `../mockup/frontend-ux-review/approval-confirm.jpg`
- `../mockup/frontend-ux-review/approval-confirm-mobile.jpg`
- `../mockup/frontend-ux-review/layout-checks.json`

## Limits

การทดสอบนี้ใช้ IP ของ TEST-NET และ local replay; ตั้ง backend ทดสอบให้โมเดลไม่พร้อมเพื่อยืนยันว่าหน้าจอแสดง rule fallback อย่างตรงไปตรงมา ไม่ใช่ผลทดสอบโมเดล Qwen จริงหรือการเชื่อม M5 / Neo สองเครื่อง ยังต้องซ้อมบน Mac และ LAN ที่จะนำเสนอ GeoIP จริงยังไม่ได้เพิ่มในงาน UX นี้

ภาพและรายงานนี้เป็นเวอร์ชันหลังปรับ UX ซึ่งใหม่กว่าชุด review ที่ส่งให้ทีมก่อนหน้านี้
