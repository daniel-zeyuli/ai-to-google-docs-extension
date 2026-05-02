document.addEventListener('DOMContentLoaded', () => {
  const frame     = document.getElementById('pickerFrame');
  const status    = document.getElementById('status');
  const btnCancel = document.getElementById('btnCancel');

  let token        = null;
  let sandboxReady = false;
  let _done        = false;

  // Pre-auth was done by background before this window opened → use cached token only
  chrome.identity.getAuthToken({ interactive: false }, (t) => {
    if (chrome.runtime.lastError || !t) {
      showStatus('Not signed in. Close this window and try again.', true);
      return;
    }
    token = t;
    if (sandboxReady) sendToSandbox();
  });

  window.addEventListener('message', (e) => {
    if (e.source !== frame.contentWindow) return;
    const { type, folderId, folderName } = e.data || {};

    if (type === 'picker-ready') {
      sandboxReady = true;
      showStatus('');
      if (token) sendToSandbox();
    }

    if (type === 'picker-load-error') {
      showStatus('Could not load Google Picker.\nCheck your internet connection.', true);
    }

    if (type === 'folder-selected') {
      _done = true;
      chrome.storage.local.set(
        { customFolderId: folderId, customFolderName: folderName, pickerState: 'done' },
        () => window.close()
      );
    }

    if (type === 'picker-cancelled') {
      _done = true;
      chrome.storage.local.set({ pickerState: 'cancelled' }, () => window.close());
    }
  });

  function sendToSandbox() {
    frame.contentWindow.postMessage({ type: 'show-picker', token }, '*');
  }

  function showStatus(msg, isError = false) {
    status.textContent = msg;
    status.className = isError ? 'error' : '';
  }

  btnCancel.addEventListener('click', () => {
    _done = true;
    chrome.storage.local.set({ pickerState: 'cancelled' }, () => window.close());
  });

  // OS ✕ close button — signal cancelled so _pickDriveFolder doesn't hang
  window.addEventListener('beforeunload', () => {
    if (!_done) chrome.storage.local.set({ pickerState: 'cancelled' });
  });
});
