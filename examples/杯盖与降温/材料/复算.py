"""在本文件所在目录读取两份模拟研究记录。运行 python3 复算.py。"""
import csv
from pathlib import Path
from statistics import mean, stdev

HERE = Path(__file__).resolve().parent


def records(filename):
    with (HERE / filename).open(encoding="utf-8-sig", newline="") as source:
        return list(csv.DictReader(source))


def leave_one_out(values):
    estimates = [mean(values[:i] + values[i + 1:]) for i in range(len(values))]
    return min(estimates), max(estimates)


def fixed_pairs():
    rows = records("温度记录.csv")
    pairs = {(int(r["轮次"]), r["杯号"]): r for r in rows}
    for time in ("5分钟", "10分钟"):
        col = time + "温度（°C）"
        diffs = [float(pairs[i, "A"][col]) - float(pairs[i, "B"][col]) for i in range(1, 7)]
        print(time, "配对差", diffs, "均值", mean(diffs))
    print("去掉一轮后终点平均差的范围", leave_one_out(diffs))
    for cup in ("A", "B"):
        subset = [r for r in rows if r["杯号"] == cup]
        rates = [(float(r["起始温度（°C）"]) - float(r["10分钟温度（°C）"])) / float(r["时长（min）"]) for r in subset]
        print(cup, "平均降温速率 (°C/min)", mean(rates))


def crossover():
    rows = records("交叉实验.csv")
    ends = {(int(r["区组"]), r["杯体"], r["盖子状态"]): float(r["十分钟温度_C"]) for r in rows}
    first_glass = {int(r["区组"]) for r in rows if r["时段"] == "1" and r["杯体"] == "玻璃" and r["盖子状态"] == "有盖"}
    contrasts = {}
    for cup in ("玻璃", "陶瓷"):
        open_cup, covered = ([ends[b, cup, state] for b in range(1, 9)] for state in ("敞口", "有盖"))
        diff = [lid - base for lid, base in zip(covered, open_cup)]
        contrasts[cup] = diff
        print(cup, "敞口均温、有盖均温", mean(open_cup), mean(covered))
        print("同杯差、均值、样本标准差、范围", diff, mean(diff), stdev(diff), (min(diff), max(diff)))
        for glass_first in (True, False):
            print("玻璃先盖" if glass_first else "陶瓷先盖", mean(d for b, d in enumerate(diff, 1) if (b in first_glass) == glass_first))
    between = [g - c for g, c in zip(contrasts["玻璃"], contrasts["陶瓷"])]
    print("差值之差、均值、标准差、去掉一组后的均值范围", between, mean(between), stdev(between), leave_one_out(between))


if __name__ == "__main__":
    fixed_pairs()
    crossover()
