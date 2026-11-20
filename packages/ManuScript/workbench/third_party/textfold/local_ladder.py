"""Local-only subset of TextFold ladder.py; see PROVENANCE.md."""
import bisect
import re
from .tokens import is_cjk, plain

BUDGET = {"takeaway": 14, "reason": 22, "topic": 3, "section": 16}

CJK_BUDGET = {"takeaway": 40, "reason": 60, "topic": 8, "section": 40}

CJK_EDGE = "。！？；"

CJK_SOFT = "，、："

CJK_FILLER = ("随着", "根据", "由于", "因此", "但是", "而且", "并且", "不过", "然而", "所以", "如果", "虽然", "尽管",
              "目前", "首先", "其次", "再次", "最后", "此外", "另外", "同时", "综上", "总之", "基于", "鉴于",
              "针对", "对于", "关于", "近年来", "当前", "实践中", "从我国", "从中国")

CJK_NUMERAL = "一二三四五六七八九十百千"

CJK_ORDINAL_RE = re.compile(r"第[" + CJK_NUMERAL + r"]|其[一二三四]|一[二三是]")

CJK_SECTION_TAIL = ("节", "章", "编", "条", "款", "项", "部分")

CJK_ORDINAL_TAIL = ("第一", "第二", "第三", "第四", "一是", "二是", "三是")

CJK_TOPIC_TAIL = "的地得了着与和及或"

CJK_DANGLER = "主是支第被把将能可各每"

CJK_TOPIC_EDGE = CJK_EDGE + CJK_SOFT + ".,;:!?"

_FILLER_SORTED = sorted(CJK_FILLER, key=len, reverse=True)

CJK_MARKERS = "①②③④⑤⑥⑦⑧⑨⑩⑴⑵⑶⑷⑸⑹⑺⑻⑼⑽⒈⒉⒊⒋⒌⒍⒎⒏⒐⒑⁰¹²³⁴⁵⁶⁷⁸⁹†‡§¶"

CJK_LABEL_RE = re.compile(r"^(?:图|表|Figure|Fig\.?|Tab\.?|Table)\s*\d+(?:\s*[-–—]\s*\d+)?\s*")

CJK_TAIL_PUNCT = CJK_EDGE + CJK_SOFT + ".,;:!?)）】]」』”’\"'"

TOC_LINE = re.compile(r"[.．…·]\s*[.．…·]\s*[.．…·]")

CITE_MARK = re.compile(r"\[[A-Za-z/]+\]|出版社|学报|：\s*第?\s*\d{1,4}\s*[-–—]\s*\d{1,4}|pp?\.\s*\d"
                       r"|\bDOI\b|\bISSN\b|CN:\s*\d|[EMDJ]B/OL|https?://|www\.")

FOOT_START = re.compile(r"^\s*[①②③④⑤⑥⑦⑧⑨⑩]\s*")

FOOT_NOTE = re.compile(r"^\s*[①②③④⑤⑥⑦⑧⑨⑩]?\s*《[^》]{2,30}》\s*第\s*\d+\s*条")

def is_apparatus(u, atoms):
    """True for a unit that is the paper's plumbing, not its argument: a contents line, a footnote
    (citation, cross-reference, statutory note). Such a unit folds to nothing and stays at Full."""
    t = plain(u["toks"], atoms).strip()
    if not t:
        return True
    if len(t) < 120 and TOC_LINE.search(t):
        return True
    if FOOT_START.match(t):
        if CITE_MARK.search(t):
            return True
        if FOOT_NOTE.match(t) or "参见" in t or "前引" in t or "同前注" in t:
            return True
        ascii_ratio = sum(c.isascii() and c.isalpha() for c in t) / max(1, sum(c.isalpha() for c in t))
        if ascii_ratio > 0.6 and len(t) < 300:      # an English footnote ("① Ronald J. Mann, …")
            return True
    return False

