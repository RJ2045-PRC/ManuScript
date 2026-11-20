"""Render the narrow, embedded view of the Archify workflow with Python 3."""
import json
from pathlib import Path
from xml.etree import ElementTree as ET

folder = Path(__file__).parent
workflow = json.loads((folder / "workflow.json").read_text(encoding="utf-8"))
# Three starting points converge on the working manuscript. Both save outcomes
# fit side by side at the bottom. Positions and line breaks belong to this view.
positions = {
    "blank": (12, 96, 142), "ideas": (163, 96, 150), "existing": (322, 96, 146),
    "work": (140, 219, 200), "save": (140, 321, 200),
    "next": (25, 451, 200), "same": (255, 451, 200),
}
height = 61
palette = {
    "frontend": ("#eff7fa", "#398091"), "backend": ("#e5f4ed", "#297455"),
    "database": ("#f0ecfa", "#72549b"),
}
svg = ET.Element("svg", xmlns="http://www.w3.org/2000/svg", viewBox="0 0 480 569",
                 role="img", attrib={"aria-labelledby": "title desc"})
def element(parent, tag, **attrs):
    return ET.SubElement(parent, tag, {key: str(value) for key, value in attrs.items()})

def text(x, y, content, size, color="#203344", anchor="middle", weight=400):
    label = element(svg, "text", x=x, y=y, fill=color, **{
        "font-size": size, "font-weight": weight, "text-anchor": anchor,
        "font-family": "system-ui, sans-serif",
    })
    label.text = content

element(svg, "title", id="title").text = workflow["meta"]["title"]
element(svg, "desc", id="desc").text = "三种起稿方式汇入工作稿。工作稿自动保存。作者显式留版后，首次或有改动生成编号快照，无变化则保留原编号。"
defs = element(svg, "defs")
marker = element(defs, "marker", id="arrow", viewBox="0 0 8 8", refX=7, refY=4,
                 markerWidth=7, markerHeight=7, orient="auto")
element(marker, "path", d="M0 0 L8 4 L0 8 Z", fill="#4d6271")
element(svg, "rect", width=480, height=569, rx=12, fill="#fbfaf6")
text(18, 36, workflow["meta"]["title"], 22, anchor="start", weight=700)
text(18, 72, "任选一种方式开始", 15, anchor="start")
for edge in workflow["edges"]:
    source_x, source_y, source_w = positions[edge["from"]]
    target_x, target_y, target_w = positions[edge["to"]]
    x1, y1 = source_x + source_w / 2, source_y + height
    x2 = target_x + target_w / 2
    # Separate the three incoming arrowheads along the top of the work node.
    if edge["to"] == "work" and abs(x1 - x2) > 5:
        x2 += -65 if x1 < x2 else 65
    bend = (y1 + target_y) / 2
    element(svg, "path", d=f"M{x1:g} {y1:g} V{bend:g} H{x2:g} V{target_y-3:g}",
            fill="none", stroke="#4d6271", **{"stroke-width": 1.7, "marker-end": "url(#arrow)"})
    if edge.get("label"):
        text(x2, bend-8, edge["label"], 14, weight=600)
for node in workflow["nodes"]:
    x, y, width = positions[node["id"]]
    fill, stroke = palette[node["type"]]
    element(svg, "rect", x=x, y=y, width=width, height=height, rx=8, fill=fill,
            stroke=stroke, **{"stroke-width": 1.4})
    text(x+width/2, y+25, node["label"], 16, weight=650)
    text(x+width/2, y+47, node["sublabel"], 12.5)
# The source records the package version, tool version and upstream address.
credit = next(card for card in workflow["cards"] if card["title"] == "图源与制图署名")
text(18, 550, credit["items"][-1].split("。")[0], 12, anchor="start")
ET.indent(svg)
(folder / "overview.svg").write_text(ET.tostring(svg, encoding="unicode") + "\n", encoding="utf-8")
