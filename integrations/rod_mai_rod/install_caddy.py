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

SOURCE = Path("/opt/copie/ops/hostinger/Caddyfile")
CADDY_DIR = Path("/var/lib/docker/volumes/copie_caddy_config/_data")
SNIPPET = CADDY_DIR / "rod-mai-rod-sentinel.caddy"
ACTIVE = CADDY_DIR / "rod-mai-rod-active.Caddyfile"
EXPECTED_SHA256 = "796cc6bcd68dcdb766828c43a1cd8e41209b4543afcbff523dda81d870162e54"
DOMAIN = "rod-mai-rod.tntproduction.tech"
NEW_BLOCK = """rod-mai-rod.tntproduction.tech {
    encode zstd gzip
    header {
        X-Content-Type-Options nosniff
        Referrer-Policy strict-origin-when-cross-origin
        -Server
    }
    log {
        output file /config/rod-mai-rod.access.log {
            mode 0600
            roll_size 10MiB
            roll_keep 3
        }
        format json
    }
    route {
        import /config/rod-mai-rod-sentinel.caddy
        reverse_proxy rod-mai-rod-web:8000 {
            transport http {
                response_header_timeout 130s
            }
        }
    }
}
"""


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
        subprocess.run(["docker", "exec", "copie-caddy-1", "caddy", "validate", "--config", "/config/rod-mai-rod-install.Caddyfile", "--adapter", "caddyfile"], check=True)
        write_atomic(SOURCE, updated, SOURCE.stat().st_mode & 0o777)
        write_atomic(ACTIVE, updated, 0o644)
        try:
            subprocess.run(["docker", "exec", "copie-caddy-1", "caddy", "reload", "--config", "/config/rod-mai-rod-active.Caddyfile", "--adapter", "caddyfile"], check=True)
        except subprocess.CalledProcessError:
            write_atomic(SOURCE, original, SOURCE.stat().st_mode & 0o777)
            write_atomic(ACTIVE, original, 0o644)
            subprocess.run(["docker", "exec", "copie-caddy-1", "caddy", "reload", "--config", "/config/rod-mai-rod-active.Caddyfile", "--adapter", "caddyfile"], check=True)
            raise
    finally:
        candidate.unlink(missing_ok=True)


if __name__ == "__main__":
    main()
