# rod-mai-rod Caddy bridge source

This is a separate integration path from `../sidecar/`. The source was present in the working tree during the 22 October handoff and is included for review. Uploading these files does not install them, apply Caddy rules, create scheduled tasks or establish that VPS deployment passed.

## Components

- `vps_logs.py`: reads JSON access logs for the configured website and emits normalized authentication/denial records. Authentication extraction accepts the configured login paths and status 200/401 only.
- `agent.py`: a local SSH collector forwards those records to SENTINEL and synchronizes active approved rules to the VPS. It uses a private key supplied by path, not embedded key contents. Host, SSH user, key and polling state must match the authorized environment. It expects the SOC API on localhost without a remote admin-key exchange.
- `vps_rules.py`: validates address/expiry fields, writes the website-specific matcher and validates Caddy configuration before reloading. A reload failure attempts to restore the previous snippet.
- `install_caddy.py`: environment-specific configuration patcher with a checksum guard and a dry-run default. Applying it changes the shared Caddy configuration. Its paths, service/container names and expected checksum are specific to the inspected server.
- `rod-mai-rod-sentinel-expire.service` / `.timer`: optional server-side rule-expiry job.
- `install_windows.ps1`: optional local logon task installer; executing it changes Windows scheduled tasks and starts the bridge.
- `probe-caddy.cjs`: container-network diagnostic. It deliberately skips TLS verification for that diagnostic and is not the production proxy path.

No private SSH key, log, state file or server credential belongs in this directory. Configure access outside Git. Review and approve server installation separately from this source review.

## Local unit checks

```bash
python -m unittest discover -s integrations/rod_mai_rod -p test_bridge.py -v
```

These fixture tests exercise log filtering and rule serialization only. They do not SSH to the VPS or validate a live Caddy deployment, log rotation recovery, replay delivery guarantees, concurrent configuration updates or scheduled-task behavior. A captured 403 log record also does not independently prove which upstream component produced it.
