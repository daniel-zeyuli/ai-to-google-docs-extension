const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'store-assets');
const iconData = fs.readFileSync(path.join(root, 'icons', 'icon128.png')).toString('base64');
const iconHref = `data:image/png;base64,${iconData}`;

function escapeXml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function smallTile() {
  return `
<svg width="440" height="280" viewBox="0 0 440 280" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="440" y2="280" gradientUnits="userSpaceOnUse">
      <stop stop-color="#F7FBFF"/>
      <stop offset="0.58" stop-color="#EDF5FF"/>
      <stop offset="1" stop-color="#F3FFF7"/>
    </linearGradient>
    <filter id="shadow" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="18" stdDeviation="18" flood-color="#1A73E8" flood-opacity="0.18"/>
    </filter>
    <filter id="cardShadow" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="18" stdDeviation="24" flood-color="#111827" flood-opacity="0.14"/>
    </filter>
  </defs>
  <rect width="440" height="280" rx="0" fill="url(#bg)"/>
  <circle cx="370" cy="58" r="82" fill="#DDF7E8" opacity="0.75"/>
  <circle cx="82" cy="236" r="112" fill="#D9E9FF" opacity="0.85"/>

  <rect x="36" y="44" width="118" height="118" rx="28" fill="white" filter="url(#cardShadow)"/>
  <image href="${iconHref}" x="55" y="62" width="80" height="80" filter="url(#shadow)"/>

  <text x="178" y="82" fill="#111827" font-family="Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif" font-size="28" font-weight="900">
    <tspan x="178" dy="0">${escapeXml('ChatGPT')}</tspan>
    <tspan x="178" dy="34">${escapeXml('to Google Docs')}</tspan>
  </text>
  <text x="178" y="158" fill="#667085" font-family="Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif" font-size="16" font-weight="700">
    ${escapeXml('Export AI answers in one click')}
  </text>

  <g transform="translate(40 202)">
    <rect width="112" height="38" rx="19" fill="white" stroke="#D8E3F2"/>
    <text x="56" y="25" text-anchor="middle" fill="#1A73E8" font-family="Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif" font-size="14" font-weight="850">${escapeXml('Docs')}</text>
  </g>
  <g transform="translate(164 202)">
    <rect width="104" height="38" rx="19" fill="white" stroke="#D8E3F2"/>
    <text x="52" y="25" text-anchor="middle" fill="#475467" font-family="Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif" font-size="14" font-weight="850">${escapeXml('Word')}</text>
  </g>
  <g transform="translate(280 202)">
    <rect width="120" height="38" rx="19" fill="white" stroke="#D8E3F2"/>
    <text x="60" y="25" text-anchor="middle" fill="#475467" font-family="Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif" font-size="14" font-weight="850">${escapeXml('Markdown')}</text>
  </g>
</svg>`;
}

function marqueeTile() {
  return `
<svg width="1400" height="560" viewBox="0 0 1400 560" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1400" y2="560" gradientUnits="userSpaceOnUse">
      <stop stop-color="#F7FBFF"/>
      <stop offset="0.52" stop-color="#EEF6FF"/>
      <stop offset="1" stop-color="#F2FFF7"/>
    </linearGradient>
    <filter id="shadow" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="28" stdDeviation="28" flood-color="#1A73E8" flood-opacity="0.20"/>
    </filter>
    <filter id="cardShadow" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="30" stdDeviation="38" flood-color="#111827" flood-opacity="0.14"/>
    </filter>
  </defs>
  <rect width="1400" height="560" fill="url(#bg)"/>
  <circle cx="1158" cy="104" r="172" fill="#DCF8E8" opacity="0.78"/>
  <circle cx="186" cy="476" r="238" fill="#D8E9FF" opacity="0.9"/>
  <circle cx="740" cy="92" r="112" fill="#FFFFFF" opacity="0.5"/>

  <rect x="108" y="130" width="220" height="220" rx="50" fill="white" filter="url(#cardShadow)"/>
  <image href="${iconHref}" x="146" y="166" width="146" height="146" filter="url(#shadow)"/>

  <text x="400" y="188" fill="#111827" font-family="Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif" font-size="56" font-weight="950">
    ${escapeXml('ChatGPT to Google Docs')}
  </text>
  <text x="402" y="250" fill="#667085" font-family="Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif" font-size="28" font-weight="720">
    ${escapeXml('Export AI answers in one click.')}
  </text>

  <g transform="translate(402 316)">
    <rect width="186" height="54" rx="27" fill="white" stroke="#D8E3F2"/>
    <text x="93" y="35" text-anchor="middle" fill="#1A73E8" font-family="Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif" font-size="20" font-weight="900">${escapeXml('Google Docs')}</text>
  </g>
  <g transform="translate(606 316)">
    <rect width="124" height="54" rx="27" fill="white" stroke="#D8E3F2"/>
    <text x="62" y="35" text-anchor="middle" fill="#475467" font-family="Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif" font-size="20" font-weight="900">${escapeXml('Word')}</text>
  </g>
  <g transform="translate(748 316)">
    <rect width="170" height="54" rx="27" fill="white" stroke="#D8E3F2"/>
    <text x="85" y="35" text-anchor="middle" fill="#475467" font-family="Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif" font-size="20" font-weight="900">${escapeXml('Markdown')}</text>
  </g>

  <g transform="translate(1114 166)" filter="url(#cardShadow)">
    <rect width="206" height="208" rx="28" fill="white"/>
    <rect x="30" y="38" width="146" height="16" rx="8" fill="#DCE8F7"/>
    <rect x="30" y="74" width="112" height="16" rx="8" fill="#DCE8F7"/>
    <rect x="30" y="110" width="134" height="16" rx="8" fill="#DCE8F7"/>
    <rect x="30" y="152" width="146" height="30" rx="10" fill="#EDF5FF" stroke="#CFE0F6"/>
  </g>
</svg>`;
}

async function writePng(svg, file) {
  await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(path.join(outDir, file));
  console.log(path.join(outDir, file));
}

(async () => {
  await writePng(smallTile(), 'promo-small-440x280.png');
  await writePng(marqueeTile(), 'promo-marquee-1400x560.png');
})();
