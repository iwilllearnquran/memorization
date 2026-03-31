from elevenlabs.client import ElevenLabs
c = ElevenLabs(api_key="0ab1348a8d65d543bcb8a75f2ca3e2a5360c2badf4ba8089ee1fa98fb7c47c40")
a = c.text_to_speech.convert(text="Hello test", voice_id="sLfduly0sixkh8riDzed", model_id="eleven_multilingual_v2", output_format="mp3_44100_128")
open("_tv.mp3","wb").write(b"".join(a))
print("OK - voice works!")
