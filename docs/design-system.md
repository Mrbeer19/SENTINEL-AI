# Design system ของ dashboard

เอกสารนี้สรุปค่าที่ dashboard (`frontend/`) ใช้จริง ทุกค่าดึงมาจากไฟล์ CSS ใน `frontend/src/` ถ้าค่าในไฟล์เปลี่ยน ให้แก้เอกสารนี้ตาม

## หลักการ

1. **สถานะต้องอ่านออกจากสีและข้อความพร้อมกัน** ป้ายสถานะทุกอันมีทั้งสีและคำภาษาไทย ไม่พึ่งสีอย่างเดียว
2. **motion มีไว้บอกว่าระบบทำอะไร ไม่ได้มีไว้ตกแต่ง** ขยับเฉพาะตอนข้อมูลเปลี่ยนจริง เช่น incident ใหม่เข้ามา สถานะเปลี่ยน หรือระบบบล็อกเอง
3. **ทุกระยะเวลาและ easing มาจาก token** ไม่เขียนตัวเลขลงใน component ยกเว้นแอนิเมชันของมาสคอตที่เป็นของตกแต่ง
4. **รองรับผู้ใช้ที่ปิด motion** `prefers-reduced-motion: reduce` ปิดแอนิเมชันและ transition ทั้งหมดใน dashboard (`motion.css`)
5. **สองธีม ค่าเดียวกัน** ธีมมืดเป็นค่าเริ่มต้น ธีมสว่างเปลี่ยนแค่ค่าของ token ใต้ `:root[data-theme="light"]` component ไม่ต้องรู้ว่าอยู่ธีมไหน

## ลำดับไฟล์

CSS โหลดตามลำดับนี้ (`frontend/src/main.jsx`) ไฟล์หลังทับค่าของไฟล์ก่อน

| ลำดับ | ไฟล์ | หน้าที่ |
|---|---|---|
| 1 | `fonts.css` | ฟอนต์จากไฟล์ในเครื่อง ไม่โหลดจาก Google หรือ CDN |
| 2 | `style.css` | โครงหน้า, component พื้นฐาน |
| 3 | `product-theme.css` | ปรับ component ตามแบบของผลิตภัณฑ์ |
| 4 | `mission-control.css` | สีสถานะ (critical / review / ok) และฟอนต์ |
| 5 | `mascot.css` | มาสคอต |
| 6 | `motion.css` | motion token และแอนิเมชัน |
| 7 | `orbit-theme.css` | ธีมปัจจุบัน: สีพื้นผิว, glass, รัศมีมุม และค่า motion ที่ปรับทับ |

