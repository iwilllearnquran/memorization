"""
Patch the remaining gaps after reverify_gpt.py:
1. Fill 5 no-gpt entries (hamza words) with verse window extraction
2. Fill 54 FAILED entries with short_example_ar fallback
"""
import json, os

CACHE_DIR = os.path.join(os.path.dirname(__file__), "..", "generated", ".quran_full_cache")


def strip_hamza(s):
    """Strip standalone hamza + combining hamza for matching."""
    out = []
    for c in s:
        cp = ord(c)
        if 0x064B <= cp <= 0x065F: continue
        if 0x0610 <= cp <= 0x061A: continue
        if 0x06D6 <= cp <= 0x06ED: continue
        if cp == 0x0670: out.append('\u0627'); continue
        if cp == 0x0640 or cp == 0x0620: continue
        if cp in (0x08F0, 0x08F1, 0x08F2): continue
        if cp in (0x0653, 0x0654, 0x0655): continue
        if cp == 0x0621: continue  # standalone hamza
        if c in '\u0627\u0671\u0623\u0625\u0622':
            out.append('\u0627')
        elif c in '\u0649\u064A':
            out.append('\u064A')
        elif c == '\u0629':
            out.append('\u0647')
        elif c == '\u0624':
            out.append('\u0648')
        else:
            out.append(c)
    return ''.join(out)


def main():
    ds = json.load(open("generated/reel_words_top600.json", "r", encoding="utf-8"))

    patched_window = 0
    patched_short = 0

    for w in ds["words"]:
        status = w.get("gpt_verified", "")

        # 1. no-gpt: extract verse window
        if status == "no-gpt":
            ref = w.get("gpt_reference", "") or w.get("example_ref", "")
            if not ref or ":" not in ref:
                continue
            ch = ref.split(":")[0]
            cache_path = os.path.join(CACHE_DIR, f"chapter_{ch}.json")
            if not os.path.exists(cache_path):
                continue
            verses = json.load(open(cache_path, "r", encoding="utf-8"))
            verse = next((v for v in verses if v["verse_key"] == ref), None)
            if not verse:
                continue

            words = verse["text"].split()
            ar_norm = strip_hamza(w["arabic"])
            best_pos = -1
            best_score = 0
            for i, wd in enumerate(words):
                wn = strip_hamza(wd)
                if ar_norm == wn:
                    best_pos = i; best_score = 1.0; break
                common = sum(1 for a, b in zip(ar_norm, wn) if a == b)
                ratio = common / max(len(ar_norm), len(wn)) if max(len(ar_norm), len(wn)) > 0 else 0
                if ratio > best_score and ratio > 0.6:
                    best_score = ratio; best_pos = i

            if best_pos >= 0:
                start = max(0, best_pos - 2)
                end = min(len(words), best_pos + 4)
                window = " ".join(words[start:end])
                w["gpt_example"] = window
                w["gpt_reference"] = ref
                w["gpt_verified"] = "from-verse-window"
                patched_window += 1
                print(f"  Window: {w['arabic']} -> {ref}: {window[:60]}")

        # 2. FAILED: fall back to short_example_ar
        elif status == "FAILED":
            se = w.get("short_example_ar", "")
            ref = w.get("example_ref", "")
            if se:
                w["gpt_example"] = se
                w["gpt_reference"] = ref
                w["gpt_verified"] = "from-short-example"
                patched_short += 1

    with open("generated/reel_words_top600.json", "w", encoding="utf-8") as f:
        json.dump(ds, f, ensure_ascii=False, indent=2)

    print(f"\nPatched window: {patched_window}")
    print(f"Patched short_example: {patched_short}")

    # Final count
    from collections import Counter
    c = Counter(w.get("gpt_verified", "?") for w in ds["words"])
    has_ex = sum(1 for w in ds["words"] if w.get("gpt_example"))
    print(f"\nFinal: {has_ex}/600 have gpt_example")
    for k, v in sorted(c.items(), key=lambda x: -x[1]):
        print(f"  {k}: {v}")


if __name__ == "__main__":
    main()
