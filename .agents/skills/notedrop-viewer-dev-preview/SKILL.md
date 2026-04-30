---
name: notedrop-viewer-dev-preview
description: Use when developing notedrop viewer UI and needing a fast browser check from current source without Obsidian, publish, release, version bump, BRAT, or GitHub Pages.
---

# Notedrop Viewer Dev Preview

## Overview

Use the viewer as a standalone Next app. Start `viewer/` with `npm run dev`, open `localhost` with Playwright or the in-app browser, exercise the UI, then stop the dev server. This checks current workspace source directly, so no Obsidian publish, release asset, version bump, or plugin reload is needed.

`npm run dev` now starts two services via `concurrently`:
- **Next dev** on `localhost:3100` (viewer source + HMR)
- **Preview sidecar** on `localhost:4321` — the same `PreviewServer` class the plugin uses, watching `viewer/samples/` and emitting SSE on `/events` for live reload

Next dev's `beforeFiles` rewrites proxy `/manifest.json`, `/content/**`, `/events` to the sidecar so the browser sees a single origin. Editing files under `viewer/samples/**` triggers automatic invalidation in the viewer — no `npm run gen:sample` rerun needed.

## Use This For

- Viewer-only UI changes under `viewer/src`.
- CSS hover, layout, panel, pagination, markdown rendering, or route behavior.
- Fast browser verification before deciding whether a dogfood publish cycle is worth running.

Do not use this as proof for plugin/publish behavior. If the question involves Obsidian vault state, plugin commands, cache keys, release assets, GH Pages, BRAT, or share repo output, use `notedrop-dogfood-automation`.

## Two Modes

This skill supports two distinct workflows. Pick by intent:

- **Automated verification** (default): single-shot Playwright check + clean teardown. Use the helper script (§Helper Script).
- **Manual launch**: leave the dev server running so the user can interact in their own browser. Bypass the helper script and start `npm run dev` directly as a backgrounded process (§Manual Launch).

Do NOT try to keep the helper script's dev server alive — its `finally` block always stops the job. Trying to extend it into a manual-mode tool produces a half-managed background process.

## Workflow (Automated Verification)

1. Run normal code checks first when changing code:
   - `cd viewer && npm test`
   - `cd viewer && npm run typecheck`
   - `cd viewer && npm run build` when production build confidence matters.
2. Start a local viewer dev server on an unused port, usually `3100`.
3. Use Playwright or `browser-use` against `http://localhost:<port>`.
4. Drive the UI directly. For settings-panel checks, open `.view-settings-btn`, choose a book layout such as `Vertical Scroll`, then inspect `.vs-*` controls.
5. Read computed styles or take screenshots from the browser. Prefer selectors and assertions over visual guessing.
6. Stop the dev server before final response. Use Manual Launch (§) if the user explicitly wants it left running.

## Manual Launch (User Interaction)

When the user asks to "launch it", "open the viewer", or wants to drive the UI themselves, do not use the helper script. Use this flow:

1. Pre-flight checks the same as automated mode (test/typecheck/build if relevant to the change).
2. Start the dev server as a background task so it persists across tool calls. **No `-p` flag** — `concurrently` swallows args and the port is hardcoded in the `dev:next` script.

   ```bash
   # in bash, working dir = viewer/
   npm run dev
   # tool call: run_in_background: true
   ```

3. Poll readiness — both Next (3100) AND sidecar (4321). Checking only 3100 isn't enough; the rewrites silently 502 if the sidecar isn't up yet.

   ```bash
   until curl -s -o /dev/null -w "%{http_code}" http://localhost:3100 | grep -q "200" \
      && curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:4321/manifest.json | grep -q "200"; do
     sleep 1
   done
   ```

4. Open the browser to a real entry, not just `/`. The default sample is `welcome`:

   ```bash
   start http://localhost:3100/#/welcome/
   ```

5. Tell the user the URL + the background process ID returned by the bash tool, so they (or you) can stop it later. Stop with `KillShell` on that ID when the user signals they are done.

