from elevenlabs.client import ElevenLabs
api_key = "0ab1348a8d65d543bcb8a75f2ca3e2a5360c2badf4ba8089ee1fa98fb7c47c40"
voice_id = "MFZUKuGQUsGJPQjTS4wC"
model = "eleven_v3"
text = "This is a test of the ElevenLabs community voice."
client = ElevenLabs(api_key=api_key)
audio_gen = client.text_to_speech.convert(
    text=text,
    voice_id=voice_id,
    model_id=model,
    output_format="mp3_44100_128",
)
with open("_test_voice.mp3", "wb") as f:
    for chunk in audio_gen:
        f.write(chunk)
print("Done.")
