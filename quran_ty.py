import os
import requests
import numpy as np
from moviepy.editor import *
from PIL import Image, ImageDraw, ImageFont, ImageFilter
from concurrent.futures import ProcessPoolExecutor
from tqdm import tqdm
import arabic_reshaper
from bidi.algorithm import get_display

# ---------------- CONFIG ---------------- #

WIDTH, HEIGHT = 1920, 1080

OUTPUT_DIR = "output_videos"
TEMP_DIR = "temp"
THUMBNAIL_DIR = "thumbnails"

BG_VIDEO = "bg.mp4"
THUMB_BG = "thumbnail_bg.jpg"

RECITER = 7  # Mishary Alafasy
MAX_WORKERS = 3

FONT_AR = "fonts/Amiri-Regular.ttf"
FONT_EN = "fonts/Arial.ttf"
FONT_UR = "fonts/NotoNastaliqUrdu-Regular.ttf"

# ---------------------------------------- #

os.makedirs(OUTPUT_DIR, exist_ok=True)
os.makedirs(TEMP_DIR, exist_ok=True)
os.makedirs(THUMBNAIL_DIR, exist_ok=True)


def reshape(text):
    return get_display(arabic_reshaper.reshape(text))


# ---------- API ---------- #

def fetch_text(surah):
    url = f"https://api.quran.com/api/v4/verses/by_chapter/{surah}?translations=20,95"
    return requests.get(url).json()["verses"]


def fetch_segments(surah):
    url = f"https://api.quran.com/api/v4/quran/recitations/{RECITER}?chapter_number={surah}&segments=true"
    return requests.get(url).json()["audio_files"][0]["segments"]


def fetch_audio(surah):
    url = f"https://api.quran.com/api/v4/chapter_recitations/{RECITER}/{surah}"
    data = requests.get(url).json()

    audio_url = data["audio_file"]["audio_url"]
    path = f"{TEMP_DIR}/s{surah}.mp3"

    if not os.path.exists(path):
        r = requests.get(audio_url)
        open(path, "wb").write(r.content)

    return path


# ---------- VISUAL ---------- #

def draw_glow_text(base_img, position, text, font):
    glow_layer = Image.new("RGBA", base_img.size, (0,0,0,0))
    glow_draw = ImageDraw.Draw(glow_layer)

    # glow
    for r in range(2, 12, 2):
        glow_draw.text(position, text, font=font, fill=(0,255,180,50), anchor="mm")

    glow_layer = glow_layer.filter(ImageFilter.GaussianBlur(10))
    base_img.alpha_composite(glow_layer)

    draw = ImageDraw.Draw(base_img)
    draw.text(position, text, font=font, fill=(0,255,180,255), anchor="mm")


def create_frame(words, active_idx, en, ur):
    img = Image.new("RGBA", (WIDTH, HEIGHT), (0,0,0,0))
    draw = ImageDraw.Draw(img)

    font_ar = ImageFont.truetype(FONT_AR, 70)
    font_en = ImageFont.truetype(FONT_EN, 40)
    font_ur = ImageFont.truetype(FONT_UR, 50)

    x = WIDTH // 2
    y = 300

    for i, word in enumerate(words):
        text = reshape(word)

        if i == active_idx:
            draw_glow_text(img, (x, y), text, font_ar)
        elif i < active_idx:
            draw.text((x, y), text, font=font_ar, fill=(180,180,180), anchor="mm")
        else:
            draw.text((x, y), text, font=font_ar, fill=(100,100,100), anchor="mm")

    # translations
    draw.text((WIDTH//2, 650), en, font=font_en, fill="white", anchor="mm")
    draw.text((WIDTH//2, 800), reshape(ur), font=font_ur, fill="white", anchor="mm")

    return np.array(img)


def build_word_clips(verse, segments):
    clips = []

    words = verse["text_uthmani"].split()

    en = ""
    ur = ""

    for t in verse["translations"]:
        if t["resource_id"] == 20:
            en = t["text"]
        elif t["resource_id"] == 95:
            ur = t["text"]

    for seg in segments:
        start, end, word_idx = seg
        duration = end - start

        frame = create_frame(words, word_idx, en, ur)

        clip = ImageClip(frame).set_duration(duration).set_start(start)

        clips.append(clip)

    return clips


# ---------- THUMBNAIL ---------- #

def create_thumbnail(surah):
    img = Image.open(THUMB_BG).resize((1280, 720))
    draw = ImageDraw.Draw(img)

    font = ImageFont.truetype(FONT_EN, 90)
    draw.text((640, 360), f"Surah {surah}", fill="white", font=font, anchor="mm")

    img.save(f"{THUMBNAIL_DIR}/surah_{surah}.jpg")


# ---------- MAIN ---------- #

def generate_surah(surah):
    print(f"\n📖 Surah {surah}")

    verses = fetch_text(surah)
    segments = fetch_segments(surah)
    audio_path = fetch_audio(surah)

    audio = AudioFileClip(audio_path)

    bg = VideoFileClip(BG_VIDEO).resize((WIDTH, HEIGHT)).loop(duration=audio.duration)

    clips = []

    seg_index = 0

    for i, verse in enumerate(tqdm(verses)):
        verse_segments = []

        while seg_index < len(segments) and segments[seg_index][2] == i:
            verse_segments.append(segments[seg_index])
            seg_index += 1

        clips.extend(build_word_clips(verse, verse_segments))

    final = CompositeVideoClip([bg] + clips)
    final = final.set_audio(audio)

    out = f"{OUTPUT_DIR}/surah_{surah}.mp4"

    final.write_videofile(
        out,
        fps=24,
        codec="libx264",
        audio_codec="aac",
        preset="ultrafast",
        threads=6
    )

    create_thumbnail(surah)

    print(f"✅ Done Surah {surah}")


# ---------- PARALLEL ---------- #

def run_all():
    with ProcessPoolExecutor(max_workers=MAX_WORKERS) as exe:
        exe.map(generate_surah, range(1, 115))


if __name__ == "__main__":
    run_all()