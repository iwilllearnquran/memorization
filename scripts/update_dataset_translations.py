#!/usr/bin/env python3
"""
Update reel_words_top600.json with:
  1. Meaningful Arabic example phrases (complete sentences, ≤13 words preferred)
  2. Proper English translations from Sahih International (quran.com API)

For each word, fetches the referenced ayah's word-by-word data + Sahih
International translation from quran.com API v4.

  - Ayahs ≤ 13 content words → full ayah Arabic + full Sahih English
  - Ayahs > 13 words → extracts meaningful sub-phrase at natural
    boundaries (waqf marks) + maps the corresponding Sahih English portion

API responses are cached in generated/.translation_cache/ so re-runs
are instant.

Usage:
  py update_dataset_translations.py                       # update all 600
  py update_dataset_translations.py --dry-run             # preview only
  py update_dataset_translations.py --start 50 --count 10 # partial run
"""
from __future__ import annotations

import argparse
import io
import json
import re
import shutil
import sys
import time
import unicodedata
import urllib.parse
import urllib.request
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
BACKUP = ROOT / "generated" / "reel_words_top600.backup.json"
CACHE_DIR = ROOT / "generated" / ".translation_cache"

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
SAHIH_ID = 20          # Sahih International on quran.com
MAX_PHRASE_WORDS = 13  # max words in Arabic example
REQUEST_DELAY = 0.35   # polite delay between API calls

HEADERS = {"User-Agent": "LearnQuranDaily/2.0", "Accept": "application/json"}

# Arabic normalisation
TASHKEEL_RE = re.compile(r'[\u064B-\u065F\u0670\u06D6-\u06ED\u0640]')
ALEF_MAP = str.maketrans({
    '\u0622': '\u0627', '\u0623': '\u0627', '\u0625': '\u0627',
    '\u0671': '\u0627', '\u0654': '', '\u0655': '', '\u0674': '',
})
# Waqf / pause marks in Uthmani script
WAQF_RE = re.compile(r'[\u06D6-\u06DC\u06DD-\u06DF\u06E0-\u06ED]')


def _norm_ar(text: str) -> str:
    return TASHKEEL_RE.sub('', text).translate(ALEF_MAP).strip()


# ---------------------------------------------------------------------------
# API helpers (with caching)
# ---------------------------------------------------------------------------
def _fetch_json(url: str) -> dict:
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def fetch_ayah_data(verse_key: str) -> tuple[list[dict], str]:
    """Fetch word-by-word data + Sahih International for an ayah.

    Returns (words_list, sahih_text).
    Each word dict: {"text": ..., "translation": ...}
    """
    cache_file = CACHE_DIR / f"{verse_key.replace(':', '_')}.json"
    if cache_file.exists():
        cached = json.loads(cache_file.read_text(encoding="utf-8"))
        return cached["words"], cached["sahih"]

    time.sleep(REQUEST_DELAY)
    encoded = urllib.parse.quote(verse_key, safe="")
    url = (f"https://api.quran.com/api/v4/verses/by_key/{encoded}"
           f"?language=en&words=true&word_fields=text_uthmani"
           f"&translations={SAHIH_ID}")
    data = _fetch_json(url)
    verse = data["verse"]

    words = []
    for w in verse["words"]:
        if w["char_type_name"] == "word":
            words.append({
                "text": w.get("text_uthmani", w.get("text", "")),
                "translation": w.get("translation", {}).get("text", ""),
            })

    sahih = ""
    for t in verse.get("translations", []):
        if t["resource_id"] == SAHIH_ID:
            sahih = re.sub(r'<[^>]+>', '', t["text"]).strip()
            break

    # Cache
    cache_file.parent.mkdir(parents=True, exist_ok=True)
    cache_file.write_text(
        json.dumps({"words": words, "sahih": sahih}, ensure_ascii=False),
        encoding="utf-8")

    return words, sahih


# ---------------------------------------------------------------------------
# Target-word finder
# ---------------------------------------------------------------------------
def find_target_word(words: list[dict], arabic: str) -> int | None:
    """Find 0-based index of the target word in the ayah."""
    target = _norm_ar(arabic)

    # Pass 1: exact match
    for i, w in enumerate(words):
        if _norm_ar(w["text"]) == target:
            return i

    # Pass 2: substring match (only for ≥3-char targets)
    if len(target) >= 3:
        for i, w in enumerate(words):
            wn = _norm_ar(w["text"])
            if target in wn or wn in target:
                return i

    return None


# ---------------------------------------------------------------------------
# Meaningful Arabic phrase extraction
# ---------------------------------------------------------------------------
def _has_waqf(text: str) -> bool:
    return bool(WAQF_RE.search(text))


