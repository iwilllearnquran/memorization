import json
data = json.loads(open('../generated/reel_words_top600.json', encoding='utf-8').read())
for w in data['words'][:10]:
    print(f"{w['rank']}: {w['example_en']}")
