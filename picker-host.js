document.addEventListener('DOMContentLoaded', () => {
  const listEl    = document.getElementById('list');
  const qInput    = document.getElementById('q');
  const btnOk     = document.getElementById('btnOk');
  const btnCancel = document.getElementById('btnCancel');

  let allFolders = [];
  let selId   = '__default__';
  let selName = 'AI Chat Exports';

  // Pre-select whatever is currently saved
  chrome.storage.local.get(['customFolderId', 'customFolderName'], (d) => {
    if (d.customFolderId) {
      selId   = d.customFolderId;
      selName = d.customFolderName || '';
    }
    btnOk.disabled = false;
  });

  loadFolders();

  // ── Auth + folder fetch (runs directly in the extension page so
  //    chrome.identity can show its interactive UI here) ──────────
  async function getToken(interactive) {
    return new Promise((resolve) => {
      chrome.identity.getAuthToken({ interactive }, (token) => {
        if (chrome.runtime.lastError || !token) resolve(null);
        else resolve(token);
      });
    });
  }

  async function loadFolders() {
    showStatus('Loading…');
    listEl.innerHTML = '';
    listEl.appendChild(statusEl('Loading…'));

    // Try silent first, then interactive
    let token = await getToken(false);
    if (!token) token = await getToken(true);

    if (!token) {
      showSignIn();
      return;
    }

    try {
      const q = encodeURIComponent(
        "mimeType='application/vnd.google-apps.folder' and 'root' in parents and trashed=false"
      );
      const res = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)&orderBy=name&pageSize=50`,
        { headers: { Authorization: 'Bearer ' + token } }
      );
      if (res.status === 401) {
        // Stale token — evict and retry once
        await new Promise(r => chrome.identity.removeCachedAuthToken({ token }, r));
        loadFolders();
        return;
      }
      if (!res.ok) throw new Error(`Drive API error (${res.status})`);
      const data = await res.json();
      allFolders = data.files || [];
      render('');
    } catch (e) {
      listEl.innerHTML = '';
      listEl.appendChild(statusEl('Could not load folders: ' + e.message));
    }
  }

  function showSignIn() {
    listEl.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.style.cssText = 'padding:24px 18px;text-align:center';

    const msg = document.createElement('div');
    msg.style.cssText = 'font-size:12px;color:#999;margin-bottom:12px';
    msg.textContent = 'Sign in to Google to pick a folder.';

    const btn = document.createElement('button');
    btn.className = 'btn btn-ok';
    btn.style.cssText = 'display:inline-block';
    btn.textContent = 'Sign in to Google';
    btn.addEventListener('click', loadFolders);

    wrap.appendChild(msg);
    wrap.appendChild(btn);
    listEl.appendChild(wrap);
  }

  function statusEl(text) {
    const d = document.createElement('div');
    d.className = 'status';
    d.textContent = text;
    return d;
  }

  // ── Render folder list ─────────────────────────────────────────
  function render(q) {
    listEl.innerHTML = '';

    // Default option always at top
    listEl.appendChild(makeItem('📂', 'AI Chat Exports', 'Default — auto-created by extension', '__default__'));

    const divider = document.createElement('div');
    divider.className = 'divider';
    listEl.appendChild(divider);

    const filtered = q
      ? allFolders.filter(f => f.name.toLowerCase().includes(q.toLowerCase()))
      : allFolders;

    if (allFolders.length === 0) {
      listEl.appendChild(statusEl('No folders found in Drive root.'));
    } else if (filtered.length === 0) {
      listEl.appendChild(statusEl('No matching folders.'));
    } else {
      filtered.forEach(f => listEl.appendChild(makeItem('📁', f.name, '', f.id)));
    }
  }

  function makeItem(icon, name, sub, id) {
    const div = document.createElement('div');
    div.className = 'item' + (selId === id ? ' sel' : '');

    const iconSpan = document.createElement('span');
    iconSpan.className = 'item-icon';
    iconSpan.textContent = icon;

    const textDiv = document.createElement('div');
    textDiv.style.cssText = 'flex:1;min-width:0';

    const nameDiv = document.createElement('div');
    nameDiv.className = 'item-name';
    nameDiv.textContent = name;
    textDiv.appendChild(nameDiv);

    if (sub) {
      const subDiv = document.createElement('div');
      subDiv.className = 'item-sub';
      subDiv.textContent = sub;
      textDiv.appendChild(subDiv);
    }

    div.appendChild(iconSpan);
    div.appendChild(textDiv);

    div.addEventListener('click', () => {
      selId   = id;
      selName = name;
      listEl.querySelectorAll('.item').forEach(el => el.classList.remove('sel'));
      div.classList.add('sel');
      btnOk.disabled = false;
    });

    return div;
  }

  qInput.addEventListener('input', () => render(qInput.value.trim()));

  // ── Select / Cancel ────────────────────────────────────────────
  btnOk.addEventListener('click', () => {
    const isDefault = selId === '__default__';
    if (isDefault) {
      chrome.storage.local.remove('customFolderId', () => {
        chrome.storage.local.set({ customFolderName: 'AI Chat Exports', pickerState: 'done' }, () => window.close());
      });
    } else {
      chrome.storage.local.set({
        customFolderId: selId,
        customFolderName: selName,
        pickerState: 'done'
      }, () => window.close());
    }
  });

  btnCancel.addEventListener('click', () => {
    chrome.storage.local.set({ pickerState: 'cancelled' }, () => window.close());
  });
});
