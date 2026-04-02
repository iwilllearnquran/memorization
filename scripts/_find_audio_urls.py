"""
Find correct audio URLs for words with missing/mismatched audio.
Strategy: Use the example_ref (surah:ayah) to look up the ayah's words,
then find which word position matches our arabic word.
Fallback: search other ayahs in the Quran for the exact word form.
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

HEADERS = {
    "Accept": "application/json",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
}

_cache = {}
def get_ayah_words(surah, ayah):
    key = f"{surah}:{ayah}"
    if key not in _cache:
        url = f"https://api.quran.com/api/v4/verses/by_key/{surah}:{ayah}?words=true&word_fields=text_uthmani,audio_url"
        req = urllib.request.Request(url, headers=HEADERS)
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        _cache[key] = data["verse"]["words"]
        time.sleep(0.3)
    return _cache[key]

def search_word_in_quran(arabic, norm_target):
    """Search a few common surahs for the word. Returns audio_url or None."""
    # Try first 10 surahs (short, common words appear often)
    for surah in range(1, 115):
        try:
            url = f"https://api.quran.com/api/v4/verses/by_chapter/{surah}?words=true&word_fields=text_uthmani,audio_url&per_page=50&page=1"
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=15) as resp:
                data = json.loads(resp.read().decode("utf-8"))
            for verse in data.get("verses", []):
                for w in verse.get("words", []):
                    if w.get("char_type_name") != "word":
                        continue
                    api_text = w.get("text_uthmani", "")
                    if _norm(api_text) == norm_target:
                        au = w.get("audio_url", "")
                        if au:
                            return au if au.startswith("http") else f"https://verses.quran.com/{au}"
            time.sleep(0.2)
        except Exception:
            time.sleep(0.5)
    return None

d = json.load(open("generated/reel_words_top600.json", encoding="utf-8"))

missing_ranks = {28,30,33,42,66,127,137,155,178,203,218,223,224,245,250,263,273,283,295,302,318,331,342,356,377,378,402,406,412,431,434,436,460,505,512,525,546,548,578,587,598}
mismatch_ranks = {201, 383, 501}
target_ranks = missing_ranks | mismatch_ranks

fixes = {}
not_found = []

for w in d["words"]:
    rank = w["rank"]
    if rank not in target_ranks:
        continue

    arabic = w["arabic"]
    norm_target = _norm(arabic)
    ref = w.get("example_ref", "")
    found_url = None

    # Strategy 1: Look in the example ayah
    if ref and ":" in ref:
        surah, ayah = ref.split(":")
        try:
            words = get_ayah_words(int(surah), int(ayah))
            api_words = [aw for aw in words if aw.get("char_type_name") == "word"]
            for aw in api_words:
                api_text = aw.get("text_uthmani", "")
                api_norm = _norm(api_text)
                if api_norm == norm_target or norm_target in api_norm:
                    au = aw.get("audio_url", "")
                    if au:
                        found_url = au if au.startswith("http") else f"https://verses.quran.com/{au}"
                        break
                # Also try with stripped ال
                bare_target = norm_target.lstrip('و')
                if bare_target.startswith('ال'):
                    bare_target = bare_target[2:]
                bare_api = api_norm.lstrip('و')
                if bare_api.startswith('ال'):
                    bare_api = bare_api[2:]
                if len(bare_target) >= 2 and (bare_target == bare_api or bare_target in bare_api):
                    au = aw.get("audio_url", "")
                    if au:
                        found_url = au if au.startswith("http") else f"https://verses.quran.com/{au}"
                        break
        except Exception as e:
            print(f"  ! API error for {rank} ({ref}): {e}")

    # Strategy 2: Search nearby ayahs (same surah, ±5 ayahs)
    if not found_url and ref and ":" in ref:
        surah, ayah = ref.split(":")
        s, a = int(surah), int(ayah)
        for da in range(-5, 6):
            if da == 0:
                continue
            try:
                words = get_ayah_words(s, a + da)
                api_words = [aw for aw in words if aw.get("char_type_name") == "word"]
                for aw in api_words:
                    api_text = aw.get("text_uthmani", "")
                    if _norm(api_text) == norm_target:
                        au = aw.get("audio_url", "")
                        if au:
                            found_url = au if au.startswith("http") else f"https://verses.quran.com/{au}"
                            break
                if found_url:
                    break
            except Exception:
                pass

    # Strategy 3: Search surah 2 (longest, most common words)
    if not found_url:
        for surah_num in [2, 3, 4, 5, 7]:
            for page in range(1, 5):
                try:
                    url = f"https://api.quran.com/api/v4/verses/by_chapter/{surah_num}?words=true&word_fields=text_uthmani,audio_url&per_page=50&page={page}"
                    req = urllib.request.Request(url, headers=HEADERS)
                    with urllib.request.urlopen(req, timeout=15) as resp:
                        data = json.loads(resp.read().decode("utf-8"))
                    for verse in data.get("verses", []):
                        for aw in verse.get("words", []):
                            if aw.get("char_type_name") != "word":
                                continue
                            if _norm(aw.get("text_uthmani", "")) == norm_target:
                                au = aw.get("audio_url", "")
                                if au:
                                    found_url = au if au.startswith("http") else f"https://verses.quran.com/{au}"
                                    break
                        if found_url:
                            break
                    if found_url:
                        break
                    time.sleep(0.2)
                except Exception:
                    time.sleep(0.3)
            if found_url:
                break

    if found_url:
        fixes[rank] = found_url
        tag = "FIXED" 
    else:
        not_found.append(rank)
        tag = "NOT FOUND"
    
    print(f"  [{tag}] #{rank} {arabic} ({norm_target}) -> {found_url or '???'}")

# Summary
print(f"\n{'='*60}")
print(f"FOUND: {len(fixes)}/{len(target_ranks)}")
print(f"NOT FOUND: {len(not_found)}")
if not_found:
    print(f"  Ranks: {not_found}")

# Write fixes
if fixes:
    with open("scripts/_audio_fixes.json", "w", encoding="utf-8") as f:
        json.dump(fixes, f, ensure_ascii=False, indent=2)
    print(f"\nFixes written to scripts/_audio_fixes.json")
    print("Run _apply_audio_fixes.py to apply them.")
