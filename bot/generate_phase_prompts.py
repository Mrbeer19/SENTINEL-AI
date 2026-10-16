"""Create copy-ready prompts for each person's project phase."""

from pathlib import Path

from core import Board, task_prompt


def main() -> None:
    board = Board()
    output = Path(__file__).resolve().parent.parent / "prompts" / "phases"
    output.mkdir(parents=True, exist_ok=True)
    members = {"backend": ("obeto", "@obeto."), "frontend": ("beer", "@btrx_beer")}
    for phase in board.plan["phases"]:
        for track, (slug, name) in members.items():
            tasks = [task for task in board.plan["tasks"] if task["phase"] == phase["id"] and task["track"] == track]
            sections = [
                f"# SENTINEL AI — Phase {phase['id']}: {phase['name']} — {name}",
                "",
                "คุณเป็น coding assistant ของสมาชิกทีมคนนี้ ทำงานใน checkout ของ repository SENTINEL-AI ที่เปิดอยู่เท่านั้น อ่าน SENTINEL AI.txt, docs/api-contract.md (ถ้ามี) และโค้ดปัจจุบันก่อนแก้ไข",
                f"เป้าหมายเฟส: {phase['goal']}",
                "",
                "กติกา: ทำงานทีละ task ตามลำดับ dependency; หาก dependency ยังไม่มีหรือยังไม่ผ่านการตรวจรับ ให้รายงานสิ่งที่ขาดและทำเฉพาะส่วนที่ไม่พึ่งพาก่อน อย่าสร้างผลทดสอบหรือผลโมเดลขึ้นเอง",
                "รักษาเส้นแบ่ง HTTP_AUTH_BRUTE_FORCE กับ SSH_BRUTE_FORCE ให้ตรงกับแหล่ง log; firewall ของ MVP เป็น app-level simulator; ทุก action ที่บล็อกต้องรอคนอนุมัติ",
                "ใช้ Qwen 3.5 4B ผ่าน Ollama เป็นโมเดลหลัก วัดการทำงานจริงบน RTX 4060 8GB; Beer เป็นเจ้าของงานเลือก/ปรับ/ประเมินโมเดล และทดลอง fine-tune เฉพาะเมื่อทรัพยากรพอ",
                "",
                "## งานในเฟสนี้",
                "",
            ]
            for task in tasks:
                sections.extend([task_prompt(task), ""])
            sections.extend([
                "## รายงานก่อนส่งให้คนตรวจ",
                "",
                "1. ไฟล์ที่สร้างหรือแก้ และเหตุผลของการแก้",
                "2. คำสั่งรันและทดสอบจริง พร้อมผลที่ได้ (ถ้าไม่ได้รันให้ระบุชัด)",
                "3. หลักฐานตามเกณฑ์ผ่านของแต่ละ task และผลลัพธ์ที่ยังไม่ผ่าน",
                "4. API/ไฟล์ที่อีก pipeline ต้องใช้ รวมถึงข้อขัดแย้งของ contract",
                "5. ข้อจำกัดและงานค้าง ห้ามอ้างว่าเสร็จหรือผ่านโดยไม่มีหลักฐาน",
                "",
                "ผู้สั่ง AI ต้องอ่าน diff และทดสอบเองก่อนกด /submit และ /selfcheck ใน Discord; ถ้าทำแทน pipeline เพื่อน เจ้าของ pipeline ต้อง /approve อีกครั้ง",
                "",
            ])
            path = output / f"phase-{phase['id']}-{slug}.md"
            path.write_text("\n".join(sections), encoding="utf-8")
    print(f"Exported 10 phase prompts to {output}")


if __name__ == "__main__":
    main()
