def generate_quran_game_html_with_extra(arabic_text, surah_name, surah_name_ar, ayah_num, english_text, word_data, audio_url, transliterations,urdu_text, urdu_audio, english_audio, required_keys, jarr_phrases=None, output_file="ayah_memorize.html"):
    folder_path = os.path.join("output", os.path.dirname(output_file))
    os.makedirs(folder_path, exist_ok=True)
    
    filepath = os.path.join(folder_path, os.path.basename(output_file))
   

    with open(filepath, "w", encoding="utf-8") as f:
        f.write(f"""
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<!-- Bootstrap CSS (v4.6 or v5.x recommended) -->
<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
<script src="https://unpkg.com/lottie-web@5.12.2/build/player/lottie.min.js"></script>
<link href="https://fonts.googleapis.com/css2?family=Roboto&display=swap" rel="stylesheet"/>
<link href="https://fonts.googleapis.com/icon?family=Material+Icons+Outlined" rel="stylesheet"/>
<link rel="stylesheet" href="/styles.css">

<title>Ayah Memorization</title>

  <script async src="https://www.googletagmanager.com/gtag/js?id=G-KL3ZNNX844"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){{ dataLayer.push(arguments); }}
    gtag('js', new Date());
    gtag('config', 'G-KL3ZNNX844');
  </script>

<!-- ✅ Firebase Compat SDKs for static HTML -->
<script src="https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.12.0/firebase-auth-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js"></script>

                

</head>
<body>

<div class="overlay" id="overlay" onclick="hidePopup()"></div>
<div class="popup-content" id="popupContent"></div>

<!-- Hidden audio element that togglePlay() uses -->
<audio id="ayahAudio" src="{audio_url}" preload="metadata"></audio>
<audio id="audio-url-ar" data-src="{audio_url}" preload="metadata"></audio>
<audio id="audio-url-en" data-src="{english_audio}" preload="metadata"></audio>
<audio id="audio-url-ur" data-src="{urdu_audio}" preload="metadata"></audio>



<div id= "main-grammar-section" class="section">
<div id="learning-mode-content" style="text-align: center; direction: rtl;">
""")

        for word in word_data:
            filtered_word = {k: word[k] for k in required_keys if k in word}
            morph_json = json.dumps(filtered_word, ensure_ascii=False).replace('"', '&quot;')

            case = (word.get("Case_from_xml") or "").strip().upper()
            case_class = {
                "NOM": "nominative",
                "ACC": "accusative",
                "GEN": "genitive",
                "nominative": "nominative",
                "accusative": "accusative",
                "genitive": "genitive"
            }.get(case, "")

            root_html = f"<span class='translation'>{html.escape(word.get('root_from_txt', ''))}</span>" if word.get("root_from_txt") else ""
            tags_html = f"<span class='translation'>{html.escape(word.get('tags_simple_joined', '').lower())}</span>" if word.get("tags_simple_joined") else ""

            f.write(f"""
    <span class="word-block click-animate {case_class} {'verb-highlight' if word.get('verb_colour') else ''}" onclick="showPopup({morph_json})">
    
    <!-- Arabic word only -->
    <span class="word-text">{html.escape(word.get('Word', ''))}</span>

    <!-- Metadata: translation, root, POS -->
    <span class="metadata">
        <span class="translation toggle-translation">{html.escape(word.get('Translation', '—'))}</span>
        <span class="translation toggle-root root-tag ">{html.escape(word.get('root_from_txt', ''))}</span>
        <span class="translation toggle-pos pos-tag ">{html.escape(word.get('tags_simple_joined', '').lower())}</span>
    </span>

</span>
    

""")

        f.write(f"""

<div class="grammar-info">
  <div style="display: flex; justify-content: center; flex-wrap: wrap; row-gap: 10px; column-gap: 20px; margin-top: 12px;">

    <!-- Nominative -->
    <div class="grammar-item" onclick="showGrammarPopup('nominative')"
         style="display: flex; align-items: center; gap: 6px; cursor: pointer;">
      <div style="width: 12px; height: 12px; background-color: #ffe6e6; border-radius: 3px; border: 1px solid #ccc;"></div>
      <span><b>Nominative</b> <i>(Rafʿ / Subject)</i></span>
    </div>

    <!-- Accusative -->
    <div class="grammar-item" onclick="showGrammarPopup('accusative')"
         style="display: flex; align-items: center; gap: 6px; cursor: pointer;">
      <div style="width: 12px; height: 12px; background-color: #e6f0ff; border-radius: 3px; border: 1px solid #ccc;"></div>
      <span><b>Accusative</b> <i>(Naṣb / Object)</i></span>
    </div>

    <!-- Genitive -->
    <div class="grammar-item" onclick="showGrammarPopup('genitive')"
         style="display: flex; align-items: center; gap: 6px; cursor: pointer;">
      <div style="width: 12px; height: 12px; background-color: #e6ffe6; border-radius: 3px; border: 1px solid #ccc;"></div>
      <span><b>Genitive</b> <i>(Jarr / Possession)</i></span>
    </div>

    <!-- Verb -->
    <div class="grammar-item" onclick="showGrammarPopup('verb')"
         style="display: flex; align-items: center; gap: 6px; cursor: pointer;">
      <div style="width: 12px; height: 12px; background-color: #fff3cd; border-radius: 3px; border: 1px solid #ccc;"></div>
      <span><b>Verb</b> <i>(Fiʿl / Action)</i></span>
    </div>

  </div>
</div>



  <!-- 🔵 PLAY Button -->
  <div style="margin-top: 20px; text-align: center;">
<button id="stripNavGames" class="strip-btn">
  <span class="btn-text">Play and Practise →</span>
</button>

  </div>
</div>


""")


        f.write(f"""
        </div>
        <div id="reciting-mode-content" class="ayah-arabic" style="display: none; text-align: center; font-size: 28px; direction: rtl; ">
        {html.escape(arabic_text)}
        </div>

        """)



        f.write(f"""
        

</div>

<div id="translation-section" class="section" style="text-align: center;">
<h2 class="practice-title" style="
  font-family: 'Roboto', sans-serif;
  font-size: 16px;
  font-weight: 700;
  color: #0a4d68;
  margin-bottom: 12px;
">
    Translation
  </h2>

  <div id="englishTranslation" class="ayah-english" style="text-align: center;">
    {html.escape(english_text)}
  </div>
  <div id="urduTranslation" class="ayah-english" style="text-align: center;">
    {html.escape(urdu_text)}
  </div>
</div>

          <div id="game-mode-content" style="display:none;">
    <!-- Game layout will be injected here via JS -->
    
  </div>


""")



        f.write(f"""
            <div id="transliteration-box" class="section" style="display:none; text-align:left">
                 <div class="section practice-header">
                    <h2 class="practice-title">✍️ Practice Mode: Write the Arabic Words</h2>
                    <p class="practice-desc" style="margin-bottom:4px"  >
                       Type the Arabic word above using English letters. Our check uses fuzzy matching, so small spelling variations may still be accepted.
                    </p>
                    <p class="practice-desc">
                       (Use the <strong>Settings</strong> (⚙️) to clear your inputs or toggle translations on/off).
                    </p>
                 </div>
                 <div class="dropdown-menu-custom">
                 </div>
               """)

        for idx, word in enumerate(word_data):
            trans = html.escape(word.get("Translation", "—"))
            translit = html.escape(word.get("translit", ""))

            f.write(f"""
                <span class="word-block-translit " style="display: inline-block; text-align: center; margin: 8px; padding: 5px">
                   <input type="text" class="translit-input small-placeholder" data-key="translit-{ayah_num}-{idx}" data-expected="{translit}"
                      placeholder="Type transliteration" 
                      style="width:150px; font-size:15px; height: 42px; text-align:center; border-radius: 8px; border: 1px solid #ccc; box-shadow: inset 0 1px 3px rgba(0,0,0,0.1);" />
                   <div class="translation toggle-translation" style="margin: 2px; font-size:10px">{trans}</div>
                   <details style="font-size:10px; color:gray; margin-top:4px;">
                      <summary style="cursor:pointer;">show translit</summary>
                      <div>{translit}</div>
                   </details>
                </span>
""")

        f.write(""" 
</div> 



<nav class="bottom-nav">



  <a href="#" id="navPractice" class="nav-item" onclick="togglePracticeNav(); this.blur();">
    <span class="material-icons-outlined">edit</span>
    <span class="nav-label">Practice</span>
  </a>
    <a href="#" id="navMode" class="nav-item" onclick="toggleModeNav(); this.blur();">
    <span id="navModeIcon" class="material-icons-outlined">menu_book</span>
    <span class="nav-label">Recite</span>
  </a>

    <a href="#" id="playToggleBtn" class="nav-item" onclick="togglePlay(event);">
    <span class="material-icons-outlined" id="navPlayIcon">play_arrow</span>
  </a>
    <a href="#" id="navSettings" class="nav-item" onclick="toggleSettingsNav(event); this.blur();">
    <span class="material-icons-outlined">settings</span>
    <span class="nav-label">Settings</span>
  </a>

<a href="#" id="navSaveProgress" class="nav-item" onclick="requestSaveProgress(); this.blur();">
  <span class="material-icons-outlined">bookmark_add</span>
  <span class="nav-label">Save</span>
</a>

</nav>









<script src="/script.js" defer></script> 

<script type="module" defer>
  import { toggleGames } from '/ui/toggleGames.js';

  document.getElementById('navGames')?.addEventListener('click', e => {
    e.preventDefault();
    toggleGames();
  });

  document.getElementById('stripNavGames')?.addEventListener('click', e => {
    e.preventDefault();
    toggleGames();
  });
</script>

<script>
  const gameEl = document.getElementById('game-mode-content');
  if (!gameEl) {
  } else {
    function notifyParent(type) {
      parent.postMessage({ type }, '*');
    }

    function checkVisibility() {
      const style = window.getComputedStyle(gameEl);
      const isVisible =
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        gameEl.offsetWidth > 0 &&
        gameEl.offsetHeight > 0;
      notifyParent(isVisible ? 'gamesReady' : 'gameExited');
    }

    // Observe both class _and_ style attribute changes
    const observer = new MutationObserver(muts => {
      checkVisibility();
    });
    observer.observe(gameEl, {
      attributes: true,
      attributeFilter: ['style', 'class']
    });

    // Initial check (once the DOM is parsed)
    window.addEventListener('DOMContentLoaded', () => {
      checkVisibility();
    });

    // (Optional) Poll every 500ms as a fallback if your game code swaps styles via JS without touching class/style attrs:
    // setInterval(checkVisibility, 500);
  }
</script>
                
  <div id="wordHintOverlay" class="word-hint-overlay hidden">
    <div class="word-hint-text">
    Click on each word to view details
    </div>
    <div id="wordHint" class="word-hint">
      <div id="wordHintLottie"></div>
    </div>
  </div>

</body>
</html>
""")

    print(f"✅ HTML file generated: {filepath}")


