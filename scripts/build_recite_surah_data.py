#!/usr/bin/env python3
"""
Build clean recite-mode data from remote APIs.

This script does NOT read local ayah HTML files. It pulls fresh surah/ayah
content and emits JSON that can power a continuous scroll recite page.
"""

from __future__ import annotations

import argparse
import json
import os
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, List


SURAH_LIST_URL = "https://api.alquran.cloud/v1/surah"
SURAH_EN_URL = "https://api.alquran.cloud/v1/surah/{surah}/en.asad"
SURAH_UR_URL = "https://api.alquran.cloud/v1/surah/{surah}/ur.jalandhry"
QURAN_COM_INDOPAK_VERSE_URL = "https://api.quran.com/api/v4/quran/verses/indopak?verse_key={surah}:{ayah}"


@dataclass
class SurahMeta:
    number: int
    arabic_name: str
    english_name: str
    english_translation: str
    ayah_count: int


def _request_json(url: str, timeout: int, retries: int) -> Dict[str, Any]:
    last_error: Exception | None = None
    for attempt in range(1, retries + 1):
        req = urllib.request.Request(
            url,
            headers={"User-Agent": "QuranQuestReciteBuilder/1.0"},
        )
        try:
            with urllib.request.urlopen(req, timeout=timeout) as response:
                return json.loads(response.read().decode("utf-8"))
        except (
            urllib.error.URLError,
            urllib.error.HTTPError,
            TimeoutError,
            json.JSONDecodeError,
            OSError,
            ConnectionError,
        ) as exc:
            last_error = exc
            if attempt < retries:
                time.sleep(min(2.0 * attempt, 5.0))
    assert last_error is not None
    raise RuntimeError(f"Request failed after {retries} attempts: {url} :: {last_error}")


def _parse_surah_selection(raw: str) -> List[int]:
    selected: set[int] = set()
    for token in raw.split(","):
        token = token.strip()
        if not token:
            continue
        if "-" in token:
            start_raw, end_raw = token.split("-", 1)
            start = int(start_raw.strip())
            end = int(end_raw.strip())
            if start > end:
                start, end = end, start
            for surah in range(start, end + 1):
                selected.add(surah)
        else:
            selected.add(int(token))
    return sorted(item for item in selected if 1 <= item <= 114)


def _load_surah_meta(timeout: int, retries: int) -> Dict[int, SurahMeta]:
    payload = _request_json(SURAH_LIST_URL, timeout=timeout, retries=retries)
    if payload.get("code") != 200 or not isinstance(payload.get("data"), list):
        raise RuntimeError(f"Unexpected surah list payload: {payload}")

    out: Dict[int, SurahMeta] = {}
    for item in payload["data"]:
        number = int(item["number"])
        out[number] = SurahMeta(
            number=number,
            arabic_name=item.get("name", ""),
            english_name=item.get("englishName", ""),
            english_translation=item.get("englishNameTranslation", ""),
            ayah_count=int(item.get("numberOfAyahs", 0)),
        )
    return out


def _build_audio_urls(surah: int, ayah: int, global_ayah: int) -> Dict[str, str]:
    return {
        "ar": f"https://verses.quran.com/Alafasy/mp3/{surah:03d}{ayah:03d}.mp3",
        "en": f"https://cdn.islamic.network/quran/audio/192/en.walk/{global_ayah}.mp3",
        "ur": f"https://cdn.islamic.network/quran/audio/64/ur.khan/{global_ayah}.mp3",
    }


def _load_indopak_ayahs_from_quran_com(
    surah: int, ayah_count: int, timeout: int, retries: int
) -> Dict[int, str]:
    out: Dict[int, str] = {}
    for ayah in range(1, ayah_count + 1):
        url = QURAN_COM_INDOPAK_VERSE_URL.format(surah=surah, ayah=ayah)
        payload = _request_json(url, timeout=timeout, retries=retries)
        verses = payload.get("verses") if isinstance(payload, dict) else None
        if not isinstance(verses, list) or not verses:
            raise RuntimeError(f"Unexpected Quran.com verse payload for {surah}:{ayah}: {payload}")
        verse = verses[0] if isinstance(verses[0], dict) else {}
        text = str(verse.get("text_indopak", "")).lstrip("\ufeff")
        if not text:
            raise RuntimeError(f"Missing text_indopak for {surah}:{ayah}")
        out[ayah] = text
    return out