def suppressed():
    """A ladder that renders nothing below Full: no brief, no takeaway, no topic, no evidence."""
    return {"role": "context", "ev": [], "brief": [], "tn": 0, "topic": [], "model": "local"}

CJK_CLAIM = ("认为", "主张", "应当", "应该", "需要", "必须", "旨在", "在于", "而是", "可见", "因此",
             "所以", "证明", "表明", "说明", "标志", "意味着", "构成", "属于", "界定", "确立", "即：")

CJK_COND_LEAD = ("而如果", "如果", "若", "倘若", "假如", "尽管", "虽然", "由于", "随着", "鉴于", "但是")

def _claim_sentence(u, atoms):
    """The sentence that states the point, not necessarily the first: an introduction or a conditional
    set-up opens many Chinese units, and the claim comes a sentence or two later."""
    best, best_score = 0, -99.0
    for i, (s, e) in enumerate(u["sents"][:4]):
        t = plain(u["toks"][s:e], atoms)
        if len(t) < 10:
            continue
        score = 0.4 - 0.6 * i
        if any(m in t for m in CJK_CLAIM):
            score += 3
        if "：" in t or ":" in t:
            score += 1.5
        if any(t.startswith(m) for m in CJK_COND_LEAD):
            score -= 2.5
        if score > best_score:
            best, best_score = i, score
    return u["sents"][best] if u["sents"] else None

def _cjk_share(text):
    """CJK share among word characters: dot leaders and punctuation must not make a Chinese heading look
    English ("三、立法位阶低且滞后.........." is 18% CJK over all characters but all of its word characters)."""
    w = [c for c in text if c.isalnum() or is_cjk(c)]
    return (sum(is_cjk(c) for c in w) / len(w)) if w else 0.0

def budgets_of(u):
    """The budgets for one unit's own text (no document at hand): a CJK unit's are in characters."""
    text = "".join(tk.get("t") or "" for tk in u["toks"])
    return CJK_BUDGET if _cjk_share(text) > 0.2 else BUDGET

def clean(s):
    s = re.sub(r"\s+", " ", s or "").strip()
    s = re.sub(r"\s*——\s*", "，", s)
    s = re.sub(r"\s*[—–]\s*|\s+-\s+", ", ", s)
    return re.sub(r"[\s.;,!?:。；，！？：、]+$", "", s)

def is_word(tk):
    return "a" in tk or "x" in tk or bool(re.search(r"\w", tk.get("t", "")))

def head_words(toks, n):
    """Indices of the first n words (punctuation between them included, none at the end)."""
    idx, w = [], 0
    for i, tk in enumerate(toks):
        if is_word(tk) and w == n:
            break
        idx.append(i)
        w += is_word(tk)
    while idx and not is_word(toks[idx[-1]]):
        idx.pop()
    return idx

def _skip_marker(text, i):
    """Skip a list marker like "1.", "2、" or "三、" at i; a date ("2019年") or a version ("3.5") is kept."""
    j = i
    while j < len(text) and (text[j].isdigit() or text[j] in CJK_NUMERAL):
        j += 1
    if j > i and j < len(text) and text[j] in ".,、)）;；:：":
        return j + 1
    return i

def _skip_ordinal(text, i):
    """Skip an ordinal like "第一，" or "一是" at i; a section heading ("第二节"), a "第十二条", a plain
    "第三方" or a "第一次" (an ordinal run followed straight by a content character) keeps it."""
    m = CJK_ORDINAL_RE.match(text, i)
    if m is None or text.startswith(CJK_SECTION_TAIL, m.end()):
        return i
    if text.startswith("第", i) and m.end() < len(text) and text[m.end()] not in CJK_SOFT + CJK_EDGE + " ":
        return i
    return m.end()

