#!/usr/bin/env python3
"""
Build a comprehensive top-600 Quran word dataset for reels.

Sources:
  - memo-practice-words.json (existing word list, sorted by frequency)
  - quranic-corpus-morphology-0.4.txt (POS tags, root, lemma, grammar)
  - api.quran.com /verses/by_key (word-by-word: translation, audio, text_uthmani)

Output:  generated/reel_words_top600.json

Each entry contains:
  arabic, transliteration, meaning, pos_tag, root, lemma, grammar,
  occurrences, first_seen, audio_url, example_ar, example_en, example_ref
"""
from __future__ import annotations

import json
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
ROOT = Path(__file__).resolve().parents[1]
CORPUS_PATH = Path(r"C:\Users\Abrar\JupyterNotebooks\quranic-corpus-morphology-0.4.txt")
DATASET_PATH = ROOT / "memo-practice-words.json"
OUTPUT_PATH = ROOT / "generated" / "reel_words_top600.json"

TOP_N = 600
QURAN_API = "https://api.quran.com/api/v4"
HEADERS = {"Accept": "application/json", "User-Agent": "LearnQuranDaily/1.0"}
REQUEST_DELAY = 0.35  # polite rate-limiting (seconds between API calls)

# ---------------------------------------------------------------------------
# Buckwalter transliteration → Arabic
# ---------------------------------------------------------------------------
BUCKWALTER = {
    "'": "ء", ">": "أ", "&": "ؤ", "<": "إ", "}": "ئ", "A": "ا", "b": "ب",
    "p": "ة", "t": "ت", "v": "ث", "j": "ج", "H": "ح", "x": "خ", "d": "د",
    "*": "ذ", "r": "ر", "z": "ز", "s": "س", "$": "ش", "S": "ص", "D": "ض",
    "T": "ط", "Z": "ظ", "E": "ع", "g": "غ", "f": "ف", "q": "ق", "k": "ك",
    "l": "ل", "m": "م", "n": "ن", "h": "ه", "w": "و", "y": "ي", "Y": "ى",
    "F": "\u064B", "N": "\u064C", "K": "\u064D", "a": "\u064E", "u": "\u064F",
    "i": "\u0650", "o": "\u0652", "~": "\u0651", "^": "\u0653", "`": "\u0670",
    "#": "\u0654", "{": "\u0671", "_": "",
}

TAG_LABELS = {
    "N": "Noun", "V": "Verb", "ADJ": "Adjective", "PN": "Proper Noun",
    "P": "Preposition", "CONJ": "Conjunction", "DET": "Determiner",
    "PRON": "Pronoun", "REL": "Relative Pronoun", "DEM": "Demonstrative",
    "T": "Time Adverb", "LOC": "Location", "NEG": "Negation",
    "COND": "Conditional", "INTG": "Interrogative", "SUB": "Subordinating",
    "EMPH": "Emphatic", "ACC": "Accusative Particle", "RES": "Restrictive",
    "CERT": "Certainty", "VOC": "Vocative", "RSLT": "Result",
    "PRO": "Prohibition", "IMPV": "Imperative", "FUT": "Future",
    "EXP": "Exception", "INC": "Inceptive", "PREV": "Preventive",
    "REM": "Resumption", "ANS": "Answer", "EXH": "Exhortation",
    "SUR": "Surprise", "AVR": "Aversion", "AMD": "Amendment",
    "INT": "Interjection", "INL": "Initials", "EQ": "Equative",
    "COM": "Comitative",
}

_TASHKEEL_RE = re.compile(
    r'[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED'
    r'\u08D3-\u08E1\u08E3-\u08FF\uFE70-\uFE7F\u0640]'
)


def bw2ar(text: str) -> str:
    text = re.sub(r"_#u", "&", text)
    return "".join(BUCKWALTER.get(c, c) for c in text)


def strip_tashkeel(text: str) -> str:
    return _TASHKEEL_RE.sub("", text).strip()


def extract_feature(features: str, key: str) -> str:
    m = re.search(rf'{key}:([^\|]+)', features)
    return m.group(1) if m else ""


