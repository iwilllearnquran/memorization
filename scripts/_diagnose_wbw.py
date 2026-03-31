"""Diagnose why 194 QURAN_TRANSLATION entries are empty"""
import json, os, re

DS_PATH = "generated/reel_words_top600.json"
WBW_CACHE = "generated/.wbw_cache"

ds = json.load(open(DS_PATH, encoding="utf-8"))
words = ds["words"]

wbw = {}
for fn in os.listdir(WBW_CACHE):
    d = json.load(open(f"{WBW_CACHE}/{fn}", encoding="utf-8"))
    wbw.update(d)

def norm(s):
    s = re.sub(
        r'[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0653\u0654\u0655\u0640\u06E5\u06E6\u06DF\u08D3-\u08E1\u08E3-\u08FF\uFE70-\uFE7F]',
        '', s
    )
    s = re.sub(r'[\u0671\u0623\u0625\u0622]', '\u0627', s)
    s = s.replace('\u0626', '\u064A').replace('\u0624', '\u0648').replace('\u0621', '')
    s = s.replace('\u0649', '\u064A').replace('\u0629', '\u0647')
    return re.sub(r'\s+', ' ', s).strip()

no_wbw = 0
no_match = 0
samples = []

for w in words:
    if w.get("QURAN_TRANSLATION"):
        continue
    ref = w.get("pass2_gpt_reference", "")
    ex = w.get("pass2_gpt_example", "")
    
    verse_wbw = wbw.get(ref, [])
    if not verse_wbw:
        no_wbw += 1
        # Check which chapter is missing
        ch = ref.split(":")[0] if ":" in ref else "?"
        if len(samples) < 5:
            samples.append(f"  NO_WBW [{w['rank']}] ref={ref} ch={ch}")
        continue
    
    # Try matching
    ex_words_n = norm(ex).split()
    wbw_words_n = [norm(ww["ar"]) for ww in verse_wbw]
    
    # Show mismatches for first few
    if no_match < 5:
        print(f"\n[{w['rank']}] ref={ref}")
        print(f"  Example: {ex}")
        print(f"  Ex norm: {ex_words_n}")
        print(f"  WBW norm: {wbw_words_n}")
        # Show char-by-char for first mismatch
        for ew in ex_words_n:
            found = False
            for ww in wbw_words_n:
                if ew == ww:
                    found = True
                    break
            if not found:
                print(f"  MISSING ex word '{ew}' ({[hex(ord(c)) for c in ew]})")
                # Find closest in WBW
                for ww in wbw_words_n:
                    if ew in ww or ww in ew:
                        print(f"    Partial: '{ww}' ({[hex(ord(c)) for c in ww]})")
    no_match += 1

print(f"\n=== Summary ===")
print(f"Missing QURAN_TRANSLATION: {no_wbw + no_match}")
print(f"  No WBW data for verse: {no_wbw}")
print(f"  WBW exists but no match: {no_match}")
for s in samples:
    print(s)

# Count which chapters are missing from WBW
missing_chapters = set()
for w in words:
    if w.get("QURAN_TRANSLATION"):
        continue
    ref = w.get("pass2_gpt_reference", "")
    if ref not in wbw:
        ch = ref.split(":")[0] if ":" in ref else "?"
        missing_chapters.add(ch)

print(f"\nMissing WBW chapters: {sorted(missing_chapters, key=lambda x: int(x) if x.isdigit() else 0)}")
