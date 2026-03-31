import json, sys
sys.path.insert(0, "scripts")
from merge_gpt_examples import strip_tashkeel

fails = json.load(open("generated/failed_verifications.json", "r", encoding="utf-8"))
for f in fails[:5]:
    ex = f["example"]
    vs = f["verse_text"]
    ex_s = strip_tashkeel(ex)
    vs_s = strip_tashkeel(vs)
    print(f"Word: {f['word']}  Ref: {f['reference']}")
    print(f"  EX raw:     {ex[:60]}")
    print(f"  VS raw:     {vs[:60]}")
    print(f"  EX stripped: {ex_s[:60]}")
    print(f"  VS stripped: {vs_s[:60]}")
    print(f"  Match: {ex_s in vs_s}")
    print()