# ---------------------------------------------------------------------------
# Load Quranic Corpus morphology
# ---------------------------------------------------------------------------
def load_corpus() -> dict:
    """Parse the morphology TSV into a lookup: (surah,ayah,word_idx) → list[row]."""
    print(f"Loading morphology corpus from {CORPUS_PATH} ...")
    corpus: dict[tuple, list] = {}
    with open(CORPUS_PATH, encoding="utf-8") as f:
        next(f)  # skip header
        for line in f:
            parts = line.strip().split("\t")
            if len(parts) < 4:
                continue
            loc, form, tag, features = parts[0], parts[1], parts[2], parts[3]
            m = re.match(r"\((\d+):(\d+):(\d+):(\d+)\)", loc)
            if not m:
                continue
            surah, ayah, widx, subidx = map(int, m.groups())
            root_bw = extract_feature(features, "ROOT")
            lemma_bw = extract_feature(features, "LEM")
            row = {
                "surah": surah, "ayah": ayah, "word_idx": widx, "sub_idx": subidx,
                "tag": tag, "form_bw": form, "features": features,
                "root_bw": root_bw, "lemma_bw": lemma_bw,
                "root_ar": bw2ar(root_bw) if root_bw else "",
                "lemma_ar": bw2ar(lemma_bw) if lemma_bw else "",
                "form_ar": bw2ar(form),
            }
            key = (surah, ayah, widx)
            corpus.setdefault(key, []).append(row)
    print(f"  Loaded {sum(len(v) for v in corpus.values())} morph entries "
          f"across {len(corpus)} word positions.")
    return corpus


def get_word_audio_url(surah: int, ayah: int, position: int) -> str:
    return f"https://verses.quran.com/wbw/{surah:03d}_{ayah:03d}_{position:03d}.mp3"


# Proper noun names to skip (Arabic key forms)
PROPER_NOUN_KEYS = {
    "الله", "والله", "بالله", "لله", "ولله", "تالله", "فالله", "فلله",
    "موسي", "يموسي", "ابرهيم", "ابرهم", "نوح", "مريم", "ءادم",
    "عيسي", "يعقوب", "اسحق", "داوود", "سليمن", "يوسف", "هرون",
    "لوط", "شعيب", "صلح", "هود", "يونس", "زكريا", "يحيي",
    "اسمعيل", "اليس", "الياس", "ادريس", "ذالكفل", "ذالقرنين",
    "جبريل", "ميكل", "ابليس", "فرعون", "قرون", "همن", "جالوت",
    "طالوت", "مرين",
}


def is_proper_noun(word: dict, corpus: dict) -> bool:
    """Check if a word is a proper noun that should be excluded."""
    key = strip_tashkeel(word.get("key", ""))
    if key in PROPER_NOUN_KEYS:
        return True
    # Also check corpus POS tag
    first_seen = word.get("firstSeen", "")
    s, a, w = find_first_occurrence(corpus, word.get("arabic", ""), first_seen)
    if s and a and w:
        rows = corpus.get((s, a, w), [])
        stem_rows = [r for r in rows if "STEM" in r["features"]]
        primary = stem_rows[0] if stem_rows else (rows[0] if rows else None)
        if primary and primary["tag"] == "PN":
            return True
    return False


# ---------------------------------------------------------------------------
# Corpus lookup helpers
# ---------------------------------------------------------------------------
def find_first_occurrence(corpus: dict, arabic_key: str, first_seen: str):
    """Find the word position in the corpus matching arabic_key at first_seen ayah."""
    try:
        s, a = first_seen.split(":")
        surah, ayah = int(s), int(a)
    except (ValueError, AttributeError):
        return None, None, None

    key_clean = strip_tashkeel(arabic_key)

    # Pass 1: exact match only
    for widx in range(1, 30):
        rows = corpus.get((surah, ayah, widx))
        if not rows:
            continue
        combined_clean = strip_tashkeel("".join(r["form_ar"] for r in rows))
        if key_clean == combined_clean:
            return surah, ayah, widx

    # Pass 2: substring match — only if the target is ≥ 3 chars to avoid
    # short words ("من") matching inside longer words ("يؤمنون")
    if len(key_clean) >= 3:
        for widx in range(1, 30):
            rows = corpus.get((surah, ayah, widx))
            if not rows:
                continue
            combined_clean = strip_tashkeel("".join(r["form_ar"] for r in rows))
            if combined_clean in key_clean and len(combined_clean) >= len(key_clean) - 1:
                return surah, ayah, widx

    # Pass 3: search all ayahs in the surah for exact match
    for (s2, a2, w2), rows in corpus.items():
        if s2 != surah:
            continue
        combined_clean = strip_tashkeel("".join(r["form_ar"] for r in rows))
        if key_clean == combined_clean:
            return s2, a2, w2

    return None, None, None