The dev server prints `__NOTEDROP_BASE__/icons/...` 404s and `events/` 404s. Ignore both — see §Known Local-Dev Quirk. Visible browser-side console may also show a hydration warning about `data-theme,style` from Zustand persist; not a regression.

## Helper Script (Automated Verification only)

Use `scripts/run-viewer-dev-preview.ps1` to start the dev server, wait for readiness, execute a Playwright script through the local `playwright-skill` wrapper, and clean up the server.

Example:

```powershell
$script = Join-Path $env:TEMP 'notedrop-viewer-check.js'
Set-Content -Path $script -Encoding UTF8 -Value @'
const TARGET_URL = process.env.TARGET_URL;

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage({ viewport: { width: 920, height: 760 } });
  await page.goto(TARGET_URL, { waitUntil: 'networkidle' });
  await page.locator('.view-settings-btn').click();
  await page.getByRole('button', { name: 'Vertical Scroll' }).click();
  console.log(await page.locator('.view-settings-panel').isVisible());
  await browser.close();
})();
'@

.agents\skills\notedrop-viewer-dev-preview\scripts\run-viewer-dev-preview.ps1 `
  -Port 3100 `
  -PlaywrightScript $script
Remove-Item -LiteralPath $script -Force
```

The Playwright script run by the wrapper has `chromium`, `firefox`, `webkit`, and helper globals available from `playwright-skill/run.js`. Use `process.env.TARGET_URL` rather than hardcoding the URL.

## Common Checks

| Goal | Browser assertion |
|---|---|
| Element rendered | `await page.locator(selector).waitFor({ state: 'visible' })` |
| SVG replaced text glyph | `el.querySelectorAll('svg').length` and `el.textContent === ''` |
| Hover target is precise | Compare `getComputedStyle()` before field hover, after field hover, and after button hover |
| Responsive panel fit | Set viewport with `page.setViewportSize()` and screenshot |
| Console errors | Attach `page.on('console', ...)` and `page.on('pageerror', ...)` |

## Known Local-Dev Quirk

`withBase('/icons/...')` produces `/__NOTEDROP_BASE__/...` URLs for publish-time replacement. Plain Next dev may log 404s for those placeholder asset URLs. Treat that as unrelated unless the task is specifically about base-path asset loading.

## Common Mistakes

- Do not claim release, BRAT, or GH Pages behavior from this workflow; it only proves current source served by Next dev + sidecar.
- Do not pass `-- -p <port>` to `npm run dev`. `concurrently` swallows extra args; the `-p` flag never reaches `next dev`. The Next port is hardcoded in `dev:next`. Override the sidecar port via `NOTEDROP_SIDECAR_PORT` (read by both the sidecar and Next's rewrites).
- Do not run `npm run gen:sample` before `npm run dev`. The sidecar serves `viewer/samples/` dynamically; pre-generation is `prebuild` only (production export).
- Do not poll only `localhost:3100` — verify the sidecar at `127.0.0.1:4321/manifest.json` too. Next without sidecar returns 502 on `/manifest.json` even though `/` itself returns 200.
- Do not leave `Start-Job` or `npm run dev` processes running after *automated* verification. Manual launch is the explicit exception (§Manual Launch).
- Do not use fixed sleeps for server readiness; poll `http://localhost:<port>`.
- Do not rely on immediate computed styles after hover when CSS transitions exist; wait roughly 150ms before reading.
- Do NOT target `.paper-page` (or `.page-strip .paper-page`) directly with `.first()`. `EntryView` mounts an off-screen *measurement* container with `aria-hidden="true"` whose subtree includes the same `.paper-page` markup. The measurement is hidden by inline `visibility: hidden`, so `waitFor({ state: 'visible' })` on `.first()` times out forever. Use `.entry-content:not([aria-hidden]) .paper-page` to target the visible PaperPage subtree only. The measurement entry-content has `aria-hidden="true"`; the visible one has no `aria-hidden` attribute. Same gotcha applies to `.page-strip` (both subtrees contain it).
