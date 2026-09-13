document.addEventListener('DOMContentLoaded', () => {
  // Apply localized strings to every [data-i18n] element
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const msg = chrome.i18n.getMessage(el.dataset.i18n);
    if (msg) el.textContent = msg;
  });

  const optDrive  = document.getElementById('opt-drive');
  const optLocal  = document.getElementById('opt-local');
  const optMd     = document.getElementById('opt-md');
  const optNotion = document.getElementById('opt-notion');
  const notionSettings  = document.getElementById('notion-settings');
  const notionTokenInput = document.getElementById('notion-token');
  const notionPageInput  = document.getElementById('notion-page-id');
  const notionDetail     = document.getElementById('notion-detail');
  const modeHint = document.getElementById('mode-hint');
  const shortcutDisplay = document.getElementById('shortcut-display');
  const shortcutCustomize = document.getElementById('shortcut-customize');

  let currentDest = 'drive';
  let currentMode = 'last';

  const MODE_HINTS = {
    last:   chrome.i18n.getMessage('hintLast') || 'Exports the last AI response',
    full:   chrome.i18n.getMessage('hintFull') || 'Exports the full conversation',
    select: chrome.i18n.getMessage('hintPick') || 'Opens panel to pick responses'
  };

  chrome.storage.local.get(['exportDest', 'defaultExportMode', 'notionToken', 'notionParentPageId'], (d) => {
    currentDest = d.exportDest || 'drive';
    currentMode = d.defaultExportMode || 'last';
    if (d.notionToken)      notionTokenInput.value = d.notionToken;
    if (d.notionParentPageId) notionPageInput.value = d.notionParentPageId;
    _updateNotionDetail(d.notionToken, d.notionParentPageId);
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

  function applyDest() {
    optDrive.classList.toggle('active',  currentDest === 'drive');
    optLocal.classList.toggle('active',  currentDest === 'local');
    optMd.classList.toggle('active',     currentDest === 'markdown');
    optNotion.classList.toggle('active', currentDest === 'notion');
    notionSettings.classList.toggle('visible', currentDest === 'notion');
  }

  function applyMode() {
    document.querySelectorAll('.mode-tab').forEach(b => {
      b.classList.toggle('active', b.dataset.mode === currentMode);
    });
    modeHint.textContent = MODE_HINTS[currentMode] || '';
  }

  [optDrive, optLocal, optMd, optNotion].forEach(opt => {
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

  document.querySelectorAll('.mode-tab').forEach(b => {
    b.addEventListener('click', () => {
      currentMode = b.dataset.mode;
      chrome.storage.local.set({ defaultExportMode: currentMode });
      applyMode();
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
