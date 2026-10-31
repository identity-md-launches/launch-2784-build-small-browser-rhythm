// Optional: regenerate the committed share.png from the original SVG artwork.
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(process.env.WHEEL_TEST_TOOLS ? pathToFileURL(`${process.env.WHEEL_TEST_TOOLS}/playwright/index.mjs`).href : 'playwright');
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  const svg = await readFile(new URL('../assets/share.svg', import.meta.url), 'utf8');
  await page.setContent(`<style>html,body{margin:0;width:1200px;height:630px;overflow:hidden}svg{display:block}</style>${svg}`);
  await page.screenshot({ path: new URL('../assets/share.png', import.meta.url).pathname });
  console.log('Generated assets/share.png, 1200 × 630.');
} finally { await browser.close(); }
