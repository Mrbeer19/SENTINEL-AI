# ต่อ SENTINEL เข้า server จริง (โหมด feed log + enforce)

SENTINEL MVP ป้องเฉพาะ demo endpoint ของตัวเอง ส่วนนี้คือวิธีให้มันช่วยป้องเว็บ/เซิร์ฟเวอร์จริงหนึ่งตัว โดยไม่เปิด SOC สู่สาธารณะ

## ภาพรวม
วาง **reverse proxy** (nginx/Caddy/แอปเอง) ไว้หน้า server จริง ทำ 2 อย่าง:
1. **ส่ง event** ของ auth จริงเข้า SENTINEL เพื่อให้ตรวจจับ (`POST /api/events`)
2. **ถามก่อนปล่อยผ่าน** ว่า IP นี้ถูกบล็อกไหม (`POST /api/enforce`) → ถ้าบล็อกคืน 403 ถ้าไม่ก็ forward ไป server จริง

ทั้งสอง endpoint เป็น admin-only: ตั้ง `SENTINEL_ADMIN_KEY` แล้ว proxy แนบ header `X-Admin-Key` ทุกครั้ง เครื่องอื่นที่ไม่มี key เรียกไม่ได้

## 1. เปิด SENTINEL ด้วย admin key
```sh
SENTINEL_ADMIN_KEY=<สุ่มคีย์ยาวๆ> SENTINEL_MODEL=sentinel-qwen3.5-4b-r2:latest \
  make -C backend run-lan HOST=<IP ที่ proxy เรียกถึง>
```

## 2. proxy ส่ง auth event เข้า detection
เมื่อ login ของเว็บจริงสำเร็จ/ล้มเหลว ให้ยิง event (source_ip = IP จริงของผู้ใช้ จาก X-Forwarded-For):
```
POST /api/events   (X-Admin-Key: <key>)
{ "source_ip": "<client ip>", "event_type": "HTTP_AUTH", "outcome": "failed" }
```
ครบเกณฑ์กฎ (เช่น ผิด ≥5 ครั้ง/60 วิ) SENTINEL เปิด incident → คนวิเคราะห์+อนุมัติบล็อกบน dashboard

## 3. proxy ถาม enforce ต่อ request
```
POST /api/enforce   (X-Admin-Key: <key>)
{ "client_ip": "<client ip>" }
→ 200 { "decision": "allowed", "rule_id": null }   → forward ไป server จริง
→ 403 { "decision": "denied",  "rule_id": 12 }     → proxy คืน 403 ไม่ forward
```
request ที่ถูกบล็อกจะ flip incident เป็น `verified` อัตโนมัติ (เหมือน demo แต่เป็น traffic จริง)

ตัวอย่าง middleware (Express) หน้า server จริง:
```js
app.use(async (req, res, next) => {
  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket.remoteAddress;
  const r = await fetch("http://<sentinel>:8000/api/enforce", {
    method: "POST", headers: { "Content-Type": "application/json", "X-Admin-Key": process.env.SENTINEL_KEY },
    body: JSON.stringify({ client_ip: ip }),
  });
  if (r.status === 403) return res.status(403).send("blocked");
  next();
});
```

## ข้อควรรู้
- source IP ที่บันทึก = `client_ip` ที่ proxy ส่งมา → proxy ต้องอ่าน IP จริงจาก `X-Forwarded-For` ให้ถูก ไม่งั้นบล็อกโดน proxy เอง
- ใส่ IP ของ proxy/server เองใน `SENTINEL_PROTECTED_IPS` กันเผลอบล็อกตัวเอง
- enforce ถามต่อ request = เพิ่ม latency เล็กน้อย; จะ cache ผล allow ฝั่ง proxy สั้นๆ ก็ได้ แต่ผล deny ควรถามสด
- ยังเป็น app-level: บล็อกที่จุด proxy ไม่ใช่ host firewall · ป้องได้เฉพาะ traffic ที่วิ่งผ่าน proxy นี้
