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
const SURAH_CACHE_KEY = 'qq_surah_list_cache_v1';
const SURAH_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function readCachedSurahList() {
  try {
    const raw = localStorage.getItem(SURAH_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.data)) return null;
    const ts = Number(parsed.timestamp) || 0;
    if (Date.now() - ts > SURAH_CACHE_TTL_MS) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

function writeCachedSurahList(data) {
  try {
    localStorage.setItem(SURAH_CACHE_KEY, JSON.stringify({
      timestamp: Date.now(),
      data
    }));
  } catch {
    // Ignore storage failures.
  }
}

async function fetchWithBackoff(url, attempts = 4) {
  let lastError = null;
  for (let i = 0; i < attempts; i += 1) {
    try {
      const res = await fetch(url);
      if (res.ok) return res;

      if (res.status === 429 || res.status >= 500) {
        const retryAfterHeader = Number(res.headers.get('Retry-After'));
        const retryAfterMs = Number.isFinite(retryAfterHeader) && retryAfterHeader > 0
          ? retryAfterHeader * 1000
          : 0;
        const backoffMs = Math.min(6000, 500 * (2 ** i)) + Math.floor(Math.random() * 250);
        await delay(Math.max(backoffMs, retryAfterMs));
        lastError = new Error(`Network error: ${res.status} ${res.statusText}`);
        continue;
      }

      throw new Error(`Network error: ${res.status} ${res.statusText}`);
    } catch (err) {
      lastError = err;
      if (i === attempts - 1) break;
      const backoffMs = Math.min(6000, 500 * (2 ** i)) + Math.floor(Math.random() * 250);
      await delay(backoffMs);
    }
  }
  throw lastError || new Error('Failed to fetch after retries');
}

export async function fetchSurahList() {
  const endpoint = 'https://api.alquran.cloud/v1/surah';
  try {
    const res = await fetchWithBackoff(endpoint, 4);
    const json = await res.json();
    if (json.code !== 200 || !Array.isArray(json.data)) {
      throw new Error(`API error: ${json.status}`);
    }
    const mapped = json.data.map(s => ({
      number: s.number,
      arabicName: s.name,
      englishName: s.englishName,
      translation: s.englishNameTranslation,
      ayahCount: s.numberOfAyahs
    }));
    writeCachedSurahList(mapped);
    return mapped;
  } catch (err) {
    console.error('fetchSurahList failed:', err);
    const cached = readCachedSurahList();
    if (cached) return cached;
    return [];
  }
}