def extract_meaningful_phrase(
    words: list[dict], target_idx: int, max_words: int = MAX_PHRASE_WORDS
) -> tuple[int, int]:
    """Extract a meaningful Arabic phrase containing the target word.

    Strategy:
      1. If ayah ≤ max_words: use full ayah
      2. Find clause boundaries at waqf marks
      3. Pick the best clause or group of contiguous clauses that
         contains the target word and is ≤ max_words
         (prefers the LONGEST phrase for more context)
      4. Fallback: centered window of max_words
    """
    n = len(words)
    if n <= max_words:
        return 0, n - 1

    # ── Find clause break positions (index AFTER the waqf word) ──
    breaks = [0]
    for i in range(n):
        if _has_waqf(words[i]["text"]) and i + 1 < n:
            breaks.append(i + 1)
    # Each "clause" spans breaks[c] .. breaks[c+1]-1  (or to n-1 for last)

    # ── Try every contiguous group of clauses ──
    best: tuple[int, int] | None = None
    best_len = 0
    for ci in range(len(breaks)):
        start = breaks[ci]
        for cj in range(ci, len(breaks)):
            end = (breaks[cj + 1] - 1) if cj + 1 < len(breaks) else n - 1
            length = end - start + 1
            if length > max_words:
                break
            if start <= target_idx <= end:
                # Prefer longer phrases (more context) up to max_words
                if length > best_len:
                    best = (start, end)
                    best_len = length

    if best:
        return best

    # ── Fallback: centered window ──
    half = max_words // 2
    start = max(0, target_idx - half)
    end = min(n - 1, start + max_words - 1)
    start = max(0, end - max_words + 1)
    return start, end


# ---------------------------------------------------------------------------
# English translation extraction from Sahih
# ---------------------------------------------------------------------------
def _clean_sahih(text: str) -> str:
    """Clean Sahih International text: remove brackets, footnotes, HTML."""
    text = re.sub(r'<[^>]+>', '', text)           # HTML tags
    text = re.sub(r'\[\s*[Oo]\s+[^]]*\]', '', text)  # [O Muḥammad] etc.
    text = re.sub(r'\[', '', text)
    text = re.sub(r'\]', '', text)
    text = re.sub(r'\d+', '', text)               # footnote numbers (1, 2...)
    text = re.sub(r'\s+', ' ', text).strip()
    text = text.strip(' ,;-–—')
    return text


def _get_keywords(words: list[dict], start: int, end: int) -> set[str]:
    """Extract distinctive keywords from word-by-word translations."""
    stopwords = {
        "a", "an", "the", "is", "are", "was", "were", "of", "to", "in",
        "and", "or", "it", "he", "she", "they", "them", "his", "her", "its",
        "not", "no", "do", "did", "has", "have", "had", "be", "been",
        "for", "with", "from", "at", "on", "by", "as", "but", "if", "so",
        "who", "that", "this", "then", "will", "we", "you", "your", "our",
    }
    kws = set()
    for i in range(start, end + 1):
        trans = words[i].get("translation", "").lower()
        trans = re.sub(r'[\[\](){}]', '', trans)
        for w in trans.split():
            if len(w) > 2 and w not in stopwords:
                kws.add(w)
    return kws


