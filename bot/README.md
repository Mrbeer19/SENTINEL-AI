# SENTINEL AI Discord Task Bot

บอตนี้แจกจ่ายงานตาม **pipeline แยกสองคน** และ phase ของโครงการ โดยไม่รัน AI CLI แทนสมาชิก คนที่กดรับงานเป็นผู้สั่ง Codex หรือ Claude บนเครื่องตนเอง และต้องอ่าน diff/ทดสอบก่อนกด `/selfcheck`

## ตั้งค่า

1. สร้าง Bot Token ใน Discord Developer Portal แล้วใส่เฉพาะ [secrets/.env](secrets/.env) บรรทัด `DISCORD_TOKEN=` อย่าส่ง token ในแชตหรือ commit ไฟล์นี้
2. หากบอตอยู่ในเซิร์ฟเวอร์เดียว ปล่อย `DISCORD_GUILD_ID=` ว่างได้ บอตจะ sync slash commands ให้เซิร์ฟเวอร์นั้นเอง หากอยู่หลายเซิร์ฟเวอร์ ให้ใส่ Server ID ที่ต้องการ
3. เปิด PowerShell ใน `C:\ProjectJhanball` แล้วรัน:

   ```powershell
   python -m venv bot/.venv
   .\bot\.venv\Scripts\python.exe -m pip install -r bot/requirements.txt
   .\bot\.venv\Scripts\python.exe bot/main.py
   ```

4. ใน Discord ให้ผู้ที่มีสิทธิ์ **Manage Server** ใช้ `/setup` แล้วเลือก `backend_member` = **@obeto.** และ `frontend_member` = **@btrx_beer** จากเมนูแท็กคน คำสั่งนี้บันทึก ID ลง `config/team.json` โดยไม่ต้องคัดลอก ID มาทางแชต
5. ใช้ `/setchannels` แล้วเลือกห้อง backend ของ Obeto และห้อง frontend/model ของ Beer จากเมนูเลือกช่อง บอตจะส่งการมอบหมายและอัปเดตงานไปยังห้องเจ้าของ pipeline

บอตใช้ slash commands และไม่ได้อ่านข้อความทั่วไปในห้อง จึงไม่ต้องเปิด Message Content Intent คำสั่งถูก sync เฉพาะเซิร์ฟเวอร์ที่กำหนด ตามแนวทาง [Discord application commands](https://docs.discord.com/developers/interactions/application-commands) และตัวอย่าง [discord.py](https://github.com/Rapptz/discord.py/blob/master/examples/app_commands/basic.py) ถ้า `python -m venv` ใช้งานไม่ได้ใน sandbox ให้สร้าง venv จาก PowerShell ปกติบนเครื่องตนเองตามขั้นตอนข้างบน

## คำสั่งทีม

| คำสั่ง | ใช้เมื่อ |
|---|---|
| `/board` | ดูความคืบหน้าทุก phase/pipeline |
| `/setchannels` | ผู้ดูแลเลือกห้องแจกงานของ Obeto และ Beer |
| `/available free:true/false` | แจ้งว่ารับงานได้หรือไม่ |
| `/next` | ดูงานที่ dependencies ผ่านแล้ว; งานของตัวเองมาก่อน และงานเพื่อนรับแทนได้ |
| `/assign` | ให้บอตเลือกและจองงานถัดไปให้อัตโนมัติ |
| `/claim task_id:B00` | เลือกรับงานเองและรับคำสั่ง AI CLI |
| `/task task_id:B00` | ดูเกณฑ์ผ่านและสถานะ |
| `/prompt task_id:B00` | รับไฟล์ prompt ของงาน |
| `/submit task_id:B00 artifact:... tests:...` | ส่งไฟล์/PR และผลทดสอบของ AI |
| `/selfcheck task_id:B00 review_note:...` | ผู้สั่ง AI ยืนยันว่าอ่าน diff และทดสอบเอง |
| `/approve task_id:B00` | เจ้าของ pipeline ตรวจรับงานที่เพื่อนทำแทน |
| `/changes task_id:B00 reason:...` | เจ้าของ pipeline ส่งงานที่เพื่อนทำแทนกลับไปแก้ |

งานมีสถานะ `ready → in_progress → self_review → done` หากรับแทนเพื่อน จะมี `owner_review` หลัง self-review ก่อน done งานที่พึ่งพากันจะเปิดรับได้เมื่อ dependency เป็น `done` เท่านั้น

## สั่ง Codex หรือ Claude

เปิด PowerShell ในโฟลเดอร์โปรเจกต์บนเครื่องของตน แล้วใช้คำสั่งที่บอตส่ง เช่น:

```powershell
python bot/export_task.py B00 | codex exec -
```

หรือ

```powershell
python bot/export_task.py B00 | claude -p "Implement the task described in the piped input"
```

คำสั่งนี้ส่ง prompt จาก [config/tasks.json](config/tasks.json) ให้ AI CLI บนเครื่องของสมาชิก **บอตไม่เรียก CLI และไม่แก้โค้ดเอง** ผู้รับงานต้องตรวจไฟล์ ผลทดสอบ และความตรงตามเกณฑ์ก่อน `/selfcheck` รูปแบบ stdin ของ Codex และ Claude อ้างอิง [OpenAI Docs](https://developers.openai.com/cookbook/examples/codex/build_iterative_repair_loops_with_codex) และ [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code/cli-usage)

## ไฟล์สำคัญ

- [config/tasks.json](config/tasks.json): งาน, phase, dependency, prompt และเกณฑ์ผ่าน
- [config/team.json](config/team.json): ชื่อ/Discord ID ของเจ้าของ pipeline
- [data/state.json](data/state.json): สถานะงานที่บอตสร้างขณะรัน; ถูก ignore จาก Git
- [secrets/.env](secrets/.env): Bot Token; ถูก ignore จาก Git
- [PIPELINES.md](PIPELINES.md): แผนงานอ่านง่ายสำหรับทีม

ข้อมูล state อยู่บนเครื่องที่รันบอต ต้องสำรอง `data/state.json` หากย้ายเครื่อง การเปิดบอตพร้อมกันสอง instance บน state เดียวกันไม่รองรับ
