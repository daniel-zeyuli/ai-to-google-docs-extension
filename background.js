/**
 * Background Service Worker
 * Handles Google OAuth, Drive upload, Docs append, and keyboard shortcuts
 */

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'uploadToDrive') {
    handleUpload(request.docxBase64, request.filename, request.platform, request.docTitle)
      .then(result => sendResponse(result))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (request.action === 'appendToDoc') {
    appendContent(request.fileId, request.text)
      .then(result => sendResponse(result))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (request.action === 'checkAuth') {
    getAuthToken(false)
      .then(token => sendResponse({ authenticated: !!token }))
      .catch(() => sendResponse({ authenticated: false }));
    return true;
  }

  if (request.action === 'fetchImage') {
    fetchImageAsBase64(request.url)
      .then(result => sendResponse(result))
      .catch(() => sendResponse({ success: false }));
    return true;
  }

  if (request.action === 'downloadLocal') {
    const { docxBase64, filename, mime } = request;
    const m = mime || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    const url = 'data:' + m + ';base64,' + docxBase64;
    chrome.downloads.download({ url, filename, saveAs: true }, () => {
      if (chrome.runtime.lastError) {
        sendResponse({ success: false, error: chrome.runtime.lastError.message });
      } else {
        sendResponse({ success: true });
      }
    });
    return true;
  }

  if (request.action === 'ensureAuth') {
    getAuthToken(true)
      .then(token => sendResponse({ ok: !!token }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }

});

// ── Context menu: export selected text ──
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'cgd-export-selection',
    title: 'Export to Docs',
    contexts: ['selection']
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'cgd-export-selection' && tab?.id) {
    chrome.tabs.sendMessage(tab.id, { action: 'exportSelection' }, () => {
      void chrome.runtime.lastError;
    });
  }
});

// ── Keyboard shortcut: forward to active tab's content script ──
chrome.commands.onCommand.addListener((command) => {
  if (command === 'trigger-export') {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (tab) chrome.tabs.sendMessage(tab.id, { action: 'triggerDefault' }, () => {
        void chrome.runtime.lastError; // suppress "no receiver" error if not on AI page
      });
    });
  }
});

// ── Auth helpers ──
function getAuthToken(interactive = true) {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive }, (token) => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(token);
    });
  });
}

function removeCachedToken(token) {
  return new Promise((resolve) => {
    chrome.identity.removeCachedAuthToken({ token }, resolve);
  });
}

// ── Fetch image via background worker (bypasses content script CORS) ──
async function fetchImageAsBase64(url) {
  try {
    const resp = await fetch(url, { credentials: 'include' });
    if (!resp.ok) return { success: false };
    const blob = await resp.blob();
    const bitmap = await createImageBitmap(blob);
    const maxPx = 1200;
    let w = bitmap.width, h = bitmap.height;
    if (!w || !h) { bitmap.close(); return { success: false }; }
    if (w > maxPx) { h = Math.round(h * maxPx / w); w = maxPx; }
    const canvas = new OffscreenCanvas(w, h);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    const pngBlob = await canvas.convertToBlob({ type: 'image/png' });
    const buffer = await pngBlob.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i += 8192) {
      binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + 8192, bytes.length)));
    }
    return { success: true, base64: btoa(binary), w, h };
  } catch (_) {
    return { success: false };
  }
}

