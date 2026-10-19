# Neo Terminal — คำสั่งทดสอบ SENTINEL AI

M5 เปิด SOC Dashboard ส่วน Mac Neo ส่งคำขอจาก Terminal ไม่มีหน้าควบคุม SOC บน Neo ใช้กับเซิร์ฟเวอร์ lab ของทีมเท่านั้น

## เตรียมที่ M5

Build เว็บจาก `frontend` ด้วย `npm run build` แล้วรัน backend จาก root โปรเจกต์:

```sh
backend/.venv/bin/python -m uvicorn backend.app:app --host 0.0.0.0 --port 8000
```

M5 เปิด `http://127.0.0.1:8000` เพื่อจัดการ SOC ส่วน Neo เรียก LAN IP ของ M5 ที่ port 8000 โดยตรง ขณะเดโมจริงไม่ส่งคำขอ Neo ผ่าน Vite proxy เพราะ backend อาจเห็น IP ของ proxy แทน Neo ต้องมี dependencies/model เตรียมบน M5 ก่อน ไม่คัดลอก virtualenv จาก Windows

## เตรียมที่ Neo — ทำครั้งเดียว

แทน `192.168.1.20` ด้วย LAN IP จริงของ M5:

```sh
export SENTINEL_URL='http://192.168.1.20:8000'
```

### 1. ตรวจว่าเชื่อม M5 ได้

```sh
curl --connect-timeout 5 --max-time 15 -sS "$SENTINEL_URL/api/health"
```

ได้ JSON แปลว่าเชื่อม server ได้ ตรวจ `model_ready` ประกอบ ถ้า false การวิเคราะห์อาจเป็น rule fallback ไม่ใช่ผลของโมเดล

### 2. คำขอปกติก่อนเริ่ม — ควร HTTP 200

```sh
curl --connect-timeout 5 --max-time 15 -i -sS -X POST "$SENTINEL_URL/api/demo/traffic" \
  -H 'Content-Type: application/json' -d '{}'
```

M5 ต้องเห็น IP ต้นทาง Neo ใน Live Request Log และผล `allowed` ถ้าติดกฎจากรอบก่อนให้ผู้ดูแลปลดบล็อกใน Rules ก่อน ไม่ควรเริ่มจากผล 403

### 3. Login สำเร็จปกติ — ควร HTTP 200

เป็นบัญชีตัวอย่างของ demo application:

```sh
curl --connect-timeout 5 --max-time 15 -i -sS -X POST "$SENTINEL_URL/api/demo/login" \
  -H 'Content-Type: application/json' \
  -d '{"username":"student","password":"sentinel-demo"}'
```

### 4. HTTP brute-force demo — ส่ง login ผิดเพียง 6 ครั้ง

```sh
for attempt in 1 2 3 4 5 6; do
  printf '\n--- Login test %s/6 ---\n' "$attempt"
  curl --connect-timeout 5 --max-time 15 -i -sS -X POST "$SENTINEL_URL/api/demo/login" \
    -H 'Content-Type: application/json' \
    -d '{"username":"student","password":"demo-wrong-password"}'
  sleep 0.5
done
```

ก่อนเพิ่มกฎควรได้ 401 และ M5 เปิด incident HTTP_AUTH_BRUTE_FORCE เมื่อผิดอย่างน้อย 5 ครั้งใน 60 วินาที บอต/Agent ไม่ได้รับสิทธิ์อนุมัติเอง

### 5. ฝั่ง M5 วิเคราะห์และอนุมัติผ่าน SOC

1. เปิด Incidents เลือก IP ของ Neo → “เปิดรายละเอียด”
2. กด “เริ่มวิเคราะห์” → ตรวจ Agent Trace และ Analysis mode
3. ถ้าโหมดเป็น rule fallback ให้บอกตามจริง หากใช้โมเดลได้จึงนับเป็น model investigation
4. Approvals → ตรวจหลักฐาน → ใส่ผู้ตรวจทาน → “อนุมัติบล็อก 10 นาที” → ตรวจ IP อีกครั้ง → “ยืนยันบล็อก IP”
5. ณจุดนี้เพิ่มกฎแล้ว แต่ยังไม่ verified ต้องให้ Neo ส่งคำขอใหม่

