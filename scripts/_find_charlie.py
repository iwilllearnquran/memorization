import urllib.request, json, sys
key = sys.argv[1] if len(sys.argv) > 1 else ""
req = urllib.request.Request(
    "https://api.elevenlabs.io/v1/voices",
    headers={"xi-api-key": key},
)
resp = urllib.request.urlopen(req, timeout=15)
data = json.loads(resp.read())
for v in data["voices"]:
    if "charlie" in v["name"].lower():
        print(f"{v['voice_id']}  {v['name']}")
