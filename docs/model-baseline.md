# Qwen 3.5 4B — บันทึกเริ่มต้นของ Beer

โมเดลหลักที่เลือก: **`qwen3.5:4b` ผ่าน Ollama** ตั้งค่าได้ด้วย `SENTINEL_MODEL` ของ backend เริ่ม context 4096 และ temperature 0 ใช้ text/tool calling เป็นหลัก

## ข้อมูลที่วัดบนเครื่องวันที่ 16 ตุลาคม 2569

| รายการ | ค่า |
|---|---|
| GPU | NVIDIA GeForce RTX 4060 |
| GPU memory รวม | 8188 MiB |
| Ollama | 0.32.15 |
| Model ID ที่ `ollama ps` แสดง | d8b0f5e9760c |
| Context ที่โหลด | 4096 |
| Processor | 100% GPU |
| Model process size ที่ Ollama แสดง | 3.1 GB |
| GPU memory used ทั้งเครื่องหลังทดสอบ | 4799 MiB; รวมโปรแกรมอื่นด้วย |
| Warm end-to-end analysis หนึ่งกรณี | 12.106 วินาที |
| Tool calls จริง | get_recent_events, get_active_rules |
| Structured output | Pydantic validation ผ่านหนึ่งกรณี |

ตัวเลขนี้ยังไม่ใช่ benchmark หลายตัวอย่าง และ process size ไม่ใช่ขนาดไฟล์ download หรือ VRAM peak ของโมเดลเพียงตัวเดียว

## Prompt/runtime ปัจจุบัน

ดู `backend/app.py` ฟังก์ชัน `analyze` และ `call_model`: ให้ local SOC analyst ใช้ read-only tools อ่าน evidence, ไม่อ้างว่าบล็อกสำเร็จ, แล้วคืน classification/severity/summary/evidence/recommendation ผ่าน schema `AnalysisOut` Backend ผูกขอบเขต tool กับ IP ของ incident และไม่ส่ง evaluation label ให้โมเดล

## งาน M00/M01 ที่ Beer ต้องทำต่อ

1. วัด cold/warm latency หลายรอบ, peak VRAM, RAM และ JSON/tool validity บน cases ที่แยกไว้
2. บันทึก Ollama/model tag+ID และ prompt version เพื่อทำซ้ำ
3. แบ่ง development/validation/test ก่อนปรับ prompt; ไม่ให้โมเดลเห็น expected labels ใน input
4. เทียบ baseline กับ prompt tuning แล้วค่อยตัดสินใจ fine-tune จากทรัพยากรที่วัดได้
5. ถ้าฝึกจริง เก็บ data provenance, training config, artifact reference และผล held-out เทียบ baseline

ยังไม่มีผล fine-tuning ใน repository นี้ และไม่ถือว่า task M00/M01 เสร็จจาก smoke test เดียว

อ้างอิง tag และความสามารถ: [Qwen 3.5 ใน Ollama](https://ollama.com/library/qwen3.5), [รายการ tags](https://ollama.com/library/qwen3.5/tags)