// ── Folder layout: AI Chat Exports/<Platform>/ ──
// Returns the platform-specific subfolder ID (or the parent folder ID if no platform / subfolder fails).
async function getOrCreateExportFolder(token, platform) {
  try {
    // Legacy cleanup: drop customFolderId from pre-v1.0 versions (folder picker removed in Path A).
    await chrome.storage.local.remove(['customFolderId', 'customFolderName']);

    const parentId = await _getOrCreateFolder(token, 'AI Chat Exports', null, 'exportFolderId');
    if (!parentId) return null;
    if (!platform) return parentId;

    const stored = await chrome.storage.local.get('exportFolderIds');
    const subIds = stored.exportFolderIds || {};
    let subId = subIds[platform];

    if (subId) {
      const check = await fetch(
        `https://www.googleapis.com/drive/v3/files/${subId}?fields=id,trashed`,
        { headers: { 'Authorization': 'Bearer ' + token } }
      );
      if (check.ok) {
        const data = await check.json();
        if (!data.trashed) return subId;
      }
      delete subIds[platform];
      await chrome.storage.local.set({ exportFolderIds: subIds });
    }

    const res = await fetch('https://www.googleapis.com/drive/v3/files?fields=id', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: platform,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parentId]
      })
    });
    if (!res.ok) return parentId; // fallback: drop into the AI Chat Exports parent
    const { id } = await res.json();
    subIds[platform] = id;
    await chrome.storage.local.set({ exportFolderIds: subIds });
    return id;
  } catch {
    return null; // never block an export over folder issues
  }
}

async function _getOrCreateFolder(token, name, parentId, storageKey) {
  const stored = await chrome.storage.local.get(storageKey);
  const existing = stored[storageKey];
  if (existing) {
    const check = await fetch(
      `https://www.googleapis.com/drive/v3/files/${existing}?fields=id,trashed`,
      { headers: { 'Authorization': 'Bearer ' + token } }
    );
    if (check.ok) {
      const data = await check.json();
      if (!data.trashed) return existing;
    }
    await chrome.storage.local.remove(storageKey);
  }
  const body = { name, mimeType: 'application/vnd.google-apps.folder' };
  if (parentId) body.parents = [parentId];
  const res = await fetch('https://www.googleapis.com/drive/v3/files?fields=id', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) return null;
  const { id } = await res.json();
  await chrome.storage.local.set({ [storageKey]: id });
  return id;
}

// ── Drive upload ──
async function handleUpload(docxBase64, filename, platform, docTitle) {
  let token;
  try {
    token = await getAuthToken(true);
  } catch (e) {
    const msg = e.message || '';
    if (msg.includes('not signed in') || msg.includes('not sign in')) {
      throw new Error('sign-in: Not signed into Chrome. Please sign in to your Google account in Chrome settings.');
    }
    if (msg.includes('invalid_client') || msg.includes('client_id')) {
      throw new Error('invalid_client: OAuth client ID mismatch. Check Google Cloud Console.');
    }
    if (msg.includes('OAuth2 not granted') || msg.includes('not granted')) {
      throw new Error('sign-in: Drive access was denied. Please allow access when prompted.');
    }
    throw new Error('sign-in: ' + msg);
  }

  if (!token) throw new Error('No auth token received. Please try again.');

  const binaryString = atob(docxBase64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);

  const MAX_BYTES = 5 * 1024 * 1024;
  if (bytes.length > MAX_BYTES) {
    throw new Error(
      `Export too large (${(bytes.length / 1024 / 1024).toFixed(1)} MB). ` +
      'Google Drive multipart uploads are limited to 5 MB. Try exporting a shorter message.'
    );
  }

  // Get or create "AI Chat Exports" folder
  const folderId = await getOrCreateExportFolder(token, platform);

  const metadata = {
    name: docTitle || filename.replace('.docx', ''),
    mimeType: 'application/vnd.google-apps.document',
    ...(folderId ? { parents: [folderId] } : {})
  };

  const boundary = 'chatgpt_export_boundary_' + Date.now();
  const body = buildMultipartBody(boundary, metadata, bytes);

  let response;
  try {
    response = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink',
      {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'multipart/related; boundary=' + boundary
        },
        body
      }
    );
  } catch (e) {
    throw new Error('Network error uploading to Drive: ' + e.message);
  }

  if (response.status === 401) {
    await removeCachedToken(token);
    token = await getAuthToken(true);
    response = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink',
      {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'multipart/related; boundary=' + boundary
        },
        body
      }
    );
  }

  if (!response.ok) {
    const errText = await response.text();
    let reason = '';
    try { reason = JSON.parse(errText)?.error?.errors?.[0]?.reason || ''; } catch {}
    if (reason === 'storageQuotaExceeded') {
      throw new Error('Your Google Drive storage is full. Free up space and try again.');
    } else if (reason === 'userRateLimitExceeded' || reason === 'rateLimitExceeded') {
      throw new Error('Google Drive rate limit reached. Please wait a minute and try again.');
    } else {
      let msg = '';
      try { msg = JSON.parse(errText)?.error?.message || errText; } catch { msg = errText; }
      throw new Error(`Drive API error (${response.status}): ${msg}`);
    }
  }

  const result = await response.json();
  return {
    success: true,
    fileId: result.id,
    fileName: result.name,
    url: result.webViewLink || ('https://docs.google.com/document/d/' + result.id + '/edit')
  };
}

