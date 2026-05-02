// Sandboxed page — cannot use chrome.* APIs.
// Communicates with picker-host.html via postMessage only.

var _pendingToken = null;

function gapiLoadError() {
  document.getElementById('err').style.display = 'block';
  document.getElementById('err').textContent = 'Could not load Google Picker.\nCheck your internet connection.';
  window.parent.postMessage({ type: 'picker-load-error' }, '*');
}

// Signal ready once this script runs (api.js already loaded above it in HTML)
window.parent.postMessage({ type: 'picker-ready' }, '*');

window.addEventListener('message', function(e) {
  if (!e.data) return;
  if (e.data.type === 'show-picker') {
    _pendingToken = e.data.token;
    openPicker(_pendingToken);
  }
});

function openPicker(token) {
  gapi.load('picker', function() {
    var folderView = new google.picker.DocsView(google.picker.ViewId.FOLDERS)
      .setSelectFolderEnabled(true)
      .setIncludeFolders(true);

    var picker = new google.picker.PickerBuilder()
      .setOAuthToken(token)
      .addView(folderView)
      .setTitle('Choose export folder')
      .setCallback(function(data) {
        if (data.action === google.picker.Action.PICKED) {
          var folder = data.docs[0];
          window.parent.postMessage({
            type: 'folder-selected',
            folderId: folder.id,
            folderName: folder.name
          }, '*');
        } else if (data.action === google.picker.Action.CANCEL) {
          window.parent.postMessage({ type: 'picker-cancelled' }, '*');
        }
      })
      .build();

    picker.setVisible(true);
  });
}