def _skip_filler(text, i):
    """Skip punctuation, one discourse filler and the punctuation after it ("第一，为了…" → "为了…")."""
    while i < len(text) and text[i] in CJK_SOFT + CJK_EDGE + " ":
        i += 1
    hit = next((f for f in _FILLER_SORTED if text.startswith(f, i)), None)
    if hit is None:
        return i
    i += len(hit)
    while i < len(text) and text[i] in CJK_SOFT + CJK_EDGE + " ":
        i += 1
    return i

def cjk_topic_span(text, n):
    """A CJK topic's char span in `text` (in the text's own coordinates): footnote markers (①②…) are dropped
    wherever they sit ("第③方支付" → "第三方支付"), a figure/table label, list markers, ordinals and leading
    fillers are skipped, the span is cut at a clause edge (a natural phrase may run a few characters past the
    budget) or at the budget, and it never ends on punctuation: a topic is a label, not a sentence."""
    clean, back = "", []                      # the text without markers, and where each clean char sat in the original
    for k, ch in enumerate(text):
        if ch not in CJK_MARKERS:
            clean += ch
            back.append(k)
    if not clean:
        return None
    i = 0
    while i < len(clean) and not is_cjk(clean[i]) and not (clean[i].isascii() and clean[i].isalnum()):
        i += 1                               # "①", punctuation, spaces
    i = _skip_marker(clean, i)                # "1.", "2、", "三、" (a date or a version number stays)
    i = _skip_ordinal(clean, i)               # "第一，"/"一是" ("第二节" stays)
    m = CJK_LABEL_RE.match(clean, i)          # the label prefix of "图 1—1 …", "表 2 …"
    if m:
        i = m.end()
    i = _skip_filler(clean, i)                # a filler, and the punctuation after it
    for p in range(i, min(i + 5, len(clean) - 1)):    # a second filler inside the first few characters ("我国对于…")
        nxt = _skip_filler(clean, p)
        if nxt != p:
            i = nxt
            break
    if i >= len(clean):
        return None
    j, edge = i, None
    while j < min(len(clean), i + n + 5):
        if clean[j] in CJK_TOPIC_EDGE:
            edge = j
            break
        j += 1
    if edge is not None:
        end = edge + 1 if clean[edge] in CJK_EDGE else edge
    else:
        end = min(len(clean), i + n)
        while end < len(clean) and (clean[end].isdigit() or clean[end - 1].isdigit()):
            end += 1                           # never cut a run of digits in half ("…4月29日国家…")
    while end > i + 1 and clean[end - 1] in CJK_TOPIC_TAIL:
        end -= 1
    while end - i >= 4 and clean[end - 2:end] in CJK_ORDINAL_TAIL:
        end -= 2                               # never end inside an ordinal ("…认为第三")
    if (i + 2 < end < len(clean) and clean[end - 1] in CJK_DANGLER
            and is_cjk(clean[end]) and clean[end] not in CJK_TOPIC_EDGE):
        end -= 1                               # never end on a word-initial character ("…的创新之处主" → "…的创新之处")
    while end > i + 1 and clean[end - 1] in CJK_TAIL_PUNCT:
        end -= 1                               # drop the closing punctuation ("…备考属性。" → "…备考属性")
    if end - i < 2:
        return None
    return (back[i], back[end - 1] + 1)

