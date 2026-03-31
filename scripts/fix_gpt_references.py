"""
Fix wrong verse references in GPT examples by searching the full Quran text.
1. Download all 6236 verses (Uthmani script) from quran.com, cache locally
2. For each FAILED example, find the correct verse
3. Update the dataset
"""
import json, os, sys, time
import urllib.request

CACHE_DIR = os.path.join(os.path.dirname(__file__), "..", "generated", ".quran_full_cache")
os.makedirs(CACHE_DIR, exist_ok=True)

STRIP_CHARS = set('\u0670\u06e5\u06e6\u08f0\u08f1\u08f2\u06df\u06e0\u06e1\u06e2\u06e3\u06e4\u06e7\u06e8\u06ea\u06eb\u06ec\u06ed\u0653\u0654\u0655\u065f\u0656\u0657\u0658\u06dc\u06d6\u06d7\u06d8\u06d9\u06da\u06db\u06dd\u06de\u0620')

def strip_for_search(s):
    """Aggressive normalization: remove tashkeel, Quranic marks, normalize letters."""
    out = []
    for c in s:
        cp = ord(c)
        if 0x064B <= cp <= 0x065F:  # tashkeel
            continue
        if 0x0610 <= cp <= 0x061A:  # signs
            continue
        if 0x06D6 <= cp <= 0x06ED:  # Quranic annotations
            continue
        if cp == 0x0670:  # superscript alef
            continue
        if c in STRIP_CHARS:
            continue
        if c == '\u0640':  # tatweel
            continue
        # Normalize alef variants
        if c in '\u0627\u0671\u0623\u0625\u0622':
            out.append('\u0627')
        elif c in '\u0649\u064a':
            out.append('\u064a')
        elif c == '\u0629':
            out.append('\u0647')
        elif c == '\u0624':
            out.append('\u0648')
        else:
            out.append(c)
    return ''.join(out)


def fetch_chapter(chapter_num):
    """Fetch all verses for a chapter, cached."""
    cache_file = os.path.join(CACHE_DIR, f"chapter_{chapter_num}.json")
    if os.path.exists(cache_file):
        with open(cache_file, "r", encoding="utf-8") as f:
            return json.load(f)
    
    url = f"https://api.quran.com/api/v4/quran/verses/uthmani?chapter_number={chapter_num}"
    req = urllib.request.Request(url)
    req.add_header("Accept", "application/json")
    req.add_header("User-Agent", "Mozilla/5.0")
    
    with urllib.request.urlopen(req, timeout=15) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    
    verses = []
    for v in data.get("verses", []):
        verses.append({
            "verse_key": v["verse_key"],
            "text": v["text_uthmani"]
        })
    
    with open(cache_file, "w", encoding="utf-8") as f:
        json.dump(verses, f, ensure_ascii=False)
    
    return verses


def load_full_quran():
    """Load all 114 chapters, return list of (verse_key, text, stripped_text)."""
    all_verses = []
    for ch in range(1, 115):
        cache_file = os.path.join(CACHE_DIR, f"chapter_{ch}.json")
        if os.path.exists(cache_file):
            verses = json.load(open(cache_file, "r", encoding="utf-8"))
        else:
            print(f"  Downloading chapter {ch}...", end=" ", flush=True)
            verses = fetch_chapter(ch)
            print(f"{len(verses)} verses")
            time.sleep(0.3)  # rate limit
        
        for v in verses:
            all_verses.append((v["verse_key"], v["text"], strip_for_search(v["text"])))
    
    return all_verses


def find_verse(example_text, all_verses):
    """Find which verse contains the example phrase."""
    ex_stripped = strip_for_search(example_text)
    
    # Search all verses
    matches = []
    for verse_key, text, stripped in all_verses:
        if ex_stripped in stripped:
            matches.append(verse_key)
    
    if len(matches) == 1:
        return matches[0], "unique"
    elif len(matches) > 1:
        return matches[0], f"multi-{len(matches)}"
    
    # Fallback: word-level match
    ex_words = [w for w in ex_stripped.split() if len(w) > 1]
    if not ex_words:
        return None, "no-words"
    
    best_key = None
    best_ratio = 0
    for verse_key, text, stripped in all_verses:
        vs_words = set(stripped.split())
        matched = sum(1 for w in ex_words if w in vs_words)
        ratio = matched / len(ex_words)
        if ratio > best_ratio:
            best_ratio = ratio
            best_key = verse_key
    
    if best_ratio >= 0.8:
        return best_key, f"word-match-{best_ratio:.0%}"
    
    return None, "not-found"


def main():
    print("Loading full Quran text...")
    all_verses = load_full_quran()
    print(f"Loaded {len(all_verses)} verses")
    
    # Load dataset
    ds = json.load(open("generated/reel_words_top600.json", "r", encoding="utf-8"))
    
    # Find failed entries
    failed_count = 0
    fixed = 0
    still_failed = 0
    
    for word_entry in ds["words"]:
        if word_entry.get("gpt_verified") != "FAILED":
            continue
        
        failed_count += 1
        example = word_entry.get("gpt_example", "")
        if not example:
            continue
        
        correct_key, match_type = find_verse(example, all_verses)
        
        if correct_key:
            old_ref = word_entry.get("gpt_reference", "?")
            word_entry["gpt_reference"] = correct_key
            word_entry["gpt_verified"] = f"fixed-{match_type}"
            fixed += 1
            print(f"  Fixed: {word_entry['arabic']} | {old_ref} -> {correct_key} ({match_type})")
        else:
            word_entry["gpt_verified"] = f"unfixable-{match_type}"
            still_failed += 1
            print(f"  UNFIXABLE: {word_entry['arabic']} | {example[:40]}... ({match_type})")
    
    # Save
    with open("generated/reel_words_top600.json", "w", encoding="utf-8") as f:
        json.dump(ds, f, ensure_ascii=False, indent=2)
    
    print(f"\nResults:")
    print(f"  Failed entries: {failed_count}")
    print(f"  Fixed: {fixed}")
    print(f"  Still unfixable: {still_failed}")


if __name__ == "__main__":
    main()
