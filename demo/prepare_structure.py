"""Build the offline structure frame from the released npm package and public example."""
import base64
import hashlib
import json
import re
from pathlib import Path
import sys
import zipfile

here = Path(__file__).resolve().parent
out = here / "assets" / "structure"
out.mkdir(exist_ok=True)
workbench = Path(sys.argv[1]) / "workbench"
source = (workbench / "web/project-map.html").read_bytes()
if hashlib.sha256(source).hexdigest() != "6df76c46df61ce1fb5d3cd65d8808a7322a077283bd2001a2e8051b7a81f41db":
    sys.exit("Expected the published ManuScript v0.13.0 workbench")
html = source.decode()
# Keep the release renderers, dialogs, styles and keyboard/scroll behavior intact.
# Only the surrounding chrome, the host transport and the startup entry differ.
hooks = {
    "</style><header>": '</style><link rel="stylesheet" href="../../structure-frame.css"><script src="sample.js"></script><script src="../../structure-frame.js"></script><header>',
    next(line for line in html.splitlines() if line.startswith("async function api(op,args={}){")):
        "async function api(op,args={}){return structureFrame.request(op,args)}",
    ";init()\n})()": """;structureFrame.connect((project,nodes)=>{
      proj=project.id; map=nodes; setPaper(project); state=empty(); view='scales';
      document.body.dataset.view=view; reader.hidden=false; openManuscriptScales();
    })
})()""",
}
for old, new in hooks.items():
    assert html.count(old) == 1, old
    html = html.replace(old, new)
(out / "workbench.html").write_text(html, encoding="utf-8")

with zipfile.ZipFile(here.parent / "examples/杯盖与降温/完成态项目.zip") as archive:
    manifest = json.loads(archive.read("manifest.json"))
    project = manifest["project"]
    snapshots = {}
    for draft in project["manuscriptDrafts"]:
        version = next(v for v in project["versions"] if v["id"] == draft["version"])
        blocks = project["blocks"] if draft == project["manuscriptDrafts"][-1] else version["blocks"]
        # The final authoring state adds writing plans to the same saved manuscript.
        fields = ("id", "parent", "title", "text")
        assert [[b[k] for k in fields] for b in blocks] == [[b[k] for k in fields] for b in version["blocks"]]
        snapshots[draft["id"][-2:]] = {"blocks": blocks, "versions": [{"id":version["id"]}],
                                      "exhibits": version["exhibits"], "references": version["references"]}
    files = {a["id"]: {"name": a["name"], "data": base64.b64encode(archive.read("files/" + a["sha"])).decode()}
             for a in project["assets"] if a["name"].endswith(".png")}
    draft_text = (here.parent / "examples/杯盖与降温/稿件/Draft-02.md").read_text(encoding="utf-8")
    pins = {}
    for block in project["blocks"]:
        ids = re.findall(r"\[@CupLog#([a-f0-9]+)\]", block["text"])
        if ids:
            heading = re.search(r"^#{1,6} " + re.escape(block["title"]) + "$", draft_text, re.M)
            section = re.split(r"^#{1,6} ", draft_text[heading.end():], maxsplit=1, flags=re.M)[0]
            pages = re.findall(r"课堂测量记录\.pdf#page=([12])", section)
            assert len(ids) == len(pages)
            pins.update(zip(ids, map(int, pages)))
    assert set(pins.values()) == {1, 2}
    data = {"base":{k:project[k] for k in ("title","assets","settings","figureAliases","notes")},
            "snapshots": snapshots,"nodes":manifest["team"]["map"],"files": files, "pins": pins}
(out / "sample.js").write_text("const structureSample = " + json.dumps(data, ensure_ascii=False) + ";\n", encoding="utf-8")
