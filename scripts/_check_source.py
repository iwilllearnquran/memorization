import json
d = json.loads(open('../generated/reel_words_top600.json', 'r', encoding='utf-8').read())
print(f"Total words: {d['total_words']}")
pn = [w for w in d['words'] if w['pos_raw'] == 'PN']
print(f"Proper nouns: {len(pn)}")
if pn:
    for w in pn:
        print(f"  {w['arabic']} = {w['meaning']}")
