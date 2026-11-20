"""Dependency preflight, without touching a manuscript database."""
import importlib.metadata as meta
from pathlib import Path
import sqlite3
import sys

assert sys.version_info >= (3, 11), 'Python 3.11+ required'
root = Path(__file__).resolve().parents[1]
for line in (root / 'requirements-dev.lock').read_text().splitlines():
    if not line or line.startswith('#'):
        continue
    name, version = line.split('==')
    assert meta.version(name) == version, f'{name}: expected {version}; run npm run setup'
with sqlite3.connect(':memory:') as db:
    db.execute('create virtual table test using fts5(text)')
import docx, pypdf, pdfplumber, lxml.etree
print(f'Python {sys.version.split()[0]}, pinned packages and FTS5 ready')
