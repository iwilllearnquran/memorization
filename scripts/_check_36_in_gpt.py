"""Check if the 36 failed words have entries in new_gpr_examples.json,
and re-verify them with the improved normalization."""
import json, os, sys

sys.path.insert(0, "scripts")
from reverify_gpt import strip_for_search, example_in_verse, find_in_full_quran, load_full_quran, parse_gpt_json

CACHE_DIR = os.path.join("generated", ".quran_full_cache")

# Load failed list
failed = json.load(open("generated/failed_verifications.json", "r", encoding="utf-8"))
failed_words = {f["word"] for f in failed}
failed_ranks = {f["rank"] for f in failed}

# Parse GPT entries
gpt_entries = parse_gpt_json("generated/new_gpr_examples.json")
print(f"GPT entries total: {len(gpt_entries)}")

# Build lookup: word -> list of GPT entries
gpt_by_word = {}
gpt_by_strip = {}
for e in gpt_entries:
    w = e.get("word", "")
    if w not in gpt_by_word:
        gpt_by_word[w] = []
    gpt_by_word[w].append(e)
    s = strip_for_search(w)
    if s not in gpt_by_strip:
        gpt_by_strip[s] = []
    gpt_by_strip[s].append(e)

# Load full Quran
print("Loading full Quran...")
all_verses = load_full_quran()
verse_map = {}
for ch in range(1, 115):
    path = os.path.join(CACHE_DIR, f"chapter_{ch}.json")
    if not os.path.exists(path): continue
    for v in json.load(open(path, "r", encoding="utf-8")):
        verse_map[v["verse_key"]] = v["text"]
print(f"Loaded {len(all_verses)} verses\n")

# Check each failed word
print(f"{'Rank':>4}  {'Word':>15}  {'GPT?':>5}  {'#Ex':>3}  Result")
print("=" * 100)

for f in failed:
    word = f["word"]
    rank = f["rank"]
    
    # Find in GPT
    matches = gpt_by_word.get(word, [])
    if not matches:
        matches = gpt_by_strip.get(strip_for_search(word), [])
    
    if not matches:
        print(f"{rank:>4}  {word:>15}  {'NO':>5}  {0:>3}  No GPT entry found")
        continue
    
    # Try each GPT example for this word
    best_result = None
    best_entry = None
    for gpt in matches:
        ex = gpt.get("example", "")
        ref_raw = gpt.get("reference", "")
        if not ex:
            continue
        
        # Parse reference
        import re
        m = re.search(r'(\d+):(\d+)', ref_raw)
        verse_key = f"{m.group(1)}:{m.group(2)}" if m else None
        
        # Try cited verse first
        if verse_key and verse_key in verse_map:
            match_type = example_in_verse(ex, verse_map[verse_key])
            if match_type:
                best_result = f"VERIFIED@{verse_key} ({match_type})"
                best_entry = gpt
                break
        
        # Try full Quran search
        found_key, found_type = find_in_full_quran(ex, all_verses)
        if found_key:
            best_result = f"FOUND@{found_key} ({found_type})"
            best_entry = gpt
            break
        
        # Record as failed
        if not best_result:
            best_result = f"FAILED ref={ref_raw}"
            best_entry = gpt
    
    n = len(matches)
    ex_preview = best_entry["example"][:45] if best_entry else ""
    print(f"{rank:>4}  {word:>15}  {'YES':>5}  {n:>3}  {best_result}  |  {ex_preview}")
