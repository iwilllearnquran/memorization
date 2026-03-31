import re
import requests
import xml.etree.ElementTree as ET
import pandas as pd
from camel_tools.morphology.database import MorphologyDB
from camel_tools.morphology.analyzer import Analyzer
import os
import json
import html
import cProfile
import pstats
import io


# Load CAMeL Tools morphology database
db = MorphologyDB.builtin_db()
analyzer = Analyzer(db)


def lookup_arabic_by_position(df, surah, ayah, word_index, joiner="-"):
    # Filter rows matching surah, ayah, word position
    subset = df[
        (df["Surah"] == surah) &
        (df["Ayah"] == ayah) &
        (df["WordIndex"] == word_index)
    ]

    #print(subset)

    if subset.empty:
        return None

    # Apply prioritization to each row: ROOT > LEMMA > FORM
    values = []
    for _, row in subset.iterrows():
        bw = row['Lemma'] or row['Root'] or row['FORM']
        values.append(bw)

    combined_bw = joiner.join([v for v in values if pd.notna(v)])
    return buckwalter_to_arabic_df(combined_bw)

def extract_pronoun_suffixes_only(tag_string, tag_dict):
    if not tag_string or "SUFFIX" not in tag_string:
        return ""

    raw_parts = tag_string.split('|')
    parts = []
    for segment in raw_parts:
        parts.extend(segment.strip().split())

    # Collect indexes of all SUFFIX tags
    suffix_indices = [i for i, x in enumerate(parts) if x == "SUFFIX"]
    suffix_pronouns = []

    # Iterate over SUFFIX positions and capture PRON:* or known pronoun tags immediately after
    for i in suffix_indices:
        if i + 1 < len(parts):
            next_tag = parts[i + 1]
            if next_tag.startswith("PRON:"):
                pron = next_tag.split(":")[1]
                readable = tag_dict.get(pron, pron)
                suffix_pronouns.append(readable)
            elif parts[i + 1] in tag_dict and any(parts[i + 1].startswith(pr) for pr in ["1", "2", "3"]):
                suffix_pronouns.append(tag_dict[parts[i + 1]])

    if suffix_pronouns:
        joined = " and ".join(suffix_pronouns)
        return f"has {len(suffix_pronouns)} pronoun suffixes -  {joined} form"

    return ""










def get_root(df, surah, ayah, word_index, joiner="-"):
    # Filter rows matching surah, ayah, word position
    subset = df[
        (df["Surah"] == surah) &
        (df["Ayah"] == ayah) &
        (df["WordIndex"] == word_index)
    ]

    if subset.empty:
        return None

    # Apply prioritization to each row: ROOT > LEMMA > FORM
    values = []
    for _, row in subset.iterrows():
        bw = row['Root'] 
        values.append(bw)

    combined_bw = joiner.join(values)
    return buckwalter_to_arabic_df(combined_bw)

def tags_joined(df, surah, ayah, word_index, joiner="+"):
    # Filter rows matching surah, ayah, word position
    subset = df[
        (df["Surah"] == surah) &
        (df["Ayah"] == ayah) &
        (df["WordIndex"] == word_index)
    ]

    if subset.empty:
        return None

    # Apply prioritization to each row: ROOT > LEMMA > FORM
    values = []
    for _, row in subset.iterrows():
        bw = row['TAG_Explanation']
        values.append(bw)

    combined = joiner.join(values)
    return combined


def morph_joined(df, surah, ayah, word_index, joiner=" "):
    # Filter rows matching surah, ayah, word position
    subset = df[
        (df["Surah"] == surah) &
        (df["Ayah"] == ayah) &
        (df["WordIndex"] == word_index)
    ]

    if subset.empty:
        return None

    # Apply prioritization to each row: ROOT > LEMMA > FORM
    values = []
    for _, row in subset.iterrows():
        bw = row['FEATURES']
        values.append(bw)

    combined = joiner.join(values)
    return combined

def tags_simple_joined(df, surah, ayah, word_index, joiner="+"):
    # Filter rows matching surah, ayah, word position
    subset = df[
        (df["Surah"] == surah) &
        (df["Ayah"] == ayah) &
        (df["WordIndex"] == word_index)
    ]

    if subset.empty:
        return None

    # Apply prioritization to each row: ROOT > LEMMA > FORM
    values = []
    for _, row in subset.iterrows():
        bw = row['TAG']
        expanded = tag_expander(bw)
        values.append(expanded)

    combined = joiner.join(values)
    return combined

def get_main_verb(df, surah, ayah, word_index):
    subset = df[
        (df["Surah"] == surah) &
        (df["Ayah"] == ayah) &
        (df["WordIndex"] == word_index)
    ]

    if subset.empty:
        return ""

    verbs = subset['VERB_MAIN'].dropna().str.strip()
    valid_verbs = verbs[verbs != "NOT VERB"]

    return valid_verbs.iloc[0] if not valid_verbs.empty else "NOT VERB"


