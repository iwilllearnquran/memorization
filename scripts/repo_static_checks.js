const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
const skippedDirs = new Set([
  '.git',
  '.expo',
  '.firebase',
  '.well-known',
  'artifacts',
  'ayahs',
  'build',
  'fonts',
  'generated',
  'node_modules',
  'test-results',
  'verbs_tables'
]);
const importExtensions = ['', '.js', '.json', '.html', '.css', '.mjs'];
const assetExtensions = ['', '.html', '.css', '.js', '.json', '.svg', '.png', '.jpg', '.jpeg', '.ico', '.woff', '.woff2', '.ttf', '.webmanifest'];
const jsFiles = [];
const htmlFiles = [];
const cssFiles = [];
const failures = [];
const warnings = [];
const optionalMemoDomIds = new Set([
  'memoHomeBtn',
  'memoMenuBtn',
  'memoNavSpeakerBtn',
  'memoNavPrevBtn',
  'memoNavNextBtn',
  'memoNavSketchSurah',
  'memoNavSketchAyah',
  'memoNavModeHost',
  'memoSurahSelect',
  'memoAyahSelect',
  'memoLockMsg',
  'memoNavLearnQuran',
  'memoProgressFill',
  'memoProgressText',
  'memoNavStreakCount',
  'memoNavTopStreakCount',
  'memoNavBar',
  'memoNavStreakPill'
]);

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (skippedDirs.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath);
      continue;
    }
    const ext = path.extname(entry.name).toLowerCase();
    if (ext === '.js') jsFiles.push(fullPath);
    if (ext === '.html') htmlFiles.push(fullPath);
    if (ext === '.css') cssFiles.push(fullPath);
  }
}

function toRepoPath(filePath) {
  return path.relative(repoRoot, filePath).replace(/\\/g, '/');
}

function isLocalReference(ref) {
  if (!ref) return false;
  return ref.startsWith('./') || ref.startsWith('../') || ref.startsWith('/');
}

function stripDecorators(ref) {
  return ref.split('#')[0].split('?')[0];
}

function resolveCandidates(baseFile, ref, extensions) {
  const rawRef = stripDecorators(ref);
  const baseDir = path.dirname(baseFile);
  const basePath = rawRef.startsWith('/')
    ? path.join(repoRoot, rawRef.replace(/^\//, ''))
    : path.resolve(baseDir, rawRef);
  const candidates = new Set([basePath]);

  for (const ext of extensions) {
    candidates.add(basePath + ext);
  }
  if (!path.extname(basePath)) {
    for (const ext of extensions.filter(Boolean)) {
      candidates.add(path.join(basePath, `index${ext}`));
    }
  }

  return [...candidates];
}

function findFirstExisting(candidates) {
  return candidates.find(candidate => fs.existsSync(candidate));
}

function recordMissing(ownerFile, label, ref, extensions) {
  if (!isLocalReference(ref)) return;
  const resolved = findFirstExisting(resolveCandidates(ownerFile, ref, extensions));
  if (!resolved) {
    failures.push(`${label} missing from ${toRepoPath(ownerFile)} -> ${ref}`);
  }
}

function collectMatches(text, regex, handler) {
  for (const match of text.matchAll(regex)) {
    const value = match.slice(1).find(Boolean);
    if (value) handler(value.trim());
  }
}

walk(repoRoot);

for (const file of jsFiles) {
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  } catch (error) {
    const details = String(error.stderr || error.stdout || error.message || '').trim();
    failures.push(`Syntax check failed for ${toRepoPath(file)}\n${details}`);
  }

  const source = fs.readFileSync(file, 'utf8');
  collectMatches(source, /(?:import|export)\s+(?:[^'"`]*?\sfrom\s*)?['"]([^'"]+)['"]/g, ref => {
    recordMissing(file, 'ES module import', ref, importExtensions);
  });
  collectMatches(source, /import\(\s*['"]([^'"]+)['"]\s*\)/g, ref => {
    recordMissing(file, 'Dynamic import', ref, importExtensions);
  });
  collectMatches(source, /importScripts\(\s*['"]([^'"]+)['"]\s*\)/g, ref => {
    recordMissing(file, 'importScripts reference', ref, assetExtensions);
  });
  collectMatches(source, /fetch\(\s*['"]([^'"]+)['"]\s*\)/g, ref => {
    recordMissing(file, 'fetch reference', ref, assetExtensions);
  });
  collectMatches(source, /new URL\(\s*['"]([^'"]+)['"]\s*,\s*window\.location\.href\s*\)/g, ref => {
    recordMissing(file, 'new URL asset reference', ref, assetExtensions);
  });
}

for (const file of htmlFiles) {
  const source = fs.readFileSync(file, 'utf8');
  collectMatches(source, /<(?:script|img|iframe|source)[^>]+\bsrc=["']([^"']+)["']/gi, ref => {
    recordMissing(file, 'HTML src reference', ref, assetExtensions);
  });
  collectMatches(source, /<link[^>]+\bhref=["']([^"']+)["']/gi, ref => {
    recordMissing(file, 'HTML href reference', ref, assetExtensions);
  });
  collectMatches(source, /fetch\(\s*['"]([^'"]+)['"]\s*\)/g, ref => {
    recordMissing(file, 'Inline fetch reference', ref, assetExtensions);
  });
  collectMatches(source, /new URL\(\s*['"]([^'"]+)['"]\s*,\s*window\.location\.href\s*\)/g, ref => {
    recordMissing(file, 'Inline new URL asset reference', ref, assetExtensions);
  });
}

for (const file of cssFiles) {
  const source = fs.readFileSync(file, 'utf8');
  collectMatches(source, /url\((?:'([^']+)'|"([^"]+)"|([^'")]+))\)/g, ref => {
    recordMissing(file, 'CSS url() reference', ref, assetExtensions);
  });
}

const memoHtml = path.join(repoRoot, 'memorization.html');
const memoJs = path.join(repoRoot, 'memorization.js');
if (fs.existsSync(memoHtml) && fs.existsSync(memoJs)) {
  const html = fs.readFileSync(memoHtml, 'utf8');
  const htmlIds = new Set([...html.matchAll(/id="([^"]+)"/g)].map(match => match[1]));
  const referencedIds = [...new Set(
    [...fs.readFileSync(memoJs, 'utf8').matchAll(/document\.getElementById\('([^']+)'\)/g)]
      .map(match => match[1])
  )];
  const missingIds = referencedIds.filter(id => !htmlIds.has(id) && !optionalMemoDomIds.has(id));
  if (missingIds.length) {
    warnings.push(
      `memorization.js references ${missingIds.length} DOM ids not present in memorization.html: ${missingIds.join(', ')}`
    );
  }
}

if (failures.length) {
  console.error('Static repo validation failed.');
  failures.forEach((failure, index) => {
    console.error(`\n[${index + 1}] ${failure}`);
  });
  if (warnings.length) {
    console.error('\nWarnings:');
    warnings.forEach(warning => console.error(`- ${warning}`));
  }
  process.exit(1);
}

console.log(`Static repo validation passed for ${jsFiles.length} JS, ${htmlFiles.length} HTML, and ${cssFiles.length} CSS files.`);
if (warnings.length) {
  console.log('Warnings:');
  warnings.forEach(warning => console.log(`- ${warning}`));
}

