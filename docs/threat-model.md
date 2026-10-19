# Threat model — SENTINEL AI backend

ขอบเขต: backend บน M5 ระหว่างเดโมใน private LAN (hotspot) มี Neo เป็นผู้โจมตี · อ้าง OWASP Top 10 for Agentic Applications 2026 (ASI01–ASI10) และ STRIDE · อัปเดต 20 ต.ค. 2569

## สิ่งที่ต้องปกป้อง

1. **การตัดสินใจบล็อก** — ห้ามบล็อกคนที่ไม่ควรโดน (gateway, M5, ผู้ใช้ปกติ) และห้ามปลดบล็อกผู้โจมตีโดยไม่ได้รับอนุญาต
2. **ความถูกต้องของหลักฐาน** — event, trace, audit ต้องไม่ถูกแก้ย้อนหลังโดยไม่มีใครรู้
3. **ความพร้อมของเดโม** — เครื่องไม่ล่มเพราะโดนยิง

## ขอบเขตความไว้ใจ

| โซน | ไว้ใจ? | หมายเหตุ |
|---|---|---|
| Neo / LAN | ไม่ | ส่ง request ได้แค่ endpoint demo + health |
| ข้อความใน log (username ฯลฯ) | ไม่ | ผู้โจมตีพิมพ์เอง แล้วไหลเข้าโมเดล |
| ผลจากโมเดล | ไม่ | ต้องผ่าน schema + policy ทุกครั้ง |
| localhost (ผู้ดูแลบน M5) | ใช่ | ตัดสิน approve/reject/reset |
| ไฟล์กฎ + prompt ใน repo | ใช่ | ผ่าน PR review |

## OWASP Top 10 for Agentic Applications 2026

| รหัส | ความเสี่ยง | เกี่ยวกับเราไหม | ทางกัน | หลักฐาน |
|---|---|---|---|---|
| ASI01 | Agent Goal Hijack | **ใช่** — username ใน log สั่งโมเดลให้บล็อก IP อื่น | log ห่อเป็น `untrusted_log_records` + prompt สั่งห้ามทำตาม · policy: `target_ip` ต้องเท่ากับ source ของ incident · คนอนุมัติ | `test_goal_hijack_cannot_redirect_block_to_another_ip` · benchmark injection 0/3 (RTX) |
| ASI02 | Tool Misuse & Exploitation | **ใช่** | tool 5 ตัว allowlist, ตรวจ args, scope IP/incident ฝั่ง server, `propose_block_ip` แค่ pre-check · เพดาน 6 ครั้ง | `agent.py: run_tool` |
| ASI03 | Identity & Privilege Abuse | ใช่ — Neo พยายามใช้ API ผู้ดูแล | API ทั้งหมด (อ่าน+เขียน, `/ws`) เฉพาะ localhost หรือ `X-Admin-Key` · โมเดลไม่มีสิทธิ์ execute | `test_remote_peer_cannot_read_soc_api_or_websocket` |
| ASI04 | Supply Chain Vulnerabilities | บางส่วน | โมเดลจาก Ollama library เท่านั้น · บันทึก `model_digest` ในทุกผล · dependency pin ช่วงเวอร์ชันใน requirements | `analysis_meta.model_digest` |
| ASI05 | Unexpected Code Execution | ต่ำ | ไม่มี shell/eval tool · กฎ YAML อ่านด้วย `safe_load` และ field ที่ใช้ใน SQL จำกัด allowlist | `detection.py: SELECTABLE` |
| ASI06 | Memory & Context Poisoning | ต่ำ | ไม่มี memory ข้ามรอบ แต่ละ incident เริ่ม context ใหม่ · log จำกัด 40 แถว/username 64 ตัว | `agent.py: LOG_LIMIT` |
| ASI07 | Insecure Inter-Agent Communication | ไม่เกี่ยว | มี agent ตัวเดียว (ถ้าเพิ่ม critic agent ต้องกลับมาประเมิน) | — |
| ASI08 | Cascading Failures | ใช่ — โมเดลล่ม/ช้า | timeout 90 วิ · ผิด schema retry 1 ครั้ง → `rule_fallback` ที่ยังต้องคนอนุมัติ · ไม่บล็อกอัตโนมัติ · กฎหมดอายุเสมอ | `test_extra_keys_and_twice_invalid_fall_back_to_rules` |
| ASI09 | Human-Agent Trust Exploitation | ใช่ — คนเชื่อ AI เกินไป | proposal แสดง `source` (model/fallback), `confidence`, evidence, policy_notes · confidence ไม่ใช้แทนการอนุมัติ · ผลโมเดลเสนอบล็อกคนปกติได้ (วัดได้ 1/28) จึงต้องมีคนตัดสินเสมอ | contract: Analysis |
| ASI10 | Rogue Agents | ต่ำ | agent ไม่มีสิทธิ์เปลี่ยนสถานะ/กฎเอง ทุกการกระทำผ่าน `transition()` + audit · ตรวจย้อนหลังด้วย audit chain | `test_audit_chain_detects_tampering` |