# Function to convert Buckwalter Transliteration to Arabic
def buckwalter_to_arabic(text):
    text = re.sub(r"_#u", "&", text) 
    #return "".join(buckwalter_table.get(char, char) for char in text)
    return "".join(buckwalter_table.get(char, char) for char in text)

def get_word_audio_url(surah: int, ayah: int, position: int) -> str:
    try:
        # Validate input types
        if not (isinstance(surah, int) and isinstance(ayah, int) and isinstance(position, int)):
            raise TypeError("All inputs must be integers.")

        # Validate positive values
        if surah < 1 or surah > 114:
            raise ValueError("Surah must be between 1 and 114.")
        if ayah < 1:
            raise ValueError("Ayah must be 1 or more.")
        if position < 1:
            raise ValueError("Position must be 1 or more.")

        # Format URL
        surah_str = str(surah).zfill(3)
        ayah_str = str(ayah).zfill(3)
        word_str = str(position).zfill(3)
        return f"https://verses.quran.com/wbw/{surah_str}_{ayah_str}_{word_str}.mp3"

    except Exception as e:
        return f"❌ Error: {str(e)}"

import re


def extract_root(morph_string):
    match = re.search(r"ROOT:([^{\s]+)", morph_string)
    if match:
        buckwalter_root = match.group(1)
        return buckwalter_to_arabic(buckwalter_root)
    return None


def extract_lemma(morph_string):
    match = re.search(r"LEM:([^{\s]+)", morph_string)
    if match:
        buckwalter_lemma = match.group(1)
        return buckwalter_to_arabic(buckwalter_lemma)
    return None


def parse_morphology(morph_string):
    parts = morph_string.strip().split()
    
    pos = ""
    verb_type = ""
    root = ""
    lemma = ""
    person = ""
    extra_tags = []

    for part in parts:
        if part in PREFIX_EXPLANATIONS:
            continue  # Skip prefixes

        if part.startswith("ROOT:"):
            root_bw = re.sub(r"[{}]", "", part.split(":", 1)[1])
            root = buckwalter_to_arabic(root_bw)
        elif part.startswith("LEM:"):
            lemma_bw = re.sub(r"[{}]", "", part.split(":", 1)[1])
            lemma = buckwalter_to_arabic(lemma_bw)
        elif ':' in part:
            prefix, code = part.split(':', 1)
            key = f"{prefix}:{code}" if prefix == "MOOD" else code
            explanation = TAG_EXPLANATIONS.get(key, key)
            if prefix == "POS":
                pos = explanation
            else:
                extra_tags.append(explanation)
        else:
            explanation = TAG_EXPLANATIONS.get(part, part)
            # Heuristically detect verb types and person
            if "verb" in explanation.lower() and not verb_type:
                verb_type = explanation
            elif part in {"1S", "2MS", "2FS", "3MS", "3FS", "1P", "2MP", "2FP", "3MP", "3FP", "MP"}:
                person = explanation
            else:
                extra_tags.append(explanation)

    sentence = "This word is"

    if verb_type:
        sentence += f" a {verb_type}"
    elif pos:
        sentence += f" a {pos}"
    else:
        sentence += " unidentified"


    if person:
        sentence += f" in {person} form"

    if extra_tags:
        sentence += ", " + ", ".join(extra_tags)

    return sentence + "."

def extract_case(morph_string):
    parts = morph_string.strip().split()
    for part in parts:
        if part in {"NOM", "ACC", "GEN"}:
            return part  # Return the first case found
    return None



def colorize_word(word, morph_string):
    case = extract_case(morph_string)
    color = CASE_COLORS.get(case, "black")
    return f"<span style='color:{color}'>{word}</span>"

import pandas as pd

import pandas as pd

def conjugation_json_to_df(conjugation_json):
    pronoun_order = [
        "هو", "هما", "هم",
        "هي", "هما مؤ", "هن",
        "أنت", "أنتما", "أنتم",
        "أنتِ", "أنتما مؤ", "أنتن",
        "أنا", "نحن"
    ]

    rows = []
    result_data = conjugation_json["result"]

    for key, row in result_data.items():
        if key == "0":
            continue  # Skip header row

        pronoun = row.get("0")
        if pronoun in pronoun_order:
            rows.append([
                pronoun,
                row.get("1", ""),   # Past
                row.get("2", ""),   # Present
                row.get("3", ""),   # Jussive
                row.get("4", ""),   # Subjunctive
                row.get("5", ""),   # Emphatic Present
                row.get("6", ""),   # Imperative
                row.get("8", ""),   # Past Passive
                row.get("9", ""),   # Present Passive
                row.get("10", ""),  # Jussive Passive
                row.get("11", ""),  # Subjunctive Passive
                row.get("12", "")   # Emphatic Passive
            ])

    df = pd.DataFrame(rows, columns=[
        "Pronoun",
        "Past",
        "Present",
        "Jussive",
        "Subjunctive",
        "Emphatic Present",
        "Imperative",
        "Past Passive",
        "Present Passive",
        "Jussive Passive",
        "Subjunctive Passive",
        "Emphatic Passive"
    ])

    df["SortKey"] = df["Pronoun"].apply(lambda x: pronoun_order.index(x))
    df = df.sort_values("SortKey").drop(columns="SortKey").reset_index(drop=True)

    return df



