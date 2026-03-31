"""
Merge GPT examples into reel_words_top600.json and verify accuracy
by checking if the example phrase exists in the referenced verse.
"""
import json, re, sys, time, os
import urllib.request

STRIP = set('\u0670\u06e5\u06e6\u08f0\u08f1\u08f2\u06df\u06e0\u06e1\u06e2\u06e3\u06e4\u06e7\u06e8\u06ea\u06eb\u06ec\u06ed\u0653\u0654\u0655\u065f\u0656\u0657\u0658\u06dc\u06d6\u06d7\u06d8\u06d9\u06da\u06db\u06dd\u06de\u0620')
STRIP.update('\u06df\u06e0\u0670')

CACHE_DIR = os.path.join(os.path.dirname(__file__), "..", "generated", ".verse_cache")
os.makedirs(CACHE_DIR, exist_ok=True)

def normalize(s):
    return ''.join(c for c in s if c not in STRIP)

def strip_tashkeel(s):
    """Remove all diacritics and normalize alef variants for comparison."""
    out = []
    for c in s:
        cp = ord(c)
        # Skip tashkeel/harakat (U+064B-U+065F) 
        if 0x064B <= cp <= 0x065F:
            continue
        # Skip Arabic signs (U+0610-U+061A)
        if 0x0610 <= cp <= 0x061A:
            continue
        # Skip Quranic annotations (U+06D6-U+06ED)
        if 0x06D6 <= cp <= 0x06ED:
            continue
        # Skip superscript alef (U+0670)
        if cp == 0x0670:
            continue
        if c in STRIP:
            continue
        if c == '\u0640':  # tatweel
            continue
        # Normalize alef variants: ٱ ا أ إ آ -> ا
        if c in '\u0627\u0671\u0623\u0625\u0622':
            out.append('\u0627')
        # Normalize ya variants: ى ي ئ -> ي
        elif c in '\u0649\u064a':
            out.append('\u064a')
        # Normalize taa marbuta -> ha
        elif c == '\u0629':
            out.append('\u0647')
        # Normalize waw variants
        elif c == '\u0624':  # ؤ -> و
            out.append('\u0648')
        else:
            out.append(c)
    return ''.join(out)

def parse_verse_key(reference):
    """Extract verse key like '4:96' from 'Surah An-Nisa 4:96'."""
    m = re.search(r'(\d+):(\d+)', reference)
    if m:
        return f"{m.group(1)}:{m.group(2)}"
    return None

def fetch_verse_text(verse_key):
    """Fetch Uthmani text for a verse from quran.com API, with caching."""
    surah, ayah = verse_key.split(":")
    cache_file = os.path.join(CACHE_DIR, f"{surah}_{ayah}.json")
    
    if os.path.exists(cache_file):
        with open(cache_file, "r", encoding="utf-8") as f:
            return json.load(f)
    
    url = f"https://api.quran.com/api/v4/quran/verses/uthmani?verse_key={verse_key}"
    try:
        req = urllib.request.Request(url)
        req.add_header("Accept", "application/json")
        req.add_header("User-Agent", "Mozilla/5.0")
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        
        verses = data.get("verses", [])
        if verses:
            text = verses[0].get("text_uthmani", "")
            result = {"text": text, "verse_key": verse_key}
            with open(cache_file, "w", encoding="utf-8") as f:
                json.dump(result, f, ensure_ascii=False)
            return result
    except Exception as e:
        print(f"  API error for {verse_key}: {e}")
    return None