def extract_grammar(corpus: dict, surah: int, ayah: int, widx: int) -> dict:
    """Extract POS, root, lemma, case, gender, number, etc. from corpus rows."""
    rows = corpus.get((surah, ayah, widx), [])
    if not rows:
        return {}

    # Take the STEM row (sub_idx usually > 1 for stems; prefixes are sub_idx=1)
    stem_rows = [r for r in rows if "STEM" in r["features"]]
    primary = stem_rows[0] if stem_rows else rows[0]

    tag = primary["tag"]
    pos_label = TAG_LABELS.get(tag, tag)
    root = primary["root_ar"]
    lemma = primary["lemma_ar"]

    # Extract case, person, gender, number from features
    feats = primary["features"]
    case_tag = ""
    for c in ("NOM", "ACC", "GEN"):
        if c in feats.split("|"):
            case_tag = c
            break

    person = gender = number = tense = mood = ""
    for feat in feats.split("|"):
        feat = feat.strip()
        if re.match(r"^[123][MF]?[SDP]$", feat):
            if feat[0] in "123":
                person = {"1": "1st", "2": "2nd", "3": "3rd"}[feat[0]]
            if "M" in feat:
                gender = "masculine"
            elif "F" in feat:
                gender = "feminine"
            if feat.endswith("S"):
                number = "singular"
            elif feat.endswith("D"):
                number = "dual"
            elif feat.endswith("P"):
                number = "plural"
        elif feat == "PERF":
            tense = "perfect"
        elif feat == "IMPF":
            tense = "imperfect"
        elif feat.startswith("MOOD:"):
            mood = feat.split(":")[1].lower()

    # Verb form (I-X)
    verb_form = ""
    vf_match = re.search(r"\(([IVX]+)\)", feats)
    if vf_match:
        verb_form = vf_match.group(1)

    return {
        "pos_tag": pos_label,
        "pos_raw": tag,
        "root": root,
        "lemma": lemma,
        "case": case_tag,
        "person": person,
        "gender": gender,
        "number": number,
        "tense": tense,
        "mood": mood,
        "verb_form": verb_form,
        "features_raw": feats,
    }


# ---------------------------------------------------------------------------
# Quran.com API — fetch word-by-word for a verse
# ---------------------------------------------------------------------------
def fetch_verse_words(verse_key: str) -> list[dict] | None:
    """GET /verses/by_key/{verse_key}?words=true → word list."""
    url = (
        f"{QURAN_API}/verses/by_key/{verse_key}"
        f"?language=en&words=true&word_fields=translation,text_uthmani"
    )
    try:
        req = urllib.request.Request(url, headers=HEADERS)
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode())
        return data.get("verse", {}).get("words", [])
    except Exception as exc:
        print(f"  ⚠ API error for {verse_key}: {exc}")
        return None


