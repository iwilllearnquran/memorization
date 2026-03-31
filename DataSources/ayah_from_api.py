    
def clean_html(raw_text):
    cleaned_text = re.sub(r'<[^>]*>', '', raw_text)            # ✅ Remove all HTML tags  
    cleaned_text = re.sub(r'\[\d+\]', '', cleaned_text)        # ✅ Remove footnotes or numbered references (e.g., [1], [2])
    cleaned_text = re.sub(r'foot_note=\d+', '', cleaned_text)  # ✅ Remove inline footnote attributes (e.g., foot_note=12345) 
    cleaned_text = re.sub(r',\s*\d+', '.', cleaned_text)       # ✅ Replace ",{number}" or ", {number}" with a full stop
    cleaned_text = re.sub(r'.\s*\d+', '.', cleaned_text)       # ✅ Replace ".{number}" or ". {number}" with a full stop
    cleaned_text = re.sub(r'\s+', ' ', cleaned_text).strip()   # ✅ Remove multiple spaces and trim
    cleaned_text = re.sub(r',\s*$', '.', cleaned_text).strip() # ✅ Fullstop at the end of sentence
    if cleaned_text:                                           # ✅ Capitalize the first letter
        cleaned_text = cleaned_text[0].upper() + cleaned_text[1:]
    return cleaned_text
    
def remove_quranic_symbols(text):
    # Define a regex pattern to remove all Quranic symbols
    pattern = r'[ۖۗۘۙۚۛۜ۝۞ۣ۟۠ۡۢۤۥۦۧۨ۩۪ۭ۫۬ۮۯـ]'
    text = text.replace("ؕ", "")
    #cleaned_text = re.sub(pattern, ' ', text)
    cleaned_text = re.sub(r'\s+', ' ', text)
    return cleaned_text
    
def fetch_with_retries(url, max_retries=3, delay=2):
    """Fetch data from the API with retry logic."""
    for attempt in range(max_retries):
        try:
            response = requests.get(url, timeout=10)
            if response.status_code == 200:
                return response.json()
            else:
                print(f"Attempt {attempt+1}: Failed to fetch {url}, Status Code: {response.status_code}")
        except requests.exceptions.RequestException as e:
            print(f"Attempt {attempt+1}: Error fetching {url} - {e}")
        time.sleep(delay)  # Wait before retrying
    return {}    

def fetch_quran_ayah(surah, ayah):
    BASE_API_URL = "https://api.quran.com/api/v4/"
    AUDIO_BASE_URL = "https://verses.quran.com/"
    
    # API URLs
    arabic_url = f"{BASE_API_URL}/quran/verses/indopak?verse_key={surah}:{ayah}"
    english_url = f"https://api.alquran.cloud/v1/surah/{surah}/en.sahih"
    urdu_url = f"https://api.alquran.cloud/v1/ayah/{surah}:{ayah}/ur.jalandhry"
    arabic_audio_url = f"{BASE_API_URL}/recitations/7/by_ayah/{surah}:{ayah}"          # Mishary Alafasy
    urdu_audio_url = f"https://api.alquran.cloud/v1/ayah/{surah}:{ayah}/ur.khan"
    english_audio_url = f"https://api.alquran.cloud/v1/ayah/{surah}:{ayah}/en.walk"
    surah_info_url = f"{BASE_API_URL}/chapters/{surah}/info"
    surah_meta_url = f"{BASE_API_URL}/chapters/{surah}"
    
    # 📥 Fetch all required data
    arabic_response = fetch_with_retries(arabic_url)
    english_response = fetch_with_retries(english_url)
    urdu_response = fetch_with_retries(urdu_url)
    arabic_audio_response = fetch_with_retries(arabic_audio_url)
    urdu_audio_response = fetch_with_retries(urdu_audio_url)
    english_audio_response = fetch_with_retries(english_audio_url)
    surah_info_response = fetch_with_retries(surah_info_url)
    surah_meta_response = fetch_with_retries(surah_meta_url)

    # 📌 Surah Info
    surah_name_simple = surah_meta_response.get("chapter", {}).get("name_simple", "No Name Found")
    surah_name_arabic = surah_meta_response.get("chapter", {}).get("name_arabic", "No Arabic Name Found")
    surah_info_text = surah_info_response.get("chapter_info", {}).get("text", "No information available")
    translated_surah_name = surah_meta_response.get("chapter", {}).get("translated_name", {}).get("name", "No English Name Found")

    # 📖 Arabic & Translations
    arabic_text = arabic_response.get("verses", [{}])[0].get("text_indopak", "No Arabic text found")

    english_text = next(
        (a.get("text") for a in english_response.get("data", {}).get("ayahs", [])
         if a.get("numberInSurah") == ayah),
        "No English translation found"
    )
    urdu_text = urdu_response.get("data", {}).get("text", "No Urdu translation found")

    # 🔊 Audio Links
    arabic_audio_path = arabic_audio_response.get("audio_files", [{}])[0].get("url", "")
    arabic_audio = AUDIO_BASE_URL + arabic_audio_path if arabic_audio_path else "No audio available"
    urdu_audio = urdu_audio_response.get("data", {}).get("audio", "No Urdu audio found")
    english_audio = english_audio_response.get("data", {}).get("audio", "No English audio found")

    # ✅ Return all values
    return {
        "arabic_text": arabic_text,
        "english_text": clean_html(english_text),
        "urdu_text": clean_html(urdu_text),
        "arabic_audio": arabic_audio,
        "english_audio": english_audio,
        "urdu_audio": urdu_audio,
        "surah_name_simple": surah_name_simple,
        "surah_name_arabic": surah_name_arabic,
        "translated_surah_name": clean_html(translated_surah_name),
        "surah_info_text": clean_html(surah_info_text)
    }