### 6. Neo ส่งคำขอใหม่ — ควร HTTP 403

```sh
curl --connect-timeout 5 --max-time 15 -i -sS -X POST "$SENTINEL_URL/api/demo/traffic" \
  -H 'Content-Type: application/json' -d '{}'
```

ควรได้ `decision: denied` และ `source_ip` เป็น IP เดิมของ Neo หน้า M5 เปลี่ยน incident เป็น Verified blocked และ Reports มีหลักฐาน request ใหม่ กฎบล็อกเฉพาะ demo application

### 7. ตรวจการปฏิเสธหรือปลดบล็อก

- ถ้า M5 เลือก Reject proposal ต้องไม่เพิ่มกฎ และคำสั่งข้อ 2 ควรได้ 200
- ถ้า Approve แล้ว M5 เลือก Unblock/Remove rule ใน Rules ให้ Neo รันข้อ 2 อีกครั้ง ควรกลับเป็น 200
- กฎปัจจุบันมีอายุ 10 นาที เมื่อหมดอายุ request ควรกลับมา allowed ผล verified ของเหตุการณ์เป็นหลักฐานในอดีต ไม่ได้แปลว่ากฎยัง active

## SSH / Port scan — log replay จากเครื่อง M5 เท่านั้น

Detector สองอย่างนี้รับ synthetic events อยู่ใน MVP ยังไม่มี SSH server หรือ network sensor ที่จับการ scan จริงโดยอัตโนมัติ การสแกนด้วยคำสั่ง network จาก Neo จึงไม่รับประกันว่าจะเปิด incident

รันจาก Terminal **บน M5** หรือใช้หน้า Demo Lab ห้ามแจก admin key ให้เครื่องผู้ทดสอบ:

```sh
# SSH brute-force log replay
curl -sS -X POST 'http://127.0.0.1:8000/api/simulations' \
  -H 'Content-Type: application/json' \
  -d '{"scenario":"ssh_brute_force_logs","source_ip":"192.0.2.61"}'

# Port scan replay: 9 distinct destination ports
curl -sS -X POST 'http://127.0.0.1:8000/api/simulations' \
  -H 'Content-Type: application/json' \
  -d '{"scenario":"port_scan","source_ip":"192.0.2.62"}'

# Normal replay: should not open a new incident
curl -sS -X POST 'http://127.0.0.1:8000/api/simulations' \
  -H 'Content-Type: application/json' \
  -d '{"scenario":"normal","source_ip":"192.0.2.63"}'
```

IP 192.0.2.x เป็น source จำลองสำหรับ replay อย่าสับสนกับ IP ของ Neo จริง

## หมุดลูกโลก

- Live network: ข้อมูล source IP และสถานะจาก backend; ยังไม่ได้เชื่อมบริการ GeoIP
- Neo · demo location: ใช้ source ที่บันทึกในระบบและสถานะ incident แต่พิกัดเมืองกำหนดเพื่อเดโม ติดป้าย DEMO
- Sample external IP: ใช้ TEST-NET `203.0.113.42` เป็นตัวอย่างภาพ สีแดง/เขียวเป็นสถานการณ์จำลอง ไม่ได้ส่งคำขอหรือสร้างผลวิเคราะห์ AI
- เมื่อเป็น finding จากโมเดลจริงจะแสดง AI finding recorded; fallback/rule alert ไม่แสดงเป็นผล AI
- IP ภายใน LAN ไม่มีพิกัด GeoIP อัตโนมัติ และ Public IP geolocation เป็นตำแหน่งโดยประมาณ ไม่ใช่ GPS

## Checklist สองเครื่อง

M5 และ Neo ต้องติดต่อกันได้, M5 รับ TCP 8000, ใช้ IP ที่ถูกต้อง, ทดสอบ 200 → 401 ×6 → คนอนุมัติ → request ใหม่ 403 → ปลดกฎ 200 และตรวจ source_ip ไม่ใช่ loopback ก่อนนำเสนอจริง
