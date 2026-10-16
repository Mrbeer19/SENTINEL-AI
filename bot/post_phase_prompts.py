"""Publish copy-ready phase prompts to the configured project channels once."""

import argparse
import json
import time
import urllib.error
import urllib.request
from pathlib import Path

from core import ROOT, read_json, write_json

LEDGER = ROOT / "data" / "phase_messages.json"


def main():
    parser = argparse.ArgumentParser(description="Check or publish the team's phase prompts")
    parser.add_argument("--publish", action="store_true", help="Send/update the messages on Discord")
    args = parser.parse_args()
    team = read_json(ROOT / "config" / "team.json")["members"]
    prompts = ROOT.parent / "prompts" / "phases"
    intro = (
        "**วิธีทำงาน SENTINEL AI — ใช้ข้อความชุดนี้แทนขั้นตอนรับงานของบอตเดิม**\n"
        "1. เริ่ม Phase 0 ด้านล่าง คัดลอกข้อความในกรอบให้ Codex, Claude หรือผู้ช่วยประจำตัวที่เปิด repository นี้อยู่\n"
        "2. ให้ AI ลงมือทำ แก้ปัญหา เทส และเตรียมรายงาน คนอ่านภาพรวมและลองตรวจผลตามที่รายงานบอก\n"
        "3. ส่งสรุปเป็นข้อความในห้องนี้ได้เลย แล้วค่อยไปเฟสถัดไป ไม่ต้องพิมพ์คำสั่งบอต\n"
        "ถ้ารอผลงานอีกคน ให้ AI ระบุสิ่งที่ต้องรอ อย่านับเฟสนั้นว่าผ่านเอง\n\n"
        "**รายงานสั้น:** เฟส/ผู้ทำ • ระบบทำอะไรได้ • เทสอะไรผ่าน • จุดค้าง • สิ่งที่เพื่อนต้องใช้ต่อ • คนต้องลองตรวจอะไร\n"
        "โค้ดและเอกสาร: https://github.com/Mrbeer19/SENTINEL-AI"
    )
    jobs = []
    for member in team:
        slug = "obeto" if member["key"] == "backend" else "beer"
        if not member.get("channel_id"):
            raise SystemExit(f"Missing channel for {slug}")
        jobs.append((f"{slug}:intro", member["channel_id"], intro))
        for phase in range(5):
            prompt = (prompts / f"phase-{phase}-{slug}.md").read_text(encoding="utf-8")
            content = f"**Phase {phase} — {member['name']}**\nคัดลอกทั้งกรอบให้ผู้ช่วยทำเฟสนี้:\n```text\n{prompt}```"
            if len(content) > 2000:
                raise SystemExit(f"Message too long: phase {phase} {slug}")
            jobs.append((f"{slug}:{phase}", member["channel_id"], content))
    print(f"Validated {len(jobs)} Discord messages for two configured channels")
    if not args.publish:
        return
    env = {}
    for line in (ROOT / "secrets" / ".env").read_text(encoding="utf-8").splitlines():
        if line.strip() and not line.lstrip().startswith("#") and "=" in line:
            key, value = line.split("=", 1)
            env[key.strip()] = value.strip().strip('"').strip("'")
    token = env.get("DISCORD_TOKEN", "")
    if not token:
        raise SystemExit("Missing local bot token")

    def request(method, path, payload=None):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8") if payload is not None else None
        req = urllib.request.Request("https://discord.com/api/v10" + path, data=body, method=method, headers={"Authorization": "Bot " + token, "User-Agent": "DiscordBot (https://github.com/Mrbeer19/SENTINEL-AI, 1)", "Content-Type": "application/json"})
        for attempt in range(4):
            try:
                with urllib.request.urlopen(req, timeout=20) as response:
                    return json.load(response)
            except urllib.error.HTTPError as exc:
                if exc.code == 429 and attempt < 3:
                    delay = json.loads(exc.read()).get("retry_after", 2)
                    time.sleep(min(float(delay) + 0.2, 30))
                    continue
                raise SystemExit(f"Discord {method} failed with HTTP {exc.code}") from None
        raise SystemExit("Discord retry limit reached")

    channels = [request("GET", f"/channels/{member['channel_id']}") for member in team]
    if len({channel["guild_id"] for channel in channels}) != 1:
        raise SystemExit("Configured channels must belong to the same server")
    ledger = read_json(LEDGER) if LEDGER.exists() else {}
    for key, channel, content in jobs:
        payload = {"content": content, "allowed_mentions": {"parse": []}}
        old = ledger.get(key)
        if old and old["channel_id"] == channel:
            message = request("PATCH", f"/channels/{channel}/messages/{old['message_id']}", payload)
        else:
            message = request("POST", f"/channels/{channel}/messages", payload)
        ledger[key] = {"channel_id": channel, "message_id": message["id"]}
        write_json(LEDGER, ledger)
        print(f"Published {key}", flush=True)
        time.sleep(0.9)
    print("Phase prompts delivered; posting IDs saved locally for future updates")


if __name__ == "__main__":
    main()
