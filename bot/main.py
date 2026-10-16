"""Discord task dispatcher for the two-person SENTINEL AI team."""

from __future__ import annotations

import asyncio
import io
import os
from pathlib import Path

import discord
from discord import app_commands

from core import Board, BoardError, ROOT, task_prompt


def load_local_env() -> None:
    path = ROOT / "secrets" / ".env"
    if not path.exists():
        raise RuntimeError(f"Missing {path}; copy .env.example to .env")
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


load_local_env()
TOKEN = os.getenv("DISCORD_TOKEN", "").strip()
GUILD_ID = os.getenv("DISCORD_GUILD_ID", "").strip()
if not TOKEN:
    raise RuntimeError("DISCORD_TOKEN is empty in bot/secrets/.env")
if GUILD_ID and not GUILD_ID.isdecimal():
    raise RuntimeError("DISCORD_GUILD_ID must be a number or blank")

board = Board()
lock = asyncio.Lock()
NO_MENTIONS = discord.AllowedMentions.none()


class TaskClient(discord.Client):
    def __init__(self) -> None:
        super().__init__(intents=discord.Intents.default(), allowed_mentions=NO_MENTIONS)
        self.tree = app_commands.CommandTree(self)
        self.synced = False
        self.active_guild_id: int | None = None

    async def setup_hook(self) -> None:
        # Wait for READY so we can verify actual guild membership before syncing.
        pass

    async def on_ready(self) -> None:
        print(f"Task bot online: {self.user}")
        if self.synced:
            return
        guild = next((item for item in self.guilds if GUILD_ID and item.id == int(GUILD_ID)), None)
        if guild is None and len(self.guilds) == 1:
            guild = self.guilds[0]
            if GUILD_ID:
                print("Configured DISCORD_GUILD_ID is not a guild the bot belongs to; using its only guild")
        if guild is None:
            print(f"Bot is joined to {len(self.guilds)} servers; cannot sync commands")
            if not self.guilds and self.application_id:
                invite = discord.utils.oauth_url(
                    self.application_id,
                    permissions=discord.Permissions(view_channel=True, send_messages=True, attach_files=True),
                    scopes=("bot", "applications.commands"),
                )
                print(f"Install bot user in your server with this link: {invite}")
            return
        self.active_guild_id = guild.id
        try:
            self.tree.copy_global_to(guild=guild)
            await self.tree.sync(guild=guild)
        except discord.Forbidden:
            print("Discord denied slash-command sync: check the bot install and applications.commands access")
            return
        self.synced = True
        print(f"Slash commands synced to server {guild.id}")


client = TaskClient()


async def member_or_reply(interaction: discord.Interaction) -> dict | None:
    if not interaction.guild_id:
        await interaction.response.send_message("ใช้คำสั่งในเซิร์ฟเวอร์โปรเจกต์เท่านั้น", ephemeral=True)
        return None
    if client.active_guild_id and interaction.guild_id != client.active_guild_id:
        await interaction.response.send_message("บอตนี้ตั้งไว้สำหรับอีกเซิร์ฟเวอร์หนึ่ง", ephemeral=True)
        return None
    member = board.member_by_discord_id(interaction.user.id)
    if not member:
        await interaction.response.send_message("ยังไม่ได้ลงทะเบียนเป็นสมาชิก ให้ผู้ดูแลใช้ /setup ก่อน", ephemeral=True)
    return member


async def post_pipeline(track: str, message: str) -> None:
    channel_id = board.channel_id(track)
    if not channel_id:
        return
    channel = client.get_channel(channel_id)
    if channel is None:
        print(f"Configured {track} channel is not visible to the bot")
        return
    try:
        await channel.send(message, allowed_mentions=NO_MENTIONS)
    except discord.Forbidden:
        print(f"Bot cannot send messages to the {track} channel")


