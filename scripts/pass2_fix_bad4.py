"""Fix the 4 entries that got wrong substring matches."""
import json, re

DS_PATH = "generated/reel_words_top600.json"
CACHE_DIR = "generated/.imlaei_cache"

# Load imlaei cache
quran = {}
for ch in range(1, 115):
    for v in json.load(open(f"{CACHE_DIR}/chapter_{ch}.json", encoding="utf-8")):
        quran[v["verse_key"]] = v["text"]

ds = json.load(open(DS_PATH, encoding="utf-8"))
words = ds["words"]

def strip(s):
    s = re.sub(
        r'[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED'
        r'\u0653\u0654\u0655\u0640\u06E5\u06E6\u06DF'
        r'\u08D3-\u08E1\u08E3-\u08FF\uFE70-\uFE7F]',
        '', s
    )
    s = re.sub(r'[\u0671\u0623\u0625\u0622]', '\u0627', s)
    s = s.replace('\u0626', '\u064A')
    s = s.replace('\u0624', '\u0648')
    s = s.replace('\u0621', '')
    s = s.replace('\u0649', '\u064A')
    s = s.replace('\u0629', '\u0647')
    return re.sub(r'\s+', ' ', s).strip()

# Manual fixes for the 4 bad matches
# Search with specific stripped forms
targets = {
    119: "شييا",      # شَيْئًا  
    304: "الايات",     # الآيات
    349: "اعمالهم",    # أعمالهم
    561: "اتيناهم",    # آتيناهم
}

# Also fix some clearly wrong word matches
bad_matches = {
    297: "الاوليان",   # الأوليان (not الأولين)  
    417: "بشر",        # بشر (not بشّر)
    537: "بيناه",      # بيّنّاه (not بيّنة)
}
targets.update(bad_matches)

for rank, search_word in targets.items():
    w = next(w for w in words if w["rank"] == rank)
    print(f"\n[{rank}] {w['arabic']} — searching for '{search_word}'...")
    
    found = False
    for vk, txt in quran.items():
        txt_s = strip(txt)
        txt_words_s = txt_s.split()
        txt_words_o = txt.split()
        
        for i, ws in enumerate(txt_words_s):
            if ws == search_word:
                start = max(0, i - 1)
                end = min(len(txt_words_o), i + 3)
                window = ' '.join(txt_words_o[start:end])
                if window in txt:
                    w["pass2_gpt_example"] = window
                    w["pass2_gpt_reference"] = vk
                    w["pass2_verification"] = "non_gpt"
                    print(f"  → {window} ({vk})")
                    found = True
                    break
        if found:
            break
    
    if not found:
        print(f"  Still not found, trying broader search...")
        for vk, txt in quran.items():
            txt_s = strip(txt)
            if search_word in txt_s:
                idx = txt_s.find(search_word)
                # Find word boundaries
                before = txt_s[:idx].split()
                wi = len(before)
                txt_words_o = txt.split()
                start = max(0, wi - 1)
                end = min(len(txt_words_o), wi + 3)
                window = ' '.join(txt_words_o[start:end])
                if window in txt:
                    w["pass2_gpt_example"] = window
                    w["pass2_gpt_reference"] = vk
                    w["pass2_verification"] = "non_gpt"
                    print(f"  → {window} ({vk})")
                    found = True
                    break
        if not found:
            print(f"  STILL NOT FOUND")

with open(DS_PATH, "w", encoding="utf-8") as fp:
    json.dump(ds, fp, ensure_ascii=False, indent=2)

# Final summary
counts = {}
for w in words:
    v = w.get("pass2_verification", "?")
    counts[v] = counts.get(v, 0) + 1
print(f"\nFinal counts:")
for k, v in sorted(counts.items()):
    print(f"  {k}: {v}")
