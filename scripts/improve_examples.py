#!/usr/bin/env python3
"""
Improve reel_words_top600.json examples — SHORT, natural Arabic phrases
with clean English translations.

Uses ONLY locally cached data (generated/.translation_cache/) — no API calls.

For each word:
  1. Load the cached ayah word-by-word data + Sahih International
  2. Score every possible 4–8 word window containing the target word
  3. Pick the window with the best "naturalness" score:
     - Prefer windows that START at ayah start or right after a waqf/pause mark
     - Prefer windows that END at ayah end or right at/before a waqf/pause mark
     - Prefer windows of exactly 5–6 words
     - Avoid windows that cut after particles, prepositions, or connectors
  4. Build clean English from the Sahih text using positional mapping
  5. Store as new fields: short_example_ar, short_example_en

Usage:
  py improve_examples.py                       # update all 600
  py improve_examples.py --dry-run             # preview only
  py improve_examples.py --start 0 --count 20  # partial run
"""
from __future__ import annotations

import argparse
import io
import json
import re
import shutil
import sys
import unicodedata
from pathlib import Path

if sys.stdout.encoding != "utf-8":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
SCRIPT_DIR = Path(__file__).resolve().parent
ROOT = SCRIPT_DIR.parent
DATASET = ROOT / "generated" / "reel_words_top600.json"
BACKUP = ROOT / "generated" / "reel_words_top600.pre_improve.json"
CACHE_DIR = ROOT / "generated" / ".translation_cache"

# ---------------------------------------------------------------------------
# Arabic helpers
# ---------------------------------------------------------------------------
TASHKEEL_RE = re.compile(r'[\u064B-\u065F\u0670\u06D6-\u06ED\u0640]')
ALEF_MAP = str.maketrans({
    '\u0622': '\u0627', '\u0623': '\u0627', '\u0625': '\u0627',
    '\u0671': '\u0627', '\u0654': '', '\u0655': '', '\u0674': '',
})

# Waqf / pause marks in Uthmani script
WAQF_CHARS = set('\u06D6\u06D7\u06D8\u06D9\u06DA\u06DB\u06DC\u06DD\u06DE\u06DF')
# Common small-pause indicators
SMALL_PAUSE = {'ۖ', 'ۗ', 'ۘ', 'ۙ', 'ۚ', 'ۛ', 'ۜ'}

# Arabic particles/prepositions that should NOT be the last word in a window
# (cutting after these sounds abrupt)
CLITIC_WORDS = {
    'فِى', 'مِن', 'عَلَىٰ', 'إِلَىٰ', 'عَن', 'حَتَّىٰ',  # prepositions
    'وَ', 'فَ', 'ثُمَّ',                                      # conjunctions  
    'إِنَّ', 'أَنَّ', 'كَأَنَّ', 'لَـٰكِنَّ',                # inna sisters
    'إِنِّى', 'إِنَّا', 'أَنَّهُ', 'أَنَّهُمْ',              # inna + pronoun
    'لَا', 'لَمْ', 'لَن', 'مَا',                              # negation particles
    'قَدْ', 'سَوْفَ',                                          # verbal particles
    'هَـٰذَا', 'هَـٰذِهِ', 'ذَٰلِكَ', 'تِلْكَ',              # demonstratives
    'ٱلَّذِى', 'ٱلَّذِينَ', 'ٱلَّتِى',                       # relative pronouns
    'كُلِّ', 'بَعْضِ',                                        # quantifiers
    'غَيْرِ', 'غَيْرَ',                                        # exception words
    'أَوْ', 'أَمْ',                                            # or
    'بَيْنَ', 'عِندَ', 'فَوْقَ', 'تَحْتَ',                   # spatial
    'لَوْ', 'لَوْلَا', 'إِذَا', 'إِذْ',                      # conditional/temporal
}

# Similarly, these should NOT be the first word (starting here sounds abrupt)
BAD_START_WORDS_NORM = {
    'بها', 'به', 'بهم', 'فيها', 'فيه', 'منها', 'منه', 'منهم',
    'عليها', 'عليه', 'عليهم', 'اليها', 'اليه', 'اليهم',
    'لها', 'لهم',  # pronouns attached to prepositions
}


def _norm_ar(text: str) -> str:
    return TASHKEEL_RE.sub('', text).translate(ALEF_MAP).strip()


def _has_waqf(text: str) -> bool:
    """Check if a word contains any waqf/pause mark."""
    return bool(set(text) & (WAQF_CHARS | SMALL_PAUSE))


