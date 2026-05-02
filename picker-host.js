document.addEventListener('DOMContentLoaded', () => {
  const listEl         = document.getElementById('list');
  const qInput         = document.getElementById('q');
  const btnOk          = document.getElementById('btnOk');
  const btnCancel      = document.getElementById('btnCancel');
  const newArea        = document.getElementById('newArea');
  const newInput       = document.getElementById('newInput');
  const btnCreate      = document.getElementById('btnCreate');
  const breadcrumb     = document.getElementById('breadcrumb');
  const breadcrumbPath = document.getElementById('breadcrumbPath');
  const btnBack        = document.getElementById('btnBack');

  const TAB_QUERIES = {
    recent:  { q: "mimeType='application/vnd.google-apps.folder' and trashed=false", orderBy: 'viewedByMeTime desc,name' },
    starred: { q: "mimeType='application/vnd.google-apps.folder' and starred=true and trashed=false", orderBy: 'name' },
  };

  let tabFolders     = { recent: null, starred: null };
  let activeTab      = 'recent';
  let selId          = '__default__';
  let selName        = 'AI Chat Exports';
  let token          = null;
  let navStack       = [{ id: 'root', name: 'My Drive' }];
  let allFolderCache = {};  // { parentId: [folders] }

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

      if (activeTab === 'all') {
        navStack = [{ id: 'root', name: 'My Drive' }];
        updateBreadcrumb();
        const parentId = navStack[0].id;
        if (allFolderCache[parentId]) {
          renderAll(allFolderCache[parentId], '');
        } else {
          loadAllFolders(parentId);
        }
      } else {
        breadcrumb.classList.remove('visible');
        if (tabFolders[activeTab] !== null) {
          render(tabFolders[activeTab], '');
        } else {
          loadTab(activeTab);
        }
      }
    });
  });

  // ── Back button (All folders tab) ──
  btnBack.addEventListener('click', () => {
    if (navStack.length > 1) {
      navStack.pop();
      updateBreadcrumb();
      qInput.value = '';
      const parentId = navStack[navStack.length - 1].id;
      if (allFolderCache[parentId]) {
        renderAll(allFolderCache[parentId], '');
      } else {
        loadAllFolders(parentId);
      }
    }
  });

  function updateBreadcrumb() {
    if (activeTab !== 'all' || navStack.length <= 1) {
      breadcrumb.classList.remove('visible');
      return;
    }
    breadcrumb.classList.add('visible');
    breadcrumbPath.textContent = navStack.map(n => n.name).join(' / ');
  }

  // ── Auth ──
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
    if (!token) { setStatus('Not signed in. Close this window and try again.'); return; }

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

  async function loadAllFolders(parentId) {
    setStatus('Loading…');
    if (!token) token = await getCachedToken();
    if (!token) { setStatus('Not signed in. Close this window and try again.'); return; }

    const parentFilter = parentId === 'root' ? `'root' in parents` : `'${parentId}' in parents`;
    const q = `${parentFilter} and mimeType='application/vnd.google-apps.folder' and trashed=false`;

    try {
      const url = `https://www.googleapis.com/drive/v3/files` +
        `?q=${encodeURIComponent(q)}&fields=files(id,name)&orderBy=name&pageSize=100`;
      const res = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
      if (res.status === 401) {
        await new Promise(r => chrome.identity.removeCachedAuthToken({ token }, r));
        token = null;
        setStatus('Session expired. Close this window and try again.');
        return;
      }
      if (!res.ok) throw new Error(`Drive API error ${res.status}`);
      const data = await res.json();
      allFolderCache[parentId] = data.files || [];
      renderAll(allFolderCache[parentId], qInput.value.trim());
    } catch (e) {
      setStatus('Error: ' + e.message);
    }
  }

  function setStatus(text) {
    listEl.innerHTML = `<div class="status">${text}</div>`;
  }

  // ── Flat render: Recent / Starred tabs ──
  function render(folders, q) {
    listEl.innerHTML = '';
    listEl.appendChild(makeItem('📂', 'AI Chat Exports', 'Default — auto-created by extension', '__default__', false));
    const hr = document.createElement('div'); hr.className = 'divider'; listEl.appendChild(hr);

    const hits = q ? folders.filter(f => f.name.toLowerCase().includes(q.toLowerCase())) : folders;
    if (folders.length === 0) {
      const msg = activeTab === 'starred'
        ? 'Star folders in Google Drive to see them here.'
        : 'No folders found.';
      listEl.appendChild(mkStatus(msg));
    } else if (hits.length === 0) {
      listEl.appendChild(mkStatus('No matching folders.'));
    } else {
      hits.forEach(f => listEl.appendChild(makeItem('📁', f.name, '', f.id, false)));
    }
  }

  // ── Hierarchical render: All folders tab ──
  function renderAll(folders, q) {
    listEl.innerHTML = '';

    if (navStack.length === 1) {
      listEl.appendChild(makeItem('📂', 'AI Chat Exports', 'Default — auto-created by extension', '__default__', false));
      const hr = document.createElement('div'); hr.className = 'divider'; listEl.appendChild(hr);
    }

    const hits = q ? folders.filter(f => f.name.toLowerCase().includes(q.toLowerCase())) : folders;
    if (folders.length === 0) {
      listEl.appendChild(mkStatus(navStack.length === 1 ? 'No folders in My Drive.' : 'No subfolders here.'));
    } else if (hits.length === 0) {
      listEl.appendChild(mkStatus('No matching folders.'));
    } else {
      hits.forEach(f => listEl.appendChild(makeItem('📁', f.name, '', f.id, true)));
    }
  }

  function mkStatus(text) {
    const d = document.createElement('div');
    d.className = 'status';
    d.textContent = text;
    return d;
  }

  function makeItem(icon, name, sub, id, showNavArrow) {
    const div = document.createElement('div');
    div.className = 'item' + (selId === id ? ' sel' : '');

    const ic = document.createElement('span'); ic.className = 'item-icon'; ic.textContent = icon;
    const body = document.createElement('div'); body.className = 'item-body';
    const nm = document.createElement('div'); nm.className = 'item-name'; nm.textContent = name;
    body.appendChild(nm);
    if (sub) {
      const sb = document.createElement('div'); sb.className = 'item-sub'; sb.textContent = sub;
      body.appendChild(sb);
    }
    div.appendChild(ic);
    div.appendChild(body);

    div.addEventListener('click', (e) => {
      if (e.target.closest('.nav-arrow')) return;
      selId = id; selName = name;
      listEl.querySelectorAll('.item').forEach(el => el.classList.remove('sel'));
      div.classList.add('sel');
      btnOk.disabled = false;
    });

    if (showNavArrow && id !== '__default__') {
      const arrow = document.createElement('button');
      arrow.className = 'nav-arrow';
      arrow.textContent = '›';
      arrow.title = `Open ${name}`;
      arrow.addEventListener('click', (e) => {
        e.stopPropagation();
        navStack.push({ id, name });
        updateBreadcrumb();
        qInput.value = '';
        if (allFolderCache[id]) {
          renderAll(allFolderCache[id], '');
        } else {
          loadAllFolders(id);
        }
      });
      div.appendChild(arrow);
    }

    return div;
  }

  qInput.addEventListener('input', () => {
    const q = qInput.value.trim();
    if (activeTab === 'all') {
      const parentId = navStack[navStack.length - 1].id;
      const folders = allFolderCache[parentId];
      if (folders !== undefined) renderAll(folders, q);
    } else {
      const folders = tabFolders[activeTab];
      if (folders !== null) render(folders, q);
    }
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

      const body = { name, mimeType: 'application/vnd.google-apps.folder' };
      // If drilled into a subfolder in All tab, create inside it
      if (activeTab === 'all' && navStack.length > 1) {
        body.parents = [navStack[navStack.length - 1].id];
      }

      const res = await fetch('https://www.googleapis.com/drive/v3/files?fields=id,name', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (!res.ok) throw new Error(`Drive API error ${res.status}`);
      const folder = await res.json();

      // Prepend into relevant caches
      const allCacheKey = navStack[navStack.length - 1].id;
      if (activeTab === 'all') {
        if (allFolderCache[allCacheKey]) allFolderCache[allCacheKey] = [folder, ...allFolderCache[allCacheKey]];
        if (tabFolders.recent) tabFolders.recent = [folder, ...tabFolders.recent];
      } else {
        if (tabFolders.recent) tabFolders.recent = [folder, ...tabFolders.recent];
      }

      selId = folder.id; selName = folder.name;
      newInput.value = ''; newArea.style.display = 'none';

      if (activeTab === 'all') {
        renderAll(allFolderCache[allCacheKey] || [folder], qInput.value.trim());
      } else {
        render(tabFolders[activeTab] || [folder], qInput.value.trim());
      }
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

  // If user closes the window via the OS ✕ button (no Cancel click), still signal cancelled
  // so _pickDriveFolder doesn't hang waiting for the 2-minute timeout.
  let _pickerDone = false;
  btnOk.addEventListener('click', () => { _pickerDone = true; }, true);
  btnCancel.addEventListener('click', () => { _pickerDone = true; }, true);
  window.addEventListener('beforeunload', () => {
    if (!_pickerDone) chrome.storage.local.set({ pickerState: 'cancelled' });
  });
});
