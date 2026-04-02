"""
Fix all 26 non-OK items by replacing example text with proper Uthmani text.
Also fixes wrong references for #195 and #294.
Fetches each ayah from quran.com API to get the exact Uthmani word list,
then extracts the correct window for each item.

Does NOT touch any match_ok items.
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
def _norm(t): return TASHKEEL_RE.sub('', t).translate(ALEF_MAP).strip()
def _strip_alef(t): return t.replace('\u0627', '')
def _fuzzy(a, b):
    if a == b: return True
    if not a or not b: return False
    if b.endswith(a) and len(a) >= 2: return True
    if a.endswith(b) and len(b) >= 2: return True
    sa, sb = _strip_alef(a), _strip_alef(b)
    if sa and sa == sb: return True
    if sb and sb.endswith(sa) and len(sa) >= 2: return True
    if sa and sa.endswith(sb) and len(sb) >= 2: return True
    return False

HEADERS = {"User-Agent": "LearnQuranDaily/2.0", "Accept": "application/json"}
_cache = {}

def fetch_ayah_words(vk):
    if vk in _cache:
        return _cache[vk]
    enc = urllib.parse.quote(vk, safe="")
    url = f"https://api.quran.com/api/v4/verses/by_key/{enc}?language=en&words=true&word_fields=text_uthmani"
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=20) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    words = [w for w in data["verse"]["words"] if w["char_type_name"] == "word"]
    _cache[vk] = words
    time.sleep(0.3)
    return words

def get_uthmani_list(vk):
    """Return list of Uthmani text tokens for the given verse key."""
    words = fetch_ayah_words(vk)
    return [w.get("text_uthmani", w.get("text", "")) for w in words]

def find_best_window(ex_norms, ay_norms):
    """Join-aware sliding window matching. Returns (start, ay_span, ex_matched)."""
    best_s, best_a, best_e = 0, 0, 0
    for s in range(len(ay_norms)):
        ei, ai = 0, 0
        while ei < len(ex_norms) and (s + ai) < len(ay_norms):
            at = ay_norms[s + ai]
            et = ex_norms[ei]
            if _fuzzy(et, at):
                ei += 1; ai += 1
            elif ei+1 < len(ex_norms) and _fuzzy(et + ex_norms[ei+1], at):
                ei += 2; ai += 1
            elif ei+2 < len(ex_norms) and _fuzzy(et + ex_norms[ei+1] + ex_norms[ei+2], at):
                ei += 3; ai += 1
            elif (s+ai+1) < len(ay_norms) and _fuzzy(et, at + ay_norms[s+ai+1]):
                ei += 1; ai += 2
            else:
                break
        if ei > best_e:
            best_s, best_a, best_e = s, ai, ei
    return best_s, best_a, best_e


# ── Reference corrections ──
# These items have wrong surah:ayah references
REF_FIXES = {
    195: "26:5",   # was 2:248, actual text is in 26:5
    294: "36:60",  # was 9:128, actual text is in 36:60
}

# ── Load JSON ──
SRC = DST = "generated/reel_words_top600_validated.json"
d = json.load(open(SRC, encoding="utf-8"))
words_list = d["words"]

# Build rank lookup
by_rank = {w["rank"]: w for w in words_list}

applied = []
skipped = []
errors = []

for w in words_list:
    comment = w.get("latest_validation_comment", "")
    if comment == "match_ok":
        continue

    rank = w["rank"]
    arabic = w["arabic"]

    ex_field = "pass3_example" if w.get("pass3_example") else \
               "pass2_gpt_example" if w.get("pass2_gpt_example") else None
    ref_field = "pass3_reference" if w.get("pass3_reference") else \
                "pass2_gpt_reference" if w.get("pass2_gpt_reference") else None
    if not ex_field or not ref_field:
        skipped.append(f"#{rank} {arabic} — no example/ref fields")
        continue

    old_ex = w[ex_field]
    old_ref = w[ref_field]

    # Apply reference fix if needed
    ref = REF_FIXES.get(rank, old_ref)
    if ref != old_ref:
        w[ref_field] = ref
        print(f"  #{rank}: FIXED reference {old_ref} -> {ref}")

    try:
        ay_uthmani = get_uthmani_list(ref)
        ay_norms = [_norm(t) for t in ay_uthmani]
    except Exception as exc:
        errors.append(f"#{rank} {arabic} — API error: {exc}")
        continue

    ex_toks = old_ex.split()
    ex_norms = [_norm(t) for t in ex_toks if _norm(t)]

    best_s, best_a, best_e = find_best_window(ex_norms, ay_norms)

    if best_e == len(ex_norms) and best_a > 0:
        # FULL match — use the found window directly
        new_ex = " ".join(ay_uthmani[best_s : best_s + best_a])
        w[ex_field] = new_ex
        applied.append(f"#{rank:>3} {arabic:>20}: FULL ({best_a} toks) — {new_ex}")
    elif best_e > 0 and best_a > 0:
        # PARTIAL — try extending the window to cover the original range
        # Strategy: if at least half matched, extend the ayah window to cover
        # as many tokens as the original had (accounting for join reduction)

        # How many ayah tokens SHOULD we need?
        # Joining reduces count, so target = best_a + (remaining unmatched / matched ratio)
        remaining_ex = len(ex_norms) - best_e
        # Estimate extra ayah tokens needed: at least 1 per remaining ex token
        target_end = best_s + best_a + remaining_ex
        # Don't exceed ayah length
        target_end = min(target_end, len(ay_uthmani))
        # Also don't go backwards before start
        # Try the extended window and verify it's better
        ext_norms = ay_norms[best_s : target_end]
        ext_s2, ext_a2, ext_e2 = find_best_window(ex_norms, ext_norms)
        if ext_e2 > best_e:
            new_ex = " ".join(ay_uthmani[best_s : target_end])
            w[ex_field] = new_ex
            applied.append(f"#{rank:>3} {arabic:>20}: EXTENDED ({target_end - best_s} toks, {ext_e2}/{len(ex_norms)}) — {new_ex}")
        else:
            # Fallback: extend window by exactly the right amount
            # Use whatever window has the most coverage
            new_ex = " ".join(ay_uthmani[best_s : best_s + best_a])

            # Try also searching with the window shifted by -1
            if best_s > 0:
                alt_start = best_s - 1
                alt_end = alt_start + best_a + remaining_ex + 1
                alt_end = min(alt_end, len(ay_uthmani))
                alt_norms = ay_norms[alt_start:alt_end]
                _, _, alt_e = find_best_window(ex_norms, alt_norms)
                if alt_e > best_e:
                    new_ex = " ".join(ay_uthmani[alt_start:alt_end])
                    w[ex_field] = new_ex
                    applied.append(f"#{rank:>3} {arabic:>20}: SHIFTED ({alt_end - alt_start} toks, {alt_e}/{len(ex_norms)}) — {new_ex}")
                    continue

            # If extended didn't help, just use the basic window
            # but only if it covers at least 75% of tokens
            if best_e >= len(ex_norms) * 0.75:
                w[ex_field] = new_ex
                applied.append(f"#{rank:>3} {arabic:>20}: PARTIAL-OK ({best_a} toks, {best_e}/{len(ex_norms)}) — {new_ex}")
            else:
                skipped.append(f"#{rank:>3} {arabic:>20}: PARTIAL-LOW ({best_e}/{len(ex_norms)}) — needs manual fix")
                print(f"  #{rank}: SKIPPED (low match {best_e}/{len(ex_norms)})")
                print(f"         OLD: {old_ex}")
                print(f"         AYAH: {' '.join(ay_uthmani)}")
    else:
        skipped.append(f"#{rank:>3} {arabic:>20}: NO MATCH — needs manual fix")
        print(f"  #{rank}: SKIPPED (no match)")
        print(f"         OLD: {old_ex}")
        print(f"         AYAH: {' '.join(ay_uthmani)}")

# ── Summary ──
print(f"\n{'='*70}")
print(f"APPLIED ({len(applied)}):")
for a in applied:
    print(f"  {a}")

print(f"\nSKIPPED ({len(skipped)}):")
for s in skipped:
    print(f"  {s}")

if errors:
    print(f"\nERRORS ({len(errors)}):")
    for e in errors:
        print(f"  {e}")

# ── Write ──
with open(DST, "w", encoding="utf-8") as f:
    json.dump(d, f, ensure_ascii=False, indent=2)
print(f"\nWritten to {DST}")
