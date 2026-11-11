document.querySelectorAll('[data-i18n]').forEach(el => {
  const msg = chrome.i18n.getMessage(el.dataset.i18n);
  if (msg) el.textContent = msg;
});