def _build_surah_record(surah: int, meta: SurahMeta, timeout: int, retries: int) -> Dict[str, Any]:
    en = _request_json(SURAH_EN_URL.format(surah=surah), timeout=timeout, retries=retries)
    ur = _request_json(SURAH_UR_URL.format(surah=surah), timeout=timeout, retries=retries)
    ar_by_num = _load_indopak_ayahs_from_quran_com(
        surah=surah,
        ayah_count=meta.ayah_count,
        timeout=timeout,
        retries=retries,
    )

    en_ayahs = en.get("data", {}).get("ayahs", [])
    ur_ayahs = ur.get("data", {}).get("ayahs", [])
    if not (isinstance(en_ayahs, list) and isinstance(ur_ayahs, list)):
        raise RuntimeError(f"Unexpected ayah payload for surah {surah}")

    en_by_num = {int(item["numberInSurah"]): item for item in en_ayahs}
    ur_by_num = {int(item["numberInSurah"]): item for item in ur_ayahs}

    ayahs: List[Dict[str, Any]] = []
    for ayah_num in range(1, meta.ayah_count + 1):
        global_ayah = int(en_by_num.get(ayah_num, {}).get("number", 0)) or int(
            ur_by_num.get(ayah_num, {}).get("number", 0)
        )
        if global_ayah <= 0:
            raise RuntimeError(f"Missing global ayah number for surah {surah}, ayah {ayah_num}")
        ayahs.append(
            {
                "ayah": ayah_num,
                "globalAyah": global_ayah,
                "arabic": ar_by_num.get(ayah_num, ""),
                "translation_en": en_by_num.get(ayah_num, {}).get("text", ""),
                "translation_ur": ur_by_num.get(ayah_num, {}).get("text", ""),
                "audio": _build_audio_urls(surah, ayah_num, global_ayah),
            }
        )

    return {
        "surah": meta.number,
        "arabicName": meta.arabic_name,
        "englishName": meta.english_name,
        "englishNameTranslation": meta.english_translation,
        "ayahCount": meta.ayah_count,
        "ayahs": ayahs,
    }


def _write_json(path: str, payload: Dict[str, Any]) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)


def main() -> int:
    parser = argparse.ArgumentParser(description="Build recite-mode surah data from APIs.")
    parser.add_argument(
        "--surahs",
        default="1-114",
        help="Surah selection, e.g. '1-3,36,55'. Default: 1-114",
    )
    parser.add_argument(
        "--output",
        default="build/recite/recite_surahs.json",
        help="Path to combined output JSON.",
    )
    parser.add_argument(
        "--per-surah-dir",
        default="build/recite/surahs",
        help="Directory for one JSON per surah.",
    )
    parser.add_argument("--timeout", type=int, default=30, help="HTTP timeout in seconds.")
    parser.add_argument("--retries", type=int, default=3, help="Retries per request.")
    parser.add_argument("--sleep-ms", type=int, default=120, help="Delay between surah pulls.")
    args = parser.parse_args()

    selected_surahs = _parse_surah_selection(args.surahs)
    if not selected_surahs:
        raise SystemExit("No valid surahs selected.")

    print(f"[recite-data] Loading surah metadata for {len(selected_surahs)} surah(s)...")
    all_meta = _load_surah_meta(timeout=args.timeout, retries=args.retries)

    records: List[Dict[str, Any]] = []
    failed: List[Dict[str, Any]] = []
    for index, surah in enumerate(selected_surahs, start=1):
        meta = all_meta.get(surah)
        if not meta:
            print(f"[recite-data] Skipping surah {surah}: metadata missing.")
            continue
        print(f"[recite-data] ({index}/{len(selected_surahs)}) Surah {surah} - {meta.english_name}")
        try:
            record = _build_surah_record(
                surah=surah,
                meta=meta,
                timeout=args.timeout,
                retries=args.retries,
            )
            records.append(record)

            per_surah_path = os.path.join(args.per_surah_dir, f"surah_{surah:03d}.json")
            _write_json(
                per_surah_path,
                {
                    "generatedAt": datetime.now(timezone.utc).isoformat(),
                    "source": "api.quran.com (indopak Arabic) + api.alquran.cloud (EN/UR) + derived audio URLs",
                    "surah": record,
                },
            )
        except Exception as exc:  # noqa: BLE001
            failed.append({"surah": surah, "error": str(exc)})
            print(f"[recite-data] Failed surah {surah}: {exc}")
        if args.sleep_ms > 0:
            time.sleep(args.sleep_ms / 1000.0)

    combined = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "sourceApis": {
            "surahList": SURAH_LIST_URL,
            "arabicIndopakByVerseKey": QURAN_COM_INDOPAK_VERSE_URL,
            "english": SURAH_EN_URL,
            "urdu": SURAH_UR_URL,
            "audioPattern": {
                "ar": "https://verses.quran.com/Alafasy/mp3/{surah3}{ayah3}.mp3",
                "en": "https://cdn.islamic.network/quran/audio/192/en.walk/{globalAyah}.mp3",
                "ur": "https://cdn.islamic.network/quran/audio/64/ur.khan/{globalAyah}.mp3",
            },
        },
        "surahCount": len(records),
        "failedCount": len(failed),
        "failed": failed,
        "surahs": records,
    }

    _write_json(args.output, combined)
    print(f"[recite-data] Wrote combined file: {args.output}")
    print(f"[recite-data] Wrote per-surah files: {args.per_surah_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
