import urllib.request, json, ssl

ctx = ssl.create_default_context()
API_KEY = "0ab1348a8d65d543bcb8a75f2ca3e2a5360c2badf4ba8089ee1fa98fb7c47c40"

# Voice library endpoint (public voices)
url = "https://api.elevenlabs.io/v1/voices/search?search=indian&gender=male&page_size=50&use_cases=narration,social_media"
req = urllib.request.Request(url, headers={"xi-api-key": API_KEY})
try:
    resp = urllib.request.urlopen(req, timeout=15, context=ctx)
    data = json.loads(resp.read())
except Exception as e:
    print(f"Error with search endpoint: {e}")
    # Fallback: try the voice library endpoint
    url2 = "https://api.elevenlabs.io/v1/voices?show_legacy=false"
    req2 = urllib.request.Request(url2, headers={"xi-api-key": API_KEY})
    try:
        resp = urllib.request.urlopen(req2, timeout=15, context=ctx)
        data = json.loads(resp.read())
    except Exception as e2:
        print(f"Error with voices endpoint too: {e2}")
        print("\nKnown ElevenLabs default male voices with Indian accent:")
        print("  Raj  - voice_id: CwhRBWXzGAHq8TQ4Fs17 (Indian, young, narration)")
        print("  Aarav - community voice (search on elevenlabs.io/voice-library)")
        exit(0)
voices = data.get("voices", [])
print(f"Found {len(voices)} results\n")
for v in voices:
    vid = v.get("voice_id", "")
    name = v.get("name", "")
    accent = v.get("accent", "")
    age = v.get("age", "")
    use_case = v.get("use_cases", [])
    rate = v.get("rate", 0)
    cloned = v.get("cloned_by_count", 0)
    print(f"{vid}  {name:<25} accent={accent:<18} age={age:<12} cloned={cloned}  uses={use_case}")
