---
name: notedrop-viewer-playwright-check
description: Use when notedrop viewer UI needs DOM, interaction, hover, computed-style, console-error, or regression verification in a real browser with Playwright.
---

# Notedrop Viewer Playwright Check

Use Playwright when screenshots alone cannot prove the behavior: accessible names, SVG replacement, hover target precision, computed CSS, route state, and console errors.

## Workflow

1. Write a temporary Playwright script under `$env:TEMP`.
2. Use `process.env.TARGET_URL`; the helper supplies the local URL.
3. Run `.agents/skills/notedrop-viewer-dev-preview/scripts/run-viewer-dev-preview.ps1 -PlaywrightScript <script>`.
4. Interact with stable selectors first: `data-*`, accessible roles, then scoped CSS.
5. Wait about `150ms` after hover before reading computed styles when CSS transitions exist.
6. Print compact JSON evidence and close the browser.

## Example

```powershell
$script = Join-Path $env:TEMP 'notedrop-viewer-playwright-check.js'
Set-Content -Path $script -Encoding UTF8 -Value @'
const TARGET_URL = process.env.TARGET_URL;

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage({ viewport: { width: 920, height: 760 } });
  await page.goto(TARGET_URL, { waitUntil: 'networkidle' });
  await page.locator('.view-settings-btn').click();
  await page.getByRole('button', { name: 'Vertical Scroll' }).click();

  const field = page.locator('.vs-margin').first();
  const step = field.locator('.vs-margin-step').first();
  await step.waitFor({ state: 'visible' });
  await step.hover({ force: true });
  await page.waitForTimeout(160);

  console.log(JSON.stringify(await step.evaluate((el) => {
    const s = getComputedStyle(el);
    return { opacity: s.opacity, color: s.color, background: s.backgroundColor };
  })));
  await browser.close();
})();
'@

.agents\skills\notedrop-viewer-dev-preview\scripts\run-viewer-dev-preview.ps1 `
  -Port 3100 `
  -PlaywrightScript $script
Remove-Item -LiteralPath $script -Force
```

## Common Checks

- SVG-only icon: `querySelectorAll('svg').length` plus `textContent === ''`.
- Hover precision: compare before, parent hover, and button hover computed styles.
- Console health: attach `page.on('console', ...)` and `page.on('pageerror', ...)`.
- Accessibility: query with `getByRole(..., { name: '...' })` when labels are stable.
