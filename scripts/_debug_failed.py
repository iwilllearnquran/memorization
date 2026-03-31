"""Debug: analyze why each of the 54 FAILED examples doesn't match."""
import json

CACHE_DIR = "generated/.quran_full_cache"

def strip_for_search(s):
    out = []
    after_tatweel = False
    for c in s:
        cp = ord(c)
        if 0x064B <= cp <= 0x065F: continue
        if 0x0610 <= cp <= 0x061A: continue
        if 0x06D6 <= cp <= 0x06DC: continue
        if 0x06DD <= cp <= 0x06DE: continue
        if 0x06DF <= cp <= 0x06E4: continue
        if 0x06E7 <= cp <= 0x06E8: continue
        if 0x06EA <= cp <= 0x06ED: continue
        if cp == 0x0640 or cp == 0x0620:
            after_tatweel = True; continue
        if cp in (0x08F0, 0x08F1, 0x08F2): continue
        if cp in (0x0653, 0x0654, 0x0655):
            if after_tatweel: out.append('\u0627')
            continue
        after_tatweel = False
        if cp == 0x0621: continue
        if cp == 0x0670: out.append('\u0627'); continue
        if cp == 0x06E5: out.append('\u0648'); continue
        if cp == 0x06E6: out.append('\u064A'); continue
        if c in '\u0627\u0671\u0623\u0625\u0622':
            out.append('\u0627')
        elif c in '\u0649\u064A\u0626':
            out.append('\u064A')
        elif c == '\u0629': out.append('\u0647')
        elif c == '\u0624': out.append('\u0648')
        else: out.append(c)
    return ''.join(out)

def strip_v2(s):
    """V2: also strip standalone hamza U+0621, and strip alef after stripping."""
    out = []
    prev_was_stripped = False
    for c in s:
        cp = ord(c)
        if 0x064B <= cp <= 0x065F: continue
        if 0x0610 <= cp <= 0x061A: continue
        if 0x06D6 <= cp <= 0x06ED: continue
        if cp in (0x0653, 0x0654, 0x0655): continue
        if cp == 0x0640 or cp == 0x0620: continue
        if cp in (0x08F0, 0x08F1, 0x08F2): continue
        if cp == 0x0670: out.append('\u0627'); continue
        if cp == 0x06E5: out.append('\u0648'); continue
        if cp == 0x06E6: out.append('\u064A'); continue
        if cp == 0x0621: continue  # standalone hamza
        if c in '\u0627\u0671\u0623\u0625\u0622':
            out.append('\u0627')
        elif c in '\u0649\u064A':
            out.append('\u064A')
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


failed = json.load(open("generated/failed_verifications.json", "r", encoding="utf-8"))

for f in failed:
    ref = f.get("reference", "")
    if ":" not in ref:
        print(f"  rank={f['rank']} {f['word']} | NO REF")
        continue
    ch = ref.split(":")[0]
    cache = json.load(open(f"{CACHE_DIR}/chapter_{ch}.json", "r", encoding="utf-8"))
    verse = next((v for v in cache if v["verse_key"] == ref), None)
    if not verse:
        print(f"  rank={f['rank']} {f['word']} | VERSE NOT FOUND")
        continue

    vtext = verse["text"]
    ex = f["example"]

    # Current normalization
    vs = strip_for_search(vtext)
    es = strip_for_search(ex)

    # V2 normalization (also strip hamza)
    vs2 = strip_v2(vtext)
    es2 = strip_v2(ex)

    # Try all strategies
    matched = "NO"
    if es in vs:
        matched = "v1-substr"
    elif es.replace(' ', '') in vs.replace(' ', ''):
        matched = "v1-spaceless"
    elif collapse_dupes(es.replace(' ', '')) in collapse_dupes(vs.replace(' ', '')):
        matched = "v1-dedup"
    elif es2 in vs2:
        matched = "v2-substr"
    elif es2.replace(' ', '') in vs2.replace(' ', ''):
        matched = "v2-spaceless"
    elif collapse_dupes(es2.replace(' ', '')) in collapse_dupes(vs2.replace(' ', '')):
        matched = "v2-dedup"

    has_0654 = "\u0654" in vtext
    has_0621 = "\u0621" in vtext

    print(f"  rank={f['rank']:>3} {f['word']:>15} | {matched:>12} | 0654={'Y' if has_0654 else 'N'} 0621={'Y' if has_0621 else 'N'} | es={es[:25]} vs={vs[:40]}")
