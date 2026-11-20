"""Compile the sample readings through the release's normal validation and publication operations."""
import json
from pathlib import Path
import sqlite3

GROUPS = [
    ("1", "1 Intro", "区分挑选整套装置与给一只杯加盖这两个决策。"),
    ("2", "2 Method", "从同轮比较两只杯，转到同一只杯跨时段换盖。"),
    ("3", "3 Results", "按原始记录复算装置差、同杯差与差值之差。"),
    ("4", "4 Discussion", "用设计与取样边界检验关于杯盖的解释。"),
    ("5", "5 Conclusion", "把结论限定在这两只杯及给定条件。"),
]
LINKS = [
    ("1.1", "2.2", "比较两套现成装置"),
    ("2.2", "2.3", "固定杯体，补上换盖对照"),
    ("2.2", "3.1", "六轮配对给出装置温差"),
    ("2.3", "3.3", "八组记录给出同杯差"),
    ("3.3", "3.4", "用顺序与单组删除检查结果"),
    ("3.1", "4.1", "核对固定装置能支持的判断"),
    ("3.3", "4.1", "回到同杯数据解释盖子"),
    ("4.1", "4.2", "改变参照杯，检查温差分解"),
    ("4.3", "5", "限定结论的适用范围"),
]


def build_reading(seed, base, draft):
    from features import logic_work

    notes = json.loads(Path(__file__).with_name("structure-notes.json").read_text(encoding="utf-8"))
    project = {**base, **seed, "id": "cup-cooling-" + draft}
    project.pop("logicWork", None)
    sections = {}
    for block in seed["blocks"]:
        key = "title" if block["id"] == "question" else "abstract" if block["title"] == "摘要" else block["title"].split()[0]
        entry = notes.get(key + "@" + draft, notes.get(key))
        if entry:
            sections[block["id"]] = (key, entry)

    question = "两套杯具的终温差能说明加盖的作用吗？"
    summary = ("固定装置的十分钟平均温差为 3.83 °C。同一只杯换盖时，玻璃杯和陶瓷杯的平均差分别为 1.69 °C 和 1.31 °C。"
               + ("首稿在 4.1 将装置差直接归因于杯盖，可对照研究设计核查。" if draft == "01"
                  else "修订稿据此把装置比较与杯盖作用分开，结论只涉及这两只杯。"))
    route = {"model": "demo-reading", "name": "公测示例预整理"}
    with sqlite3.connect(":memory:") as db:
        db.execute("create table projects (id text primary key, title text, data text)")

        def run(op, **args):
            return logic_work.handle(db, project, "worker", op, args)

        job = run("work_begin", route=route, imageMode="captions")
        for task in job["tasks"]:
            _, entry = sections[task["block"]]
            parts = []
            for src in task["packet"]["parts"]:
                note = entry["paragraphs"][src["paragraph"]]
                units = [{"id": str(i), "role": u["role"], "label": u["label"],
                          "text": u.get("explanation", note["purpose"]), "quotes": [{"quote": u["quote"]}]}
                         for i, u in enumerate(note["units"])]
                edges = [{"from": str(i), "to": str(i + 1), "type": rel, "label": rel}
                         for i, rel in enumerate(note["relations"])]
                parts.append({"id": src["id"], "task": note["task"], "purpose": note["purpose"],
                              "units": units, "edges": edges})
            run("work_result", task=task["id"], result={"summary": entry["summary"], "parts": parts})
        ids = {key: block for block, (key, _) in sections.items()}
        overview = {"question": question, "summary": summary,
                    "branches": [{"block": block, "label": entry["paragraphs"][0]["task"], "detail": entry["summary"], "kind": "章节主线"}
                                 for block, (_, entry) in sections.items()],
                    "groups": [dict(key=k, title=t, task=s) for k,t,s in GROUPS],
                    "connections": [{"from": ids[a], "to": ids[b], "text": t} for a,b,t in LINKS]}
        status = run("work_finish", overview=overview)
        assert status["status"] == "done"
    # The offline site ships a fixed reading, without replaying a model job or exposing run logs.
    published = project["logicWork"]["published"]
    published["id"] = status["id"] = "demo-reading-" + published["fingerprint"][:16]
    published.pop("time")
    status.pop("updated")
    return {"published": published}, status
