document.addEventListener('DOMContentLoaded', () => {
  // Apply localized strings to every [data-i18n] element
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const msg = chrome.i18n.getMessage(el.dataset.i18n);
    if (msg) el.textContent = msg;
  });

  const optDrive  = document.getElementById('opt-drive');
  const optLocal  = document.getElementById('opt-local');
  const optMd     = document.getElementById('opt-md');
  const optNotion    = document.getElementById('opt-notion');
  const optObsidian  = document.getElementById('opt-obsidian');
  const notionSettings   = document.getElementById('notion-settings');
  const obsidianSettings = document.getElementById('obsidian-settings');
  const notionTokenInput  = document.getElementById('notion-token');
  const notionPageInput   = document.getElementById('notion-page-id');
  const notionDetail      = document.getElementById('notion-detail');
  const obsidianVaultInput = document.getElementById('obsidian-vault');
  const obsidianDetail     = document.getElementById('obsidian-detail');
  const shortcutDisplay = document.getElementById('shortcut-display');
  const shortcutCustomize = document.getElementById('shortcut-customize');
  const destChecks = document.getElementById('dest-checks');
  const citationSelect = document.getElementById('citation-select');

  document.getElementById('version-badge').textContent = chrome.runtime.getManifest().version;

  let currentDest = 'drive';
  let currentMode = 'select';
  let hiddenDests = [];

  const DEST_OPTS = { drive: optDrive, local: optLocal, markdown: optMd, notion: optNotion, obsidian: optObsidian };

  chrome.storage.local.get(['exportDest', 'defaultExportMode', 'notionToken', 'notionParentPageId', 'obsidianVault', 'hiddenDestinations', 'citationStyle'], (d) => {
    currentDest = d.exportDest || 'drive';
    currentMode = d.defaultExportMode || 'select';
    hiddenDests = Array.isArray(d.hiddenDestinations) ? d.hiddenDestinations : [];
    citationSelect.value = d.citationStyle || 'mla';
    if (d.notionToken)        notionTokenInput.value = d.notionToken;
    if (d.notionParentPageId) notionPageInput.value = d.notionParentPageId;
    if (d.obsidianVault)      obsidianVaultInput.value = d.obsidianVault;
    _updateNotionDetail(d.notionToken, d.notionParentPageId);
    _updateObsidianDetail(d.obsidianVault);
    destChecks.querySelectorAll('input[data-dest-check]').forEach(cb => {
      cb.checked = !hiddenDests.includes(cb.dataset.destCheck);
    });
    applyDest();
    applyMode();
  });

  chrome.commands.getAll((commands) => {
    const cmd = commands.find(c => c.name === 'trigger-export');
    shortcutDisplay.textContent = cmd?.shortcut || chrome.i18n.getMessage('notSet') || 'Not set';
  });

  function _updateNotionDetail(token, pageId) {
    if (token && pageId) notionDetail.textContent = 'Connected';
    else if (token)      notionDetail.textContent = 'Add parent page ID';
    else                 notionDetail.textContent = 'Connect your workspace';
  }

  function _updateObsidianDetail(vault) {
    obsidianDetail.textContent = vault ? `Vault: ${vault}` : 'Open in your vault';
  }

  function applyDest() {
    optDrive.classList.toggle('active',    currentDest === 'drive');
    optLocal.classList.toggle('active',    currentDest === 'local');
    optMd.classList.toggle('active',       currentDest === 'markdown');
    optNotion.classList.toggle('active',   currentDest === 'notion');
    optObsidian.classList.toggle('active', currentDest === 'obsidian');
    notionSettings.classList.toggle('visible',   currentDest === 'notion');
    obsidianSettings.classList.toggle('visible', currentDest === 'obsidian');
    Object.entries(DEST_OPTS).forEach(([dest, el]) => {
      el.style.display = (hiddenDests.includes(dest) && dest !== currentDest) ? 'none' : '';
    });
  }

  function applyMode() {
    document.querySelectorAll('.mode-opt').forEach(b => {
      b.classList.toggle('active', b.dataset.mode === currentMode);
    });
  }

  [optDrive, optLocal, optMd, optNotion, optObsidian].forEach(opt => {
    opt.addEventListener('click', () => {
      currentDest = opt.dataset.dest;
      chrome.storage.local.set({ exportDest: currentDest });
      applyDest();
    });
  });

  notionTokenInput.addEventListener('input', () => {
    const val = notionTokenInput.value.trim();
    chrome.storage.local.set({ notionToken: val });
    _updateNotionDetail(val, notionPageInput.value.trim());
  });

  notionPageInput.addEventListener('input', () => {
    let val = notionPageInput.value.trim();
    // Accept full Notion URLs and extract just the ID at the end
    const urlMatch = val.match(/([a-f0-9]{32})(?:[?#].*)?$/i);
    if (urlMatch) val = urlMatch[1];
    chrome.storage.local.set({ notionParentPageId: val });
    _updateNotionDetail(notionTokenInput.value.trim(), val);
  });

  document.getElementById('notion-help-btn').addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://developers.notion.com/docs/create-a-notion-integration#getting-started' });
  });

  obsidianVaultInput.addEventListener('input', () => {
    const val = obsidianVaultInput.value.trim();
    chrome.storage.local.set({ obsidianVault: val });
    _updateObsidianDetail(val);
  });

  document.querySelectorAll('.mode-opt').forEach(b => {
    b.addEventListener('click', () => {
      currentMode = b.dataset.mode;
      chrome.storage.local.set({ defaultExportMode: currentMode });
      applyMode();
    });
  });

  destChecks.querySelectorAll('input[data-dest-check]').forEach(cb => {
    cb.addEventListener('change', () => {
      const boxes = Array.from(destChecks.querySelectorAll('input[data-dest-check]'));
      if (!boxes.some(b => b.checked)) { cb.checked = true; return; }
      hiddenDests = boxes.filter(b => !b.checked).map(b => b.dataset.destCheck);
      chrome.storage.local.set({ hiddenDestinations: hiddenDests });
      applyDest();
    });
  });

  citationSelect.addEventListener('change', () => {
    chrome.storage.local.set({ citationStyle: citationSelect.value });
  });

  // ── Status of the active tab: do we see AI replies on this page? ──
  const statusBox = document.getElementById('page-status');
  const statusText = document.getElementById('status-text');
  const statusReport = document.getElementById('status-report');
  let statusPlatform = '';
  const msg = (key, fallback) => chrome.i18n.getMessage(key) || fallback;

  function showStatus(ok, text, canReport) {
    statusBox.hidden = false;
    statusBox.classList.toggle('ok', ok);
    statusText.textContent = text;
    statusReport.hidden = !canReport;
  }

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs && tabs[0];
    if (!tab || tab.id == null) return;
    chrome.tabs.sendMessage(tab.id, { action: 'getPlatform' }, (resp) => {
      void chrome.runtime.lastError;
      if (!resp || !resp.platform) {
        showStatus(false, msg('statusUnsupported', 'Works on ChatGPT, Gemini, Claude, DeepSeek & Perplexity. Already on one? Refresh the page.'), false);
        return;
      }
      statusPlatform = resp.platform;
      const n = resp.responseCount || 0;
      if (n === 1) showStatus(true, msg('statusFoundOne', 'Found 1 reply on this page'), false);
      else if (n > 1) showStatus(true, msg('statusFoundMany', 'Found {n} replies on this page').replace('{n}', n), false);
      else showStatus(false, msg('statusNone', 'No AI replies on this page yet.'), true);
    });
  });

  // User-initiated only: sends platform, version, destination, mode, a fixed note and browser/OS — no chat content.
  statusReport.addEventListener('click', async () => {
    statusReport.disabled = true;
    const prefs = await new Promise(resolve => chrome.storage.local.get(['exportDest', 'defaultExportMode'], resolve));
    const chromeVersion = (navigator.userAgent.match(/Chrome\/(\d+)/) || [])[1] || 'unknown';
    const os = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || 'unknown';
    const fields = {
      platform: statusPlatform,
      version: chrome.runtime.getManifest().version,
      destination: prefs.exportDest || 'drive',
      mode: prefs.defaultExportMode || 'select',
      error: 'Popup check: 0 AI replies detected on this page',
      browser: `Chrome ${chromeVersion} · ${os}`
    };
    chrome.runtime.sendMessage({ action: 'sendReport', fields }, (resp) => {
      void chrome.runtime.lastError;
      statusReport.textContent = resp && resp.success ? msg('statusSent', 'Sent — thanks!') : msg('statusFail', 'Could not send');
    });
  });

  shortcutCustomize.addEventListener('click', () => {
    chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
    window.close();
  });

  document.getElementById('feedbackBtn').addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://forms.gle/XGW5JQ2kRjTgz2bB8' });
    window.close();
  });

  document.getElementById('proBtn').addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://docs.google.com/forms/d/e/1FAIpQLScAP7Ok8jRTbHV8sekEnDwZAaktJ0bme3bT8vsNKI6LSrR1jA/viewform?usp=dialog' });
    window.close();
  });
});
