---
name: notedrop-viewer-screenshot-check
description: Use when notedrop viewer UI needs screenshot-based visual QA for layout, spacing, clipping, overlap, responsive behavior, or dark-theme rendering.
---

# Notedrop Viewer Screenshot Check

Use screenshots when visual layout matters: spacing, clipping, contrast, hover appearance, responsive fit, page framing, and panel positioning.

## Workflow

1. Serve `viewer/` from current source with the shared helper script.
2. Set an explicit viewport before capture.
3. Drive the UI into the state being reviewed.
4. Save screenshots outside the repo, usually under `$env:TEMP`.
5. Inspect with `view_image` when exact visual judgment matters.
6. Stop the dev server after capture.

## Example

```powershell
$shot = Join-Path $env:TEMP 'notedrop-viewer-settings.png'
$script = Join-Path $env:TEMP 'notedrop-viewer-screenshot.js'
Set-Content -Path $script -Encoding UTF8 -Value @"
const TARGET_URL = process.env.TARGET_URL;
const SHOT_PATH = String.raw`$shot`;

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage({ viewport: { width: 920, height: 760 } });
  await page.goto(TARGET_URL, { waitUntil: 'networkidle' });
  await page.locator('.view-settings-btn').click();
  await page.getByRole('button', { name: 'Vertical Scroll' }).click();
  await page.screenshot({ path: SHOT_PATH, fullPage: false });
  console.log(JSON.stringify({ screenshot: SHOT_PATH }));
  await browser.close();
})();
"@

.agents\skills\notedrop-viewer-dev-preview\scripts\run-viewer-dev-preview.ps1 `
  -Port 3100 `
  -PlaywrightScript $script
Remove-Item -LiteralPath $script -Force
```

## Checklist

- Confirm the target UI state is visible before capture.
- Capture desktop and mobile viewports when the change is responsive.
- Prefer clipped screenshots for tiny controls when full-page images hide details.
- Report screenshot path and viewport in the final answer when relevant.