def extract_sahih_portion(
    sahih: str, words: list[dict],
    start_idx: int, end_idx: int, total_words: int
) -> str:
    """Extract the matching English portion from Sahih International.

    Strategy:
      1. Full ayah → return full Sahih
      2. Use word-position ratios to estimate English region
      3. Snap to punctuation boundaries (commas, semicolons, dashes)
      4. Verify with keyword matching; fallback to cleaned word-by-word
    """
    if start_idx == 0 and end_idx == total_words - 1:
        return _clean_sahih(sahih)

    cleaned = _clean_sahih(sahih)
    en_words = cleaned.split()
    n_en = len(en_words)
    if n_en == 0:
        return cleaned

    # Estimate English word range from Arabic position ratios
    ratio_start = start_idx / total_words
    ratio_end = (end_idx + 1) / total_words

    est_start = int(ratio_start * n_en)
    est_end = min(n_en, int(ratio_end * n_en) + 1)

    # Find all punctuation boundary positions (word indices AFTER punctuation)
    boundaries = [0]
    for i, w in enumerate(en_words):
        if re.search(r'[,;.\-–—!?]$', w):
            boundaries.append(i + 1)
    boundaries.append(n_en)

    # Snap start to nearest boundary ≤ est_start (+small slack)
    snap_start = max((b for b in boundaries if b <= est_start + 2), default=0)
    # Snap end to nearest boundary ≥ est_end (-small slack)
    snap_end = min((b for b in boundaries if b >= est_end - 2), default=n_en)

    # Don't let it be too short — at least 3 words
    if snap_end - snap_start < 3:
        snap_start = max(0, est_start)
        snap_end = min(n_en, est_end)

    result = " ".join(en_words[snap_start:snap_end])
    result = result.strip(' ,;-–—')

    # Verify: does the result contain enough keywords from word-by-word?
    keywords = _get_keywords(words, start_idx, end_idx)
    if keywords:
        result_lower = result.lower()
        matches = sum(1 for kw in keywords if kw in result_lower)
        if matches < len(keywords) * 0.25:
            # Keyword match too low — try wider window
            snap_start = max(0, snap_start - 3)
            snap_end = min(n_en, snap_end + 3)
            result2 = " ".join(en_words[snap_start:snap_end]).strip(' ,;-–—')
            matches2 = sum(1 for kw in keywords if kw in result2.lower())
            if matches2 > matches:
                result = result2

    # Final fallback: if still poor, use cleaned word-by-word
    if keywords:
        matches = sum(1 for kw in keywords if kw in result.lower())
        if matches < len(keywords) * 0.15:
            wbw = " ".join(
                re.sub(r'[\[\]()]', '', words[i]["translation"])
                for i in range(start_idx, end_idx + 1)
            ).strip()
            if wbw:
                result = wbw

    return result


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    parser = argparse.ArgumentParser(description="Update dataset with Sahih translations")
    parser.add_argument("--dry-run", action="store_true", help="Preview without saving")
    parser.add_argument("--start", type=int, default=0, help="Start index (0-based)")
    parser.add_argument("--count", type=int, default=0, help="Number of words (0=all)")
    args = parser.parse_args()

    with open(DATASET, "r", encoding="utf-8") as f:
        dataset = json.load(f)

    if not args.dry_run:
        shutil.copy2(DATASET, BACKUP)
        print(f"Backup: {BACKUP}")

    words_list = dataset["words"]
    total = len(words_list)
    end_idx = total if args.count == 0 else min(total, args.start + args.count)

    # Deduplicate ayah refs to count unique API calls needed
    refs = set()
    for w in words_list[args.start:end_idx]:
        r = w.get("example_ref", "")
        if r:
            refs.add(r)
    # Count how many are already cached
    cached = sum(1 for r in refs if (CACHE_DIR / f"{r.replace(':', '_')}.json").exists())
    to_fetch = len(refs) - cached
    est_time = to_fetch * (REQUEST_DELAY + 0.3)
    print(f"Words {args.start}–{end_idx-1} ({end_idx - args.start} words)")
    print(f"Unique ayahs: {len(refs)} ({cached} cached, {to_fetch} to fetch)")
    if to_fetch > 0:
        print(f"Estimated time: {est_time:.0f}s ({est_time/60:.1f} min)")
    print()

    stats = {"full": 0, "partial": 0, "failed": 0, "no_ref": 0, "skipped": 0}

    for idx in range(args.start, end_idx):
        word = words_list[idx]
        rank = word.get("rank", idx + 1)
        arabic = word["arabic"]
        meaning = word.get("meaning", "")
        ref = word.get("example_ref", "")

        if not ref:
            stats["no_ref"] += 1
            print(f"[{rank:3d}] {arabic:15s} — no example_ref, skipping")
            continue

        try:
            ayah_words, sahih_text = fetch_ayah_data(ref)
            n = len(ayah_words)
            target_idx = find_target_word(ayah_words, arabic)

            if target_idx is None:
                stats["failed"] += 1
                print(f"[{rank:3d}] {arabic:15s} — word not found in {ref}, keeping old")
                continue

            start, end = extract_meaningful_phrase(ayah_words, target_idx)
            phrase_len = end - start + 1
            is_full = (start == 0 and end == n - 1)

            # Build new Arabic example
            new_ar = " ".join(w["text"] for w in ayah_words[start:end + 1])

            # Build new English translation
            new_en = extract_sahih_portion(sahih_text, ayah_words, start, end, n)

            tag = "FULL" if is_full else "PART"
            stats["full" if is_full else "partial"] += 1

            # Show old vs new
            old_ar = word.get("example_ar", "")
            old_en = word.get("example_en", "")
            changed_ar = old_ar != new_ar
            changed_en = old_en != new_en

            print(f"[{rank:3d}] {arabic:12s} = {meaning:12s} [{tag}] ({phrase_len}w/{n}w) {ref}")
            if changed_ar:
                print(f"       AR: {new_ar}")
            if changed_en:
                print(f"       EN: {new_en}")
            if not changed_ar and not changed_en:
                print(f"       (unchanged)")

            if not args.dry_run:
                word["example_ar"] = new_ar
                word["example_en"] = new_en

        except Exception as exc:
            stats["failed"] += 1
            print(f"[{rank:3d}] {arabic:15s} — ERROR: {exc}")

    if not args.dry_run:
        with open(DATASET, "w", encoding="utf-8") as f:
            json.dump(dataset, f, ensure_ascii=False, indent=2)
        print(f"\nSaved: {DATASET}")

    print(f"\nStats: {json.dumps(stats)}")
    pct_full = stats['full'] / max(1, stats['full'] + stats['partial']) * 100
    print(f"Full-ayah usage: {pct_full:.0f}%")


if __name__ == "__main__":
    main()
