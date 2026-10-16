"""Export one copyable AI CLI prompt per project task."""

from pathlib import Path

from core import Board, task_prompt


def main() -> None:
    board = Board()
    target = Path(__file__).resolve().parent.parent / "prompts" / "tasks"
    target.mkdir(parents=True, exist_ok=True)
    for task in board.plan["tasks"]:
        (target / f"{task['id']}.md").write_text(task_prompt(task) + "\n", encoding="utf-8")
    print(f"Exported {len(board.tasks)} task prompts to {target}")


if __name__ == "__main__":
    main()
