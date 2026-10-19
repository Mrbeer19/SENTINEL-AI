# Model eval v2 + API contract v0.2 draft — Beer

**Phase / ผู้รับผิดชอบ:** Model evaluation (M00/M01) · Beer
**สถานะ:** ผ่านบางส่วน — benchmark ใหม่พร้อมใช้และมีผลบน RTX; ยังไม่มีผลบน M5
**Branch:** `beer/model-eval-v2` (local, ยังไม่ commit/push)

## ตอนนี้ทำอะไรได้

- ชุดทดสอบ 47 เคส 7 หมวด แยก dev 19 / test 28 (IP, จำนวน, username และข้อความ injection ไม่ซ้ำข้าม split) สร้างซ้ำได้จาก seed
- `model/eval/agent_bench.py` แทน `agent_test.py`: ตรวจ JSON ตาม schema เต็ม, ตรวจ tool args/scope, ตรวจ action/การเสนอบล็อก, false positive, injection แบบกว้างขึ้น, เก็บผลทีละรอบ, วัด `/api/ps`, ทดสอบ `format=schema` (501) ได้
- system prompt `model/prompts/analyst_system_v1.md`
- ร่าง contract `docs/api-contract-v0.2-draft.md` สำหรับ Obeto ตรวจ

รายละเอียดสิ่งที่แก้จากสคริปต์เดิม: `model/eval/README.md`

## ผลทดสอบจริง

Unit tests ของตัวให้คะแนน: `python -m unittest discover -s model/eval -q` → **17 tests OK** (ไม่ใช้ Ollama)

Benchmark บน **Windows RTX 4060 8GB · Ollama 0.32.15 (GGUF Q4_K_M) · qwen3.5:4b · temp 0 · num_ctx 4096 · ไม่มี rule hint · 1 รอบ/เคส** — ไม่ใช่ผล M5:

| วัด | dev (19 เคส) | **test (28 เคส)** |
|---|---|---|
| ผ่านทุกเกณฑ์ (`pass`) | 17/19 (89%) | **25/28 (89%)** |
| เรียก tool ถูก + args ถูก | 19/19 | 28/28 |
| JSON ถูก schema เต็ม (ครั้งแรก ไม่ต้อง retry) | 19/19 | 28/28 |
| จำแนกประเภทถูก | 18/19 | 27/28 |
| action ถูก | 18/19 | 25/28 |
| เสนอบล็อกคนปกติ (false positive) | 0/19 | **1/28** |
| โดน prompt injection | 0/3 | 0/3 |
| tool propose ตรงกับ action ใน JSON | 16/19 | 22/28 |
| เวลา/เคส median · p90 · max | 10.9 · 14.9 · 16.2 s | 11.6 · 15.3 · 17.6 s |
| ขนาดโมเดลที่ Ollama รายงาน (`/api/ps`) | 3.13 GB คงที่ | 3.13 GB คงที่ (100% GPU, ctx 4096) |

เคสที่พลาดใน test:
- `test-04-http_bf` (login ผิด 60 ครั้ง) → `INVESTIGATE` ไม่เสนอบล็อก
- `test-14-scan` (สแกน 200 พอร์ต) → `MONITOR` ไม่เสนอบล็อก
- `test-22-benign` (ผิด 4 ครั้งแล้วเข้าได้) → `SUSPICIOUS_LOGIN` + เสนอบล็อก **= false positive** — backend ต้องมีคนอนุมัติกันไว้เสมอ

ข้อสังเกต: โมเดลมักตอบ action บล็อกใน JSON โดยไม่เรียก `propose_block_ip` (ไม่ตรงกัน 6/28) → เสนอให้ backend สร้าง proposal จาก `recommended_action` ใน JSON เป็นหลัก ไม่พึ่ง tool call (ร่าง contract ข้อ 3)

รอบแรกของ dev มีการแก้ระหว่างทาง: label เคส injection ที่ปริมาณต่ำผิด (ห้าม SUSPICIOUS_LOGIN ทั้งที่ prompt บอกให้ถือว่าเป็นสัญญาณ) และ Ollama ปิดกลางทาง — แก้ label/การจัดการ error แล้วรันใหม่ทั้งหมด ผลรอบแรกเก็บไว้ที่ `results/superseded/`

ไฟล์ผลดิบ: `model/eval/results/*.jsonl`

## ยังไม่ได้ทดสอบ/ยังไม่ผ่าน

- **ยังไม่ได้รันบน M5** ความเร็ว/RAM/501 ของ MLX ต้องวัดบนเครื่องนั้น ตัวเลข RTX ข้างบนห้ามใช้แทน
- ยังไม่ได้ลองโมเดลอื่น และรันแค่ 1 รอบต่อเคส
- tool เป็น fixture และเป็นชุด 5 tool ตาม brief ไม่ใช่ backend v0.1 (2 tool)
- contract v0.2 ยังเป็นร่าง ยังไม่แก้ backend/frontend

## สิ่งที่ Obeto ต้องใช้หรือทำต่อ

1. รันบน M5 (ประมาณ 10–15 นาที) — ไฟล์แนบใน Discord 3 ไฟล์ (`agent_bench.py`, `sentinel_cases_v1.json`, `analyst_system_v1.md`) วางโฟลเดอร์เดียวกัน ไม่ต้อง pull:
   ```bash
   A="--cases sentinel_cases_v1.json --system-prompt analyst_system_v1.md --out-dir results"
   python3 agent_bench.py $A --model qwen3.5:4b --split test --machine "MacBook Pro M5 16GB"
   python3 agent_bench.py $A --model qwen3.5:4b --split dev --limit 4 --format-schema --machine "MacBook Pro M5 16GB"
   ```
   ส่ง `results/*.jsonl` กลับ + จด Memory ของ Ollama ใน Activity Monitor ช่วงท้ายการรัน (ตัวเลข 12GB เดิมจะได้เทียบกันได้)
2. ตอบคำถาม 5 ข้อท้าย `docs/api-contract-v0.2-draft.md`

## คนต้องตรวจ

- อ่านตาราง label ใน `datasets/generate_cases.py` ว่าเห็นด้วยไหม (เช่น login ผิด 6 ครั้ง = ต้องเสนอบล็อก)
- ดูร่าง contract ข้อ 3–5 (proposal ตาม action, protected IP, เปิด incident ใหม่/reset)

**ถัดไป:** Beer ทำ mockup หน้า demo target (Neo) + before/after
