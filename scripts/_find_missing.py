import json, re, unicodedata
from pathlib import Path

data = json.loads(open('../generated/reel_words_top600.json', encoding='utf-8').read())
out = Path('../output/yt_word_videos')

def make_slug(t):
    t = unicodedata.normalize('NFKD', t)
    return re.sub(r'[^a-zA-Z0-9]', '', t).lower() or 'word'

missing = []
found = 0
for w in data['words']:
    slug = make_slug(w.get('transliteration', '') or f"word{w['rank']}")
    mp4 = out / slug / f"word_{slug}.mp4"
    if mp4.exists():
        found += 1
    else:
        missing.append(w['rank'])

print(f"Found: {found} / {len(data['words'])}")
print(f"Missing: {len(missing)}")
print(f"First 10 missing ranks: {missing[:10]}")
if missing:
    ranks_str = ",".join(str(r) for r in missing[:10])
    print(f"Ranks: {ranks_str}")
    print(f"Start rank: {missing[0]}")
