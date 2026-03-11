'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const AYAHS_DIR = path.join(ROOT, 'ayahs');
const OUTPUT_PATH = path.join(ROOT, 'generated', 'memo-practice-words.json');

const WORD_TRANSLATION_RE =
  /<span\s+class="word-text"[^>]*>([\s\S]*?)<\/span>[\s\S]*?<span\s+class="translation[^"]*toggle-translation[^"]*"[^>]*>([\s\S]*?)<\/span>/g;
const TRANSLIT_RE = /class="translit-input[^"]*"[^>]*data-expected="([^"]*)"/g;

function decodeHtmlEntities(text) {
  return String(text || '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)));
}

function stripTags(text) {
  return String(text || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeArabicToken(text) {
  return String(text || '')
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, '')
    .replace(/\u0640/g, '')
    .replace(/[ٱأإآ]/g, 'ا')
    .replace(/[ؤ]/g, 'و')
    .replace(/[ئ]/g, 'ي')
    .replace(/[ى]/g, 'ي')
    .replace(/[ة]/g, 'ه')
    .replace(/[^\u0621-\u063A\u0641-\u064A]/g, '')
    .trim();
}

function cleanValue(raw) {
  return stripTags(decodeHtmlEntities(raw));
}

function extractSurahAyahFromPath(filePath) {
  const match = filePath.replace(/\\/g, '/').match(/surah_(\d+)\/ayah_\d+_(\d+)\.html$/);
  if (!match) return { surah: 0, ayah: 0 };
  return {
    surah: Number(match[1]) || 0,
    ayah: Number(match[2]) || 0
  };
}

function collectAyahFiles() {
  if (!fs.existsSync(AYAHS_DIR)) {
    throw new Error(`Ayah directory not found: ${AYAHS_DIR}`);
  }

  const files = [];
  const surahDirs = fs.readdirSync(AYAHS_DIR, { withFileTypes: true });
  for (const dir of surahDirs) {
    if (!dir.isDirectory()) continue;
    const fullDir = path.join(AYAHS_DIR, dir.name);
    const ayahFiles = fs.readdirSync(fullDir, { withFileTypes: true });
    for (const ayahFile of ayahFiles) {
      if (!ayahFile.isFile()) continue;
      if (!/^ayah_\d+_\d+\.html$/.test(ayahFile.name)) continue;
      files.push(path.join(fullDir, ayahFile.name));
    }
  }

  files.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  return files;
}

function main() {
  const files = collectAyahFiles();
  const tokenCount = new Map();
  const tokenMeta = new Map();
  let totalTokens = 0;
  let mismatchFiles = 0;

  for (const filePath of files) {
    const html = fs.readFileSync(filePath, 'utf8');
    const pairMatches = Array.from(html.matchAll(WORD_TRANSLATION_RE));
    const translitMatches = Array.from(html.matchAll(TRANSLIT_RE)).map(match => cleanValue(match[1]));
    if (pairMatches.length !== translitMatches.length) {
      mismatchFiles += 1;
    }

    const { surah, ayah } = extractSurahAyahFromPath(filePath);

    for (let i = 0; i < pairMatches.length; i += 1) {
      const rawWord = cleanValue(pairMatches[i][1]);
      const meaning = cleanValue(pairMatches[i][2]);
      const transliteration = translitMatches[i] || '';
      const key = normalizeArabicToken(rawWord);
      if (!key) continue;

      totalTokens += 1;
      tokenCount.set(key, (tokenCount.get(key) || 0) + 1);

      if (!tokenMeta.has(key)) {
        tokenMeta.set(key, {
          key,
          arabic: rawWord,
          transliteration,
          meaning,
          firstSeen: `${surah}:${ayah}`
        });
        continue;
      }

      const existing = tokenMeta.get(key);
      if ((!existing.transliteration || existing.transliteration.length < 2) && transliteration) {
        existing.transliteration = transliteration;
      }
      if ((!existing.meaning || existing.meaning.length < 2) && meaning) {
        existing.meaning = meaning;
      }
    }
  }

  const words = Array.from(tokenMeta.values())
    .map(entry => ({
      key: entry.key,
      arabic: entry.arabic,
      transliteration: entry.transliteration || '',
      meaning: entry.meaning || '',
      occurrences: Number(tokenCount.get(entry.key) || 0),
      firstSeen: entry.firstSeen
    }))
    .filter(entry => entry.arabic && entry.occurrences > 0)
    .sort((a, b) => {
      if (b.occurrences !== a.occurrences) return b.occurrences - a.occurrences;
      return a.arabic.localeCompare(b.arabic, 'ar');
    });

  const payload = {
    source: 'local-quran-ayah-html-corpus',
    generatedAt: new Date().toISOString(),
    totalAyahFiles: files.length,
    totalTokens,
    totalUniqueWords: words.length,
    mismatchFiles,
    words
  };

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

  console.log(
    JSON.stringify(
      {
        output: path.relative(ROOT, OUTPUT_PATH),
        totalAyahFiles: files.length,
        totalTokens,
        totalUniqueWords: words.length,
        mismatchFiles
      },
      null,
      2
    )
  );
}

main();