def get_quran_word_api_data(verse_key):
    url = f"https://api.quran.com/api/v4/verses/by_key/{verse_key}"
    params = {
        "language": "en",
        "words": "true",
        "word_fields": "translation,audio_url"
    }
    response = requests.get(url, params=params)
    if response.status_code != 200:
        return {}
    data = response.json()
    #print(data)
    return {word["position"]: {
        "translation": word.get("translation", {}).get("text", ""),
        "audio_url": word.get("audio_url", ""), 
        "translit": word.get("transliteration", {}).get("text", ""),
    } for word in data["verse"]["words"]}

# Normalize Arabic text (remove diacritics)
def normalize_arabic_word(text):
    arabic_diacritics = re.compile(r'[\u064B-\u065F]')  # Unicode range for Harakat
    text = re.sub(arabic_diacritics, '', text)
    text = text.replace("ٱ", "ا")  # Normalize Alif Wasla
    return text

def generate_conjugation_table(conjugations_dict):
    # Prepare HTML table headers
    html = '<table border="1" style="border-collapse: collapse;"><tr><th>Pronoun</th><th>Past</th><th>Present</th><th>Imperative</th></tr>'
    
    # Group and fill
    pronouns = set(k.split('_')[0] for k in conjugations_dict.keys())
    for pronoun in sorted(pronouns):
        past = conjugations_dict.get(f"{pronoun}_Past", "N/A")
        present = conjugations_dict.get(f"{pronoun}_Present", "N/A")
        imperative = conjugations_dict.get(f"{pronoun}_Imperative", "N/A")
        html += f"<tr><td>{pronoun}</td><td>{past}</td><td>{present}</td><td>{imperative}</td></tr>"
    
    html += '</table>'
    return html
def build_attached_pronouns_table():
    pronouns = [
        ("هُوَ (he)", "ـَ → كَتَبَ", "يَـ → يَكْتُبُ", "ـهُ → كَتَبَهُ"),
        ("هُمَا (those two men)", "ـَا → كَتَبَا", "يَـ...ـانِ → يَكْتُبَانِ", "ـهُمَا → كَتَبَهُمَا"),
        ("هُمْ (those men)", "ـُوا → كَتَبُوا", "يَـ...ـونَ → يَكْتُبُونَ", "ـهُمْ → كَتَبَهُمْ"),
        ("هِيَ (she)", "ـَتْ → كَتَبَتْ", "تَـ → تَكْتُبُ", "ـهَا → كَتَبَهَا"),
        ("هُمَا (those two women)", "ـَتَا → كَتَبَتَا", "تَـ...ـانِ → تَكْتُبَانِ", "ـهُمَا → كَتَبَهُمَا"),
        ("هُنَّ (those women)", "ـْنَ → كَتَبْنَ", "يَـ...ـنَ → يَكْتُبْنَ", "ـهُنَّ → كَتَبْهُنَّ"),
        ("أَنْتَ (you, masc)", "ـْتَ → كَتَبْتَ", "تَـ → تَكْتُبُ", "ـكَ → كَتَبَكَ"),
        ("أَنْتُمَا (you two men)", "ـْتُمَا → كَتَبْتُمَا", "تَـ...ـانِ → تَكْتُبَانِ", "ـكُمَا → كَتَبَكُمَا"),
        ("أَنْتُمْ (you all men)", "ـْتُمْ → كَتَبْتُمْ", "تَـ...ـونَ → تَكْتُبُونَ", "ـكُمْ → كَتَبَكُمْ"),
        ("أَنْتِ (you, fem)", "ـْتِ → كَتَبْتِ", "تَـ...ـينَ → تَكْتُبِينَ", "ـكِ → كَتَبَكِ"),
        ("أَنْتُمَا (you two women)", "ـْتُمَا → كَتَبْتُمَا", "تَـ...ـانِ → تَكْتُبَانِ", "ـكُمَا → كَتَبَكُمَا"),
        ("أَنْتُنَّ (you all women)", "ـْتُنَّ → كَتَبْتُنَّ", "تَـ...ـنَ → تَكْتُبْنَ", "ـكُنَّ → كَتَبَكُنَّ"),
        ("أَنَا (I)", "ـْتُ → كَتَبْتُ", "أَـ → أَكْتُبُ", "ـنِي → كَتَبَنِي"),
        ("نَحْنُ (we)", "ـْنَا → كَتَبْنَا", "نَـ → نَكْتُبُ", "ـنَا → كَتَبَنَا"),
    ]

    html = """
    <br/><b style="font-size: 15px; margin-bottom: 10px; color: #0a4d68;text-align: left;">🔗 Attached Pronouns Table with Examples (كَتَبَ)</b>
    <table style="
        width: 100%;
        border-collapse: collapse;
        box-shadow: 0 2px 6px rgba(0,0,0,0.1);
    ">
        <thead>
            <tr style="background-color: #f2f2f2; text-align: center;">
                <th style="padding: 8px; border: 1px solid #ccc;">Pronoun</th>
                <th style="padding: 8px; border: 1px solid #ccc;">Doer (Past)</th>
                <th style="padding: 8px; border: 1px solid #ccc;">Doer (Present)</th>
                <th style="padding: 8px; border: 1px solid #ccc;">Done-To (Object)</th>
            </tr>
        </thead>
        <tbody>
    """

    for p in pronouns:
        pronoun = p[0]

        # Color coding
        bg_color = "#eaffea" if "أَنَا" in pronoun or "نَحْنُ" in pronoun else (
            "#e6f0ff" if "أَنْت" in pronoun else "#fff8dc"
        )

        html += f"""
        <tr style="background-color: {bg_color}; text-align: center;">
            <td style="padding: 8px; border: 1px solid #ccc;"><b>{p[0]}</b></td>
            <td style="padding: 8px; border: 1px solid #ccc;"><b>{p[1]}</b></td>
            <td style="padding: 8px; border: 1px solid #ccc;"><b>{p[2]}</b></td>
            <td style="padding: 8px; border: 1px solid #ccc;"><b>{p[3]}</b></td>
        </tr>
        """

    html += "</tbody></table>"
    return html




