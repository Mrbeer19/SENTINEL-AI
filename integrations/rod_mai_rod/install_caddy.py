"""Surgically add SENTINEL logging/rules to the existing rod-mai-rod Caddy site.

Run on the VPS. Leaves other site blocks byte-for-byte unchanged.
"""

import argparse
import difflib
import hashlib
import os
import subprocess
import tempfile
from pathlib import Path

from site_config import CADDY_CONTAINER, CADDY_DIR, DOMAIN, SITE

SOURCE = Path(SITE.get("caddyfile", "/nonexistent"))
SNIPPET = CADDY_DIR / "rod-mai-rod-sentinel.caddy"
ACTIVE = CADDY_DIR / "rod-mai-rod-active.Caddyfile"
EXPECTED_SHA256 = SITE.get("caddyfile_sha256", "")
NEW_BLOCK = """{domain} {{
    encode zstd gzip
    header {{
        X-Content-Type-Options nosniff
        Referrer-Policy strict-origin-when-cross-origin
        -Server
    }}
    log {{
        output file /config/rod-mai-rod.access.log {{
            mode 0600
            roll_size 10MiB
            roll_keep 3
        }}
        format json
    }}
    route {{
        import /config/rod-mai-rod-sentinel.caddy
        reverse_proxy {upstream} {{
            transport http {{
                response_header_timeout 130s
            }}
        }}
    }}
}}
""".format(domain=DOMAIN, upstream=SITE.get("upstream", ""))


def site_bounds(data):
    marker = DOMAIN + " {"
    if data.count(marker) != 1:
        raise RuntimeError("expected exactly one rod-mai-rod site block")
    start = data.index(marker)
    depth = 0
    for i in range(start + len(DOMAIN), len(data)):
        if data[i] == "{":
            depth += 1
        elif data[i] == "}":
            depth -= 1
            if depth == 0:
                return start, i + 1
    raise RuntimeError("unbalanced Caddy site block")


def write_atomic(path, data, mode):
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=path.parent, prefix=path.name + ".", delete=False) as file:
        file.write(data)
        name = file.name
    os.chmod(name, mode)
    os.replace(name, path)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    if not (DOMAIN and EXPECTED_SHA256 and CADDY_CONTAINER and SITE.get("upstream")):
        raise RuntimeError("fill site.json (see site.example.json) before running")
    original = SOURCE.read_text()
    if hashlib.sha256(SOURCE.read_bytes()).hexdigest() != EXPECTED_SHA256:
        raise RuntimeError("shared Caddyfile changed since inspection; refusing to patch")
    start, end = site_bounds(original)
    updated = original[:start] + NEW_BLOCK.rstrip("\n") + original[end:]
    print("".join(difflib.unified_diff(original.splitlines(True), updated.splitlines(True), fromfile="Caddyfile.before", tofile="Caddyfile.rod-mai-rod")))
    if not args.apply:
        return
    if not SNIPPET.exists():
        write_atomic(SNIPPET, "# No active SENTINEL rules for rod-mai-rod.\n", 0o644)
    candidate = CADDY_DIR / "rod-mai-rod-install.Caddyfile"
    write_atomic(candidate, updated, 0o644)
    try:
        subprocess.run(["docker", "exec", CADDY_CONTAINER, "caddy", "validate", "--config", "/config/rod-mai-rod-install.Caddyfile", "--adapter", "caddyfile"], check=True)
        write_atomic(SOURCE, updated, SOURCE.stat().st_mode & 0o777)
        write_atomic(ACTIVE, updated, 0o644)
        try:
            subprocess.run(["docker", "exec", CADDY_CONTAINER, "caddy", "reload", "--config", "/config/rod-mai-rod-active.Caddyfile", "--adapter", "caddyfile"], check=True)
        except subprocess.CalledProcessError:
            write_atomic(SOURCE, original, SOURCE.stat().st_mode & 0o777)
            write_atomic(ACTIVE, original, 0o644)
            subprocess.run(["docker", "exec", CADDY_CONTAINER, "caddy", "reload", "--config", "/config/rod-mai-rod-active.Caddyfile", "--adapter", "caddyfile"], check=True)
            raise
    finally:
        candidate.unlink(missing_ok=True)


if __name__ == "__main__":
    main()
