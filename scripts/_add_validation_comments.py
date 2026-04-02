"""Add latest_validation_comment to each word in reel_words_top600.json."""
import json, re, sys, time, urllib.request, io

if sys.stdout.encoding != "utf-8":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

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
    import urllib.parse
    encoded = urllib.parse.quote(verse_key, safe="")
    url = f"https://api.quran.com/api/v4/verses/by_key/{encoded}?language=en&words=true&word_fields=text_uthmani"
    data = fetch_json(url)
    return [w for w in data["verse"]["words"] if w["char_type_name"] == "word"]

def match(example_ar, ayah_words):
    ex_tokens = [_norm_ar(w) for w in example_ar.split() if _norm_ar(w)]
    ay_tokens = [_norm_ar(w.get("text_uthmani", w.get("text", ""))) for w in ayah_words]
    if not ex_tokens or not ay_tokens: return None, None, 0, 0

    # Build joined-normalized form of both sides for flexible matching
    ex_joined = ''.join(ex_tokens)
    ay_joined = ''.join(ay_tokens)

    # Try contiguous token matching with join lookahead
    best_start, best_matched_ay, best_matched_ex = 0, 0, 0
    for start in range(len(ay_tokens)):
        ei, ai = 0, 0  # example index, ayah offset from start
        while ei < len(ex_tokens) and (start + ai) < len(ay_tokens):
            ay_tok = ay_tokens[start + ai]
            ex_tok = ex_tokens[ei]
            if _fuzzy_tok_eq(ex_tok, ay_tok):
                ei += 1; ai += 1
            # Try joining 2 example tokens -> 1 ayah token
            elif ei + 1 < len(ex_tokens) and _fuzzy_tok_eq(ex_tok + ex_tokens[ei + 1], ay_tok):
                ei += 2; ai += 1
            # Try joining 3 example tokens -> 1 ayah token
            elif ei + 2 < len(ex_tokens) and _fuzzy_tok_eq(ex_tok + ex_tokens[ei + 1] + ex_tokens[ei + 2], ay_tok):
                ei += 3; ai += 1
            # Try 1 example token -> 2 joined ayah tokens
            elif (start + ai + 1) < len(ay_tokens) and _fuzzy_tok_eq(ex_tok, ay_tok + ay_tokens[start + ai + 1]):
                ei += 1; ai += 2
            else:
                break
        if ei > best_matched_ex:
            best_start, best_matched_ay, best_matched_ex = start, ai, ei

    if best_matched_ex < max(1, len(ex_tokens) // 2):
        return None, None, len(ex_tokens), best_matched_ex
    return best_start, best_start + best_matched_ay - 1, len(ex_tokens), best_matched_ex

def _ar_word_exact_in_example(arabic_word, example_ar):
    """The exact normalized form must appear in a token (prefix/suffix ok)."""
    if not example_ar:
        return False
    norm_word = _norm_ar(arabic_word)
    if not norm_word or len(norm_word) < 2:
        return True  # very short words (1 char) – skip check
    for tok in example_ar.split():
        nt = _norm_ar(tok)
        if norm_word in nt:
            return True
    return False

def _en_word_in_translation(english_meaning, translation):
    if not translation:
        return False
    meaning_lower = english_meaning.lower().strip()
    trans_lower = translation.lower()
    if meaning_lower in trans_lower:
        return True
    meaning_words = meaning_lower.split()
    if len(meaning_words) > 1:
        for mw in meaning_words:
            if len(mw) > 2 and mw in trans_lower:
                return True
    return False

# ── Load ──
SRC = 'generated/reel_words_top600_validated.json'
DST = 'generated/reel_words_top600_validated.json'

d = json.load(open(SRC, encoding='utf-8'))
words = d['words']

counts = {"ok": 0, "soft": 0, "partial": 0, "fail": 0, "no_example": 0, "api_error": 0}

for i, w in enumerate(words):
    rank = w.get('rank', 0)
    arabic = w['arabic']
    english = w['meaning']

    example_ar = (w.get('pass3_example', '')
                  or w.get('pass2_gpt_example', '')
                  or w.get('example_ar', ''))
    example_ref = (w.get('pass3_reference', '')
                   or w.get('pass2_gpt_reference', '')
                   or w.get('example_ref', ''))
    example_en = (w.get('pass3_translation', '')
                  or w.get('API_TRANSLATION', '')
                  or w.get('QURAN_TRANSLATION', '')
                  or w.get('example_en', ''))

    # --- Strict check flags ---
    ar_ok = _ar_word_exact_in_example(arabic, example_ar) if example_ar else False
    en_ok = _en_word_in_translation(english, example_en) if example_en else False

    if not example_ar or not example_ref:
        w['latest_validation_comment'] = 'no_example_data'
        counts["no_example"] += 1
        print(f"  [{i+1}/600] #{rank} {arabic} -> no_example_data")
        continue

    try:
        time.sleep(0.25)
        ayah_words = fetch_ayah_words(example_ref)
        start, end, ex_count, matched_count = match(example_ar, ayah_words)

        if start is None:
            comment = f"match_fail (matched={matched_count}/{ex_count})"
            counts["fail"] += 1
        elif matched_count < ex_count:
            comment = f"match_partial (matched={matched_count}/{ex_count})"
            counts["partial"] += 1
        else:
            # All tokens matched — check strict criteria
            if ar_ok and en_ok:
                comment = "match_ok"
                counts["ok"] += 1
            else:
                reasons = []
                if not ar_ok: reasons.append("ar_missing")
                if not en_ok: reasons.append("en_missing")
                comment = f"match_soft ({', '.join(reasons)})"
                counts["soft"] += 1

        w['latest_validation_comment'] = comment
        if comment != "match_ok":
            print(f"  [{i+1}/600] #{rank} {arabic} -> {comment}")
        elif rank % 50 == 0:
            print(f"  [{i+1}/600] #{rank} {arabic} -> ok")

    except Exception as exc:
        w['latest_validation_comment'] = f"api_error ({exc})"
        counts["api_error"] += 1
        print(f"  [{i+1}/600] #{rank} {arabic} -> API ERROR: {exc}")

# ── Write ──
with open(DST, 'w', encoding='utf-8') as f:
    json.dump(d, f, ensure_ascii=False, indent=2)

print(f"\n{'='*60}")
print(f"Total: {len(words)}")
for k, v in counts.items():
    print(f"  {k}: {v}")
print(f"\nWritten to {DST}")
