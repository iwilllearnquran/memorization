"""Remove [], () from meaning and example_en fields in reel_words_top600.json"""
import json, re, pathlib

fp = pathlib.Path(__file__).resolve().parent.parent / "generated" / "reel_words_top600.json"
data = json.load(open(fp, encoding="utf-8"))

def clean(text: str) -> str:
    # Remove brackets/parens but keep the content inside
    text = re.sub(r'[\[\](){}]', '', text)
    # Collapse multiple spaces
    text = re.sub(r'  +', ' ', text).strip()
    return text

changed = 0
for w in data["words"]:
    for field in ("meaning", "example_en"):
        old = w.get(field, "")
        new = clean(old)
        if new != old:
            w[field] = new
            changed += 1

with open(fp, "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

print(f"Cleaned {changed} fields in {fp.name}")
