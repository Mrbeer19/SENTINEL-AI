"""Create one copyable Discord message for each person's project phase."""

from pathlib import Path

from core import PLAN_PATH, read_json


def main() -> None:
    plan = read_json(PLAN_PATH)
    output = Path(__file__).resolve().parent.parent / "prompts" / "phases"
    output.mkdir(parents=True, exist_ok=True)
    members = {"backend": ("obeto", "Obeto"), "frontend": ("beer", "Beer")}
    for phase in plan["phases"]:
        for track, (slug, name) in members.items():
            tasks = [task for task in plan["tasks"] if task["phase"] == phase["id"] and task["track"] == track]
            sections = [
                f"SENTINEL AI | Phase {phase['id']} | {name} | {phase['name']}",
                "",
                "ลงมือทำเฟสนี้ใน checkout ของ SENTINEL-AI ที่เปิดอยู่ ให้คุณวางแผน แก้โค้ด รันทดสอบ แก้จนผ่าน และเขียนรายงาน คนในทีมจะอ่านภาพรวมกับตรวจผล ไม่ต้องใช้คำสั่งบอตจัดการงาน",
                "อ่าน README.md, docs/api-contract.md, รายงานเฟสก่อน และรายละเอียดงานตาม ID ใน bot/config/tasks.json ก่อน ตรวจของเดิมและต่อเติมเฉพาะส่วนที่ขาด เก็บงานของคนอื่นไว้",
                "",
                "งานที่ต้องทำ:",
            ]
            for task in tasks:
                sections.append(f"- {task['id']} {task['title']}: {task['acceptance']}")
            sections.extend([
                "",
                "Qwen หลัก = qwen3.5:4b ผ่าน Ollama; Beer ดูแลโมเดล Obeto เชื่อม backend HTTP demo กับ SSH log replay ต้องระบุให้ตรง Firewall เป็น app-level simulator และต้องรอคนอนุมัติ",
                "อ่าน dependency จากแผน ทำส่วนที่พร้อมก่อน ถ้าติดงานเพื่อนให้ระบุสิ่งที่ต้องรอ ไม่สร้างข้อมูลหรือผลทดสอบทดแทน",
                "รันทดสอบตามเกณฑ์ข้างต้นจริง หากไม่ผ่านให้แก้และรันซ้ำ ห้ามอ้างว่าผ่านถ้าไม่ได้รัน",
                f"เขียน reports/phase-{phase['id']}-{slug}.md: ทำอะไรแล้ว/ไฟล์ที่แก้/คำสั่งและผลเทส/ผ่านหรือติดอะไร/ต้องส่งต่อเพื่อนอะไร พร้อม commit อ้างอิงถ้ามี",
                "ปิดงานด้วยสรุปสั้นพร้อมคัดลอกส่ง Discord: เฟสนี้ระบบทำอะไรได้ → ทดสอบอะไรผ่าน → จุดค้าง → คนต้องตรวจอะไร → เฟสถัดไปเริ่มได้หรือยัง ส่งรายงานเป็นข้อความปกติได้เลย",
            ])
            content = "\n".join(sections) + "\n"
            if len(content) + 12 > 2000:
                raise ValueError(f"Discord prompt exceeds one message: phase {phase['id']} {slug}")
            (output / f"phase-{phase['id']}-{slug}.md").write_text(content, encoding="utf-8")
    print("Exported 10 phase prompts; each fits one Discord message")


if __name__ == "__main__":
    main()
