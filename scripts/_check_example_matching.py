"""
Dry-run check: For all 600 words, verify that the example_ar tokens
match against the ayah words from quran.com API.
Reports words where match_example_to_word_range would fail.
"""
import json, re, sys, io, time, urllib.request, urllib.parse

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

def _strip_alef(text):
    return text.replace('\u0627', '')

def _fuzzy_tok_eq(ex_tok, ay_tok):
    if ex_tok == ay_tok:
        return True
    if ay_tok.endswith(ex_tok) and len(ex_tok) >= 2:
        return True
    if ex_tok.endswith(ay_tok) and len(ay_tok) >= 2:
        return True
    ex_skel = _strip_alef(ex_tok)
    ay_skel = _strip_alef(ay_tok)
    if ex_skel and ex_skel == ay_skel:
        return True
    if ay_skel.endswith(ex_skel) and len(ex_skel) >= 2:
        return True
    if ex_skel.endswith(ay_skel) and len(ay_skel) >= 2:
        return True
    return False

HEADERS = {"Accept": "application/json", "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}

_word_cache = {}
def fetch_ayah_words(verse_key):
    if verse_key in _word_cache:
        return _word_cache[verse_key]
    encoded = urllib.parse.quote(verse_key, safe="")
    url = f"https://api.quran.com/api/v4/verses/by_key/{encoded}?language=en&words=true&word_fields=text_uthmani"
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=15) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    words = []
    for w in data["verse"]["words"]:
        if w["char_type_name"] == "word":
            words.append({"position": w["position"], "text": w.get("text_uthmani", w.get("text", ""))})
    _word_cache[verse_key] = words
    time.sleep(0.2)
    return words

_seg_cache = {}
def fetch_ayah_segments(verse_key, reciter_id=7):
    if verse_key in _seg_cache:
        return _seg_cache[verse_key]
    encoded = urllib.parse.quote(verse_key, safe="")
    url = f"https://api.quran.com/api/v4/recitations/{reciter_id}/by_ayah/{encoded}?fields=segments"
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=15) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    af = data["audio_files"][0]
    _seg_cache[verse_key] = af["segments"]
    time.sleep(0.2)
    return af["segments"]

def match_example(example_ar, ayah_words):
    ex_tokens = [_norm_ar(w) for w in example_ar.split() if _norm_ar(w)]
    ay_tokens = [_norm_ar(w["text"]) for w in ayah_words]
    if not ex_tokens or not ay_tokens:
        return None, None, 0, len(ex_tokens)
    best_start, best_len = 0, 0
    for start in range(len(ay_tokens)):
        match_len = 0
        for j in range(len(ex_tokens)):
            if start + j < len(ay_tokens) and _fuzzy_tok_eq(ex_tokens[j], ay_tokens[start + j]):
                match_len += 1
            else:
                break
        if match_len > best_len:
            best_start = start
            best_len = match_len
    if best_len < max(1, len(ex_tokens) // 2):
        return None, None, best_len, len(ex_tokens)
    return best_start, best_start + best_len - 1, best_len, len(ex_tokens)


d = json.load(open("generated/reel_words_top600.json", encoding="utf-8"))

no_example = []
no_ref = []
match_fail = []
seg_fail = []
ok = 0
api_errors = 0

for w in d["words"]:
    rank = w["rank"]
    arabic = w["arabic"]
    example_ar = w.get("example_ar", "")
    example_ref = w.get("example_ref", "")

    if not example_ar:
        no_example.append(rank)
        continue
    if not example_ref:
        no_ref.append(rank)
        continue

    try:
        ayah_words = fetch_ayah_words(example_ref)
        start, end, matched, total = match_example(example_ar, ayah_words)

        if start is None:
            match_fail.append((rank, arabic, example_ref, example_ar, matched, total))
            continue

        # Also check segments exist
        segments = fetch_ayah_segments(example_ref)
        # Clamp end to last segment (matches video script behavior)
        clamped_end = min(end, len(segments) - 1)
        if clamped_end < 0:
            seg_fail.append((rank, arabic, example_ref, f"no segments available"))
            continue

        ok += 1
    except Exception as e:
        api_errors += 1
        if api_errors <= 5:
            print(f"  ! API error #{rank}: {e}")

    if rank % 50 == 0:
        print(f"  ... checked {rank}/600 (ok={ok})")

print(f"\n{'='*60}")
print(f"EXAMPLE MATCHING RESULTS")
print(f"  OK:           {ok}")
print(f"  Match fail:   {len(match_fail)}")
print(f"  Segment fail: {len(seg_fail)}")
print(f"  No example:   {len(no_example)}")
print(f"  No ref:       {len(no_ref)}")
print(f"  API errors:   {api_errors}")

if match_fail:
    print(f"\nMATCH FAILURES (token matching failed):")
    print(f"{'Rank':<6} {'Arabic':<20} {'Ref':<10} {'Matched':<10} Example")
    print("-" * 110)
    for rank, arabic, ref, ex, matched, total in match_fail:
        print(f"{rank:<6} {arabic:<20} {ref:<10} {matched}/{total:<6} {ex}")

if seg_fail:
    print(f"\nSEGMENT FAILURES (matched but no segment data):")
    print(f"{'Rank':<6} {'Arabic':<20} {'Ref':<10} Details")
    print("-" * 80)
    for rank, arabic, ref, detail in seg_fail:
        print(f"{rank:<6} {arabic:<20} {ref:<10} {detail}")

if no_example:
    print(f"\nNO EXAMPLE: {no_example}")
if no_ref:
    print(f"\nNO REF: {no_ref}")
