const { test, expect } = require('playwright/test');

const googleIframeNoise = [/apis\.google\.com/, /u\[v\] is not a function/];

function shouldIgnoreIssue(text, ignorePatterns) {
  return ignorePatterns.some(pattern => pattern.test(text));
}

function trackClientIssues(page, { ignoreAbort = false, ignorePatterns = googleIframeNoise } = {}) {
  const issues = [];

  page.on('pageerror', error => {
    const details = `${error?.message || String(error)}\n${error?.stack || ''}`.trim();
    if (shouldIgnoreIssue(details, ignorePatterns)) return;
    issues.push(`pageerror: ${details}`);
  });

  page.on('console', message => {
    if (message.type() !== 'error') return;
    const text = message.text();
    if (shouldIgnoreIssue(text, ignorePatterns)) return;
    issues.push(`console: ${text}`);
  });

  page.on('requestfailed', request => {
    const failureText = request.failure()?.errorText || 'unknown';
    if (ignoreAbort && failureText.includes('ERR_ABORTED')) return;
    const details = `${request.method()} ${request.url()} :: ${failureText}`;
    if (shouldIgnoreIssue(details, ignorePatterns)) return;
    issues.push(`requestfailed: ${details}`);
  });

  return issues;
}

async function attachPageScreenshot(testInfo, name, page) {
  await testInfo.attach(name, {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png'
  });
}

function assertNoClientIssues(issues) {
  expect(issues, issues.length ? issues.join('\n') : 'No client-side issues recorded').toEqual([]);
}

test.describe('Quran Quest web smoke checks', () => {
  test('home page loads core navigation', async ({ page }, testInfo) => {
    const issues = trackClientIssues(page);

    await page.goto('/index.html', { waitUntil: 'networkidle' });

    await expect(page).toHaveTitle(/Quran Quest/i);
    await expect(page.locator('#mainNavbar')).toBeVisible();

    await attachPageScreenshot(testInfo, 'home-screen', page);
    assertNoClientIssues(issues);
  });

  test('memorization welcome page advances into recitation shell', async ({ page }, testInfo) => {
    const issues = trackClientIssues(page);

    await page.goto('/memorization.html', { waitUntil: 'networkidle' });

    await expect(page).toHaveTitle(/Memorization/i);
    await expect(page.locator('#memoWelcomeStartBtn')).toBeVisible();

    await page.locator('#memoWelcomeStartBtn').click({ force: true });

    await expect(page.locator('#memoMain')).toBeVisible({ timeout: 20000 });
    await expect(page.locator('#memoWelcome')).not.toBeVisible();
    await expect(page.locator('#memoWords > *').first()).toBeVisible();

    await attachPageScreenshot(testInfo, 'memorization-shell', page);
    assertNoClientIssues(issues);
  });

  test('standalone dua page redirects into the shell route', async ({ page }, testInfo) => {
    const issues = trackClientIssues(page, { ignoreAbort: true });

    await page.goto('/duas/duas.html', { waitUntil: 'domcontentloaded' });

    await expect(page).toHaveURL(/\/?tab=duas/);
    await expect(page.locator('body')).toHaveClass(/duas-mode/);

    await attachPageScreenshot(testInfo, 'duas-shell-route', page);
    assertNoClientIssues(issues);
  });

  test('duas tab renders inside the embedded iframe', async ({ page }, testInfo) => {
    const issues = trackClientIssues(page);

    await page.goto('/?tab=duas', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(5000);

    await expect(page.locator('body')).toHaveClass(/duas-mode/);
    await expect.poll(() => page.frames().some(frame => (
      frame.name() === 'duasFrame' && /duas\/duas\.html/.test(frame.url())
    ))).toBeTruthy();

    const duaFrame = page.frames().find(frame => (
      frame.name() === 'duasFrame' && /duas\/duas\.html/.test(frame.url())
    ));

    expect(duaFrame, 'duasFrame should be available').toBeTruthy();
    await expect(duaFrame.locator('.app-header')).toBeVisible({ timeout: 20000 });
    await expect(duaFrame.locator('.dua-card').first()).toBeVisible({ timeout: 20000 });

    await attachPageScreenshot(testInfo, 'duas-shell', page);
    assertNoClientIssues(issues);
  });
});
