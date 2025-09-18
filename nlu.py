# nlu.py
import re

# ------------ Rule-based ------------
NUM_RE  = re.compile(r"\b(\d{1,3})\b", re.I)
PAGE_RE = re.compile(r"page\s+(\d+)", re.I)
SUB_RE  = re.compile(r"(quarter|eighth|triplet|sixteenth)", re.I)

def nlu_rules(utterance: str):
    u = utterance.strip().lower()

    # metronome
    if re.search(r"\b(start|begin)\s+metronome\b", u): return {"name":"start_met"}
    if re.search(r"\b(stop|end)\s+metronome\b",  u):   return {"name":"stop_met"}
    if re.search(r"\b(tap\s+tempo)\b", u):             return {"name":"tap_tempo"}
    if re.search(r"\bwhat'?s\s+(tempo|bpm)\b", u):     return {"name":"what_tempo"}

    if re.search(r"\b(set\s+(tempo|bpm)\s+(to|at)\s+\d{2,3}|(tempo|bpm)\s+\d{2,3})\b", u):
        m = NUM_RE.search(u); 
        if m: return {"name":"set_tempo","bpm":int(m.group(1))}

    m = re.search(r"\b(increase|up)\s+(tempo|bpm)(?:\s+by)?\s+(\d{1,3})\b", u)
    if m: return {"name":"inc_tempo","delta":int(m.group(3))}
    m = re.search(r"\b(decrease|down)\s+(tempo|bpm)(?:\s+by)?\s+(\d{1,3})\b", u)
    if m: return {"name":"dec_tempo","delta":int(m.group(3))}

    m = SUB_RE.search(u)
    if m and "subdiv" in u:
        return {"name":"set_subdivision","sub":m.group(1)}

    # pages
    if re.search(r"\b(next\s+page|turn\s+page)\b", u): return {"name":"next_page"}
    if re.search(r"\b(previous\s+page|prev\s+page)\b", u): return {"name":"prev_page"}
    m = PAGE_RE.search(u)
    if m and "go to page" in u:
        return {"name":"goto_page","page":int(m.group(1))}

    # scheduled flip
    m = re.search(r"turn\s+page\s+in\s+(\d+)\s+bars?", u)
    if m: return {"name":"schedule_page_turn","bars":int(m.group(1))}

    if re.search(r"\bhelp\b", u): return {"name":"help"}
    if re.search(r"\b(quit|exit)\b", u): return {"name":"quit"}

    return {"name":"unknown"}

# ------------ Optional ML ------------
_HAS_SK = False
try:
    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.linear_model import LogisticRegression
    _HAS_SK = True
except Exception:
    _HAS_SK = False

TRAIN_DATA = [
    ("start metronome","start_met"), ("begin metronome","start_met"),
    ("stop metronome","stop_met"), ("end metronome","stop_met"),
    ("set tempo to 120","set_tempo"), ("tempo 140","set_tempo"), ("bpm 76","set_tempo"),
    ("increase tempo by 5","inc_tempo"), ("tempo up 3","inc_tempo"),
    ("decrease tempo by 4","dec_tempo"), ("tempo down 10","dec_tempo"),
    ("what's tempo","what_tempo"), ("what is my bpm","what_tempo"),
    ("tap tempo","tap_tempo"),
    ("next page","next_page"), ("turn page","next_page"),
    ("previous page","prev_page"),
    ("go to page 5","goto_page"), ("open page 3","goto_page"),
    ("set subdivision to eighth","set_subdivision"), ("subdivision triplet","set_subdivision"),
    ("turn page in 4 bars","schedule_page_turn"),
    ("help","help"), ("quit","quit")
]

VEC = None
CLF = None

def ml_train():
    global VEC, CLF
    if not _HAS_SK:
        return False
    texts, labels = zip(*TRAIN_DATA)
    VEC = TfidfVectorizer(ngram_range=(1,2), min_df=1)
    X = VEC.fit_transform(texts)
    CLF = LogisticRegression(max_iter=300).fit(X, labels)
    return True

def ml_predict(utterance: str):
    if not (_HAS_SK and VEC and CLF):
        return None
    X = VEC.transform([utterance])
    proba = CLF.predict_proba(X)[0]
    label = CLF.classes_[proba.argmax()]
    conf = float(proba.max())
    return (label, conf) if conf >= 0.45 else None

def nlu(utterance: str):
    pred = ml_predict(utterance)
    if pred:
        intent, conf = pred
        # enrich with params
        m = NUM_RE.search(utterance)
        if intent == "set_tempo":
            return {"name":"set_tempo","bpm": int(m.group(1)) if m else None, "conf":conf}
        if intent in {"inc_tempo","dec_tempo"}:
            return {"name":intent,"delta": int(m.group(1)) if m else 5, "conf":conf}
        if intent == "goto_page":
            return {"name":"goto_page","page": int(m.group(1)) if m else None, "conf":conf}
        if intent == "set_subdivision":
            sm = SUB_RE.search(utterance)
            return {"name":"set_subdivision","sub": sm.group(1).lower() if sm else None, "conf":conf}
        if intent == "schedule_page_turn":
            bm = re.search(r"(\d+)\s+bars?", utterance.lower())
            return {"name":"schedule_page_turn","bars": int(bm.group(1)) if bm else None, "conf":conf}
        return {"name":intent,"conf":conf}
    # fallback rules
    return nlu_rules(utterance)