import json
d = json.load(open('generated/reel_words_top600_validated.json', encoding='utf-8'))
for w in d['words']:
    c = w.get('latest_validation_comment', '')
    if 'partial' in c or 'fail' in c:
        ex = w.get('pass3_example', '') or w.get('pass2_gpt_example', '') or ''
        ref = w.get('pass3_reference', '') or w.get('pass2_gpt_reference', '') or ''
        rank = w['rank']
        ar = w['arabic']
        print(f"#{rank:>3} {ar:>20}  ref={ref:<10} {c}")
        print(f"     example: {ex}")
        print()
