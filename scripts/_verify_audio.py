"""
Verify that each word's audio_url points to the correct word-by-word audio.
Cross-references the audio_url (format: wbw/{surah}_{ayah}_{word_pos}.mp3)
against quran.com API to confirm the word at that position matches our arabic field.
"""
import json, re, sys, io, time
import urllib.request

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
def _norm(t): return TASHKEEL_RE.sub('', t).translate(ALEF_MAP).strip()

# Cache API responses per ayah
_cache = {}
def get_words(surah, ayah):
    key = f"{surah}:{ayah}"
    if key not in _cache:
        url = f"https://api.quran.com/api/v4/verses/by_key/{surah}:{ayah}?words=true&word_fields=text_uthmani"
        req = urllib.request.Request(url, headers={
            "Accept": "application/json",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        })
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        _cache[key] = data["verse"]["words"]
        time.sleep(0.3)  # rate limit
    return _cache[key]

d = json.load(open("generated/reel_words_top600.json", encoding="utf-8"))

mismatches = []
no_url = []
ok = 0
errors = 0

for w in d["words"]:
    rank = w["rank"]
    arabic = w["arabic"]
    audio_url = w.get("audio_url", "")

    if not audio_url:
        no_url.append(rank)
        continue

    # Parse URL: wbw/002_004_008.mp3
    m = re.search(r'(\d{3})_(\d{3})_(\d{3})\.mp3', audio_url)
    if not m:
        mismatches.append((rank, arabic, audio_url, "UNPARSEABLE URL"))
        continue

    surah = int(m.group(1))
    ayah = int(m.group(2))
    word_pos = int(m.group(3))  # 1-based

    try:
        words = get_words(surah, ayah)
        # word_pos is 1-based; API words list is 0-based, last item is often "end" marker
        api_words = [ww for ww in words if ww.get("char_type_name") == "word"]
        if word_pos < 1 or word_pos > len(api_words):
            mismatches.append((rank, arabic, audio_url, f"pos {word_pos} out of range (ayah has {len(api_words)} words)"))
            continue

        api_word = api_words[word_pos - 1]
        api_text = api_word.get("text_uthmani", api_word.get("text", ""))

        # Compare normalized
        norm_ours = _norm(arabic)
        norm_api = _norm(api_text)

        # Check if our word appears in the API word (handle prefixed forms)
        if norm_ours == norm_api or norm_ours in norm_api or norm_api in norm_ours:
            ok += 1
        else:
            # Try stripping ال
            bare_ours = norm_ours.lstrip('و')
            if bare_ours.startswith('ال'):
                bare_ours = bare_ours[2:]
            bare_api = norm_api.lstrip('و')
            if bare_api.startswith('ال'):
                bare_api = bare_api[2:]
            if bare_ours == bare_api or bare_ours in bare_api or bare_api in bare_ours:
                ok += 1
            else:
                mismatches.append((rank, arabic, f"{surah}:{ayah} pos={word_pos}", f"API: {api_text} | norm: {norm_api} vs {norm_ours}"))
    except Exception as e:
        errors += 1
        if errors <= 5:
            print(f"  ! API error rank {rank}: {e}")

    if rank % 50 == 0:
        print(f"  ... checked {rank}/600")

print(f"\nAUDIO VERIFICATION RESULTS")
print(f"  OK:         {ok}")
print(f"  Mismatch:   {len(mismatches)}")
print(f"  No URL:     {len(no_url)}")
print(f"  API errors: {errors}")

if mismatches:
    print(f"\nMISMATCHES:")
    print(f"{'Rank':<6} {'Arabic':<20} {'Audio ref':<25} Details")
    print("-" * 100)
    for rank, arabic, ref, detail in mismatches:
        print(f"{rank:<6} {arabic:<20} {ref:<25} {detail}")

if no_url:
    print(f"\nNO AUDIO URL: ranks {no_url}")
