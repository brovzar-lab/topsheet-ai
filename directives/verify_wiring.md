# Directive: Verify System Wiring

> **Purpose:** Confirm that the 3-layer architecture is set up correctly and all layers can communicate.

## Goal

Run the example execution script and verify that:

1. The `.env` file is loading properly
2. Python can write to `.tmp/`
3. Log output is generated
4. An output JSON file is created

## Inputs

- None (self-contained smoke test)

## Execution

```bash
python3 execution/verify_wiring.py --verbose
```

## Expected Output

- Exit code: `0`
- File created: `.tmp/wiring_check.json`
- Log entries printed to stdout

## Edge Cases

- **Missing `.env`**: Script should warn and fall back to defaults
- **Missing `.tmp/`**: Script should create it automatically

## Learnings

- **macOS Sandbox EPERM (2026-02-22)**: Writing to `.tmp/` from Python inside VS Code's sandboxed terminal triggers `PermissionError: [Errno 1] Operation not permitted`. The script now falls back to `/tmp/lemon_budget_engine/` when EPERM is caught. This is a known VS Code sandbox issue on macOS — see the `macos_dev_env` KI for details.
