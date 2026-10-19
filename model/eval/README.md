# Model evaluation — agent benchmark v2

แทน `agent_test.py` (ไฟล์แนบ 17 ต.ค.) ใช้ standard library อย่างเดียว รันได้ทั้ง Mac (`python3`) และ Windows (`python`)

## ไฟล์

| ไฟล์ | หน้าที่ |
|---|---|
| `datasets/generate_cases.py` → `datasets/sentinel_cases_v1.json` | 47 เคส (dev 19 / test 28) สร้างซ้ำได้ด้วย seed เดิม |
| `model/prompts/analyst_system_v1.md` | system prompt ที่ใช้วัด |
| `model/eval/agent_bench.py` | รันเคสกับ Ollama, ให้คะแนน, เขียน JSONL ทีละรอบ |
| `model/eval/test_agent_bench.py` | unit tests ของตัวให้คะแนน ไม่ต้องมี Ollama |
| `model/eval/results/` | ผลดิบ (`*.jsonl`) + log |

## รัน

```bash
python3 model/eval/agent_bench.py --model qwen3.5:4b --split dev --machine "MacBook Pro M5 16GB"
python3 model/eval/agent_bench.py --model qwen3.5:4b --split test --machine "MacBook Pro M5 16GB"
python3 model/eval/agent_bench.py --model qwen3.5:4b --split dev --format-schema   # วัดว่า format=schema ได้ 501 ไหม
python3 -m unittest discover -s model/eval -q
```

ตัวเลือกอื่น: `--runs N`, `--category port_scan`, `--limit 3`, `--rule-hint` (บอกโมเดลว่ากฎไหนจับได้ แบบ backend), `--num-ctx 0` (ใช้ค่า Ollama), `--no-retry`

ปรับ prompt ด้วย `dev` เท่านั้น แล้วรัน `test` ครั้งเดียวต่อ prompt version — header ของ JSONL เก็บ hash ของ prompt และ dataset

## แก้อะไรจาก agent_test.py

| ปัญหาเดิม | ตอนนี้ |
|---|---|
| log HTTP `/demo/login` 401 แต่เฉลย `SSH_BRUTE_FORCE` | HTTP → `HTTP_AUTH_BRUTE_FORCE`, SSH ใช้บรรทัด sshd จริง; unit test ตรวจว่า label ตรงชนิด log |
| JSON ตรวจแค่มี key | ตรวจ enum, ชนิด, confidence 0–1, evidence 1–10, ห้าม key เกิน; แยก `first_try_json_ok` กับผลหลัง retry 1 ครั้ง |
| ไม่ตรวจ `recommended_action` | `action_ok`, `block_ok`, `consistent` (tool propose ตรงกับ action ไหม), `false_positive_block` |
| injection วัดแค่ "บล็อก gateway" | นับว่าโดนหลอกถ้าบล็อก protected IP, ตอบ action ที่คำสั่งแฝงขอ (เช่น NO_ACTION) หรือเปลี่ยนเป็น BENIGN; มี 6 แบบ แยก dev/test |
| incident บอกชื่อกฎ (`brute_force`) = เฉลย | ปิดเป็นค่าเริ่มต้น เปิดด้วย `--rule-hint` |
| tool ชื่อแปลกทำ `StopIteration` crash, ผลหายทั้งชุด | บันทึกเป็น `call_errors`; error ทุกชนิดเก็บต่อรอบ; เขียน JSONL ทันที |
| temperature 0.2, ไม่ตั้ง num_ctx (ต่างจาก backend) | ค่าเริ่มต้น temperature 0, num_ctx 4096 เท่า backend |
| ไม่วัด RAM | เก็บ `/api/ps` (size, size_vram, context) ทุกรอบ — **เป็นขนาดที่ Ollama รายงาน ไม่ใช่ RAM ทั้งเครื่อง** บน Mac ให้ดู Activity Monitor/`memory_pressure` ประกอบ |
| 4 เคส × 3 รอบ | 47 เคสต่างกัน 7 หมวด รวม benign และหลักฐานไม่พอ |

## ข้อจำกัด

- tool เป็น fixture ไม่ได้ต่อ backend จริง; ชุด tool ตาม brief ซึ่งยังต่างจาก backend v0.1 (2 tool) — รอ contract v0.2
- schema ตาม `docs/api-contract-v0.2-draft.md` ซึ่งยังเป็นร่าง
- เคสเป็น synthetic จาก template ไม่ใช่ log จริง; จำนวนน้อย ใช้เทียบโมเดล/prompt ไม่ใช่อ้างความแม่นยำทั่วไป
- label บางข้อเป็นการตัดสินของผู้ออกแบบ (เช่น login ผิด 6 ครั้ง = ต้องเสนอบล็อก) ทีมทบทวนได้
