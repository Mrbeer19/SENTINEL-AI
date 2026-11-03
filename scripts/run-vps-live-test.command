#!/bin/bash
# Finder opens .command files in Terminal; resolve paths relative to this file.
SCRIPT_DIR="$(cd -- "$(dirname -- "$0")" && pwd)" || exit 1
cd -- "$SCRIPT_DIR/.." || exit 1

if [[ -x "$PWD/.venv/bin/python3" ]]; then
    PYTHON_BIN="$PWD/.venv/bin/python3"
elif [[ -x "$PWD/scripts/.venv-live-test/bin/python3" ]]; then
    PYTHON_BIN="$PWD/scripts/.venv-live-test/bin/python3"
elif command -v python3 >/dev/null 2>&1; then
    PYTHON_BIN="$(command -v python3)"
else
    printf '\nไม่พบ Python 3 กรุณาติดตั้ง Python 3.9 ขึ้นไปก่อน\n'
    read -r -p 'กด Enter เพื่อปิด...' _answer
    exit 1
fi

"$PYTHON_BIN" scripts/vps_live_test.py
result=$?
printf '\nจบการทำงาน (exit code: %s)\n' "$result"
read -r -p 'กด Enter เพื่อปิด...' _answer
exit "$result"
