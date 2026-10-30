# งาน deploy สำหรับ Beer — F06

เป้าหมายคือ URL HTTPS ที่ทีมเปิดใช้งานระบบจริงได้จากอุปกรณ์อื่น เชื่อม FastAPI, WebSocket และ Qwen ได้ พร้อมมีวิธีเปิดระบบใหม่และย้อน version ยังไม่มี URL deployment ที่ตรวจรับในเอกสารนี้

## ทางเลือกที่แนะนำ

**Vercel Hobby สำหรับ React/Vite frontend**: เชื่อม GitHub repository นี้ เลือก root directory `frontend`, build command `npm run build`, output directory `dist` ใช้ URL ของผู้ให้บริการได้โดยไม่ต้องซื้อโดเมนเอง แผน Hobby ใช้สำหรับงานส่วนตัวที่ไม่ใช่เชิงพาณิชย์ตามเงื่อนไขปัจจุบัน

FastAPI/SQLite/Ollama อยู่บนเครื่อง RTX 4060 ของทีม เชื่อมผ่าน tunnel ที่จำกัดสิทธิ์เข้าใช้ เครื่องและบริการต้องเปิดอยู่จึงวิเคราะห์ด้วย Qwen ได้ Frontend ที่ deploy สำเร็จเพียงอย่างเดียวยังไม่ถือว่าระบบครบทำงาน

รูปแบบที่วางแผน: frontend บน Vercel → browser เรียก API/WSS ผ่าน protected tunnel → FastAPI ใน Docker Desktop บนเครื่องทีม → Ollama บน Windows ใช้ RTX 4060 โดยเก็บ SQLite ใน persistent Docker volume ไม่รวม model weights ไว้ใน image

ให้ Beer ประสาน Obeto ทำ Dockerfile/Compose และคู่มือสั่งเปิดชุดบริการเดียว ค่า `OLLAMA_URL` ภายใน container ต้องชี้ไป host เช่น `http://host.docker.internal:11434` ตาม Docker Desktop และต้องทดสอบการเชื่อมจริง การใช้ Docker ไม่ได้ทำให้เครื่อง local เปิดให้ใช้ได้เมื่อปิดเครื่อง ห้ามระบุว่า container ผ่านการทดสอบก่อน build/run จริง

Cloudflare Pages Free เป็นตัวเลือก frontend อีกทางสำหรับ static build ส่วน Render Free รัน web service ได้แต่พักหลังไม่มี traffic 15 นาทีและไม่มี persistent disk ใน free web service จึงต้องออกแบบที่เก็บ SQLite ใหม่หากย้าย backend ไปที่นั่น

## ขั้นตอนของ Beer

1. ตรวจโค้ดปัจจุบัน: API ยังเป็น relative `/api`, WebSocket อิง origin หน้าเว็บ และ Vite proxy มีผลเฉพาะ dev ต้องทำ production routing/config ให้ครบ
2. แยก public configuration เช่น API origin และ WSS URL ออกจาก secrets ค่า `VITE_*` ถูกส่งให้ browser จึงห้ามใส่ bot token, admin key หรือ credential ถาวรในนั้น
3. ประสาน Obeto ให้ backend รองรับ origin ที่อนุญาตและ authentication/access control สำหรับ HTTP กับ WebSocket ก่อนเปิดใช้นอกเครื่อง
4. กั้น backend ปัจจุบันให้ครบก่อนใช้ tunnel เพราะ local management bypass ใน MVP มอง peer เป็น localhost และ reverse proxy อาจทำให้ทุกคนดูเหมือน localhost การเพิ่ม frontend login เพียงหน้าเดียวไม่เพียงพอ
5. หากใช้ Quick Tunnel ให้ถือเป็น URL เดโมชั่วคราว ไม่มี uptime guarantee หากต้องการ API hostname ถาวรให้เลือก named tunnel/host ที่ทีมมีสิทธิ์และระบุค่าใช้จ่ายโดเมนแยกจาก free hosting
6. เชื่อม GitHub กับ hosting ที่เลือกด้วยบัญชีเจ้าของ ตั้ง production branch, public env, HTTPS และ deployment preview ทดสอบโดยไม่ใช้ Vite dev server เป็น production
7. ทดสอบจาก URL จริงบนเครื่องอื่น: access control, API health, WSS handshake/reconnect, simulator→incident→Qwen→approval→403→report, refresh, mobile และ offline/backend error
8. เขียน `docs/deployment.md`: URL/version/date, host settings, public environment names, startup order, ผลทดสอบ, ข้อจำกัดเวลาเปิด GPU และวิธี rollback ส่งสรุปทีมตาม `reports/README.md`

9. ทดสอบ Docker build/start/stop/recreate, SQLite volume persistence, healthcheck และ container→Ollama จริง พร้อมระบุว่า Ollama ใช้ GPU ของ host ตรวจว่าเมื่อ Docker/Ollama/tunnel ปิด เว็บแสดง backend unavailable ที่เข้าใจได้

หากยังไม่มีบัญชีหรือสิทธิ์ hosting ให้เตรียม config/คู่มือจน review ได้ แล้วรายงานส่วนที่รอ ห้ามอ้างว่า deploy สำเร็จจาก local build หรือ preview ในเครื่อง

## เกณฑ์ผ่าน

มี URL ที่ตรวจได้, HTTPS ไม่มี mixed content, API/WSS เชื่อมจริง, ผู้ไม่มีสิทธิ์อ่านข้อมูลหรือสั่ง defense ไม่ได้, ไม่มี secrets ใน bundle/Git, ผ่าน smoke test จริง และมี rollback ที่ทำซ้ำได้

## แหล่งอ้างอิง

- [Vercel Hobby](https://vercel.com/docs/plans/hobby)
- [Vite static deployment](https://vite.dev/guide/static-deploy.html)
- [Cloudflare Pages Git integration](https://developers.cloudflare.com/pages/get-started/git-integration/)
- [Cloudflare Quick Tunnels และข้อจำกัด](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/)
- [Render Free](https://render.com/docs/free)
- [Docker Desktop: เชื่อม container กับ host](https://docs.docker.com/desktop/features/networking/networking-how-tos/)