def build_conjugation_html_table(df, main_verb):
    pronoun_order = [
        "هو", "هما", "هم",
        "هي", "هما مؤ", "هن",
        "أنت", "أنتما", "أنتم",
        "أنتِ", "أنتما مؤ", "أنتن",
        "أنا", "نحن"
    ]

    pronoun_display = {
        "هو": "هُوَ (he)",
        "هما": "هُمَا (those 2 men)",
        "هم": "هُمْ (those men)",
        "هي": "هِيَ (she)",
        "هما مؤ": "هُمَا (those 2 women)",
        "هن": "هُنَّ (those women)",
        "أنت": "أَنْتَ (you masc.)",
        "أنتما": "أَنْتُمَا (you 2 men)",
        "أنتم": "أَنْتُمْ (you all men)",
        "أنتِ": "أَنْتِ (you fem.)",
        "أنتما مؤ": "أَنْتُمَا (you 2 fem.)",
        "أنتن": "أَنْتُنَّ (you all fem.)",
        "أنا": "أَنَا (I)",
        "نحن": "نَحْنُ (we)"
    }

    df["SortKey"] = df["Pronoun"].apply(lambda x: pronoun_order.index(x) if x in pronoun_order else 999)
    df = df.sort_values("SortKey").drop(columns="SortKey").reset_index(drop=True)

    html = f"""
        <b style="font-size:15px; margin-bottom:10px; color:#0a4d68; display:flex; align-items:center; justify-content:space-between;">
         <span>
          📋 Verb Conjugation Table (Active & Passive)
            <a id="open-new-tab-link" href="/memorization/verbs_tables/{main_verb}.html" target="_blank" title="Open full table in new tab" style="
              margin-left: 5px;
              display: inline-flex;
              align-items: center;
              font-size: 16px;
              text-decoration: none;
            ">
              ↗️
            </a>


        </span>
        </b>
        <table style ="box-shadow: 0 2px 6px rgba(0,0,0,0.1);">
          <thead>
            <tr style="background-color: #f2f2f2; text-align: center;">
              <th style="padding:4px 6px; border:1px solid #ccc; min-width:160px;">
                Pronoun
              </th>
              <th style="padding:4px 6px; border:1px solid #ccc;">
                <a href="#" onclick="playVerbAudio('{main_verb}', 'past', this); return false;" style="text-decoration:none; color:inherit;">
                  Past (He taught) <span class="audio-icon">🔊</span>
                </a>
              </th>
              <th style="padding:4px 6px; border:1px solid #ccc;">
                <a href="#" onclick="playVerbAudio('{main_verb}', 'present', this); return false;" style="text-decoration:none; color:inherit;">
                  Present (He teaches) <span class="audio-icon">🔊</span>
                </a>
              </th>
              <th style="padding:4px 6px; border:1px solid #ccc;">Negation (Not teaching)</th>
              <th style="padding:4px 6px; border:1px solid #ccc;">Subjunctive (Might teach)</th>
              <th style="padding:4px 6px; border:1px solid #ccc;">Emphatic (Must teach)</th>
              <th style="padding:4px 6px; border:1px solid #ccc;">Command!</th>
              <th style="padding:4px 6px; border:1px solid #ccc;">Past Passive (Was taught)</th>
              <th style="padding:4px 6px; border:1px solid #ccc;">Present Passive (Is being taught)</th>
              <th style="padding:4px 6px; border:1px solid #ccc;">Jussive Passive (Not being taught)</th>
              <th style="padding:4px 6px; border:1px solid #ccc;">Subjunctive Passive (Might be taught)</th>
              <th style="padding:4px 6px; border:1px solid #ccc;">Emphatic Passive (Must be taught)</th>
            </tr>
          </thead>
          <tbody>
        """

    for _, row in df.iterrows():
        pronoun = row.get('Pronoun', '')
        pronoun_text = pronoun_display.get(pronoun, pronoun)

        bg_color = "#eaffea" if pronoun.startswith("أنا") or pronoun.startswith("نحن") else (
            "#e6f0ff" if pronoun.startswith("أنت") else "#fff8dc"
        )

        html += f"""
        <tr style="background-color: {bg_color}; text-align: center;">
            <td style="padding: 3px 12px; border: 1px solid #ccc; font-size: 16px; vertical-align: middle; font-weight: bold;">{pronoun_text}</td>
            <td style="padding: 4px 6px; border: 1px solid #ccc; font-size: 18px;">{row.get('Past', '')}</td>
            <td style="padding: 4px 6px; border: 1px solid #ccc; font-size: 18px;">{row.get('Present', '')}</td>
            <td style="padding: 4px 6px; border: 1px solid #ccc; font-size: 18px;">{row.get('Jussive', '')}</td>
            <td style="padding: 4px 6px; border: 1px solid #ccc; font-size: 18px;">{row.get('Subjunctive', '')}</td>
            <td style="padding: 4px 6px; border: 1px solid #ccc; font-size: 18px;">{row.get('Emphatic Present', '')}</td>
            <td style="padding: 4px 6px; border: 1px solid #ccc; font-size: 18px;">{row.get('Imperative', '')}</td>
            <td style="padding: 4px 6px; border: 1px solid #ccc; font-size: 18px;">{row.get('Past Passive', '')}</td>
            <td style="padding: 4px 6px; border: 1px solid #ccc; font-size: 18px;">{row.get('Present Passive', '')}</td>
            <td style="padding: 4px 6px; border: 1px solid #ccc; font-size: 18px;">{row.get('Jussive Passive', '')}</td>
            <td style="padding: 4px 6px; border: 1px solid #ccc; font-size: 18px;">{row.get('Subjunctive Passive', '')}</td>
            <td style="padding: 4px 6px; border: 1px solid #ccc; font-size: 18px;">{row.get('Emphatic Passive', '')}</td>
        </tr>
        """

    html += "</tbody></table>"
    return html

