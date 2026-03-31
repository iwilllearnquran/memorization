"""Categorize remaining FAILED entries: wrong verse reference vs text mismatch vs other."""
import json, os

CACHE_DIR = "generated/.quran_full_cache"

def strip_for_search(s):
    out = []
    after_tatweel = False
    for c in s:
        cp = ord(c)
        if cp in (0x0653, 0x0654, 0x0655):
            if after_tatweel: out.append('\u0627')
            continue
        if 0x064B <= cp <= 0x065F: continue
        if 0x0610 <= cp <= 0x061A: continue
        if 0x06D6 <= cp <= 0x06ED: continue
        if cp == 0x0640 or cp == 0x0620:
            after_tatweel = True; continue
        if cp in (0x08F0, 0x08F1, 0x08F2): continue
        after_tatweel = False
        if cp == 0x0621: continue
        if cp == 0x0670: out.append('\u0627'); continue
        if cp == 0x06E5: out.append('\u0648'); continue
        if cp == 0x06E6: out.append('\u064A'); continue
        if c in '\u0627\u0671\u0623\u0625\u0622': out.append('\u0627')
        elif c in '\u0649\u064A\u0626': out.append('\u064A')
        elif c == '\u0629': out.append('\u0647')
        elif c == '\u0624': out.append('\u0648')
        else: out.append(c)
    return ''.join(out)

def collapse_dupes(s):
    if not s: return s
    out = [s[0]]
    for c in s[1:]:
        if c != out[-1]: out.append(c)
    return ''.join(out)

# Load full Quran
all_verses = []
for ch in range(1, 115):
    path = os.path.join(CACHE_DIR, f"chapter_{ch}.json")
    for v in json.load(open(path, "r", encoding="utf-8")):
        s = strip_for_search(v["text"])
        ns = s.replace(' ','')
        dd = collapse_dupes(ns)
        all_verses.append((v["verse_key"], v["text"], s, ns, dd))
print(f"Loaded {len(all_verses)} verses")

failed = json.load(open("generated/failed_verifications.json", "r", encoding="utf-8"))

for f in failed:
    ex_raw = f["example"]
    ref = f.get("reference","")
    ex = strip_for_search(ex_raw)
    ex_ns = ex.replace(' ','')
    ex_dd = collapse_dupes(ex_ns)

    # Search full Quran with all strategies
    found_in = None
    strategy = None
    for vk, vraw, vs, vs_ns, vs_dd in all_verses:
        if ex in vs:
            found_in = vk; strategy = "skeleton"; break
        if ex_ns in vs_ns:
            found_in = vk; strategy = "spaceless"; break
        if ex_dd in vs_dd:
            found_in = vk; strategy = "dedup"; break

    # If not found, try word-level
    if not found_in:
        ex_words = [w for w in ex.split() if len(w) > 1]
        if ex_words:
            best_key, best_r = None, 0
            for vk, vraw, vs, vs_ns, vs_dd in all_verses:
                vw = set(vs.split())
                m = sum(1 for w in ex_words if w in vw)
                r = m / len(ex_words)
                if r > best_r:
                    best_r = r; best_key = vk
            if best_r >= 0.7:
                found_in = best_key; strategy = f"word-{best_r:.0%}"

    # Check if cited verse GPT text actually has the target word
    word_strip = strip_for_search(f["word"])
    word_in_example = word_strip in ex or word_strip in ex_ns
    
    if found_in:
        # Compare found verse to cited verse
        if found_in == ref:
            cat = f"NORM-GAP({strategy})"
        else:
            cat = f"WRONG-REF({strategy}→{found_in})"
    else:
        cat = "NOT-IN-QURAN"
    
    # show char-level diff for first few mismatched chars
    diff_info = ""
    if ref and ":" in ref:
        ch_num = ref.split(":")[0]
        cache = json.load(open(os.path.join(CACHE_DIR, f"chapter_{ch_num}.json"), "r", encoding="utf-8"))
        verse = next((v for v in cache if v["verse_key"] == ref), None)
        if verse:
            vs_cited = strip_for_search(verse["text"])
            # find where they first differ
            for i, (a,b) in enumerate(zip(ex, vs_cited)):
                if a != b:
                    diff_info = f" diff@{i}:'{ex[max(0,i-3):i+5]}' vs '{vs_cited[max(0,i-3):i+5]}'"
                    break

    print(f"rank={f['rank']:>3} {f['word']:>15} | {cat:>30} | word_ok={word_in_example} | ex={ex[:30]}{diff_info}")
