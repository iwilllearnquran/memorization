# App Source Inventory

This document inventories the content, API, dataset, and backend sources referenced in this repo, with extra attention on the `DataSources/` folder.

## Scope

Included:
- Confirmed runtime data sources used by the app or reel generator.
- Local generated datasets that the app reads.
- Source-building scripts in `DataSources/` and `scripts/`.
- Backend services and CDNs that the app depends on.

Excluded from the main source list:
- Pure presentation assets such as local backgrounds and fonts unless they are clearly part of a source pipeline.
- Unrelated experiments that do not appear to feed the app.

## Confirmed App Data Sources

| Category | Source | How it is used | Evidence |
|---|---|---|---|
| Quran Arabic text (IndoPak) | `https://api.quran.com/api/v4/quran/verses/indopak` | Builds recite-mode surah JSON and reel text payloads | `scripts/build_recite_surah_data.py`, `scripts/reel_service.py`, `DataSources/ayah_from_api.py` |
| Quran surah metadata | `https://api.quran.com/api/v4/chapters/{surah}` and `/chapters/{surah}/info` | Surah names, translated names, and info for ayah/reel pages | `scripts/reel_service.py`, `DataSources/ayah_from_api.py` |
| Quran.com recitation endpoint | `https://api.quran.com/api/v4/recitations/7/by_ayah/{verse_key}` | Arabic reel audio discovery | `scripts/reel_service.py`, `DataSources/ayah_from_api.py` |
| English translation API | `https://api.alquran.cloud/v1/surah/{surah}/en.asad` | Recite dataset generation | `scripts/build_recite_surah_data.py` |
| English translation API | `https://api.alquran.cloud/v1/surah/{surah}/en.sahih` | Ayah fetch and reel generation | `scripts/reel_service.py`, `DataSources/ayah_from_api.py` |
| Urdu translation API | `https://api.alquran.cloud/v1/surah/{surah}/ur.jalandhry` | Recite dataset generation and ayah fetch | `scripts/build_recite_surah_data.py`, `DataSources/ayah_from_api.py` |
| English audio CDN/API pattern | `https://cdn.islamic.network/quran/audio/192/en.walk/{globalAyah}.mp3` and `https://api.alquran.cloud/v1/ayah/{surah}:{ayah}/en.walk` | English audio URLs in generated recite data and ayah fetch | `scripts/build_recite_surah_data.py`, `DataSources/ayah_from_api.py` |
| Urdu audio CDN/API pattern | `https://cdn.islamic.network/quran/audio/64/ur.khan/{globalAyah}.mp3` and `https://api.alquran.cloud/v1/ayah/{surah}:{ayah}/ur.khan` | Urdu audio URLs in generated recite data and ayah fetch | `scripts/build_recite_surah_data.py`, `DataSources/ayah_from_api.py` |
| Arabic audio CDN | `https://verses.quran.com/Alafasy/mp3/{surah3}{ayah3}.mp3` and `https://verses.quran.com/{audio_rel}` | Arabic audio in generated recite data and reels | `scripts/build_recite_surah_data.py`, `scripts/reel_service.py`, `DataSources/ayah_from_api.py` |
| Word-by-word audio CDN | `https://verses.quran.com/wbw/{surah3}_{ayah3}_{word3}.mp3` | Word-level audio in grammar/morph pipelines | `DataSources/main_data_parer.py` |
| Dua source website | `https://quranwbw.com/duas` | Scraped into local dua JSON used by the duas page and reel generator | `DataSources/scrape_duas.py`, `DataSources/QuranProjectApp.ipynb`, `duas/quranwbw_duas.json`, `scripts/reel_service.py` |
| Dua page audio | `https://everyayah.com/data/Alafasy_128kbps/{surah3}{ayah3}.mp3` | Full-dua audio playback on the duas page | `duas/duas.html` |
| Verb conjugation API | `http://qutrub.arabeyes.org/api` | Verb form/conjugation enrichment in data-building pipeline | `DataSources/main_data_parer.py`, `DataSources/QuranProjectApp.ipynb` |
| Morphology source file | `quranic-corpus-morphology-0.4.txt` | Local morphology dataset consumed by builder scripts | `DataSources/df_morph_builder.py` |
| Morphology library | CAMeL Tools builtin morphology DB | Local morphology analysis during data building | `DataSources/main_data_parer.py` |
| Verb meaning spreadsheet | `verbsgame/verbs_with_meanings_roots.xlsx` | Merged into morphology/verb data | `DataSources/df_morph_builder.py` |
| Verb audio repository | `https://raw.githubusercontent.com/iwilllearnquran/memorization/main/audio/verbs1-4/` | Verb audio playback in app and generated verb tables | `AyahControl/audio/verbAudio.js`, `script.js`, `DataSources/main_data_parer.py`, `verbs_tables/*.html` |
| Local ayah HTML corpus | `ayahs/surah_*/ayah_*_*.html` | Builds memorization practice vocabulary dataset | `scripts/build_memorization_practice_words.js` |
| Local recite dataset | `build/recite/surahs/*.json`, `build/recite/recite_surahs.json` | Main recite-mode source consumed by app pages | `index-script.js`, `arabic-cleanup-sample.html`, `firebase.json` |
| Local dua dataset | `duas/quranwbw_duas.json` | Main duas page data source and reel-generator dua source | `duas/duas.html`, `scripts/reel_service.py`, `_private/reel-admin.html` |
| Local practice-word dataset | `memo-practice-words.json`, `generated/memo-practice-words.json` | Quran vocabulary practice page | `memorization-practice.html` |
| Firebase project | `myquranquest786` (`firebaseapp.com`, `appspot.com`) | Auth, Firestore, Messaging, Analytics, hosting | `services/_private/firestoreService.js`, `_private/firebase-init.js`, `firebase-messaging-sw.js`, `index.html` |
| Reel backend service | `https://quran-reel-service-556656799781.us-central1.run.app` | Private admin reel generation endpoint | `_private/reel-admin.html` |
| Google Cloud internal metadata and Monitoring APIs | `metadata.google.internal`, `monitoring.googleapis.com` | Reel service usage and environment metadata | `scripts/reel_service.py` |