def _is_clitic_end(text: str) -> bool:
    """Check if this word is a particle that shouldn't end a phrase."""
    norm = _norm_ar(text)
    # Check normalized forms
    for c in CLITIC_WORDS:
        if _norm_ar(c) == norm:
            return True
    # Also catch words starting with و or ف followed by 1-2 chars
    if norm.startswith('و') and len(norm) <= 3:
        return True
    if norm.startswith('ف') and len(norm) <= 3:
        return True
    return False


def _is_bad_start(text: str) -> bool:
    """Check if this word shouldn't start a phrase."""
    norm = _norm_ar(text)
    return norm in BAD_START_WORDS_NORM


# ---------------------------------------------------------------------------
# Cache reader
# ---------------------------------------------------------------------------
def load_cached_ayah(verse_key: str) -> tuple[list[dict], str] | None:
    """Load cached word-by-word + Sahih data. Returns None if not cached."""
    cache_file = CACHE_DIR / f"{verse_key.replace(':', '_')}.json"
    if not cache_file.exists():
        return None
    data = json.loads(cache_file.read_text(encoding="utf-8"))
    return data["words"], data.get("sahih", "")


def find_target_word(words: list[dict], arabic: str) -> int | None:
    """Find 0-based index of the target word in the ayah."""
    target = _norm_ar(arabic)

    # Pass 1: exact match
    for i, w in enumerate(words):
        if _norm_ar(w["text"]) == target:
            return i

    # Pass 2: prefix/suffix match (for words with attached particles)
    if len(target) >= 3:
        for i, w in enumerate(words):
            wn = _norm_ar(w["text"])
            if target in wn or wn in target:
                return i

    return None


# ---------------------------------------------------------------------------
# Window scoring — the core intelligence
# ---------------------------------------------------------------------------
def score_window(
    words: list[dict], start: int, end: int,
    target_idx: int, total: int
) -> float:
    """Score a window [start, end] (inclusive). Higher = better.

    Factors:
      - Length: prefer 5-6, accept 4-8
      - Start quality: starts at ayah beginning or after waqf
      - End quality: ends at ayah end or at/before waqf
      - No clitic at end
      - No bad word at start
      - Target word is near center (not at extreme edge)
    """
    length = end - start + 1
    score = 0.0

    # ── Length preference ──
    if length == 5:
        score += 10.0
    elif length == 6:
        score += 9.5
    elif length == 4:
        score += 7.0
    elif length == 7:
        score += 7.5
    elif length == 8:
        score += 5.0
    elif length == 3:
        score += 3.0
    else:
        score += 1.0

    # ── Start quality ──
    if start == 0:
        # Starts at beginning of ayah — very natural
        score += 8.0
    elif start > 0 and _has_waqf(words[start - 1]["text"]):
        # Starts right after a waqf mark — natural clause boundary
        score += 7.0
    elif start > 0 and _is_clitic_end(words[start - 1]["text"]):
        # Previous word is a connector — this is a decent start point
        score += 3.0
    else:
        # Mid-clause start
        score += 0.0

    if _is_bad_start(words[start]["text"]):
        score -= 5.0

    # ── End quality ──
    if end == total - 1:
        # Ends at end of ayah — perfect
        score += 8.0
    elif _has_waqf(words[end]["text"]):
        # Ends at a waqf mark — natural pause
        score += 7.0
    elif end + 1 < total and _has_waqf(words[end]["text"]):
        score += 6.0
    else:
        # Mid-clause end
        score += 0.0

    if _is_clitic_end(words[end]["text"]):
        score -= 6.0  # bad to end on a particle

    # ── Target word position ──
    # Prefer target word not right at the edge
    pos_in_window = target_idx - start
    if 1 <= pos_in_window <= length - 2:
        score += 2.0  # target is interior — good context on both sides
    elif pos_in_window == 0 and length >= 4:
        score += 1.0  # at start, but enough context after
    elif pos_in_window == length - 1 and length >= 4:
        score += 1.0  # at end, but enough context before

    return score


def select_best_window(
    words: list[dict], target_idx: int
) -> tuple[int, int]:
    """Find the best 4–8 word window containing target_idx."""
    n = len(words)

    # If ayah is already ≤ 8 words, use full ayah
    if n <= 8:
        return 0, n - 1

    best_start, best_end = 0, min(5, n - 1)
    best_score = -999.0

    for length in range(4, 9):  # window sizes 4-8
        for start in range(max(0, target_idx - length + 1),
                           min(n - length + 1, target_idx + 1)):
            end = start + length - 1
            if end >= n:
                continue
            if not (start <= target_idx <= end):
                continue

            s = score_window(words, start, end, target_idx, n)
            if s > best_score:
                best_score = s
                best_start, best_end = start, end

    return best_start, best_end


