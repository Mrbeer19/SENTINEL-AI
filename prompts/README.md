# Prompt แยกคนและเฟส

เปิดไฟล์ของคนรับงาน คัดลอกเนื้อหาทั้งไฟล์ไปวางใน Codex หรือ Claude ที่เปิด checkout ของ repository นี้อยู่ เริ่ม Phase 0 แล้วตรวจรับงานก่อนปลด dependency ของเฟสถัดไป

| Phase | เป้าหมาย | Obeto | Beer |
|---|---|---|---|
| 0 | Contract, UI shell, model baseline | [B00](phases/phase-0-obeto.md) | [F00 + M00](phases/phase-0-beer.md) |
| 1 | Ingestion, detection, dashboard | [B01–B03](phases/phase-1-obeto.md) | [F01](phases/phase-1-beer.md) |
| 2 | Investigation, tools, model evaluation | [B04–B05](phases/phase-2-obeto.md) | [F02 + M01](phases/phase-2-beer.md) |
| 3 | Approval, defense, verification | [B06–B07](phases/phase-3-obeto.md) | [F03](phases/phase-3-beer.md) |
| 4 | Integration, metrics, rehearsal | [B08–B09](phases/phase-4-obeto.md) | [F04–F05](phases/phase-4-beer.md) |

โค้ดใน repository เป็นจุดเริ่มต้น: ให้ตรวจของเดิมเทียบ acceptance ก่อนแก้ อย่าเขียนทับทั้งหมดหรืออ้างว่า task ผ่านเพราะเห็นไฟล์อยู่แล้ว

ใช้ task เดี่ยวกับ CLI ได้ เช่น:

```powershell
python bot/export_task.py B00 | codex exec -
python bot/export_task.py F00 | claude -p "Implement the task described in the piped input"
```

หรือส่งไฟล์ prompt รายเฟสผ่าน stdin ใน PowerShell:

```powershell
Get-Content -Raw -Encoding utf8 prompts/phases/phase-0-obeto.md | codex exec -
Get-Content -Raw -Encoding utf8 prompts/phases/phase-0-beer.md | claude -p "Implement the phase described in the piped input"
```

ห้ามให้สอง CLI แก้ working directory เดียวกันพร้อมกัน ให้แต่ละคน clone ของตนเอง ทำ feature branch, ส่ง commit/PR และตรวจ API contract ก่อนรวมงาน

หลัง AI ทำเสร็จ ผู้สั่งต้องอ่าน diff, รัน acceptance, ส่งหลักฐานผ่าน `/submit` แล้ว `/selfcheck` งานที่รับแทนเพื่อนต้องให้เจ้าของ pipeline `/approve` ด้วย

ถ้าแก้แผนใน `bot/config/tasks.json` ให้สร้าง prompt ใหม่:

```powershell
python bot/generate_prompts.py
python bot/generate_phase_prompts.py
python bot/generate_workstreams.py
```