## DataSources Folder Audit

| File | Role | Source(s) referenced | Feeds app? |
|---|---|---|---|
| `DataSources/ayah_from_api.py` | Fetch ayah text/translations/audio for one ayah | `api.quran.com`, `api.alquran.cloud`, `verses.quran.com` | Yes, same source family as app/runtime data |
| `DataSources/main_data_parer.py` | Main morphology/grammar/verb data assembly script | `api.quran.com`, `verses.quran.com/wbw`, `qutrub.arabeyes.org`, CAMeL Tools, raw GitHub verb audio | Yes, appears to feed grammar/verb features |
| `DataSources/df_morph_builder.py` | Builds morphology DataFrame from local corpus files | `quranic-corpus-morphology-0.4.txt`, `verbs_with_meanings_roots.xlsx` | Yes, likely part of grammar/verb pipeline |
| `DataSources/scrape_duas.py` | Scrapes duas into JSON | `quranwbw.com/duas` | Yes, directly |
| `DataSources/QuranProjectApp.ipynb` | Notebook combining dua scraping, verb work, qutrub experiments, and data generation | `quranwbw.com/duas`, `qutrub.arabeyes.org`, OpenAI experiments, local verb spreadsheets | Partly; contains real source work plus experiments |
| `DataSources/html_run_from_local.py` | HTML generator/template | Bootstrap CDN, Google Fonts, Material Icons | Indirect; UI template support, not primary data |
| `DataSources/games_python.py` | Prototype HTML template | Bootstrap CDN, Lottie CDN, Google Fonts, Firebase CDN, Google Tag Manager | Prototype/support only |
| `DataSources/games_python_new.py` | Prototype HTML template | Bootstrap CDN, Lottie CDN, Google Fonts, Firebase CDN, Google Tag Manager | Prototype/support only |
| `DataSources/games_python_old.py` | Prototype HTML template | Bootstrap CDN, Lottie CDN, Google Fonts, Firebase CDN, Google Tag Manager | Prototype/support only |
| `DataSources/get_data.py` | Vertica/ESM analytics query script | Internal analytics tables, unrelated alert data | No; appears unrelated to Quran app |
| `DataSources/quranwbw_duas.json` | Scraped dua dataset snapshot | Derived from `quranwbw.com/duas` | Yes, mirrored source dataset |

## Local Datasets Present In Repo

These are local files the app reads or that clearly serve as build outputs:

| Local file/folder | Origin | Consumer |
|---|---|---|
| `duas/quranwbw_duas.json` | Scraped from `quranwbw.com/duas` | `duas/duas.html`, `scripts/reel_service.py` |
| `build/recite/surahs/*.json` | Generated from Quran.com + AlQuran Cloud + derived audio URLs | `index-script.js`, recite pages |
| `build/recite/recite_surahs.json` | Combined recite dataset | `index-script.js` |
| `memo-practice-words.json` | Generated from local `ayahs/` HTML corpus | `memorization-practice.html` |
| `generated/memo-practice-words.json` | Generated mirror of practice words | `memorization-practice.html` |
| `verbs_data.js` | Local verb dataset | Verb/game features |
| `verbsgame/verb_data.js` | Local verb dataset | Verb game |
| `verbsgame/verbs_with_meanings_roots.xlsx` | Local verb enrichment spreadsheet | `df_morph_builder.py`, verb pipeline |
| `audio/verbs1-4/*.mp3` | Local verb audio mirror | Verb tables and audio playback fallback/source mirror |
| `ayahs/surah_*/ayah_*_*.html` | Local ayah corpus with word/translit/translation markup | Practice-word builder and ayah pages |

## Backend And Platform Sources

| Service | Purpose | Evidence |
|---|---|---|
| Firebase Auth | Sign-in and persistence | `services/_private/firestoreService.js`, `_private/firebase-init.js` |
| Firestore | User progress and app state | `services/_private/firestoreService.js`, app state modules |
| Firebase Messaging | Push messaging / service worker | `services/_private/firestoreService.js`, `_private/firebase-messaging-sw.js`, `firebase-messaging-sw.js` |
| Firebase Analytics / GA measurement ID | Analytics | `index.html`, Firebase config |
| Firebase Hosting | Static hosting and rewrites | `firebase.json` |
| Cloud Run reel service | Reel generation API | `_private/reel-admin.html`, `scripts/reel_service.py` |
| Google Cloud Monitoring | Reel service usage stats | `scripts/reel_service.py` |

## Third-Party Runtime / CDN Sources

These are not primary Quran data sources, but they are external sources used by the app UI or prototypes.

| Source | Where found |
|---|---|
| Firebase JS SDK via `gstatic.com` | `index.html`, `services/_private/firestoreService.js`, `_private/firebase-messaging-sw.js` |
| Google Fonts | `duas/duas.html`, `memorization-practice.html`, `DataSources/html_run_from_local.py`, prototype files |
| Google Material Icons | `duas/duas.html`, `DataSources/html_run_from_local.py`, prototype files |
| Bootstrap CDN | `DataSources/html_run_from_local.py`, `DataSources/games_python*.py` |
| Lottie Web via `unpkg.com` | `duas/duas.html`, `DataSources/games_python*.py` |
| Google Tag Manager | `DataSources/games_python*.py` |
| GitHub Actions API | `_private/reel-admin.html` |

## Notes And Ambiguities

- `DataSources/get_data.py` looks unrelated to the Quran app and appears to be a separate analytics query script.
- `DataSources/QuranProjectApp.ipynb` includes development-only experiments in addition to real source-building work. It references OpenAI, but that looks exploratory rather than a confirmed runtime dependency of the app.
- `quranic-corpus-morphology-0.4.txt` is referenced by the morphology builder, but the file itself does not appear to be present in the repo root.
- `build/recite/surahs_sample/surah_001.json` records its own provenance as `api.alquran.cloud + derived audio URLs from existing app pattern`, while the current builder script now also pulls IndoPak Arabic from Quran.com.
- Several generated JSON and JS files display mojibake when printed in the current terminal, but the source provenance is still recoverable from the builder scripts.

## Short Answer: Main Sources Used To Build The App

If you want the shortest high-confidence list, these are the main source families behind the app:

1. `api.quran.com` for IndoPak Arabic text, chapter metadata, and recitation lookup.
2. `api.alquran.cloud` for English and Urdu translations and some audio endpoints.
3. `verses.quran.com` for Arabic audio files and word-by-word audio.
4. `quranwbw.com/duas` for the Quranic duas dataset.
5. `qutrub.arabeyes.org/api` for Arabic verb conjugation/form enrichment.
6. `quranic-corpus-morphology-0.4.txt` plus CAMeL Tools for morphology/grammar data.
7. Local curated/generated datasets in `build/recite/`, `duas/`, `ayahs/`, `memo-practice-words.json`, and verb data files.
8. Firebase (`myquranquest786`) for auth, Firestore, messaging, analytics, and hosting.