def verb_conjugation_page(conj_html, main_verb):
    filepath = os.path.join("output", "verbs_tables", f"{main_verb}.html")
    if os.path.exists(filepath):
        return
    os.makedirs(os.path.dirname(filepath), exist_ok=True)

    with open(filepath, "w", encoding="utf-8") as f:
        f.write(f"""<!DOCTYPE html>
        <html lang="ar">
        <head>
          <meta charset="UTF-8">
          <title>Conjugation of {main_verb}</title>
          <style>
            body {{ font-family: Arial, sans-serif; padding: 20px; }}
            table {{ border-collapse: collapse; width: 100%; }}
            th, td {{ border: 1px solid #ccc; padding: 6px; text-align: center; font-size: 16px; }}
            th {{ background-color: #f2f2f2; }}
          </style>
        </head>
        <body>
          <h2>📘 Conjugation Table for: {main_verb}</h2>

          {conj_html}

  <script>

    document.addEventListener("DOMContentLoaded", function () {{
      console.log("🧪 DOM fully loaded");
      console.log("👣 Current path:", window.location.pathname);

      if (window.location.pathname.includes("verbs_tables")) {{
        console.log("✅ 'verbs_tables' found in path");

        const link = document.getElementById("open-new-tab-link");
        if (link) {{
          console.log("✅ Link element found, hiding it now");
          link.style.display = "none";
        }} else {{
          console.warn("⚠️ Link element with id 'open-new-tab-link' not found");
        }}
      }} else {{
        console.log("⛔ 'verbs_tables' not found in path");
      }}
    }});



    const audioCache = {{}};

    async function playVerbAudio(verb, tense, linkElement) {{
      const key = `${{verb}}_${{tense}}`;
      const iconSpan = linkElement.querySelector(".audio-icon");
      const baseUrls = [
        "https://raw.githubusercontent.com/iwilllearnquran/memorization/main/audio/verbs1/",
        "https://raw.githubusercontent.com/iwilllearnquran/memorization/main/audio/verbs2/",
        "https://raw.githubusercontent.com/iwilllearnquran/memorization/main/audio/verbs3/",
        "https://raw.githubusercontent.com/iwilllearnquran/memorization/main/audio/verbs4/"
      ];

      if (audioCache[key]) {{
        const audio = audioCache[key];
        if (!audio.paused) {{
          audio.pause();
          if (iconSpan) iconSpan.textContent = "🔊";
        }} else {{
          audio.currentTime = 0;
          audio.play();
          if (iconSpan) iconSpan.textContent = "⏸️";
        }}
        return;
      }}

      for (const base of baseUrls) {{
        const url = `${{base}}${{key}}.mp3`;
        try {{
          const res = await fetch(url, {{ method: 'HEAD' }});
          if (res.ok) {{
            const audio = new Audio(url);
            audioCache[key] = audio;
            audio.play();
            if (iconSpan) iconSpan.textContent = "⏸️";

            audio.addEventListener("ended", () => {{
              if (iconSpan) iconSpan.textContent = "🔊";
            }});
            return;
          }}
        }} catch (err) {{
          // ignore
        }}
      }}

      alert(`⚠️ Audio for ${{verb}} (${{tense}}) not found.`);
    }}
  </script>
</body>
</html>
""")



