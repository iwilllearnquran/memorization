"""Fix the last 4 QURAN_TRANSLATION entries manually"""
import json

DS_PATH = "generated/reel_words_top600.json"
ds = json.load(open(DS_PATH, encoding="utf-8"))
words = ds["words"]

fixes = {
    # [241] يقول يا ليتني قدمت → WBW: يقول(He will say) يليتني(Oh! I wish I had sent ahead) قدمت(I had sent ahead) لحياتي(for my life)
    # The WBW merges يا ليتني → يليتني. Map: يقول→يقول, يا ليتني→يليتني, قدمت→قدمت
    241: "He will say Oh! I wish I had sent ahead",
    
    # [305] يا بني اسراييل → WBW: يبني(O Children) اسريل(of Israel)
    305: "O Children of Israel",
    
    # [470] يا بني اسراييل → same as 305
    470: "O Children of Israel",
    
    # [530] قل يا ايها الكافرون → WBW: قل(Say) يايها(O disbelievers) الكفرون(O disbelievers) 
    # Actually WBW has only 3 words, example has 4. Map: قل→Say, يا ايها الكافرون → O disbelievers
    530: "Say O disbelievers",
}

for w in words:
    r = w["rank"]
    if r in fixes and not w.get("QURAN_TRANSLATION"):
        w["QURAN_TRANSLATION"] = fixes[r]
        print(f"  [{r}] {w['pass2_gpt_example']} → {fixes[r]}")

with open(DS_PATH, "w", encoding="utf-8") as fp:
    json.dump(ds, fp, ensure_ascii=False, indent=2)

qt = sum(1 for x in words if x.get("QURAN_TRANSLATION"))
at = sum(1 for x in words if x.get("API_TRANSLATION"))
print(f"\nQURAN_TRANSLATION: {qt}/600")
print(f"API_TRANSLATION:   {at}/600")
