"""Prove occurrence count for a word by counting directly from XML corpus."""
import re, io, sys, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

XML_PATH = r"C:\Users\Abrar\JupyterNotebooks\quranic-corpus-morphology-xml-0.2.xml"
JSON_PATH = r"C:\Users\Abrar\github\private\memorization\generated\reel_words_top600.json"

def normalize(text):
    """Same normalization as build_memorization_practice_words.js"""
    t = re.sub(r'[\u064B-\u065F\u0670\u06D6-\u06ED]', '', text)
    t = t.replace('\u0640', '')
    t = re.sub(r'[ٱأإآ]', 'ا', t)
    t = t.replace('ؤ', 'و')
    t = t.replace('ئ', 'ي')
    t = t.replace('ى', 'ي')
    t = t.replace('ة', 'ه')
    t = re.sub(r'[^\u0621-\u063A\u0641-\u064A]', '', t)
    return t.strip()

# Build counts from XML
print("Counting every word in the XML corpus...")
xml_counts = {}
with open(XML_PATH, encoding="utf-8") as f:
    for line in f:
        m = re.search(r'token="([^"]+)"', line)
        if m:
            normed = normalize(m.group(1))
            if normed:
                xml_counts[normed] = xml_counts.get(normed, 0) + 1

print(f"Total unique normalized keys in XML: {len(xml_counts)}")
print(f"Total tokens: {sum(xml_counts.values()):,}\n")

# Load JSON and verify several words
data = json.loads(open(JSON_PATH, encoding="utf-8").read())
words = data["words"]

# Check first 10 + a few from the middle
check_indices = list(range(10)) + [49, 99, 199, 299, 399, 499, 599]
print(f"{'Rank':<6}{'Arabic':<12}{'Key':<10}{'JSON':<8}{'XML':<8}{'Match?'}")
print("-" * 56)

all_match = True
for i in check_indices:
    w = words[i]
    key = normalize(w["arabic"])
    json_occ = w["occurrences"]
    xml_occ = xml_counts.get(key, 0)
    match = "OK" if json_occ == xml_occ else f"MISMATCH (diff={json_occ - xml_occ})"
    if json_occ != xml_occ:
        all_match = False
    print(f"{w['rank']:<6}{w['arabic']:<12}{key:<10}{json_occ:<8}{xml_occ:<8}{match}")

print(f"\nAll checked words match: {all_match}")
