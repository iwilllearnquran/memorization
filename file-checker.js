// 📁 file-checker.js
// A dev utility to scan all surah/ayah paths and log missing files

const surahCounts = {
  1: 7,
  2: 286,
  3: 200,
  4: 176,
  5: 120,
  // Add the rest as needed
};

async function checkFiles() {
  const base = window.location.origin;
  const missing = [];

  for (const [surah, count] of Object.entries(surahCounts)) {
    for (let ayah = 1; ayah <= count; ayah++) {
      const url = `${base}/ayahs/surah_${surah}/ayah_${surah}_${ayah}.html`;
      try {
        const res = await fetch(url, { method: 'HEAD' });
        if (!res.ok) {
          missing.push(url);
          console.warn(`❌ Missing: ${url}`);
        } else {
          console.log(`✅ Found: ${url}`);
        }
      } catch (err) {
        missing.push(url);
        console.warn(`⚠️ Error checking: ${url}`);
      }
    }
  }

  if (missing.length === 0) {
    alert('✅ All files are present.');
  } else {
    alert(`⚠️ Missing ${missing.length} file(s). Check console.`);
    console.table(missing);
  }
}

// Run manually from browser console or auto-run after load
window.addEventListener('load', () => {
  const btn = document.createElement('button');
  btn.textContent = '🔍 Check Missing Files';
  btn.style.cssText = `
    position: fixed;
    top: 16px;
    left: 16px;
    z-index: 9999;
    padding: 8px 12px;
    background: #0a4d68;
    color: white;
    border: none;
    border-radius: 8px;
    cursor: pointer;
  `;
  btn.onclick = checkFiles;
  document.body.appendChild(btn);
});
