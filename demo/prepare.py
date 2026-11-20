"""Rebuild the static reader from the published cup-cooling example."""
from pathlib import Path
import json
import re
import shutil
import subprocess
import zipfile

here = Path(__file__).resolve().parent
sample = here.parent / "examples" / "杯盖与降温"
assets = here / "assets"
assets.mkdir(exist_ok=True)
materials = sample / "材料"
for name in ("cup-setup.png", "endpoints.png", "crossover.png"):
    shutil.copyfile(materials / name, assets / name)
shutil.copyfile(materials / "课堂测量记录.pdf", assets / "measurement-log.pdf")
shutil.copyfile(sample / "稿件/Draft-01-审阅回稿.docx", assets / "review.docx")
shutil.copyfile(here.parent / "packages/ManuScript/assets/mark.svg", assets / "mark.svg")
subprocess.run(["pdftoppm", "-png", "-r", "150", str(assets / "measurement-log.pdf"),
                str(assets / "source")], check=True)

vendor = here.parent / "packages/ManuScript/workbench/map/vendor"
(assets / "editor").mkdir(exist_ok=True)
for name in ("live-editor.js", "writing-editor.js", "marked.umd.js", "math.js", "LICENSE-marked",
             "LIVE-EDITOR-NOTICES.txt", "THIRD-PARTY-NOTICES.txt"):
    shutil.copyfile(vendor / name, assets / "editor" / name)

def manuscript(version):
    text = (sample / "稿件" / f"Draft-{version}.md").read_text(encoding="utf-8")
    return text.replace("../材料/", "assets/").replace("课堂测量记录.pdf", "measurement-log.pdf")

def sections(version):
    md = (sample / "稿件" / f"Draft-{version}.md").read_text(encoding="utf-8")
    markup = subprocess.check_output(["pandoc", "-f", "markdown+autolink_bare_uris",
                                      "-t", "html5", "--mathml", "--wrap=none"],
                                     input=md, text=True)
    parts = re.split(r"<h[23][^>]*>([^<]+)</h[23]>", markup)[1:]
    result = {}
    for title, content in zip(parts[::2], parts[1::2]):
        key = title.split()[0] if title[0].isdigit() else {"摘要": "abstract", "参考文献": "refs"}[title]
        content = content.replace("../材料/", "assets/").replace("课堂测量记录.pdf", "measurement-log.pdf")
        content = re.sub(r'<a href="assets/measurement-log.pdf#page=([12])"', r'<a class="citation" data-page="\1" href="assets/measurement-log.pdf#page=\1"', content)
        result[key] = {"title": title, "html": content.strip()}
    return result

first, second = sections("01"), sections("02")
with zipfile.ZipFile(sample / "完成态项目.zip") as archive:
    project = json.loads(archive.read("manifest.json"))["project"]
feedback, = project["feedback"]
decision = feedback["decisions"][-1]
versions = {v["version"]: v["id"] for v in project["manuscriptDrafts"]}
assert versions[feedback["basis"]] == "Draft 01" and versions[decision["version"]] == "Draft 02"
assert feedback["quote"] in first["4.1"]["html"]
changed = re.findall(r"<p>([^<>]+)</p>", second["4.1"]["html"])[-1]
assert set(first) == set(second) and len(second) == 22
data = {"markdown": {v: manuscript(v) for v in ("01", "02")}, "sections": second, "original": {k: v["html"] for k, v in first.items() if v != second[k]},
        "review": {"author": feedback["author"], "message": feedback["message"], "quote": feedback["quote"],
                   "revised": changed, "reason": decision["reason"], "status": decision["status"]}}
(assets / "paper.js").write_text("const paper = " + json.dumps(data, ensure_ascii=False, indent=2) + ";\n", encoding="utf-8")