def commands_for(task_id: str) -> str:
    return (
        "รันจากโฟลเดอร์โปรเจกต์ใน PowerShell (เลือกอย่างใดอย่างหนึ่ง):\n"
        f"Codex: `python bot/export_task.py {task_id} | codex exec -`\n"
        f"Claude: `python bot/export_task.py {task_id} | claude -p \"Implement the task described in the piped input\"`\n"
        "อ่าน diff และทดสอบด้วยตัวเองก่อน /selfcheck"
    )


@client.tree.command(name="setup", description="ตั้งสมาชิก 2 คนสำหรับ pipeline (ผู้ดูแลเซิร์ฟเวอร์เท่านั้น)")
async def setup(interaction: discord.Interaction, backend_member: discord.Member, frontend_member: discord.Member) -> None:
    if not interaction.guild or not interaction.user.guild_permissions.manage_guild:
        await interaction.response.send_message("ต้องมีสิทธิ์ Manage Server เพื่อใช้ /setup", ephemeral=True)
        return
    if client.active_guild_id and interaction.guild_id != client.active_guild_id:
        await interaction.response.send_message("เซิร์ฟเวอร์นี้ไม่ตรงกับ DISCORD_GUILD_ID", ephemeral=True)
        return
    try:
        async with lock:
            board.configure_members(backend_member.id, frontend_member.id)
    except BoardError as exc:
        await interaction.response.send_message(str(exc), ephemeral=True)
        return
    await interaction.response.send_message(
        f"ตั้งทีมแล้ว: Backend/Security = {backend_member.display_name}; Frontend/Model = {frontend_member.display_name}\n"
        "ใช้ /setchannels เลือกห้องงาน แล้วแต่ละคนใช้ /assign รับงาน",
        allowed_mentions=NO_MENTIONS,
    )


@client.tree.command(name="setchannels", description="ตั้งห้องแจกงาน backend และ frontend/model (ผู้ดูแลเซิร์ฟเวอร์เท่านั้น)")
async def setchannels(interaction: discord.Interaction, backend_channel: discord.TextChannel, frontend_channel: discord.TextChannel) -> None:
    if not interaction.guild or not interaction.user.guild_permissions.manage_guild:
        await interaction.response.send_message("ต้องมีสิทธิ์ Manage Server เพื่อใช้ /setchannels", ephemeral=True)
        return
    if backend_channel.guild.id != interaction.guild.id or frontend_channel.guild.id != interaction.guild.id:
        await interaction.response.send_message("ทั้งสองห้องต้องอยู่ในเซิร์ฟเวอร์นี้", ephemeral=True)
        return
    try:
        async with lock:
            board.configure_channels(backend_channel.id, frontend_channel.id)
    except BoardError as exc:
        await interaction.response.send_message(str(exc), ephemeral=True)
        return
    await interaction.response.send_message(
        f"ตั้งห้องแล้ว: Backend/Security → {backend_channel.mention}; Frontend/Model → {frontend_channel.mention}",
        ephemeral=True,
        allowed_mentions=NO_MENTIONS,
    )


@client.tree.command(name="board", description="ดูความคืบหน้าของแต่ละ phase และ pipeline")
async def show_board(interaction: discord.Interaction) -> None:
    if not await member_or_reply(interaction):
        return
    await interaction.response.send_message("**SENTINEL AI task board**\n" + board.summary(), allowed_mentions=NO_MENTIONS)


@client.tree.command(name="available", description="แจ้งว่าพร้อมรับงานหรือไม่")
async def availability(interaction: discord.Interaction, free: bool) -> None:
    member = await member_or_reply(interaction)
    if not member:
        return
    async with lock:
        board.set_availability(member["key"], free)
    await interaction.response.send_message(f"{member['name']}: {'พร้อมรับงาน' if free else 'ไม่ว่าง'}", allowed_mentions=NO_MENTIONS)


