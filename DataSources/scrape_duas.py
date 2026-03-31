from playwright.sync_api import sync_playwright
import json

URL = "https://quranwbw.com/duas"

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()

    print("Opening page...")
    page.goto(URL, timeout=60000)
    page.wait_for_timeout(4000)  # allow JS hydration

    # 🔁 SCROLL UNTIL NO NEW CONTENT LOADS
    previous_count = 0

    while True:
        blocks = page.query_selector_all("section div[id*=':']")
        current_count = len(blocks)

        print("Loaded blocks:", current_count)

        if current_count == previous_count:
            break

        previous_count = current_count
        page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
        page.wait_for_timeout(1500)

    print("Finished loading all content.")

    duas = []

    for block in blocks:
        verse_id = block.get_attribute("id")
        if not verse_id:
            continue

        # ✅ keep only ayah-level IDs (e.g. 2:127)
        if verse_id.count(":") != 1:
            continue

        # Arabic ayah (join words)
        words = block.query_selector_all("span.arabicText")
        arabic = " ".join(w.inner_text().strip() for w in words)

        # Transliteration + translation
        blocks_tt = block.query_selector_all(".verseTranslationText > div")

        transliteration = ""
        translation = ""

        if len(blocks_tt) > 0:
            transliteration = blocks_tt[0].inner_text().split("—")[0].strip()

        if len(blocks_tt) > 1:
            translation = blocks_tt[1].inner_text().split("—")[0].strip()

        if arabic:
            duas.append({
                "reference": verse_id,
                "arabic": arabic,
                "transliteration": transliteration,
                "translation": translation
            })

    browser.close()

print("Extracted", len(duas), "duas")

with open("quranwbw_duas.json", "w", encoding="utf-8") as f:
    json.dump(duas, f, ensure_ascii=False, indent=2)

print("Saved to quranwbw_duas.json")
