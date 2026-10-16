"""Print a task prompt for Codex CLI or Claude Code stdin."""

import argparse
import sys

from core import Board, BoardError, task_prompt


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("task_id", help="For example B00 or F01")
    args = parser.parse_args()
    try:
        board = Board()
        prompt = task_prompt(board.task(args.task_id))
    except BoardError as exc:
        print(exc, file=sys.stderr)
        return 2
    sys.stdout.reconfigure(encoding="utf-8")
    print(prompt)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