# ---------------------------------------------------------------------------
# English extraction from Sahih
# ---------------------------------------------------------------------------
def _clean_sahih(text: str) -> str:
    text = re.sub(r'<[^>]+>', '', text)
    text = re.sub(r'\d+', '', text)
    text = re.sub(r'\[', '', text)
    text = re.sub(r'\]', '', text)
    text = re.sub(r'\s+', ' ', text).strip()
    return text


def _clean_wbw(text: str) -> str:
    """Clean word-by-word translation into natural English."""
    # Remove parenthetical markers: (is) → is, (the) → the
    text = re.sub(r'\(([^)]+)\)', r'\1', text)
    # Remove square brackets: [d] → d
    text = re.sub(r'\[([^\]]*)\]', r'\1', text)
    # Fix double spaces
    text = re.sub(r'\s+', ' ', text).strip()
    # Remove trailing particles/fragments
    text = re.sub(r'\s+(of|and|or|not|to|in|from|for|on|at|by|with)\s*$', '', text, flags=re.IGNORECASE)
    text = text.rstrip(' ,;.-–—')
    return text


def _extract_sahih_by_keywords(
    sahih: str, words: list[dict],
    start_idx: int, end_idx: int, total: int
) -> str | None:
    """Try to extract the right portion of Sahih using keyword matching.

    Returns None if no confident match.
    """
    en_words = sahih.split()
    n_en = len(en_words)
    if n_en < 3:
        return None

    # Get distinctive keywords from word-by-word translations
    stopwords = {"a","an","the","is","are","was","were","of","to","in","and",
                 "or","it","he","she","they","them","his","her","its","not","no",
                 "do","did","has","have","had","be","been","for","with","from",
                 "at","on","by","as","but","if","so","who","that","this","then",
                 "will","we","you","your","our","what","which","those"}
    keywords = []
    for i in range(start_idx, end_idx + 1):
        tr = words[i].get("translation", "").lower()
        tr = re.sub(r'[\[\]()]', '', tr)
        for w in tr.split():
            w = w.strip('.,;:')
            if len(w) > 2 and w not in stopwords:
                keywords.append(w)

    if not keywords:
        return None

    # Use positional estimate to narrow search area
    ratio_start = max(0, start_idx / total - 0.1)
    ratio_end = min(1.0, (end_idx + 1) / total + 0.1)
    search_start = int(ratio_start * n_en)
    search_end = int(ratio_end * n_en)

    # Find the smallest window in the search area that contains most keywords
    best_span = None
    best_score = 0

    sahih_lower = [w.lower().strip('.,;:"\'-–—') for w in en_words]

    for ws in range(max(0, search_start - 3), min(n_en, search_end + 3)):
        for we in range(ws + 2, min(n_en + 1, ws + 25)):
            span_text = " ".join(sahih_lower[ws:we])
            matches = sum(1 for kw in keywords if kw in span_text)
            span_len = we - ws
            if matches == 0:
                continue
            # Score: coverage * bonus for shorter span
            score = (matches / len(keywords)) * 10 - span_len * 0.15
            if matches >= len(keywords) * 0.5 and score > best_score:
                best_score = score
                best_span = (ws, we)

    if best_span is None or best_score < 2:
        return None

    ws, we = best_span

    # Snap start to punctuation boundary (look backwards up to 3 words)
    for offset in range(0, 4):
        if ws - offset <= 0:
            ws = 0
            break
        prev = en_words[ws - offset - 1]
        if re.search(r'[,;.\-–—!?"]$', prev):
            ws = ws - offset
            break

    # Snap end to punctuation boundary (look forward up to 3 words)
    for offset in range(0, 4):
        if we + offset >= n_en:
            we = n_en
            break
        curr = en_words[we + offset - 1]
        if re.search(r'[,;.\-–—!?"]$', curr):
            we = we + offset
            break

    result = " ".join(en_words[ws:we])
    result = result.strip(' ,;-–—"\'')
    result = re.sub(r'\s+(of|and|or|not|to|in|from|for|on|at|by|with)\s*$', '', result, flags=re.IGNORECASE)
    result = result.rstrip(' ,;.-–—')

    # Verify result has enough keyword coverage
    result_lower = result.lower()
    final_matches = sum(1 for kw in keywords if kw in result_lower)
    if final_matches < len(keywords) * 0.4:
        return None

    return result


