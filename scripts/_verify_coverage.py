"""
Verify reel_words_top600.json against the actual Quranic Corpus source files.

Uses:
  - quranic-corpus-morphology-0.4.txt  (morpheme-level, tab-separated)
  - quranic-corpus-morphology-xml-0.2.xml (word-level tokens)
  - generated/reel_words_top600.json
"""
import json
import re
import sys
import io
from pathlib import Path
from collections import Counter

if sys.stdout.encoding != "utf-8":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

CORPUS_TXT = Path(r"C:\Users\Abrar\JupyterNotebooks\quranic-corpus-morphology-0.4.txt")
CORPUS_XML = Path(r"C:\Users\Abrar\JupyterNotebooks\quranic-corpus-morphology-xml-0.2.xml")
JSON_FILE  = Path(r"C:\Users\Abrar\github\private\memorization\generated\reel_words_top600.json")

# ── 1) Count word-level tokens from the XML ──────────────────────
print("=" * 60)
print("1) Counting word-level tokens from XML (v0.2)...")
xml_word_count = 0
with open(CORPUS_XML, encoding="utf-8") as f:
    for line in f:
        # Each <word ...> is one Quran word token
        xml_word_count += line.count("<word ")
print(f"   Total <word> elements in XML: {xml_word_count:,}")

# ── 2) Count from the TXT morphology file (v0.4) ─────────────────
print("\n2) Counting from TXT morphology file (v0.4)...")
# The TXT has morphemes — multiple rows per word (e.g. prefix + stem).
# Location format: (chapter:verse:word:morpheme)
# Unique (chapter:verse:word) tuples = total word tokens
txt_words = set()
txt_total_lines = 0
with open(CORPUS_TXT, encoding="utf-8") as f:
    for line in f:
        if line.startswith("("):
            txt_total_lines += 1
            loc = line.split("\t")[0]  # e.g. (1:1:1:1)
            parts = loc.strip("()").split(":")
            word_key = (parts[0], parts[1], parts[2])  # (chapter, verse, word)
            txt_words.add(word_key)

txt_word_count = len(txt_words)
print(f"   Total morpheme rows: {txt_total_lines:,}")
print(f"   Unique word tokens (ch:v:w): {txt_word_count:,}")

# ── 3) Load JSON and verify ──────────────────────────────────────
print("\n3) Loading reel_words_top600.json...")
data = json.loads(JSON_FILE.read_text(encoding="utf-8"))
words = data["words"]
json_total_occ = sum(w["occurrences"] for w in words)
print(f"   Words in JSON: {len(words)}")
print(f"   Sum of occurrences: {json_total_occ:,}")

# ── 4) Spot-check a few words against the TXT corpus ─────────────
print("\n4) Spot-checking word counts against TXT corpus (v0.4)...")
# Count lemmas from TXT STEM entries
lemma_counter = Counter()
with open(CORPUS_TXT, encoding="utf-8") as f:
    for line in f:
        if "STEM" in line and "LEM:" in line:
            m = re.search(r"LEM:([^\|]+)", line)
            if m:
                lemma_counter[m.group(1)] += 1

# Check the JSON's top words against corpus lemma counts
# Map a few JSON transliterations to corpus lemma keys
spot_checks = {
    "min": ("min", "مِن"),
    "inna": ("<in~", "إِنَّ"),  
    "fī": ("fiY", "فِى"),
}

print(f"   Total unique lemmas in corpus: {len(lemma_counter):,}")
print(f"   Top 20 lemmas by count:")
for lem, count in lemma_counter.most_common(20):
    print(f"     {lem}: {count:,}")

# ── 5) Compute coverage ──────────────────────────────────────────
print("\n" + "=" * 60)
print("SUMMARY")
print("=" * 60)
print(f"  XML word tokens (v0.2):     {xml_word_count:,}")
print(f"  TXT word tokens (v0.4):     {txt_word_count:,}")
print(f"  JSON top-600 occurrence sum: {json_total_occ:,}")
print()
print(f"  Coverage vs XML (v0.2): {json_total_occ/xml_word_count*100:.1f}%  ({json_total_occ:,} / {xml_word_count:,})")
print(f"  Coverage vs TXT (v0.4): {json_total_occ/txt_word_count*100:.1f}%  ({json_total_occ:,} / {txt_word_count:,})")
print()
print("NOTE: The TXT file counts morphemes split at prefix/stem level,")
print("while XML counts whole word tokens as written in the mushaf.")
print("The JSON occurrence counts appear to be based on word-level tokens.")
