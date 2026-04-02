"""Debug: check what audio_url the API returns for the 4 remaining problem words."""
import json, re, sys, io, time, urllib.request

if sys.stdout.encoding != "utf-8":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

TASHKEEL_RE = re.compile(r'[\u064B-\u065F\u06D6-\u06ED\u0640]')
ALEF_MAP = str.maketrans({
    '\u0622': '\u0627', '\u0623': '\u0627', '\u0625': '\u0627',
    '\u0671': '\u0627', '\u0670': '\u0627',
    '\u0621': '', '\u0654': '', '\u0655': '', '\u0674': '', '\u0653': '',
    '\u0649': '\u064A', '\u0629': '\u0647', '\u0624': '\u0648', '\u0626': '\u064A',
    '\u06E1': '', '\u06DF': '', '\u06E5': '', '\u06E6': '',
})
def _norm(t): return TASHKEEL_RE.sub('', t).translate(ALEF_MAP).strip()

HEADERS = {"Accept": "application/json", "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}

checks = [
    (33, "كَانُوا۟", "2:10"),
    (283, "مَعَهُۥ", "2:214"),
    (402, "تُوَلُّوا۟", "2:115"),
    (512, "وَٱعْلَمُوٓا۟", "2:194"),
]

for rank, arabic, ref in checks:
    s, a = ref.split(":")
    url = f"https://api.quran.com/api/v4/verses/by_key/{s}:{a}?words=true&word_fields=text_uthmani,audio_url"
    req = urllib.request.Request(url, headers=HEADERS)
    resp = urllib.request.urlopen(req, timeout=10)
    data = json.loads(resp.read())
    
    nt = _norm(arabic)
    print(f"\n#{rank} {arabic} (norm: {nt}) in {ref}:")
    words = [w for w in data["verse"]["words"] if w.get("char_type_name") == "word"]
    for i, w in enumerate(words):
        text = w.get("text_uthmani", "")
        au = w.get("audio_url", "")
        nw = _norm(text)
        marker = " <-- MATCH" if nw == nt else ""
        print(f"  pos {i+1}: {text:<25} norm={nw:<20} audio={au}{marker}")
    time.sleep(0.3)