ข้อควรรู้: component หลักบางตัว (`.toast`, `.button`, `select`, `.notice`) ถูกแต่งในหลายไฟล์ การแก้ต้องแก้ในไฟล์สุดท้ายที่แต่งตัวนั้น ไม่งั้นจะถูกทับ (เช่นบั๊ก dropdown ตัวอักษรมองไม่เห็นที่แก้ใน #45) การรวมให้เหลือไฟล์ token ไฟล์เดียวเป็นงานหลังสอบ

## สี

### พื้นผิวและตัวอักษร (`orbit-theme.css`)

| token | ธีมมืด | ธีมสว่าง | ใช้กับ |
|---|---|---|---|
| `--page` | `#07060c` | `#e9e7f1` | พื้นหลังนอกสุด |
| `--bg` | `#0d0c14` | `#eceaf3` | พื้นหลังหน้า |
| `--surface` | `#1b1a22` | `#ffffff` | การ์ด, รายการตัวเลือกของ select |
| `--surface-2` | `#262431` | `#f1eff7` | hover ของแถวตาราง |
| `--line` | `#2e2c37` | `#dedbe8` | เส้นขอบ |
| `--text` | `#f2f0f7` | `#141318` | ตัวอักษรหลัก |
| `--text-dim` | `#a3a0b0` | `#5f5b6c` | ตัวอักษรรอง |
| `--accent` | `#b39cff` | `#6d4fd8` | ลิงก์, ปุ่มหลัก, เส้นบอกเมนูที่เลือก, แถบแจ้งเตือน auto-block |
| `--accent-soft` | accent 18% | accent 12% | พื้นของรายการในแถบแจ้งเตือน |

glass (`--glass`, `--glass-strong`, `--glass-soft`, `--glass-line`) เป็นพื้นกึ่งโปร่งใสของการ์ด แถบ และ toast ตัวอักษรบน glass ต้องผ่าน contrast 4.5:1 หลังผสมกับพื้นด้านหลัง

### สีสถานะ (`mission-control.css`)

| ความหมาย | token | ธีมมืด | ธีมสว่าง | สถานะที่ใช้ (`tone()` ใน `lib.js`) |
|---|---|---|---|---|
| ร้ายแรง / ล้มเหลว | `--critical` | `#e5534b` | `#ae3933` | CRITICAL, HIGH, rejected, failed, denied, error |
| รอตัดสิน | `--review` | `#e8c24a` | `#85690e` | MEDIUM, pending, awaiting_approval, needs_review, analyzing |
| สำเร็จ / ป้องกันแล้ว | `--ok` | `#7fa88f` | `#4b7158` | blocked, verified, approved, allowed, success |

แต่ละสีมี `-bg`, `-text`, `-line` คู่กันสำหรับพื้น ตัวอักษร และขอบของป้าย

### สีตามชนิดภัย

`--type-http-brute`, `--type-ssh-brute`, `--type-port-scan`, `--type-anomaly`, `--type-login` แต่ละตัวมี `-bg` และ `-line` ใช้แยกชนิดภัยบน network map และป้ายชนิด โทนอยู่ในตระกูลม่วงเดียวกับ accent เพื่อไม่ชนกับสีสถานะ

## ตัวอักษร (`mission-control.css`, `fonts.css`)

| token | ฟอนต์ | ใช้กับ |
|---|---|---|
| `--font-ui` | IBM Plex Sans + IBM Plex Sans Thai | ข้อความทั่วไป |
| `--font-mono` | JetBrains Mono + IBM Plex Sans Thai | IP, เลข incident, เวลา, ค่า log |
| `--font-tech` | = `--font-ui` | ป้ายเล็กแบบตัวพิมพ์ใหญ่ |

ตัวเลขใช้ `tabular-nums` ทั้งหน้า ตัวเลขที่นับขึ้นลงจึงไม่ขยับความกว้าง

## รูปทรง (`orbit-theme.css`)

| token | ค่า | ใช้กับ |
|---|---|---|
| `--radius` | 12px | ช่องกรอก, select, ปุ่ม |
| `--radius-card` | 22px | การ์ด |
| ปุ่มกลม / ป้าย | 999px | segmented control, ป้ายสถานะ, ช่องค้นหา |
| toast | 18px | toast |
| `--rail-w` | 76px | ความกว้างเมนูด้านซ้ายตอนย่อ |

## Motion (`motion.css`, ปรับทับใน `orbit-theme.css`)

### Easing

| token | ค่า | ใช้เมื่อ |
|---|---|---|
| `--ease-out` | `cubic-bezier(0.25, 1, 0.5, 1)` | ของที่เข้ามา: เริ่มเร็วแล้วค่อยหยุด |
| `--ease-in` | `cubic-bezier(0.5, 0, 0.75, 0)` | ของที่ออกไป: เริ่มช้าแล้วเร่ง |

### ระยะเวลา

| token | ค่าที่ใช้จริง | ใช้กับ |
|---|---|---|
| `--dur-press` | 100ms | กดปุ่ม |
| `--dur-hover` | 150ms | hover แถว, การ์ด, ไอคอนลูกศร |
| `--dur-page-out` | 120ms | หน้าเดิมจางออกตอนเปลี่ยนหน้า |
| `--dur-page-in` | 180ms | หน้าใหม่เข้ามา |
| `--dur-state` | 220ms | สถานะเปลี่ยน, toast, แถบแจ้งเตือน auto-block, รายการที่กดรับทราบแล้วหายไป |
| `--dur-check` | 300ms | เครื่องหมายถูกข้างป้าย approved ในหน้า Approvals |
| `--dur-count` | 400ms | ตัวเลขสถิตินับไปค่าใหม่ (`MotionNumber`), ไอคอนรีเฟรชหมุน |
| `--dur-panel` | 560ms (orbit ทับค่า 80ms ของ motion.css) | การ์ดขึ้นตอนเปิดหน้า |
| `--panel-step` | 60ms (orbit ทับค่า 40ms) | ระยะเหลื่อมระหว่างการ์ดหรือรายการ |
| `--dur-signal` | 600ms | วงสัญญาณเมื่อสถานะเป็น blocked / verified, สีกะพริบบนตัวเลขที่เปลี่ยน |
| `--dur-breathe` | 2s | จุดที่ต้องการความสนใจ (IP ที่รอตัดสินบน network map, จุด CONNECTED, ไอคอนแถบแจ้งเตือน) |
| `--dur-mascot` | 2400ms | มาสคอต |

### รูปแบบที่ใช้

| เหตุการณ์ | การเคลื่อนไหว | token |
|---|---|---|
| เปลี่ยนหน้า | View Transitions: หน้าเดิมจาง หน้าใหม่ fade + เลื่อนขึ้น 6px เมนูกับ header ไม่ขยับ | `--dur-page-out` + `--ease-in`, `--dur-page-in` + `--ease-out` |
| เปิดหน้า | การ์ดขึ้นทีละใบ fade + เลื่อน 8px สูงสุด 6 ลำดับ | `--dur-panel`, `--panel-step` |
| incident / event ใหม่เข้ามาในตาราง | แถวใหม่เลื่อนลงพร้อม fade ครั้งเดียว (`useRowSignals`, `data-arriving`) ไม่ขยับตอนเปิดหน้า | `--dur-state` |
| ระบบบล็อกเอง | แถบแจ้งเตือนเลื่อนลง รายการขึ้นทีละรายการ ไอคอนหายใจ | `--dur-state`, `--panel-step`, `--dur-breathe` |
| กดรับทราบ | รายการจางและเลื่อนขวา 12px ก่อนส่ง request แล้วจึงหาย | `--dur-state` + `--ease-in` |
| สถานะเปลี่ยนระหว่างดู | ป้ายใหม่ scale 0.92 → 1, ถ้าเป็น blocked / verified มีวงสัญญาณ 1 ครั้ง ไม่ขยับตอน render ครั้งแรก | `--dur-state`, `--dur-signal` |
| ตัวเลขสถิติเปลี่ยน | นับไปค่าใหม่และกะพริบสี accent | `--dur-count`, `--dur-signal` |
| toast | fade + เลื่อนขึ้น 12px | `--dur-state` |

### กติกา

- ใช้ `--ease-out` กับของที่เข้า ใช้ `--ease-in` กับของที่ออก
- ไม่ขยับของที่ผู้ใช้ไม่ได้ทำอะไรและข้อมูลไม่ได้เปลี่ยน ยกเว้นจุดที่ต้องการความสนใจซึ่งใช้ `--dur-breathe`
- ไม่ใช้ motion เกิน 600ms กับสิ่งที่ต้องรอ (ยกเว้นการ์ดตอนเปิดหน้าและของที่วนซ้ำ)
- ของใหม่ต้องผ่าน `prefers-reduced-motion` โดยอยู่ใต้ `.nShell` หรือเพิ่มเข้าในกฎกลางของ `motion.css`
- ถ้าต้องหน่วงก่อนส่ง request (เช่นรายการที่กดรับทราบ) ให้ข้ามการหน่วงเมื่อผู้ใช้ปิด motion (`useReducedMotion`)

## การตรวจก่อนรวมโค้ด

1. `npm test` และ `npm run build` ผ่าน
2. เปิด `tests/preview.html?scenario=<ชื่อ>` (ใช้ `npm run dev`) ดูทั้งธีมมืดและสว่าง scenario ที่ใช้บ่อย: `pending`, `blocked`, `verified`, `auto-blocked`, `HONEYPOT`, `offline`
3. ตัวอักษรใน dropdown, select, toast, notice และป้ายสถานะต้องผ่าน contrast 4.5:1 ทั้งสองธีม (ตรวจ 4 พ.ย. 2569: 5 หน้า × 2 ธีม ผ่านทั้งหมด)

## งานหลังสอบ

- รวม token ที่กระจายใน 5 ไฟล์ให้อยู่ไฟล์เดียว แล้วให้ component อ่านจาก token อย่างเดียว
- เปลี่ยน duration ที่ยังเขียนตายตัว (ส่วนใหญ่เป็นแอนิเมชันมาสคอต) ให้ใช้ token
- ป้ายเฉพาะสำหรับการบล็อกอัตโนมัติในรายการ incident
