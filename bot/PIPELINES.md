# SENTINEL AI — สอง pipeline และจุดส่งงาน

| Phase | เป้าหมาย | @obeto. · Backend/Security/Agent integration | @btrx_beer · Frontend/UI/Model |
|---|---|---|---|
| 0 · Contract & Setup | ตกลงข้อมูลกลาง | B00 API/event contract | F00 React shell/navigation และ M00 local model baseline ทำพร้อม B00 ได้ |
| 1 · Observe & Detect | รับ log และเห็น incident | B01 ingestion/SQLite → B02 detection → B03 demo สองเครื่อง | F01 dashboard/incident จาก mock contract |
| 2 · Investigate & Plan | AI อ่านหลักฐานจริง | B04 เชื่อมโมเดลของ Beer → B05 tool calling/trace | F02 workflow/evidence viewer และ M01 prompt tuning/fine-tune ถ้าทรัพยากรพอ |
| 3 · Approve & Defend | อนุมัติและพิสูจน์ผล | B06 policy/approval/firewall → B07 verification/WebSocket | F03 approval/firewall/simulator UI |
| 4 · Integrate & Present | เชื่อมจริงและซ้อมสอบ | B08 metrics/report → B09 ซ้อมสองเครื่อง | F04 real API/WebSocket/report → F05 UI polish/หลักฐานสไลด์ |

งานที่มีลูกศรต้องรอ dependency เป็น `done` ตาม [tasks.json](config/tasks.json) งานในคนละ pipeline ที่ไม่พึ่งกันทำพร้อมกันได้

## กติกาเมื่องานข้ามคน

1. สมาชิกกด `/available free:false` เมื่อไม่ว่าง คนที่ว่างใช้ `/next` จะเห็นงานของตัวเองก่อน แล้วเห็นงานอีก pipeline ที่พร้อมทำ
2. คนที่รับแทนกด `/claim` และรัน Codex/Claude **บนเครื่องของตน** พร้อม prompt ของงาน
3. ผู้สั่ง AI อ่าน diff, ตรวจ API contract, ทดสอบ acceptance และใส่หลักฐานใน `/submit`
4. ผู้สั่ง AI กด `/selfcheck` พร้อมบอกว่าตรวจอะไร บอตจึงส่งงานไป `owner_review`
5. เจ้าของ pipeline กด `/approve` เมื่อเชื่อมกับงานตัวเองได้ หรือ `/changes` เพื่อส่งกลับไปแก้

บอตไม่ตัดสินว่าผลงาน AI ถูกต้องจากข้อความ AI เพียงอย่างเดียว และไม่รัน CLI ด้วย Bot Token

## จุดเชื่อมสำคัญ

- **B00 ก่อน F01:** ตกลงชื่อ field, enum, error และ WebSocket event ก่อนทำ mock API; F00 ทำ shell ได้ทันที
- **B02/B03 ก่อนเดโม live:** log ของเครื่องเพื่อนต้องเข้าทาง pipeline เดียวกับ detection
- **B05 ก่อน B06:** AI เสนอ action ส่วน backend ตรวจ policy และ execute หลังคนอนุมัติ
- **M00 ก่อน B04:** Beer เลือกและวัด local model; Obeto เชื่อมเข้ากับ backend/Agent
- **M01 ก่อน B08:** Beer ส่งผลประเมินและ model artifact (ถ้ามี) เพื่อรวมในผลทดสอบระบบ
- **B07/B08 ก่อน F04:** UI ต้องใช้ verification และ report จาก backend จริง ไม่เปลี่ยนสถานะด้วย mock ในเดโมหลัก
- **B08/F04 ก่อน B09:** ซ้อมสองเครื่องเมื่อ API/UI/report เชื่อมครบ

หมายเหตุ: B03 ใช้ HTTP login demo และแสดงประเภท HTTP auth brute force ตามจริง ถ้าต้องการ SSH จริงต้องเพิ่มงานแยกและทดสอบใน lab ที่ควบคุมเอง