def build_short_example(words: list[dict], arabic_key: str, verse_key: str) -> dict | None:
    """Pick a ≤5-word window around the target word from the verse words."""
    if not words:
        return None

    key_clean = strip_tashkeel(arabic_key)

    # Find target word index
    best_idx = None
    for i, w in enumerate(words):
        w_text = w.get("text_uthmani", "") or w.get("text", "")
        if strip_tashkeel(w_text) == key_clean:
            best_idx = i
            break
    if best_idx is None:
        for i, w in enumerate(words):
            w_text = w.get("text_uthmani", "") or w.get("text", "")
            if key_clean in strip_tashkeel(w_text) or strip_tashkeel(w_text) in key_clean:
                best_idx = i
                break
    if best_idx is None:
        best_idx = 0

    # Filter content words (skip end-of-ayah markers)
    content = [(i, w) for i, w in enumerate(words) if w.get("char_type_name") != "end"]
    pos = 0
    for j, (orig_i, _) in enumerate(content):
        if orig_i == best_idx:
            pos = j
            break

    start = max(0, pos - 2)
    end = min(len(content), start + 5)
    start = max(0, end - 5)
    window = content[start:end]

    ar_parts, en_parts = [], []
    for _, w in window:
        ar_parts.append(w.get("text_uthmani", "") or w.get("text", ""))
        tr = w.get("translation", {})
        en_parts.append(tr.get("text", "") if isinstance(tr, dict) else str(tr))

    return {
        "ar": " ".join(ar_parts),
        "en": " ".join(en_parts),
        "ref": verse_key,
    }


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    # Load existing word list
    print(f"Loading word dataset from {DATASET_PATH} ...")
    data = json.loads(DATASET_PATH.read_text(encoding="utf-8-sig"))
    all_words = data["words"]
    print(f"  {len(all_words)} total words, collecting top {TOP_N} (skipping proper nouns)")

    # Load corpus
    corpus = load_corpus()

    results = []
    skipped_pn = []
    src_idx = 0
    for word in all_words:
        if len(results) >= TOP_N:
            break

        # Skip proper nouns
        if is_proper_noun(word, corpus):
            skipped_pn.append(f"{word.get('key','')} = {word.get('meaning','')}")
            print(f"  [SKIP] Proper noun: {word.get('key','')} = {word.get('meaning','')}")
            continue

        idx = len(results)
        arabic = word["arabic"]
        key = word["key"]
        meaning = word["meaning"]
        translit = word.get("transliteration", "")
        occurrences = word.get("occurrences", 0)
        first_seen = word.get("firstSeen", "")

        print(f"\n[{idx+1}/{TOP_N}] {arabic} = {meaning} ({translit})  "
              f"occ={occurrences}  first={first_seen}")

        # ── Morphology from corpus ─────────────────────────────────
        grammar = {}
        audio_url = ""
        surah, ayah, widx = find_first_occurrence(corpus, arabic, first_seen)
        if surah and ayah and widx:
            grammar = extract_grammar(corpus, surah, ayah, widx)
            audio_url = get_word_audio_url(surah, ayah, widx)
            print(f"  POS: {grammar.get('pos_tag', '?')}  "
                  f"Root: {grammar.get('root', '?')}  "
                  f"Audio: .../{surah:03d}_{ayah:03d}_{widx:03d}.mp3")
        else:
            print(f"  ⚠ Could not find in corpus")

        # ── Quran.com example (≤5 words) ──────────────────────────
        example = None
        if first_seen:
            time.sleep(REQUEST_DELAY)
            verse_words = fetch_verse_words(first_seen.replace(":", ":"))
            if verse_words:
                example = build_short_example(verse_words, arabic, first_seen)
                if example:
                    print(f"  Example: {example['ar']}")
                    print(f"           {example['en']}")

        entry = {
            "rank": idx + 1,
            "key": key,
            "arabic": arabic,
            "transliteration": translit,
            "meaning": meaning,
            "occurrences": occurrences,
            "first_seen": first_seen,
            "pos_tag": grammar.get("pos_tag", ""),
            "pos_raw": grammar.get("pos_raw", ""),
            "root": grammar.get("root", ""),
            "lemma": grammar.get("lemma", ""),
            "case": grammar.get("case", ""),
            "person": grammar.get("person", ""),
            "gender": grammar.get("gender", ""),
            "number": grammar.get("number", ""),
            "tense": grammar.get("tense", ""),
            "mood": grammar.get("mood", ""),
            "verb_form": grammar.get("verb_form", ""),
            "audio_url": audio_url,
            "example_ar": example["ar"] if example else "",
            "example_en": example["en"] if example else "",
            "example_ref": example["ref"] if example else "",
        }
        results.append(entry)

    # Write output
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    output = {
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "source": "memo-practice-words.json + quranic-corpus-morphology-0.4.txt + api.quran.com",
        "total_words": len(results),
        "words": results,
    }
    OUTPUT_PATH.write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\n✅ Saved {len(results)} words to {OUTPUT_PATH}")
    if skipped_pn:
        print(f"   Skipped {len(skipped_pn)} proper nouns: {', '.join(skipped_pn)}")


if __name__ == "__main__":
    main()
