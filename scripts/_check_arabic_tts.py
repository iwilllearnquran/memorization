#!/usr/bin/env python3
"""
Scan all example_ar fields in reel_words_top600.json for characters/patterns
that could cause ElevenLabs TTS mispronunciation or intonation issues.

Checks:
  1) Non-Arabic / non-standard characters (Latin, digits, stray Unicode)
  2) Punctuation that may affect intonation (?, !, ;, commas, parens, brackets)
  3) Extraneous whitespace (double spaces, leading/trailing)
  4) Verse/surah markers, bismillah prefixes
  5) Very long examples (>120 chars) that may get cut off
  6) Mixed scripts
"""
import json, re, sys, unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "generated" / "reel_words_top600.json"

data = json.loads(DATA.read_text("utf-8"))
words = data["words"]

# Arabic Unicode blocks: \u0600-\u06FF (Arabic), \u0750-\u077F (supplement),
# \uFB50-\uFDFF (Presentation Forms-A), \uFE70-\uFEFF (Presentation Forms-B),
# \u08A0-\u08FF (Arabic Extended-A)
ARABIC_RE = re.compile(r'[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF\u08A0-\u08FF]')
# Whitespace characters
WS_RE = re.compile(r'\s')

# Characters that are fine in Arabic text: Arabic chars, spaces, common diacritics
SAFE_RE = re.compile(r'^[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF\u08A0-\u08FF\s\u200F\u200E]+$')

issues = []

for w in words:
    rank = w.get("rank", "?")
    ar = w.get("example_ar", "")
    if not ar:
        continue
    
    entry_issues = []
    
    # 1) Non-Arabic characters
    non_arabic = []
    for ch in ar:
        if ARABIC_RE.match(ch) or WS_RE.match(ch) or ch in '\u200F\u200E':
            continue
        cp = f"U+{ord(ch):04X}"
        name = unicodedata.name(ch, "UNKNOWN")
        non_arabic.append(f"'{ch}' ({cp} {name})")
    if non_arabic:
        entry_issues.append(f"NON-ARABIC chars: {', '.join(set(non_arabic))}")
    
    # 2) Any punctuation at all
    puncts = []
    for ch in ar:
        if unicodedata.category(ch).startswith('P'):
            cp = f"U+{ord(ch):04X}"
            name = unicodedata.name(ch, "UNKNOWN")
            puncts.append(f"'{ch}' ({cp} {name})")
    if puncts:
        entry_issues.append(f"PUNCTUATION: {', '.join(set(puncts))}")
    
    # 3) Latin/digit characters
    latin = [ch for ch in ar if ch.isascii() and ch.isalpha()]
    digits = [ch for ch in ar if ch.isdigit()]
    if latin:
        entry_issues.append(f"LATIN chars: {''.join(set(latin))}")
    if digits:
        entry_issues.append(f"DIGITS: {''.join(set(digits))}")
    
    # 4) Double/triple spaces
    if '  ' in ar:
        entry_issues.append("DOUBLE SPACES")
    
    # 5) Leading/trailing whitespace
    if ar != ar.strip():
        entry_issues.append("LEADING/TRAILING WHITESPACE")
    
    # 6) Very long text (>120 chars)
    if len(ar) > 120:
        entry_issues.append(f"LONG ({len(ar)} chars)")
    
    # 7) Contains numbers (Arabic-Indic digits ٠-٩)
    ar_digits = [ch for ch in ar if '\u0660' <= ch <= '\u0669']
    if ar_digits:
        entry_issues.append(f"ARABIC DIGITS: {''.join(set(ar_digits))}")
    
    # 8) Unusual Unicode (zero-width joiners, etc.)
    unusual = []
    for ch in ar:
        cat = unicodedata.category(ch)
        if cat.startswith('C') and ch not in '\u200F\u200E':  # Control/Format
            cp = f"U+{ord(ch):04X}"
            name = unicodedata.name(ch, "UNKNOWN")
            unusual.append(f"'{cp}' ({name})")
    if unusual:
        entry_issues.append(f"INVISIBLE/CONTROL: {', '.join(set(unusual))}")
    
    if entry_issues:
        issues.append((rank, ar[:80], entry_issues))

print(f"Scanned {len(words)} words\n")

if not issues:
    print("✓ All Arabic examples are clean — no TTS issues found.")
else:
    print(f"Found issues in {len(issues)} entries:\n")
    for rank, preview, problems in sorted(issues, key=lambda x: x[0]):
        print(f"  #{rank}: \"{preview}\"")
        for p in problems:
            print(f"       → {p}")
        print()

# Summary by issue type
from collections import Counter
type_counts = Counter()
for _, _, problems in issues:
    for p in problems:
        key = p.split(":")[0]
        type_counts[key] += 1

if type_counts:
    print(f"\n{'='*50}")
    print("Summary by issue type:")
    for t, c in type_counts.most_common():
        print(f"  {t}: {c} entries")
