#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from pathlib import Path

from scripts.reel_service import generate_for_ayah


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate one Quran reel.")
    parser.add_argument("--surah", type=int, required=True)
    parser.add_argument("--ayah", type=int, required=True)
    parser.add_argument("--title", type=str, default="")
    parser.add_argument("--out-json", type=str, default="generated/reels/result.json")
    args = parser.parse_args()

    result = generate_for_ayah(args.surah, args.ayah, args.title)
    out_path = Path(args.out_json)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