## STRIDE (backend)

| | ภัย | ทางกัน |
|---|---|---|
| **S**poofing | Neo ส่ง `source_ip` ปลอมใน body | ใช้ IP จาก connection เท่านั้น · override ได้จาก localhost |
| **S**poofing (ผ่านเบราว์เซอร์บน M5) | เว็บอื่นที่เปิดบน M5 ยิง POST มาที่ `127.0.0.1` แล้วได้สิทธิ์ localhost (CSRF) · ชื่อโดเมนของผู้โจมตีชี้มา 127.0.0.1 (DNS rebinding) | POST/PUT/PATCH/DELETE ที่มี `Origin` ไม่ใช่ host ที่อนุญาต → 403 · `TrustedHostMiddleware` (`localhost`, `127.0.0.1` + `SENTINEL_ALLOWED_HOSTS`) → 400 · Beer เจอ 20 ต.ค. แก้แล้ว |
| **T**ampering | แก้ event/audit ใน DB | audit hash chain + `/api/audit/verify` (DB อยู่บน M5 ไม่เปิดให้ LAN) |
| **R**epudiation | "ใครกดอนุมัติ" | `reviewer` + audit `rule_applied` |
| **I**nformation disclosure | Neo แอบดูหน้า SOC/WS · เว็บอื่นบน M5 เปิด `ws://127.0.0.1/ws` อ่านข้อมูล SOC (CORS ไม่คุม WebSocket) | อ่าน API/WS ได้เฉพาะ localhost/admin key · WS ที่ `Origin` ไม่ใช่ host ที่อนุญาตถูกปิด · `/docs` ปิดจาก LAN · ไม่เก็บ password |
| **D**enial of service | ยิงรัวจนเครื่องค้าง | rate limit demo endpoint 30/10 วิ/IP (ลืม IP ที่หมดหน้าต่างเมื่อเกิน 1000 IP) · username >1024 / log >1000 บรรทัด ถูกปฏิเสธ (422) · ยังไม่ได้จำกัดขนาด body ระดับ server |
| **E**levation of privilege | โมเดลสั่งบล็อกเอง | โมเดลไม่มี tool ที่เปลี่ยนสถานะ · policy + human approval |

## ความเสี่ยงที่ยอมรับ (ไม่ได้แก้ในขอบเขตเดโม)

- `X-Admin-Key` เป็นกุญแจเดียว ไม่มีบัญชีผู้ใช้/role · ใช้ใน private LAN เท่านั้น
- HTTP ไม่เข้ารหัสใน LAN · ห้ามเปิดสู่ internet
- rate limit เก็บในหน่วยความจำ restart แล้วรีเซ็ต
- audit chain กันการแก้โดยไม่รู้ตัว แต่คนที่เข้าถึงเครื่อง M5 ได้เขียนทับทั้ง chain ใหม่ได้ (ไม่มี anchor ภายนอก)
- โมเดลขนาด 4B โดน injection รูปแบบใหม่ได้ — ด่านจริงคือ policy + คน ไม่ใช่โมเดล
