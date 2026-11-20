"""Make an isolated executable copy of the installed DSH node_modules for the web probe."""
import json
import os
import shutil
from pathlib import Path
import struct
from sys import argv

archive=Path(argv[1]).resolve()
out=Path(argv[2]).resolve()
out.mkdir(parents=True,exist_ok=False)
with archive.open("rb") as f:
    prefix=struct.unpack("<4I",f.read(16))
    tree=json.loads(f.read(prefix[3]))
    start=8+prefix[1]
    def copy(parts, entry):
        dest=out.joinpath(*parts)
        if "files" in entry:
            dest.mkdir()
            for name,desc in entry["files"].items():
                if name in {".",".."} or "/" in name: raise ValueError(name)
                copy([*parts,name],desc)
        elif "link" in entry:
            target=(out/entry["link"]).resolve()
            if not target.is_relative_to(out): raise ValueError(target)
            dest.symlink_to(os.path.relpath(target,dest.parent))
        elif entry.get("unpacked"):
            shutil.copy2(Path(str(archive)+".unpacked",*parts),dest)
        else:
            f.seek(start+int(entry["offset"]))
            dest.write_bytes(f.read(entry["size"]))
            if entry.get("executable"): dest.chmod(0o755)
    copy(["node_modules"],tree["files"]["node_modules"])