@client.tree.command(name="next", description="แนะนำงานที่พร้อมทำตาม dependencies และเวลาว่าง")
async def next_task(interaction: discord.Interaction) -> None:
    member = await member_or_reply(interaction)
    if not member:
        return
    tasks = board.suggestions(member["key"])[:5]
    if not tasks:
        await interaction.response.send_message("ยังไม่มีงานที่พร้อมรับ หรือคุณตั้งสถานะไม่ว่าง", ephemeral=True)
        return
    lines = [f"**งานที่แนะนำสำหรับ {member['name']}**"]
    for task in tasks:
        owner = board.member(task["track"])
        cross = " · รับแทนได้" if task["track"] != member["track"] else ""
        lines.append(f"`{task['id']}` Phase {task['phase']} · {task['title']} · เจ้าของ {owner['name']}{cross}")
    lines.append("ใช้ `/claim task_id` เพื่อรับงาน")
    await interaction.response.send_message("\n".join(lines), ephemeral=True, allowed_mentions=NO_MENTIONS)


@client.tree.command(name="claim", description="รับงานของตัวเองหรือรับแทนเพื่อนที่ไม่ว่าง")
async def claim(interaction: discord.Interaction, task_id: str) -> None:
    member = await member_or_reply(interaction)
    if not member:
        return
    try:
        async with lock:
            task = board.claim(task_id, member["key"])
    except BoardError as exc:
        await interaction.response.send_message(str(exc), ephemeral=True)
        return
    owner = board.member(task["track"])
    takeover = f" (รับแทน {owner['name']}; เจ้าของ pipeline จะตรวจตอนท้าย)" if owner["key"] != member["key"] else ""
    message = (
        f"{member['name']} รับงาน `{task['id']}` {task['title']}{takeover}\n"
        f"ผลลัพธ์ที่ต้องส่ง: {task['deliverable']}\nเกณฑ์ผ่าน: {task['acceptance']}\n"
        + commands_for(task["id"])
    )
    await interaction.response.send_message(message, ephemeral=True, allowed_mentions=NO_MENTIONS)
    await post_pipeline(task["track"], message)


@client.tree.command(name="assign", description="ให้บอตเลือกและจองงานถัดไปที่พร้อมทำให้คุณ")
async def assign(interaction: discord.Interaction) -> None:
    member = await member_or_reply(interaction)
    if not member:
        return
    try:
        async with lock:
            suggestions = board.suggestions(member["key"])
            if not suggestions:
                raise BoardError("ยังไม่มีงานที่พร้อมรับ หรือคุณตั้งสถานะไม่ว่าง")
            task = board.claim(suggestions[0]["id"], member["key"])
    except BoardError as exc:
        await interaction.response.send_message(str(exc), ephemeral=True)
        return
    owner = board.member(task["track"])
    takeover = f" · รับแทน {owner['name']} และต้องให้เจ้าของตรวจรับ" if owner["key"] != member["key"] else ""
    message = (
        f"บอตมอบหมาย `{task['id']}` ให้ {member['name']}{takeover}\n"
        f"{task['title']}\nเกณฑ์ผ่าน: {task['acceptance']}\n" + commands_for(task["id"])
    )
    await interaction.response.send_message(message, ephemeral=True, allowed_mentions=NO_MENTIONS)
    await post_pipeline(task["track"], message)


@client.tree.command(name="task", description="ดูรายละเอียดและสถานะของงาน")
async def show_task(interaction: discord.Interaction, task_id: str) -> None:
    if not await member_or_reply(interaction):
        return
    try:
        task = board.task(task_id)
        record = board.record(task_id)
    except BoardError as exc:
        await interaction.response.send_message(str(exc), ephemeral=True)
        return
    await interaction.response.send_message(
        f"**{task['id']} · {task['title']}**\nPhase {task['phase']} · {task['track']} · สถานะ {record['status']}\n"
        f"Dependencies: {', '.join(task['depends_on']) or 'none'}\n"
        f"Deliverable: {task['deliverable']}\nAcceptance: {task['acceptance']}\n" + commands_for(task["id"]),
        ephemeral=True,
        allowed_mentions=NO_MENTIONS,
    )


