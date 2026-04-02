"""Quick test of updated match() on known problem ranks."""
import json, sys, io, urllib.request, urllib.parse

if sys.stdout.encoding != "utf-8":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

# Import match logic from the validation script
import importlib.util, re
spec = importlib.util.spec_from_file_location("vc", "scripts/_add_validation_comments.py")
# We can't import directly (it runs on import), so just copy the functions:

import re
TASHKEEL_RE = re.compile(r'[\u064B-\u065F\u06D6-\u06ED\u0640]')
ALEF_MAP = str.maketrans({
    '\u0622': '\u0627', '\u0623': '\u0627', '\u0625': '\u0627',
    '\u0671': '\u0627', '\u0670': '\u0627',
    '\u0621': '', '\u0654': '', '\u0655': '', '\u0674': '', '\u0653': '',
    '\u0649': '\u064A', '\u0629': '\u0647', '\u0624': '\u0648', '\u0626': '\u064A',
    '\u06E1': '', '\u06DF': '', '\u06E5': '', '\u06E6': '',
})
def _norm_ar(t): return TASHKEEL_RE.sub('', t).translate(ALEF_MAP).strip()
def _strip_alef(t): return t.replace('\u0627', '')
def _fuzzy_tok_eq(ex_tok, ay_tok):
    if ex_tok == ay_tok: return True
    if ay_tok.endswith(ex_tok) and len(ex_tok) >= 2: return True
    if ex_tok.endswith(ay_tok) and len(ay_tok) >= 2: return True
    ex_s, ay_s = _strip_alef(ex_tok), _strip_alef(ay_tok)
    if ex_s and ex_s == ay_s: return True
    if ay_s.endswith(ex_s) and len(ex_s) >= 2: return True
    if ex_s.endswith(ay_s) and len(ay_s) >= 2: return True
    return False

HEADERS = {"User-Agent": "LearnQuranDaily/2.0", "Accept": "application/json"}
def fetch_json(url):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=20) as resp:
        return json.loads(resp.read().decode("utf-8"))
def fetch_ayah_words(verse_key):
    encoded = urllib.parse.quote(verse_key, safe="")
    url = f"https://api.quran.com/api/v4/verses/by_key/{encoded}?language=en&words=true&word_fields=text_uthmani"
    data = fetch_json(url)
    return [w for w in data["verse"]["words"] if w["char_type_name"] == "word"]

def match(example_ar, ayah_words):
    ex_tokens = [_norm_ar(w) for w in example_ar.split() if _norm_ar(w)]
    ay_tokens = [_norm_ar(w.get("text_uthmani", w.get("text", ""))) for w in ayah_words]
    if not ex_tokens or not ay_tokens: return None, None, 0, 0
    best_start, best_matched_ay, best_matched_ex = 0, 0, 0
    for start in range(len(ay_tokens)):
        ei, ai = 0, 0
        while ei < len(ex_tokens) and (start + ai) < len(ay_tokens):
            ay_tok = ay_tokens[start + ai]
            ex_tok = ex_tokens[ei]
            if _fuzzy_tok_eq(ex_tok, ay_tok):
                ei += 1; ai += 1
            elif ei + 1 < len(ex_tokens) and _fuzzy_tok_eq(ex_tok + ex_tokens[ei + 1], ay_tok):
                ei += 2; ai += 1
            elif ei + 2 < len(ex_tokens) and _fuzzy_tok_eq(ex_tok + ex_tokens[ei + 1] + ex_tokens[ei + 2], ay_tok):
                ei += 3; ai += 1
            elif (start + ai + 1) < len(ay_tokens) and _fuzzy_tok_eq(ex_tok, ay_tok + ay_tokens[start + ai + 1]):
                ei += 1; ai += 2
            else:
                break
        if ei > best_matched_ex:
            best_start, best_matched_ay, best_matched_ex = start, ai, ei
    if best_matched_ex < max(1, len(ex_tokens) // 2):
        return None, None, len(ex_tokens), best_matched_ex
    return best_start, best_start + best_matched_ay - 1, len(ex_tokens), best_matched_ex

# Test on known problem ranks
d = json.load(open('generated/reel_words_top600_validated.json', encoding='utf-8'))
problem_ranks = [7,45,62,77,91,195,216,221,241,263,294,305,314,341,389,466,470,495,496,498,515,530,568,587]

import time
for w in d['words']:
    if w['rank'] not in problem_ranks: continue
    ex = w.get('pass3_example','') or w.get('pass2_gpt_example','') or ''
    ref = w.get('pass3_reference','') or w.get('pass2_gpt_reference','') or ''
    if not ex or not ref: continue
    time.sleep(0.3)
    ayah_words = fetch_ayah_words(ref)
    start, end, ex_count, matched = match(ex, ayah_words)
    old = w.get('latest_validation_comment','')
    status = "FULL" if matched == ex_count else ("PARTIAL" if start is not None else "FAIL")
    improved = " <<<IMPROVED" if 'fail' in old and status != 'FAIL' or 'partial' in old and status == 'FULL' else ""
    print(f"#{w['rank']:>3} {w['arabic']:>20}  {matched}/{ex_count} {status:>8}  (was: {old}){improved}")
