"""Prepare the user-local Python environment before installing ManuScript in DSH."""

import argparse
import importlib.metadata
import os
from pathlib import Path
import shutil
import sqlite3
import subprocess
import sys
import tempfile


def check_python(lock):
    for line in lock.read_text(encoding="utf-8").splitlines():
        if line and not line.startswith("#"):
            name, expected = line.split("==")
            actual = importlib.metadata.version(name)
            if actual != expected:
                raise RuntimeError(f"{name} {expected} required, found {actual}")
    with sqlite3.connect(":memory:") as db:
        db.execute("CREATE VIRTUAL TABLE test USING fts5(text)")
    import docx, pypdf, pdfplumber, lxml.etree  # noqa: F401


def check_tools():
    path = os.pathsep.join(filter(None, (
        os.environ.get("PATH"), "/opt/homebrew/bin", "/usr/local/bin",
        "/Applications/LibreOffice.app/Contents/MacOS",
    )))
    missing = []
    for tool, flag in (("pnpm", "--version"), ("pandoc", "--version"),
                       ("pdftoppm", "-v"), ("soffice", "--version")):
        executable = shutil.which(tool, path=path)
        if executable is None:
            missing.append(tool)
            continue
        try:
            result = subprocess.run([executable, flag], check=True, timeout=20, capture_output=True)
        except (OSError, subprocess.SubprocessError):
            missing.append(tool)
            continue
        if tool == "pnpm":
            major = result.stdout.strip().split(b".", 1)[0]
            if not major.isdigit() or int(major) < 10:
                missing.append("pnpm >= 10")
    if missing:
        raise RuntimeError(f"Install or repair these tools and try again: {', '.join(missing)}")


def prepare(lock, check_only):
    check_tools()
    runtime = Path.home() / ".manuscript" / "runtime"
    current = runtime / "current"
    script = Path(__file__).resolve()
    verify = [str(script), "--lock", str(lock), "--verify-python"]
    python = current / "bin" / "python3"
    if python.is_file():
        checked = subprocess.run([python, *verify], capture_output=True)
        if checked.returncode == 0:
            print(f"ManuScript runtime ready: {python}")
            return
    if check_only:
        raise RuntimeError("Python environment is missing or invalid. Run setup again without --check.")
    runtime.mkdir(parents=True, exist_ok=True)
    candidate = Path(tempfile.mkdtemp(prefix="env-", dir=runtime))
    link = candidate / "current-link"
    activated = False
    try:
        subprocess.run([sys.executable, "-m", "venv", candidate], check=True)
        python = candidate / "bin" / "python3"
        subprocess.run([python, "-m", "pip", "install", "--disable-pip-version-check",
                        "--no-input", "-r", lock], check=True)
        subprocess.run([python, *verify], check=True)
        link.symlink_to(candidate.name, target_is_directory=True)
        link.replace(current)
        activated = True
    finally:
        if not activated:
            shutil.rmtree(candidate)
    print(f"ManuScript runtime ready: {current / 'bin' / 'python3'}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--lock", type=Path, required=True, help="requirements-dev.lock from the same release")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--check", action="store_true", help="verify without creating or changing the environment")
    mode.add_argument("--verify-python", action="store_true", help=argparse.SUPPRESS)
    args = parser.parse_args()
    if sys.platform != "darwin" or sys.version_info[:2] != (3, 13):
        raise RuntimeError("Run this script on macOS with Python 3.13 (python3.13).")
    lock = args.lock.resolve(strict=True)
    if args.verify_python:
        check_python(lock)
    else:
        prepare(lock, args.check)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("ManuScript setup interrupted. Run the same command to retry.", file=sys.stderr)
        sys.exit(130)
    except (OSError, RuntimeError, subprocess.SubprocessError, sqlite3.Error, ImportError) as error:
        sys.exit(f"ManuScript setup: {error}")
