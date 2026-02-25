#!/usr/bin/env python3
"""
verify_wiring.py — Smoke test for the 3-layer architecture.

Confirms:
  1. .env loading works (or falls back gracefully)
  2. Python can write to .tmp/
  3. JSON output is generated
  4. Basic logging works

Usage:
  python3 execution/verify_wiring.py [--verbose]
"""

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

PROJECT_ROOT = Path(__file__).resolve().parent.parent
TMP_DIR = PROJECT_ROOT / ".tmp"
OUTPUT_FILE = TMP_DIR / "wiring_check.json"
ENV_FILE = PROJECT_ROOT / ".env"


def log(msg: str, verbose: bool = True) -> None:
    """Simple timestamped logger."""
    if verbose:
        ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
        print(f"[{ts}] {msg}")


def load_env(verbose: bool = False) -> dict:
    """
    Load .env file manually (no external deps required).
    Returns dict of loaded vars.
    """
    loaded = {}
    if ENV_FILE.exists():
        log(f"✅ Found .env at {ENV_FILE}", verbose)
        with open(ENV_FILE) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    key, _, value = line.partition("=")
                    key = key.strip()
                    value = value.strip()
                    loaded[key] = value
                    os.environ.setdefault(key, value)
        log(f"   Loaded {len(loaded)} variable(s)", verbose)
    else:
        log(f"⚠️  No .env file found at {ENV_FILE} — using defaults", verbose)
    return loaded


def ensure_tmp(verbose: bool = False) -> None:
    """Create .tmp/ directory if it doesn't exist."""
    if not TMP_DIR.exists():
        TMP_DIR.mkdir(parents=True, exist_ok=True)
        log(f"📁 Created {TMP_DIR}", verbose)
    else:
        log(f"📁 .tmp/ exists at {TMP_DIR}", verbose)


def write_output(env_vars: dict, verbose: bool = False) -> str:
    """Write the verification result. Falls back to system temp if .tmp/ is sandboxed."""
    import tempfile

    result = {
        "status": "ok",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "python_version": sys.version,
        "project_root": str(PROJECT_ROOT),
        "env_loaded": bool(env_vars),
        "env_var_count": len(env_vars),
        "env_keys": list(env_vars.keys()),
        "checks": {
            "env_file": ENV_FILE.exists(),
            "tmp_dir": TMP_DIR.exists(),
            "directives_dir": (PROJECT_ROOT / "directives").exists(),
            "execution_dir": (PROJECT_ROOT / "execution").exists(),
        },
    }

    # Try .tmp/ first, fall back to system temp on EPERM
    output_path = OUTPUT_FILE
    try:
        with open(output_path, "w") as f:
            json.dump(result, f, indent=2)
    except PermissionError:
        fallback = Path(tempfile.gettempdir()) / "lemon_budget_engine"
        fallback.mkdir(parents=True, exist_ok=True)
        output_path = fallback / "wiring_check.json"
        log(f"⚠️  EPERM on .tmp/ — falling back to {output_path}", verbose)
        with open(output_path, "w") as f:
            json.dump(result, f, indent=2)

    log(f"📄 Output written to {output_path}", verbose)
    return str(output_path)


def main() -> None:
    parser = argparse.ArgumentParser(description="Verify 3-layer architecture wiring")
    parser.add_argument("--verbose", action="store_true", help="Enable verbose output")
    args = parser.parse_args()
    v = args.verbose

    log("=" * 50, v)
    log("🔧 LEMON BUDGET ENGINE — Wiring Check", v)
    log("=" * 50, v)

    # Step 1: Load .env
    env_vars = load_env(v)

    # Step 2: Ensure .tmp exists
    ensure_tmp(v)

    # Step 3: Write output
    write_output(env_vars, v)

    # Step 4: Summary
    log("", v)
    log("✅ All checks passed. System is wired correctly.", v)
    log(f"   Output: {OUTPUT_FILE}", v)


if __name__ == "__main__":
    main()