import requests

def get_qutrub_conjugation(verb):
    """
    Fetches the conjugation of an Arabic verb from Qutrub API using just the verb.
    
    :param verb: Arabic verb (in Arabic script)
    :return: JSON response with conjugation details or an error message.
    """
    base_url = "http://qutrub.arabeyes.org/api"
    params = {"verb": verb}

    try:
        response = requests.get(base_url, params=params)
        if response.status_code == 200:
            return response.json()
        else:
            return {"error": f"API request failed with status code {response.status_code}"}
    except Exception as e:
        return {"error": str(e)}


# POS and morphological tag explanations

import re

def remove_diacritics_keep_shadda(text, keep_shadda=True):
    # Arabic diacritics to remove
    basic_diacritics = "ًٌٍَُِْٰٓٔ"  # Includes all except shadda
    all_diacritics = basic_diacritics + "ّ"  # add shadda if needed

    pattern = f"[{basic_diacritics}]" if keep_shadda else f"[{all_diacritics}]"
    return re.sub(pattern, '', text)


def guess_verb_form_from_past(huwa_form):
    form = re.sub(r'[ًٌٍَُِْٰٓٔ]', '', huwa_form)

    if form.startswith("است"):
        return "X - " + form_examples["X"]

    # Form VIII: ا + 1 letter + ت (e.g. اجتهد، اقترب)
    if re.match(r"^ا.{1}ت", form):
        return "VIII - " + form_examples["VIII"]

    if form.startswith("ان"):
        return "VII - " + form_examples["VII"]

    # Form VI: تفاعل
    if re.match(r"^ت.{1}ا.{2}", form):
        return "VI - " + form_examples["VI"]


    if form.startswith("ت") and "ّ" in form[1:]:
        return "V - " + form_examples["V"]

    if form.startswith("أ") and len(form) >= 4:
        return "IV - " + form_examples["IV"]


    if len(form) >= 4 and form[1] == "ا":
        return "III - " + form_examples["III"]

    # Form IX: starts with ا, ends in shadda, 4–5 chars
    if form.startswith("ا") and form.endswith("ّ") and len(form) in [4, 5]:
        return "IX - " + form_examples["IX"]

    if "ّ" in form[1:-1]:
        return "II - " + form_examples["II"]

    if len(form.replace("ّ", "")) <= 3:
        return "I - " + form_examples["I"]

    return "Unknown"


def detect_verb_form_from_qutrub_response(qutrub_response):
    try:
        huwa_past = qutrub_response['result']['9']['1']  # 'هو' past tense
        return guess_verb_form_from_past(huwa_past)
    except:
        return "Unknown"