@client.tree.command(name="prompt", description="รับไฟล์ prompt สำหรับ AI CLI ของงาน")
async def prompt(interaction: discord.Interaction, task_id: str) -> None:
    if not await member_or_reply(interaction):
        return
    try:
        task = board.task(task_id)
    except BoardError as exc:
        await interaction.response.send_message(str(exc), ephemeral=True)
        return
    content = task_prompt(task).encode("utf-8")
    await interaction.response.send_message(
        commands_for(task["id"]),
        file=discord.File(io.BytesIO(content), filename=f"SENTINEL-{task['id']}-prompt.md"),
        ephemeral=True,
        allowed_mentions=NO_MENTIONS,
    )


@client.tree.command(name="submit", description="ส่งงาน AI พร้อมไฟล์หรือ PR และผลทดสอบ เพื่อเข้าสู่ self-review")
async def submit(interaction: discord.Interaction, task_id: str, artifact: str, tests: str) -> None:
    member = await member_or_reply(interaction)
    if not member:
        return
    try:
        async with lock:
            board.submit(task_id, member["key"], artifact[:500], tests[:500])
    except BoardError as exc:
        await interaction.response.send_message(str(exc), ephemeral=True)
        return
    message = (
        f"`{task_id.upper()}` ส่งงานแล้วโดย {member['name']}\nไฟล์/PR: {artifact[:500]}\nผลทดสอบ: {tests[:500]}\n"
        "ผู้สั่ง AI ต้องอ่าน diff และตรวจผลด้วยตัวเอง จากนั้นใช้ `/selfcheck`"
    )
    await interaction.response.send_message(message, ephemeral=True, allowed_mentions=NO_MENTIONS)
    await post_pipeline(board.task(task_id)["track"], message)


@client.tree.command(name="selfcheck", description="ผู้สั่ง AI ยืนยันว่าอ่าน diff และตรวจงานเองแล้ว")
async def selfcheck(interaction: discord.Interaction, task_id: str, review_note: str) -> None:
    member = await member_or_reply(interaction)
    if not member:
        return
    try:
        async with lock:
            status = board.selfcheck(task_id, member["key"], review_note[:500])
    except BoardError as exc:
        await interaction.response.send_message(str(exc), ephemeral=True)
        return
    note = "รอเจ้าของ pipeline ตรวจรับ เพราะเป็นงานที่รับแทน" if status == "owner_review" else "งานเสร็จแล้ว; งานที่พึ่งพางานนี้เปิดรับต่อได้"
    message = f"`{task_id.upper()}` ตรวจงาน AI โดย {member['name']} แล้ว · {note}"
    await interaction.response.send_message(message, ephemeral=True, allowed_mentions=NO_MENTIONS)
    await post_pipeline(board.task(task_id)["track"], message)


@client.tree.command(name="approve", description="เจ้าของ pipeline ตรวจรับงานที่เพื่อนทำแทน")
async def approve(interaction: discord.Interaction, task_id: str) -> None:
    member = await member_or_reply(interaction)
    if not member:
        return
    try:
        async with lock:
            board.owner_approve(task_id, member["key"])
    except BoardError as exc:
        await interaction.response.send_message(str(exc), ephemeral=True)
        return
    message = f"`{task_id.upper()}` เจ้าของ pipeline ตรวจรับแล้ว · งานเสร็จ"
    await interaction.response.send_message(message, ephemeral=True, allowed_mentions=NO_MENTIONS)
    await post_pipeline(board.task(task_id)["track"], message)


@client.tree.command(name="changes", description="เจ้าของ pipeline ส่งงานที่เพื่อนทำแทนกลับไปแก้")
async def changes(interaction: discord.Interaction, task_id: str, reason: str) -> None:
    member = await member_or_reply(interaction)
    if not member:
        return
    try:
        async with lock:
            board.request_changes(task_id, member["key"], reason[:500])
    except BoardError as exc:
        await interaction.response.send_message(str(exc), ephemeral=True)
        return
    message = f"`{task_id.upper()}` ส่งกลับให้ runner แก้: {reason[:500]}"
    await interaction.response.send_message(message, ephemeral=True, allowed_mentions=NO_MENTIONS)
    await post_pipeline(board.task(task_id)["track"], message)


if __name__ == "__main__":
    client.run(TOKEN, log_handler=None)
