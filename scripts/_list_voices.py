import urllib.request, json

req = urllib.request.Request(
    "https://api.elevenlabs.io/v1/voices",
    headers={"xi-api-key": "0ab1348a8d65d543bcb8a75f2ca3e2a5360c2badf4ba8089ee1fa98fb7c47c40"},
)
resp = urllib.request.urlopen(req, timeout=15)
data = json.loads(resp.read())
for v in data["voices"]:
    labels = v.get("labels", {})
    gender = labels.get("gender", "?")
    if gender.lower() == "male":
        cat = v.get("category", "?")
        accent = labels.get("accent", "")
        age = labels.get("age", "")
        print(f"{v['voice_id']}  {v['name']:<20} cat={cat:<12} accent={accent:<15} age={age}")
