"""
Fix the 11 remaining audio mismatches by doing a precise word-by-word search.
For each word, iterate through ayahs in the Quran until we find an exact match.
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

problem_ranks = [30, 33, 137, 203, 224, 245, 283, 377, 402, 512, 546]

d = json.load(open("generated/reel_words_top600.json", encoding="utf-8"))
words_map = {w["rank"]: w for w in d["words"]}

fixes = {}

for rank in problem_ranks:
    w = words_map[rank]
    arabic = w["arabic"]
    norm_target = _norm(arabic)
    print(f"\nSearching #{rank} {arabic} (norm: {norm_target})...")

    found = False
    # Search surahs 1-114, pages 1-3 each
    for surah in range(1, 115):
        if found:
            break
        for page in range(1, 8):
            try:
                url = f"https://api.quran.com/api/v4/verses/by_chapter/{surah}?words=true&word_fields=text_uthmani,audio_url&per_page=50&page={page}"
                req = urllib.request.Request(url, headers=HEADERS)
                with urllib.request.urlopen(req, timeout=15) as resp:
                    data = json.loads(resp.read().decode("utf-8"))
                verses = data.get("verses", [])
                if not verses:
                    break  # no more pages

                for verse in verses:
                    for aw in verse.get("words", []):
                        if aw.get("char_type_name") != "word":
                            continue
                        api_text = aw.get("text_uthmani", "")
                        if _norm(api_text) == norm_target:
                            au = aw.get("audio_url", "")
                            if au:
                                full_url = au if au.startswith("http") else f"https://verses.quran.com/{au}"
                                # Verify: parse the URL and check position
                                m = re.search(r'(\d{3})_(\d{3})_(\d{3})\.mp3', full_url)
                                if m:
                                    fixes[rank] = full_url
                                    print(f"  FOUND: {full_url} (in {verse['verse_key']}, text: {api_text})")
                                    found = True
                                    break
                    if found:
                        break
                time.sleep(0.15)
            except Exception as e:
                time.sleep(0.3)
                break
        if found:
            break

    if not found:
        print(f"  NOT FOUND after full scan!")

print(f"\n{'='*60}")
print(f"Fixed: {len(fixes)}/{len(problem_ranks)}")

if fixes:
    # Apply fixes directly
    for w in d["words"]:
        if w["rank"] in fixes:
            w["audio_url"] = fixes[w["rank"]]
    with open("generated/reel_words_top600.json", "w", encoding="utf-8") as f:
        json.dump(d, f, ensure_ascii=False, indent=2)
    print("Applied fixes to reel_words_top600.json")
