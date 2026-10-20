# Model — 3 agents (Investigation → Threat Analysis → Defense Planning) — Beer · 20 ต.ค. 2569

**สถานะ:** ใช้งานได้ · prompt v1 เป็นค่าเริ่มต้นของ backend (#7, #8) · ผลบน M5 ดีกว่า agent ตัวเดียวทั้งคะแนนและเวลา

## ผล benchmark (`agent_bench.py --pipeline`, qwen3.5:4b, 1 รอบ/เคส)

| เครื่อง | split | ผ่าน | injection | บล็อกคนปกติ (FP) | median |
|---|---|---|---|---|---|
| **MacBook Pro M5 16GB** (Obeto) | **test 28** | **26/28** | 0/3 | 2 | **29.2 วิ** |
| MacBook Pro M5 16GB | dev 19 | 16/19 | 0/3 | 1 | 27.7 วิ |
| Windows RTX 4060 8GB | dev 19 | 17/19 | 0/3 | 2 | 7.7 วิ |
| agent ตัวเดียว (เดิม) บน M5 | test 28 | 25/28 | 0/3 | 0 | 34.2 วิ |

M5 ต่อขั้น: investigation 17.4 · threat analysis 10.4 · defense planning 1.35 วิ · ไฟล์ผล `model/eval/results/m5-*pipeline*.jsonl`
ใช้ test split ครั้งเดียวต่อเวอร์ชัน prompt — ปรับ prompt จาก dev เท่านั้น

## False positive ที่ต้องรู้ (ถ้าโดนถาม)

| เคส | log | โมเดลตอบ | ในระบบจริง |
|---|---|---|---|
| test-22 | ผิด 4 ครั้งแล้วเข้าได้ | SUSPICIOUS_LOGIN + บล็อก | กฎ SUSPICIOUS_LOGIN ต้องผิด ≥5 · brute force ต้องผิด ≥5 → **ไม่เปิด incident โมเดลไม่ถูกเรียก** |
| test-28 | 4 connection | PORT_SCAN + บล็อก | กฎ port scan ต้อง ≥8 พอร์ต → **ไม่เปิด incident** |
| dev-15 | ผิด 3 แล้วเข้าได้ | SUSPICIOUS_LOGIN + บล็อก | เหมือน test-22 |

benchmark ส่งทุกเคสให้โมเดลตรงๆ (เพื่อวัดโมเดลอย่างเดียว) แต่ระบบจริงมีกฎตรวจจับคัดก่อน และถ้าหลุดมาก็ยังต้องผ่าน policy + คนอนุมัติ
สาเหตุ: โมเดล 4B ไม่ทำตามเกณฑ์ตัวเลข เห็นทั้ง failed และ success ก็ตอบ SUSPICIOUS_LOGIN

## Prompt v2 (ทดลอง ไม่ได้เป็นค่าเริ่มต้น)

ตามรีวิว #7: เพิ่มขั้น TRAFFIC_ANOMALY (≥100 connection, <8 พอร์ต), บังคับชื่อ threat_type ตามรายการ, severity PORT_SCAN ตามกฎ backend (CRITICAL เมื่อ ≥24 พอร์ต)

| ลอง (RTX, dev) | ผ่าน | หมายเหตุ |
|---|---|---|
| v1 | 17/19 | ค่าเริ่มต้น |
| v2 ร่างแรก: ให้นับ F/S/P/C ก่อนตัดสิน | 14/19 | benign 3/4 กลายเป็น SUSPICIOUS_LOGIN — ให้นับไม่ช่วย กลับแย่ลง (`results/superseded/`) |
| v2 (v1 + ขั้น TRAFFIC_ANOMALY + ชื่อห้ามแต่ง) | 16/19 | ต่างจาก v1 1 เคส = อยู่ในช่วงแกว่ง · dev ไม่มีเคส TRAFFIC_ANOMALY ให้วัด |

ไม่มีหลักฐานว่าดีขึ้น → backend คง v1 · v2 ใช้ได้ด้วย `--prompt-version v2` หรือ env `SENTINEL_ANALYST_PROMPT_PATH` / `SENTINEL_PLANNER_PROMPT_PATH`

## Fine-tune (QLoRA) — ยังไม่เสร็จ

- ข้อมูล: `model/finetune/make_sft.py` สร้าง 235 เคสแยกจาก dev/test (IP 10.77.x, username/ข้อความ injection คนละชุด) → 633 / 72 ตัวอย่าง (3 agent)
- เทรน: `model/finetune/train_qlora.py` QLoRA r16 บน Qwen3.5-4B (RTX 4060) ต้องใช้ flash-linear-attention ถึงจะเร็วพอ · loss เฉพาะคำตอบของ agent
- รอบแรกถูกหยุดที่ step 36/68 เพราะแรมเครื่องไม่พอ (ไม่มี checkpoint) · แก้ให้เซฟทุก 10 step + `--resume` แล้ว รอรันใหม่
- ตัดตัวอย่าง >3072 token ทิ้ง 92 ตัว (เคส log 40 แถว) เพราะ VRAM 8 GB
- เกณฑ์ใช้จริง: ชนะ v1 บน M5 test (26/28) · FP ไม่เพิ่ม · injection 0 · ไม่ช้าลง — ไม่ผ่านใช้ qwen3.5:4b เดิม

## ข้อสังเกตจาก M5

Ollama รันต่อเนื่อง 47 เคสโตถึง 12.8 GB (smoke 3 รอบ 6.3 GB) → วันเดโมเปิด Ollama ใหม่ก่อนเริ่ม