def explain_buckwalter_tag(bw_tag):
    """
    Converts a Buckwalter tag string like عَلِيّ/ADJ+هُم/POSS_PRON_3MP
    or يُؤْمِنُونَ/PVSUFF_SUBJ:3MP into a human-readable explanation.
    """
    parts = bw_tag.split("+")
    phrases = []

    for part in parts:
        if "/" not in part:
            continue

        token, tag = part.split("/", 1)

        # Handle tags with sub-features separated by ":"
        if ":" in tag:
            main_tag, subtag = tag.split(":", 1)
            main_expl = TAG_EXPLANATIONS.get(main_tag, main_tag)
            sub_expl = TAG_EXPLANATIONS.get(subtag, subtag)
            tag_explained = f"{main_expl} ({sub_expl})"
        else:
            tag_explained = TAG_EXPLANATIONS.get(tag, tag)

        phrases.append(f"<b>{token}</b> is a {tag_explained}")

    if phrases:
        return " → ".join(phrases)
    else:
        return "No explanation available."


from functools import lru_cache




def minify_all_words(results):
    simplified = []
    for word in results:
        simplified.append({
            #"Quran POS": word.get("Quran POS", ""), 
            #"Quran Lemma": word.get("Quran Lemma", ""), 
            "Quran Root": word.get("Quran Root", ""), 
            "root_from_txt": word.get("root_from_txt", ""), 
            "tags_joined": word.get("tags_joined", ""), 
            "tags_simple_joined": word.get("tags_simple_joined", ""), 
            "verb_colour": word.get("verb_colour",""),
            "count_of_verb": word.get("count_of_verb",""),
            "root_from_gpt": word.get("root_from_gpt",""),
            
            "Word": word.get("Word", ""),	
            "Translation": word.get("Translation", ""),	
            "Audio URL": word.get("Audio URL", ""),	
            "Quran Morph Info" : word.get("Quran Morph Info",""),
            "Prefixes" : word.get("Prefixes",""),
            "VERB_FORM" : word.get("VERB_FORM",""),
            #"Root_morp": word.get("Root_morp", ""),  	
            #"Case_morp": word.get("Case_morp", ""),  	
            #"Gender_morp": word.get("Gender_morp", ""), 
            #"Number_morp": word.get("Number_morp", ""), 
            #"Aspect_morp": word.get("Aspect_morp", ""), 
            #"Form_morp": word.get("Form_morp", ""),  	
            #"Voice_morp": word.get("Voice_morp", ""),  	
            #"Person_morp": word.get("Person_morp", ""), 
            #"Pronoun_morp": word.get("Pronoun_morp", ""),
            #"CAMeL Lemma": word.get("CAMeL Lemma", ""),
            "CAMeL Root": word.get("CAMeL Root", ""),
            "translit": word.get("translit", ""),
            "All CAMeL diac": word.get("All CAMeL diac", ""), 
            "Case_from_xml": word.get("Case_from_xml", ""), 
            "main_root_from_gpt": word.get("main_root_from_gpt", ""), 
            "count_from_gpt": word.get("Case_from_xml", ""), 
            "diac": word.get("diac", ""),
            "Meaning Of Verb": word.get("Meaning Of Verb", ""),
            #"Buckwalter Transliteration": word.get("Buckwalter Transliteration", ""),
            "Explanation": word.get("Explanation", ""),
            "CAMeL Explanation": word.get("CAMeL Explanation", ""),
            "Conjugation Table" : word.get("Conjugation Table", ""),
            "Muslim Chart" : word.get("Muslim Chart", ""),
            "Main Verb Grammar": word.get("Main Verb Grammar","")
            #"Primary": True  # Optional: mark all as Primary for now
        })
    return simplified

# Cache Qutrub API results to reduce repeated slow requests
@lru_cache(maxsize=500)
def get_qutrub_conjugation_cached(verb):
    return get_qutrub_conjugation(verb)

# Single df_morph access function to reduce repeated filtering
import pandas as pd

def combine_features(person: str, gender: str, number: str) -> str:
    """
    Combine person, gender, and number into a single descriptor string.
    Omits any part that is None or empty.
    """
    parts = []
    if person:
        parts.append(person)
    if gender:
        parts.append(gender)
    if number:
        parts.append(number)
    return ' '.join(parts)

