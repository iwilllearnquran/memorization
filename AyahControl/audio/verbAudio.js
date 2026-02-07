const audioCache = {};

export async function playVerbAudio(verb, tense, linkEl) {
  const key = `${verb}_${tense}`;
  const icon = linkEl.querySelector('.audio-icon');

  if (audioCache[key]) {
    const a = audioCache[key];
    a.paused ? a.play() : a.pause();
    icon.textContent = a.paused ? '🔊' : '⏸️';
    return;
  }

  const bases = [
    "https://raw.githubusercontent.com/iwilllearnquran/memorization/main/audio/verbs1/",
    "https://raw.githubusercontent.com/iwilllearnquran/memorization/main/audio/verbs2/",
    "https://raw.githubusercontent.com/iwilllearnquran/memorization/main/audio/verbs3/",
    "https://raw.githubusercontent.com/iwilllearnquran/memorization/main/audio/verbs4/"
  ];

  for (const base of bases) {
    const audio = new Audio(`${base}${key}.mp3`);
    try {
      await audio.play();
      audioCache[key] = audio;
      icon.textContent = '⏸️';
      audio.onended = () => (icon.textContent = '🔊');
      return;
    } catch {}
  }

  alert(`Audio not found for ${verb}`);
}
