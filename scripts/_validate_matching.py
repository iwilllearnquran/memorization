"""Dry-run: check word matching for all 600 words without generating videos."""
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
    best_start, best_len = 0, 0
    for start in range(len(ay_tokens)):
        ml = 0
        for j in range(len(ex_tokens)):
            if start + j < len(ay_tokens) and _fuzzy_tok_eq(ex_tokens[j], ay_tokens[start + j]):
                ml += 1
            else: break
        if ml > best_len: best_start, best_len = start, ml
    if best_len < max(1, len(ex_tokens) // 2):
        return None, None, len(ex_tokens), best_len
    return best_start, best_start + best_len - 1, len(ex_tokens), best_len

d = json.load(open('generated/reel_words_top600.json', encoding='utf-8'))
words = d['words']

no_example = []
no_audio = []
match_fail = []
match_partial = []
match_ok = []       # Strict: ALL criteria pass
match_soft = []     # Token match ok but missing arabic/english word checks
api_errors = []
ar_word_missing = []   # Arabic word not found in Arabic example
en_word_missing = []   # English meaning not found in English translation

def _ar_word_exact_in_example(arabic_word, example_ar):
    """Check if the EXACT Arabic word appears in the example (normalized but not fuzzy)."""
    if not example_ar:
        return False  # no example means check fails
    norm_word = _norm_ar(arabic_word)
    for tok in example_ar.split():
        nt = _norm_ar(tok)
        if nt == norm_word:
            return True
    return False

def _en_word_in_translation(english_meaning, translation):
    """Check if the English meaning appears in the translation (case-insensitive)."""
    if not translation:
        return False  # no translation means check fails
    meaning_lower = english_meaning.lower().strip()
    trans_lower = translation.lower()
    # Direct substring match
    if meaning_lower in trans_lower:
        return True
    # Check individual words of the meaning
    meaning_words = meaning_lower.split()
    if len(meaning_words) > 1:
        # Multi-word meaning: check if at least one key word appears
        for mw in meaning_words:
            if len(mw) > 2 and mw in trans_lower:
                return True
    return False

for w in words:
    rank = w.get('rank', 0)
    arabic = w['arabic']
    english = w['meaning']

    # Prefer pass3, then pass2, then legacy fields
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
    audio_url = w.get('audio_url', '')

    if not audio_url:
        no_audio.append(rank)

    # --- Strict check flags ---
    ar_ok = False
    en_ok = False
    tok_ok = False  # all tokens matched

    # Check: Arabic word EXACT in Arabic example
    if example_ar:
        ar_ok = _ar_word_exact_in_example(arabic, example_ar)
        if not ar_ok:
            ar_word_missing.append((rank, arabic, example_ar))
    # Check: English meaning in English translation
    if example_en:
        en_ok = _en_word_in_translation(english, example_en)
        if not en_ok:
            en_word_missing.append((rank, english, example_en))

    if not example_ar or not example_ref:
        no_example.append(rank)
        continue

    try:
        time.sleep(0.25)
        ayah_words = fetch_ayah_words(example_ref)
        start, end, ex_count, matched_count = match(example_ar, ayah_words)
        if start is None:
            match_fail.append((rank, arabic, example_ref, example_ar, ex_count, matched_count))
            print(f"  FAIL #{rank} {arabic} ref={example_ref} matched={matched_count}/{ex_count}")
        elif matched_count < ex_count:
            match_partial.append((rank, arabic, example_ref, matched_count, ex_count))
            print(f"  PARTIAL #{rank} {arabic} ref={example_ref} matched={matched_count}/{ex_count}")
        else:
            tok_ok = True
            # Strict OK: all tokens match AND exact Arabic word AND English meaning
            if tok_ok and ar_ok and en_ok:
                match_ok.append(rank)
                if rank % 50 == 0:
                    print(f"  ok #{rank} {arabic}")
            else:
                reasons = []
                if not ar_ok: reasons.append("ar_missing")
                if not en_ok: reasons.append("en_missing")
                match_soft.append((rank, arabic, reasons))
                print(f"  SOFT #{rank} {arabic} tokens=OK but {', '.join(reasons)}")
    except Exception as exc:
        api_errors.append((rank, str(exc)))
        print(f"  API ERROR #{rank} {arabic}: {exc}")

print(f"\n{'='*60}")
print(f"Total words: {len(words)}")
print(f"No audio URL: {len(no_audio)}")
print(f"No example data: {len(no_example)}")
print(f"Match OK (STRICT — all checks pass): {len(match_ok)}")
print(f"Match SOFT (tokens OK, missing ar/en): {len(match_soft)}")
print(f"Match PARTIAL: {len(match_partial)}")
print(f"Match FAIL: {len(match_fail)}")
print(f"API errors: {len(api_errors)}")

if match_soft:
    print(f"\n--- SOFT (tokens OK, missing checks) ({len(match_soft)}) ---")
    for rank, ar, reasons in match_soft:
        print(f"  #{rank} {ar} — {', '.join(reasons)}")

if match_fail:
    print(f"\n--- FAILURES ({len(match_fail)}) ---")
    for rank, ar, ref, ex, ec, mc in match_fail:
        print(f"  #{rank} {ar} ref={ref} example='{ex}' matched={mc}/{ec}")

if match_partial:
    print(f"\n--- PARTIAL ({len(match_partial)}) ---")
    for rank, ar, ref, mc, ec in match_partial:
        print(f"  #{rank} {ar} ref={ref} matched={mc}/{ec}")

if api_errors:
    print(f"\n--- API ERRORS ({len(api_errors)}) ---")
    for rank, err in api_errors:
        print(f"  #{rank}: {err}")

if no_audio:
    print(f"\n--- NO AUDIO URL ({len(no_audio)}) ---")
    print(f"  Ranks: {no_audio[:20]}{'...' if len(no_audio)>20 else ''}")

if ar_word_missing:
    print(f"\n--- ARABIC WORD NOT IN EXAMPLE ({len(ar_word_missing)}) ---")
    for rank, ar, ex in ar_word_missing:
        print(f"  #{rank} word='{ar}' not found in example='{ex}'")

if en_word_missing:
    print(f"\n--- ENGLISH MEANING NOT IN TRANSLATION ({len(en_word_missing)}) ---")
    for rank, en, trans in en_word_missing:
        print(f"  #{rank} meaning='{en}' not found in translation='{trans}'")