def get_morph_info(df, surah, ayah, word_index):
    subset = df.query("Surah == @surah and Ayah == @ayah and WordIndex == @word_index")
    
    if subset.empty:
        return {
            "main_verb": "NOT VERB",
            "root": "",
            "tags_joined": "",
            "tags_simple_joined": "",
            "main_root_from_gpt": "",
            "count_from_gpt": 0,
            "Main Verb Grammar": "",
            "Main Verb Grammar": ""
            
        }

    main_verb_series = subset['VERB_MAIN'].dropna().str.strip()
    main_verb = main_verb_series.iloc[0] if not main_verb_series.empty and main_verb_series.iloc[0] != "NOT VERB" else "NOT VERB"
    
    # Extract other fields
    root = subset['Root'].dropna().iloc[0] if not subset['Root'].dropna().empty else ""
    meaning = subset['meaning'].dropna().iloc[0] if not subset['meaning'].dropna().empty else ""
    root_from_gpt = subset.get('3MSAP_root', pd.Series()).dropna().iloc[0] if '3MSAP_root' in subset and not subset['3MSAP_root'].dropna().empty else ""
    count_from_gpt = subset.get('count', pd.Series()).dropna().iloc[0] if 'count' in subset and not subset['count'].dropna().empty else 0

    tags_joined_val = "+".join(subset['TAG_Explanation'].dropna())
    tags_simple_val = "+".join(tag_expander(tag) for tag in subset['TAG'].dropna())

    # Extract grammar features
    person = subset.get('Person', pd.Series()).dropna().iloc[0] if 'Person' in subset and not subset['Person'].dropna().empty else ""
    gender = subset.get('Gender', pd.Series()).dropna().iloc[0] if 'Gender' in subset and not subset['Gender'].dropna().empty else ""
    number = subset.get('Number', pd.Series()).dropna().iloc[0] if 'Number' in subset and not subset['Number'].dropna().empty else ""
    grammar = combine_features(person, gender, number)

    return {
        "main_verb": main_verb,
        "root": root,
        "tags_joined": tags_joined_val,
        "tags_simple_joined": tags_simple_val,
        "main_root_from_gpt": root_from_gpt,
        "count_from_gpt": count_from_gpt,
        "Meaning Of Verb": meaning,
        "Main Verb Grammar": grammar
    }




# Optimized function
def parse_quran_with_morphology_df_opt(df_xml, surah, ayah):
    verse_key = f"{surah}:{ayah}"
    quran_api_data = get_quran_word_api_data(verse_key)

    word_data = []
    verse_df = df_xml.query("Surah == @surah and Ayah == @ayah")

    if verse_df.empty:
        print(f"❌ Surah {surah}, Ayah {ayah} not found in df.")
        return []

    for _, row in verse_df.iterrows():
        position = int(row['WordIndex'])
        arabic_word = row['Word']
        morphology = row['Morphology']
        morph_info = get_morph_info(df_morph, surah, ayah, position)
        
        
        # 2) Normalization helper
        def remove_dagger_alif_and_wasla(text):
            return (text
                    .replace("ٱ", "اِ")  # replace wasla-alif with alif+kasra
                    .replace("ٰ", "")    # remove dagger-alif
                    .replace("ْ", "")     # remove damma
                    .replace("ٓ", "")
                   )        

        main_verb = morph_info["main_root_from_gpt"]
      
        
        count_of_verb = morph_info["count_from_gpt"]
        qutrub_used = None
        conjugations = pd.DataFrame()
        
        if main_verb and main_verb != "":
            #print(main_verb)
            raw_qutrub = get_qutrub_conjugation_cached(remove_dagger_alif_and_wasla(main_verb.strip()))
        
            if isinstance(raw_qutrub.get("result"), dict):
                conjugations = conjugation_json_to_df(raw_qutrub)
                qutrub_used = raw_qutrub
                #print(conjugations)
            else:
                print(f"⚠️ Qutrub didn’t return conjugation for: {main_verb}")


        word_info = {
            "Word": arabic_word,
            "Quran Morph Info": extract_pronoun_suffixes_only(morph_joined(df_morph, surah, ayah, position, ' '), tag_dict),#parse_morphology(morphology),
            "Case_from_xml": extract_case(morphology),
            "root_from_txt": lookup_arabic_by_position(df_morph, surah, ayah, position, joiner=" "),
            "tags_joined": morph_info["tags_joined"],
            "tags_simple_joined": morph_info["tags_simple_joined"],
            "verb_colour": "Verb" in morph_info["tags_joined"],
            "VERB_FORM": detect_verb_form_from_qutrub_response(qutrub_used) if qutrub_used else "Unknown",
            "count_of_verb": count_of_verb,
            "root_from_gpt": main_verb,
            "Main Verb Grammar" : morph_info["Main Verb Grammar"],
            "Meaning Of Verb": morph_info["Meaning Of Verb"]
        }

        # Conjugation Table
        if not conjugations.empty:
            word_info["Conjugation Table"] = (
                build_conjugation_html_table(conjugations, main_verb.replace("ْ", "")) + build_attached_pronouns_table()
            )
            verb_conjugation_page(word_info["Conjugation Table"], main_verb)
        else:
            word_info["Conjugation Table"] = ""
            
        

        # Quran.com API data
        api = quran_api_data.get(position, {})
        word_info["Translation"] = api.get("translation", "")
        word_info["translit"] = api.get("translit", "")
        word_info["Audio URL"] = get_word_audio_url(surah, ayah, position)

        word_data.append(word_info)

    return word_data
