const path = require('path');
const { chromium } = require('playwright');
const sharp = require('sharp');

const root = __dirname;
const htmlPath = path.join(root, 'webstore-hook.html');
const rawPng = path.join(root, 'webstore-hook-raw.png');
const finalPng = path.join(root, 'webstore-hook-1280x800.png');

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  await page.goto('file://' + htmlPath);
  await page.screenshot({ path: rawPng, fullPage: false });
  await browser.close();

  await sharp(rawPng)
    .resize(1280, 800, { fit: 'fill' })
    .png({ compressionLevel: 9 })
    .toFile(finalPng);

  console.log(finalPng);
})();