// ── Docs API: append formatted text to existing Google Doc ──
async function appendContent(fileId, text) {
  let token;
  try { token = await getAuthToken(true); }
  catch (e) { throw new Error('Sign-in failed: ' + e.message); }

  const now = new Date();
  const dateStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  const separator = '\n\n────────────────────────────────────────\n\nAdded ' + dateStr + '\n\n';

  // GET document endIndex so insertText + updateTextStyle indices are exact.
  let insertStart = null;
  try {
    const getResp = await fetch(
      `https://docs.googleapis.com/v1/documents/${fileId}?fields=body.content`,
      { headers: { 'Authorization': 'Bearer ' + token } }
    );
    if (getResp.ok) {
      const doc = await getResp.json();
      const content = doc?.body?.content;
      if (content && content.length > 0) {
        insertStart = content[content.length - 1].endIndex - 1;
      }
    }
  } catch (_) { /* fallback below */ }

  let requests;
  if (insertStart !== null && insertStart >= 0) {
    const { plainText, formats } = markdownToDocsRuns(text);
    const fullText = separator + plainText;
    const contentOffset = insertStart + separator.length;
    requests = [
      { insertText: { location: { index: insertStart }, text: fullText } }
    ];
    for (const fmt of formats) {
      const s = contentOffset + fmt.start;
      const e = contentOffset + fmt.end;
      if (s >= e) continue;
      if (fmt.type === 'bold') {
        requests.push({ updateTextStyle: { range: { startIndex: s, endIndex: e }, textStyle: { bold: true }, fields: 'bold' } });
      } else if (fmt.type === 'italic') {
        requests.push({ updateTextStyle: { range: { startIndex: s, endIndex: e }, textStyle: { italic: true }, fields: 'italic' } });
      } else if (fmt.type === 'heading') {
        requests.push({ updateParagraphStyle: { range: { startIndex: s, endIndex: e }, paragraphStyle: { namedStyleType: 'HEADING_' + fmt.level }, fields: 'namedStyleType' } });
      }
    }
  } else {
    // Fallback: plain text insertion (no formatting).
    requests = [{ insertText: { endOfSegmentLocation: { segmentId: '' }, text: separator + text } }];
  }

  const docsRequest = async (tok) => fetch(
    `https://docs.googleapis.com/v1/documents/${fileId}:batchUpdate`,
    {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + tok, 'Content-Type': 'application/json' },
      body: JSON.stringify({ requests })
    }
  );

  let response = await docsRequest(token);

  if (response.status === 401) {
    await removeCachedToken(token);
    token = await getAuthToken(true);
    response = await docsRequest(token);
  }

  if (!response.ok) {
    const errText = await response.text();
    if (response.status === 403) {
      throw new Error('Google Docs API not enabled. Go to console.cloud.google.com → APIs → enable "Google Docs API".');
    }
    let msg = errText;
    try { msg = JSON.parse(errText)?.error?.message || errText; } catch {}
    throw new Error(`Docs API error (${response.status}): ${msg}`);
  }

  return { success: true };
}

