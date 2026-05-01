document.addEventListener('DOMContentLoaded', () => {
  const listEl    = document.getElementById('list');
  const qInput    = document.getElementById('q');
  const btnOk     = document.getElementById('btnOk');
  const btnCancel = document.getElementById('btnCancel');
  const newArea   = document.getElementById('newArea');
  const newInput  = document.getElementById('newInput');
  const btnCreate = document.getElementById('btnCreate');

  const TAB_QUERIES = {
    recent:  { q: "mimeType='application/vnd.google-apps.folder' and trashed=false", orderBy: 'viewedByMeTime desc,name' },
    starred: { q: "mimeType='application/vnd.google-apps.folder' and starred=true and trashed=false", orderBy: 'name' },
    all:     { q: "mimeType='application/vnd.google-apps.folder' and trashed=false", orderBy: 'name' }
  };

  let tabFolders = { recent: null, starred: null, all: null };
  let activeTab  = 'recent';
  let selId   = '__default__';
  let selName = 'AI Chat Exports';
  let token   = null;

  chrome.storage.local.get(['customFolderId', 'customFolderName'], (d) => {
    if (d.customFolderId) { selId = d.customFolderId; selName = d.customFolderName || ''; }
    btnOk.disabled = false;
    loadTab('recent');
  });

  // ── Tab switching ──
  document.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => {
      activeTab = btn.dataset.tab;
      document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t === btn));
      qInput.value = '';
      if (tabFolders[activeTab] !== null) {
        render(tabFolders[activeTab], '');
      } else {
        loadTab(activeTab);
      }
    });
  });

  // ── Auth: pre-auth done by background before this window opened ──
  async function getCachedToken() {
    return new Promise((resolve) => {
      chrome.identity.getAuthToken({ interactive: false }, (t) => {
        resolve((chrome.runtime.lastError || !t) ? null : t);
      });
    });
  }

  async function loadTab(tab) {
    setStatus('Loading…');
    if (!token) token = await getCachedToken();
    if (!token) {
      setStatus('Not signed in. Close this window and try again.');
      return;
    }
    const { q, orderBy } = TAB_QUERIES[tab];
    try {
      const url = `https://www.googleapis.com/drive/v3/files` +
        `?q=${encodeURIComponent(q)}&fields=files(id,name)&orderBy=${encodeURIComponent(orderBy)}&pageSize=100`;
      const res = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
      if (res.status === 401) {
        await new Promise(r => chrome.identity.removeCachedAuthToken({ token }, r));
        token = null;
        setStatus('Session expired. Close this window and try again.');
        return;
      }
      if (!res.ok) throw new Error(`Drive API error ${res.status}`);
      const data = await res.json();
      tabFolders[tab] = data.files || [];
      render(tabFolders[tab], qInput.value.trim());
    } catch (e) {
      setStatus('Error: ' + e.message);
    }
  }

  function setStatus(text) {
    listEl.innerHTML = `<div class="status">${text}</div>`;
  }

  // ── Folder list ──
  function render(folders, q) {
    listEl.innerHTML = '';
    // Default option always pinned at top
    listEl.appendChild(makeItem('📂', 'AI Chat Exports', 'Default — auto-created by extension', '__default__'));
    const hr = document.createElement('div'); hr.className = 'divider'; listEl.appendChild(hr);

    const hits = q ? folders.filter(f => f.name.toLowerCase().includes(q.toLowerCase())) : folders;
    if (folders.length === 0) {
      listEl.appendChild(mkStatus(activeTab === 'starred' ? 'No starred folders.' : 'No folders found.'));
    } else if (hits.length === 0) {
      listEl.appendChild(mkStatus('No matching folders.'));
    } else {
      hits.forEach(f => listEl.appendChild(makeItem('📁', f.name, '', f.id)));
    }
  }

  function mkStatus(text) {
    const d = document.createElement('div'); d.className = 'status'; d.textContent = text; return d;
  }

  function makeItem(icon, name, sub, id) {
    const div = document.createElement('div');
    div.className = 'item' + (selId === id ? ' sel' : '');

    const ic = document.createElement('span'); ic.className = 'item-icon'; ic.textContent = icon;
    const body = document.createElement('div'); body.className = 'item-body';
    const nm = document.createElement('div'); nm.className = 'item-name'; nm.textContent = name;
    body.appendChild(nm);
    if (sub) { const sb = document.createElement('div'); sb.className = 'item-sub'; sb.textContent = sub; body.appendChild(sb); }
    div.appendChild(ic); div.appendChild(body);

    div.addEventListener('click', () => {
      selId = id; selName = name;
      listEl.querySelectorAll('.item').forEach(el => el.classList.remove('sel'));
      div.classList.add('sel');
      btnOk.disabled = false;
    });
    return div;
  }

  qInput.addEventListener('input', () => {
    const folders = tabFolders[activeTab];
    if (folders !== null) render(folders, qInput.value.trim());
  });

  // ── New folder ──
  document.getElementById('btnNewFolder').addEventListener('click', () => {
    const open = newArea.style.display === 'flex';
    newArea.style.display = open ? 'none' : 'flex';
    if (!open) newInput.focus();
  });

  btnCreate.addEventListener('click', createFolder);
  newInput.addEventListener('keydown', e => { if (e.key === 'Enter') createFolder(); });

  async function createFolder() {
    const name = newInput.value.trim();
    if (!name) return;
    btnCreate.disabled = true; btnCreate.textContent = 'Creating…';
    try {
      if (!token) token = await getCachedToken();
      const res = await fetch('https://www.googleapis.com/drive/v3/files?fields=id,name', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder' })
      });
      if (!res.ok) throw new Error(`Drive API error ${res.status}`);
      const folder = await res.json();
      // Insert into all cached tabs
      ['recent', 'all'].forEach(tab => {
        if (tabFolders[tab]) tabFolders[tab] = [folder, ...tabFolders[tab]];
      });
      selId = folder.id; selName = folder.name;
      newInput.value = ''; newArea.style.display = 'none';
      render(tabFolders[activeTab] || [folder], qInput.value.trim());
      btnOk.disabled = false;
    } catch (e) {
      alert('Could not create folder: ' + e.message);
    }
    btnCreate.disabled = false; btnCreate.textContent = 'Create';
  }

  // ── Select / Cancel ──
  btnOk.addEventListener('click', () => {
    if (selId === '__default__') {
      chrome.storage.local.remove('customFolderId', () =>
        chrome.storage.local.set({ customFolderName: 'AI Chat Exports', pickerState: 'done' }, () => window.close())
      );
    } else {
      chrome.storage.local.set({ customFolderId: selId, customFolderName: selName, pickerState: 'done' }, () => window.close());
    }
  });

  btnCancel.addEventListener('click', () =>
    chrome.storage.local.set({ pickerState: 'cancelled' }, () => window.close())
  );
});