def extract_english(
    sahih: str, words: list[dict],
    start_idx: int, end_idx: int, total: int
) -> str:
    """Build clean English for the selected Arabic window.

    Strategy:
      - Full ayah → use full Sahih International (best quality)
      - Partial → try keyword-based Sahih extraction first
      - Fallback → cleaned word-by-word translations
    """
    cleaned_sahih = _clean_sahih(sahih)

    if start_idx == 0 and end_idx == total - 1:
        result = cleaned_sahih.rstrip('.')
        result = result.rstrip(' -–—')
        return result

    # Try Sahih extraction first (natural English)
    sahih_extract = _extract_sahih_by_keywords(
        cleaned_sahih, words, start_idx, end_idx, total)
    if sahih_extract and len(sahih_extract.split()) >= 5:
        return _capitalize_first(sahih_extract)

    # Fallback: cleaned word-by-word
    raw_parts = []
    for i in range(start_idx, end_idx + 1):
        tr = words[i].get("translation", "").strip()
        if tr:
            raw_parts.append(tr)

    result = _clean_wbw(" ".join(raw_parts))
    return _capitalize_first(result)


def _capitalize_first(s: str) -> str:
    if not s:
        return s
    return s[0].upper() + s[1:]


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    parser = argparse.ArgumentParser(description="Improve examples with short natural phrases")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--start", type=int, default=0)
    parser.add_argument("--count", type=int, default=0)
    args = parser.parse_args()

    with open(DATASET, "r", encoding="utf-8") as f:
        dataset = json.load(f)

    if not args.dry_run:
        shutil.copy2(DATASET, BACKUP)
        print(f"Backup: {BACKUP}")

    words_all = dataset["words"]
    total = len(words_all)
    end = total if args.count == 0 else min(total, args.start + args.count)

    stats = {"updated": 0, "unchanged": 0, "no_cache": 0, "no_match": 0}

    for idx in range(args.start, end):
        word = words_all[idx]
        rank = word.get("rank", idx + 1)
        arabic = word["arabic"]
        meaning = word.get("meaning", "")
        ref = word.get("example_ref", "")

        if not ref:
            stats["no_cache"] += 1
            print(f"[{rank:3d}] {arabic:15s} — no ref, skip")
            continue

        cached = load_cached_ayah(ref)
        if cached is None:
            stats["no_cache"] += 1
            print(f"[{rank:3d}] {arabic:15s} — not cached ({ref}), skip")
            continue

        ayah_words, sahih = cached
        n = len(ayah_words)

        target_idx = find_target_word(ayah_words, arabic)
        if target_idx is None:
            stats["no_match"] += 1
            print(f"[{rank:3d}] {arabic:15s} — word not found in {ref}")
            continue

        start, end_w = select_best_window(ayah_words, target_idx)
        phrase_len = end_w - start + 1
        is_full = (start == 0 and end_w == n - 1)

        new_ar = " ".join(w["text"] for w in ayah_words[start:end_w + 1])
        new_en = extract_english(sahih, ayah_words, start, end_w, n)

        old_short_ar = word.get("short_example_ar", "")
        changed = (old_short_ar != new_ar)

        tag = "FULL" if is_full else f"{phrase_len}w"
        marker = "*" if changed else " "

        print(f"[{rank:3d}]{marker} {arabic:12s} = {meaning:12s} [{tag}/{n}w] {ref}")
        print(f"       AR: {new_ar}")
        print(f"       EN: {new_en}")

        if not args.dry_run:
            word["short_example_ar"] = new_ar
            word["short_example_en"] = new_en

        stats["updated" if changed else "unchanged"] += 1

    if not args.dry_run:
        with open(DATASET, "w", encoding="utf-8") as f:
            json.dump(dataset, f, ensure_ascii=False, indent=2)
        print(f"\nSaved: {DATASET}")

    print(f"\nStats: {json.dumps(stats)}")

    # Word length distribution of new short examples
    if not args.dry_run:
        from collections import Counter
        lens = [len(w.get("short_example_ar", "").split())
                for w in words_all if w.get("short_example_ar")]
        c = Counter(lens)
        print("Short example word lengths:")
        for k, v in sorted(c.items()):
            print(f"  {k} words: {v}")


if __name__ == "__main__":
    main()
