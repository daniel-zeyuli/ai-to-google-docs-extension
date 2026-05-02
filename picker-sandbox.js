// Sandboxed page — cannot use chrome.* APIs.
// Communicates with picker-host.html via postMessage only.

// api.js loads before this script (HTML order). If it failed, gapi is undefined.
if (typeof gapi === 'undefined') {
  window.parent.postMessage({ type: 'picker-load-error' }, '*');
} else {
  window.parent.postMessage({ type: 'picker-ready' }, '*');
}

window.addEventListener('message', function(e) {
  if (!e.data) return;
  if (e.data.type === 'show-picker') openPicker(e.data.token);
});

function openPicker(token) {
  if (typeof gapi === 'undefined') {
    window.parent.postMessage({ type: 'picker-load-error' }, '*');
    return;
  }
  gapi.load('picker', function() {
    var folderView = new google.picker.DocsView(google.picker.ViewId.FOLDERS)
      .setSelectFolderEnabled(true)
      .setIncludeFolders(true)
      .setMode(google.picker.DocsViewMode.LIST);

    var picker = new google.picker.PickerBuilder()
      .setOAuthToken(token)
      .setDeveloperKey('AIzaSyCGZjDDRW6e6ogByzjwduNYC3XiQVBEpjY')
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