def cjk_takeaway(brief, n):
    """Indices of a CJK takeaway: the first n words, but ending at the last clause edge inside them. An edge in
    the first two tokens is a fragment marker (a line-break shard like "构，"), not a clause, so edges start at
    token 2; the head's end counts one token past its last word (head_words drops trailing punctuation, and a
    sentence-final "。" right there is still an edge); with no edge inside the budget, the first edge within 50%
    past it is used before falling back."""
    head = head_words(brief, n)
    if not head:
        return head
    limit = head[-1] + 1
    far = min(len(brief), limit + 1 + n // 2)
    edges = [k for k in range(2, far)
             if any(c in CJK_EDGE + CJK_SOFT + "," for c in (brief[k].get("t") or ""))]
    inside = [k for k in edges if k <= limit]
    edge = inside[-1] if inside else (edges[0] if edges else None)
    if edge is None:
        return head
    strong = any(c in CJK_EDGE for c in (brief[edge].get("t") or ""))
    return list(range(edge + 1)) if strong else list(range(edge))

def cjk_topic(brief, tn, n):
    """Indices of a CJK topic inside brief[:tn] (cjk_topic_span over its text, mapped back to tokens)."""
    text, starts = "", []
    for i in range(tn):
        starts.append(len(text))
        text += brief[i].get("t") or ""
    span = cjk_topic_span(text, n)
    if span is None:
        return head_words(brief[:tn], n)
    lo = bisect.bisect_left(starts, span[0])
    hi = bisect.bisect_left(starts, span[1])
    rng = list(range(lo, max(hi, lo + 1)))
    kept = [k for k in rng if (brief[k].get("t") or "").strip(CJK_MARKERS + " ")]
    return kept or rng

def local(u, atoms, cjk=None):
    """No model reply: the first sentence stands in for brief, its head for the shorter levels. In a CJK document
    (cjk; None: judged from the unit's own text) the unit's claim sentence stands in, and apparatus (a contents
    line, a footnote) folds to nothing: it stays at Full and hides below it."""
    if not (budgets_of(u) is CJK_BUDGET if cjk is None else cjk):
        s, e = u["sents"][0]
        brief = [dict(tk, m=s + k) for k, tk in enumerate(u["toks"][s:e])]
        head = head_words(brief, BUDGET["takeaway"])
        tn = (head[-1] + 1) if head else len(brief)
        topic = [{**{x: brief[i][x] for x in ("t", "a", "x", "s", "f") if x in brief[i]}, "k": i} for i in head_words(brief[:tn], 3)]
        return {"role": "context", "ev": [0], "brief": brief, "tn": tn, "topic": topic, "model": "local"}
    if is_apparatus(u, atoms):
        return suppressed()
    span = _claim_sentence(u, atoms)
    if span is None:
        return suppressed()
    s, e = span
    brief = [dict(tk, m=s + k) for k, tk in enumerate(u["toks"][s:e])
             if not ((tk.get("t") or "").strip(CJK_MARKERS + " ") == "" and "a" not in tk and "x" not in tk)]
    if not brief:
        return suppressed()
    b = budgets_of(u)
    cjk = _cjk_share("".join(tk.get("t") or "" for tk in brief)) > 0.2
    head = cjk_takeaway(brief, b["takeaway"]) if cjk else head_words(brief, b["takeaway"])
    if cjk and head and any(("".join(brief[i].get("t") or "" for i in head)).startswith(m) for m in CJK_COND_LEAD):
        strong = [k for k in range(head[-1] + 1, min(len(brief), head[-1] + 1 + b["takeaway"]))
                  if any(c in CJK_EDGE for c in (brief[k].get("t") or ""))]
        head = list(range(strong[0] + 1)) if strong else list(range(len(brief)))   # a half conditional says nothing: run on to the next stop
    tn = (head[-1] + 1) if head else len(brief)
    tix = cjk_topic(brief, tn, b["topic"]) if cjk else head_words(brief[:tn], b["topic"])
    topic = []
    for i in tix:
        tk = {**{x: brief[i][x] for x in ("t", "a", "x", "s", "f") if x in brief[i]}, "k": i}
        t = re.sub("[" + re.escape(CJK_MARKERS) + "]", "", tk.get("t") or "")
        if not t and "a" not in tk and "x" not in tk:
            continue                      # a token that is only a footnote marker is not part of a topic
        tk["t"] = t
        topic.append(tk)
    if not topic:                          # everything was stripped: fall back to the head words
        topic = [{**{x: brief[i][x] for x in ("t", "a", "x", "s", "f") if x in brief[i]}, "k": i}
                 for i in head_words(brief[:tn], b["topic"])]
    return {"role": "context", "ev": [0], "brief": brief, "tn": tn, "topic": topic, "model": "local"}
