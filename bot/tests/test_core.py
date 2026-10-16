import json
import tempfile
import unittest
from pathlib import Path

from bot.core import Board, BoardError, PLAN_PATH, TEAM_PATH, task_prompt


class BoardTests(unittest.TestCase):
    def setUp(self):
        test_temp = Path(__file__).resolve().parent / ".tmp"
        test_temp.mkdir(exist_ok=True)
        self.temp = tempfile.TemporaryDirectory(dir=test_temp)
        root = Path(self.temp.name)
        self.plan_path = root / "tasks.json"
        self.team_path = root / "team.json"
        self.state_path = root / "state.json"
        self.plan_path.write_text(PLAN_PATH.read_text(encoding="utf-8"), encoding="utf-8")
        example = TEAM_PATH.with_name("team.example.json")
        self.team_path.write_text(example.read_text(encoding="utf-8"), encoding="utf-8")
        self.board = Board(self.plan_path, self.team_path, self.state_path)

    def tearDown(self):
        self.temp.cleanup()

    def complete(self, task_id, runner="backend"):
        self.board.claim(task_id, runner)
        self.board.submit(task_id, runner, "files changed", "tests passed")
        status = self.board.selfcheck(task_id, runner, "Read the diff and ran acceptance tests")
        if status == "owner_review":
            self.board.owner_approve(task_id, self.board.task(task_id)["track"])

    def test_dependencies_hold_frontend_data_work_until_contract_done(self):
        self.assertTrue(self.board.ready("F00"))
        self.assertFalse(self.board.ready("F01"))
        with self.assertRaises(BoardError):
            self.board.claim("F01", "frontend")
        self.complete("B00")
        self.assertFalse(self.board.ready("F01"))
        self.complete("F00", "frontend")
        self.assertTrue(self.board.ready("F01"))

    def test_takeover_requires_runner_selfcheck_then_owner_approval(self):
        self.board.set_availability("backend", False)
        self.assertIn("B00", [task["id"] for task in self.board.suggestions("frontend")])
        self.board.claim("B00", "frontend")
        self.board.submit("B00", "frontend", "docs/api-contract.md", "manual checks passed")
        self.assertEqual(self.board.selfcheck("B00", "frontend", "Reviewed the diff and API examples"), "owner_review")
        self.assertFalse(self.board.ready("F01"))
        self.board.owner_approve("B00", "backend")
        self.assertTrue(self.board.ready("B01"))

    def test_runner_must_self_review_and_owner_can_request_changes(self):
        self.board.claim("B00", "frontend")
        with self.assertRaises(BoardError):
            self.board.selfcheck("B00", "frontend", "looks fine")
        self.board.submit("B00", "frontend", "docs/api-contract.md", "tests passed")
        with self.assertRaises(BoardError):
            self.board.owner_approve("B00", "backend")
        self.board.selfcheck("B00", "frontend", "Reviewed all fields and examples")
        self.board.request_changes("B00", "backend", "Missing WebSocket event schema")
        self.assertEqual(self.board.record("B00")["status"], "in_progress")

    def test_prompt_and_state_persist(self):
        prompt = task_prompt(self.board.task("B00"))
        self.assertIn("Acceptance:", prompt)
        self.assertIn("ผู้สั่ง AI", prompt)
        self.complete("B00")
        restored = Board(self.plan_path, self.team_path, self.state_path)
        self.assertEqual(restored.record("B00")["status"], "done")
        self.assertEqual(json.loads(self.state_path.read_text(encoding="utf-8"))["tasks"]["B00"]["status"], "done")

    def test_member_and_channel_setup(self):
        self.board.configure_members(123, 456)
        self.board.configure_channels(789, 987)
        self.assertEqual(self.board.member_by_discord_id(123)["key"], "backend")
        self.assertEqual(self.board.channel_id("frontend"), 987)
        restored = Board(self.plan_path, self.team_path, self.state_path)
        self.assertEqual(restored.channel_id("backend"), 789)


if __name__ == "__main__":
    unittest.main()