// ── Convert markdown to plain text + Docs API format ranges ──
function markdownToDocsRuns(markdown) {
  const cleaned = markdown.replace(/\[\[IMG:\d+\]\]/g, '').replace(/\n{3,}/g, '\n\n');
  const lines = cleaned.split('\n');
  let plainText = '';
  const formats = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Code block
    if (line.startsWith('```')) {
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) {
        plainText += '    ' + lines[i] + '\n';
        i++;
      }
      continue;
    }

    // Heading
    const hm = line.match(/^(#{1,6})\s+(.+)$/);
    if (hm) {
      const hStart = plainText.length;
      const { plain, fmts } = parseInlineRuns(hm[2], hStart);
      plainText += plain + '\n';
      formats.push({ type: 'heading', level: hm[1].length, start: hStart, end: plainText.length });
      formats.push(...fmts);
      continue;
    }

    // Empty line
    if (!line.trim()) { plainText += '\n'; continue; }

    // Unordered list item
    const ulm = line.match(/^[-*+]\s+(.+)$/);
    if (ulm) {
      const lStart = plainText.length;
      plainText += '• ';
      const { plain, fmts } = parseInlineRuns(ulm[1], lStart + 2);
      plainText += plain + '\n';
      formats.push(...fmts);
      continue;
    }

    // Ordered list item
    const olm = line.match(/^(\d+\.)\s+(.+)$/);
    if (olm) {
      const prefix = olm[1] + ' ';
      const lStart = plainText.length;
      plainText += prefix;
      const { plain, fmts } = parseInlineRuns(olm[2], lStart + prefix.length);
      plainText += plain + '\n';
      formats.push(...fmts);
      continue;
    }

    // Normal paragraph line
    const lStart = plainText.length;
    const { plain, fmts } = parseInlineRuns(line, lStart);
    plainText += plain + '\n';
    formats.push(...fmts);
  }

  return { plainText, formats };
}

// ── Parse inline bold/italic/code, return stripped plain text + absolute format ranges ──
function parseInlineRuns(text, basePos) {
  const parts = [];
  const fmts = [];
  const regex = /(\*\*\*[\s\S]+?\*\*\*|\*\*[\s\S]+?\*\*|\*(?!\*|\s)[\s\S]+?(?<!\s|\*)\*(?!\*)|`[^`\n]+`)/g;
  let lastIndex = 0;
  let pos = 0;
  let m;
  while ((m = regex.exec(text)) !== null) {
    const before = text.slice(lastIndex, m.index);
    parts.push(before);
    pos += before.length;
    const raw = m[0];
    if (raw.startsWith('***')) {
      const inner = raw.slice(3, -3);
      const s = basePos + pos, e = s + inner.length;
      parts.push(inner);
      fmts.push({ type: 'bold', start: s, end: e });
      fmts.push({ type: 'italic', start: s, end: e });
      pos += inner.length;
    } else if (raw.startsWith('**')) {
      const inner = raw.slice(2, -2);
      const s = basePos + pos, e = s + inner.length;
      parts.push(inner);
      fmts.push({ type: 'bold', start: s, end: e });
      pos += inner.length;
    } else if (raw.startsWith('`')) {
      const inner = raw.slice(1, -1);
      parts.push(inner);
      pos += inner.length;
    } else {
      const inner = raw.slice(1, -1);
      const s = basePos + pos, e = s + inner.length;
      parts.push(inner);
      fmts.push({ type: 'italic', start: s, end: e });
      pos += inner.length;
    }
    lastIndex = m.index + raw.length;
  }
  parts.push(text.slice(lastIndex));
  return { plain: parts.join(''), fmts };
}

// ── Build multipart body for Drive upload ──
function buildMultipartBody(boundary, metadata, fileBytes) {
  const encoder = new TextEncoder();
  const metadataPart = encoder.encode(
    '--' + boundary + '\r\n' +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) + '\r\n'
  );
  const fileHeader = encoder.encode(
    '--' + boundary + '\r\n' +
    'Content-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document\r\n' +
    'Content-Transfer-Encoding: binary\r\n\r\n'
  );
  const fileFooter = encoder.encode('\r\n--' + boundary + '--');

  const totalLength = metadataPart.length + fileHeader.length + fileBytes.length + fileFooter.length;
  const body = new Uint8Array(totalLength);
  let offset = 0;
  body.set(metadataPart, offset); offset += metadataPart.length;
  body.set(fileHeader, offset);   offset += fileHeader.length;
  body.set(fileBytes, offset);    offset += fileBytes.length;
  body.set(fileFooter, offset);
  return body;
}
