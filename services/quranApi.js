// src/services/quranApi.js

/**
 * Fetch the full list of Surahs from the AlQuran Cloud API.
 * @returns {Promise<Array<{
 *   number: number,
 *   arabicName: string,
 *   englishName: string,
 *   translation: string,
 *   ayahCount: number
 * }>>}
 */
export async function fetchSurahList() {
  const endpoint = 'https://api.alquran.cloud/v1/surah';
  try {
    const res = await fetch(endpoint);
    if (!res.ok) {
      throw new Error(`Network error: ${res.status} ${res.statusText}`);
    }
    const json = await res.json();
    if (json.code !== 200 || !Array.isArray(json.data)) {
      throw new Error(`API error: ${json.status}`);
    }
    return json.data.map(s => ({
      number: s.number,
      arabicName: s.name,
      englishName: s.englishName,
      translation: s.englishNameTranslation,
      ayahCount: s.numberOfAyahs
    }));
  } catch (err) {
    console.error('fetchSurahList failed:', err);
    return [];
  }
}