def example_in_verse(example_text, verse_text):
    """Check if example phrase appears in verse (fuzzy: strip tashkeel)."""
    # First try exact
    if example_text in verse_text:
        return "exact"
    
    # Try normalized (strip Quranic marks)
    if normalize(example_text) in normalize(verse_text):
        return "normalized"
    
    # Try skeleton (base letters only)
    ex_skel = strip_tashkeel(example_text)
    vs_skel = strip_tashkeel(verse_text)
    if ex_skel in vs_skel:
        return "skeleton"
    
    # Try word-by-word: check if most example words appear in verse
    ex_words = [strip_tashkeel(w) for w in example_text.split() if len(w) > 1]
    vs_words_set = set(strip_tashkeel(w) for w in verse_text.split())
    if not ex_words:
        return "empty"
    matched = sum(1 for w in ex_words if w in vs_words_set)
    ratio = matched / len(ex_words)
    if ratio >= 0.7:
        return f"word-match-{matched}/{len(ex_words)}"
    
    return None

def main():
    # Parse GPT file
    t = open("generated/new_gpr_examples.json", "r", encoding="utf-8").read()
    dec = json.JSONDecoder()
    gpt_entries = []
    i = 0
    while i < len(t):
        while i < len(t) and t[i] in ' \t\r\n[],':
            i += 1
        if i >= len(t):
            break
        if t[i] == '{':
            try:
                obj, end = dec.raw_decode(t, i)
                gpt_entries.append(obj)
                i = end
            except:
                i += 1
        else:
            i += 1
    
    print(f"Parsed {len(gpt_entries)} GPT entries")
    
    # Build lookup: exact word -> entry, normalized word -> entry
    # Only include entries that have an example
    gpt_by_exact = {}
    gpt_by_norm = {}
    for e in gpt_entries:
        if "example" not in e:
            continue
        w = e["word"]
        if w not in gpt_by_exact:
            gpt_by_exact[w] = e
        n = normalize(w)
        if n not in gpt_by_norm:
            gpt_by_norm[n] = e
    
    # Load dataset
    ds = json.load(open("generated/reel_words_top600.json", "r", encoding="utf-8"))
    
    # Match and verify
    matched = 0
    verified = 0
    failed_verify = []
    no_ref = 0
    api_calls = 0
    
    for word_entry in ds["words"]:
        arabic = word_entry["arabic"]
        
        # Find GPT entry
        gpt = gpt_by_exact.get(arabic) or gpt_by_norm.get(normalize(arabic))
        if not gpt:
            continue
        
        matched += 1
        example = gpt["example"]
        reference = gpt.get("reference", "")
        verse_key = parse_verse_key(reference)
        
        if not verse_key:
            word_entry["gpt_example"] = example
            word_entry["gpt_reference"] = reference
            word_entry["gpt_verified"] = "no-ref"
            no_ref += 1
            continue
        
        # Fetch verse and verify
        verse_data = fetch_verse_text(verse_key)
        if verse_data:
            api_calls += 1
            verse_text = verse_data["text"]
            match_type = example_in_verse(example, verse_text)
            
            word_entry["gpt_example"] = example
            word_entry["gpt_reference"] = verse_key
            
            if match_type:
                word_entry["gpt_verified"] = match_type
                verified += 1
            else:
                word_entry["gpt_verified"] = "FAILED"
                failed_verify.append({
                    "word": arabic,
                    "example": example,
                    "reference": verse_key,
                    "verse_text": verse_text
                })
        else:
            word_entry["gpt_example"] = example
            word_entry["gpt_reference"] = verse_key
            word_entry["gpt_verified"] = "api-error"
    
    # Save updated dataset
    with open("generated/reel_words_top600.json", "w", encoding="utf-8") as f:
        json.dump(ds, f, ensure_ascii=False, indent=2)
    
    print(f"\nResults:")
    print(f"  Matched to GPT: {matched}/600")
    print(f"  Verified: {verified}")
    print(f"  Failed verification: {len(failed_verify)}")
    print(f"  No parseable reference: {no_ref}")
    print(f"  API calls: {api_calls}")
    
    if failed_verify:
        print(f"\nFailed verifications ({len(failed_verify)}):")
        with open("generated/failed_verifications.json", "w", encoding="utf-8") as ff:
            json.dump(failed_verify, ff, ensure_ascii=False, indent=2)
        print("  Details saved to generated/failed_verifications.json")

if __name__ == "__main__":
    main()
