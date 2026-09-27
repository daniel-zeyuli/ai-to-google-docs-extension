/**
 * AI Chat Exporter — Content Script
 * Supports ChatGPT, Gemini, and Claude.
 */

(function() {
  'use strict';

  const BUTTON_CLASS = 'cgd-export-btn';
  const BANNER_CLASS = 'cgd-toast';

  // Detect platform
  const isGemini = location.hostname.includes('gemini.google.com');
  const isChatGPT = location.hostname.includes('chatgpt.com') || location.hostname.includes('chat.openai.com');
  const isClaude = location.hostname.includes('claude.ai');
  const isDeepSeek = location.hostname.includes('chat.deepseek.com');
  const isPerplexity = location.hostname.includes('perplexity.ai');

  const DRIVE_ICON_SVG = `<svg width="15" height="13" viewBox="0 0 87.3 78" xmlns="http://www.w3.org/2000/svg" style="flex-shrink:0;display:inline-block;vertical-align:text-bottom"><path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066DA"/><path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0-1.2 4.5h27.5z" fill="#00AC47"/><path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" fill="#EA4335"/><path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832D"/><path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684FC"/><path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#FFBA00"/></svg>`;
  const DOCX_ICON_SVG = `<svg width="13" height="13" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="flex-shrink:0;display:inline-block;vertical-align:text-bottom"><rect x="2" y="1" width="20" height="22" rx="2" fill="#2B579A"/><path d="M7 9.5l1.5 5 1.5-3.5 1.5 3.5 1.5-5" stroke="white" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>`;
  const MARKDOWN_ICON_SVG = `<svg width="15" height="13" viewBox="0 0 208 128" xmlns="http://www.w3.org/2000/svg" style="flex-shrink:0;display:inline-block;vertical-align:text-bottom"><rect x="4" y="4" width="200" height="120" rx="10" fill="none" stroke="currentColor" stroke-width="8"/><path d="M30 94V34h18l18 23 18-23h18v60H82V63L66 84 50 63v31zM145 94l-28-30h18V34h20v30h18z" fill="currentColor"/></svg>`;

  let exportDest = 'drive';
  chrome.storage.local.get('exportDest', d => { exportDest = d.exportDest || 'drive'; });

  // Update all injected export buttons when destination changes
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.exportDest) {
      exportDest = changes.exportDest.newValue || 'drive';
      document.querySelectorAll('.' + BUTTON_CLASS).forEach(btn => _updateExportBtnContent(btn));
    }
  });

  function isDarkMode() {
    const root = document.documentElement;
    const body = document.body;
    if (root.classList.contains('dark') || body.classList.contains('dark')) return true;
    if (root.getAttribute('data-theme') === 'dark' || body.getAttribute('data-theme') === 'dark') return true;
    if (root.getAttribute('data-color-scheme') === 'dark' || root.getAttribute('data-color-mode') === 'dark') return true;
    if (window.matchMedia('(prefers-color-scheme: dark)').matches) return true;
    // Fallback: measure body background luminance
    const bg = window.getComputedStyle(body).backgroundColor;
    const rgb = bg.match(/\d+/g);
    if (rgb && rgb.length >= 3) {
      const lum = (0.299 * +rgb[0] + 0.587 * +rgb[1] + 0.114 * +rgb[2]) / 255;
      return lum < 0.4;
    }
    return false;
  }

  function escHtml(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function _formatRelativeTime(ts) {
    if (!ts) return '';
    const diff = Date.now() - ts;
    const mins  = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days  = Math.floor(diff / 86400000);
    if (mins < 2)   return 'just now';
    if (hours < 1)  return `${mins}m ago`;
    const now = new Date(), then = new Date(ts);
    if (now.toDateString() === then.toDateString()) return '';
    const yest = new Date(now); yest.setDate(now.getDate() - 1);
    if (yest.toDateString() === then.toDateString()) return 'yesterday';
    if (days < 8)   return `${days}d ago`;
    if (days < 30)  return `${Math.floor(days / 7)}w ago`;
    return then.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  function showToast(message, isError = false, duration = 4000) {
    const existing = document.querySelector('.' + BANNER_CLASS);
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.className = BANNER_CLASS;
    toast.innerHTML = message;
    toast.style.cssText = `position:fixed;bottom:24px;left:50%;transform:translateX(-50%);padding:12px 24px;border-radius:8px;z-index:99999;font-size:14px;font-family:-apple-system,sans-serif;color:white;box-shadow:0 4px 12px rgba(0,0,0,0.3);background:${isError?'#d93025':'#1a7f37'};transition:opacity 0.3s;max-width:600px;text-align:center;`;
    document.body.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, duration);
  }

  // ═══════════════════════════════════════════════════════════════
  //  IMAGE CAPTURE (canvas-based, best-effort)
  // ═══════════════════════════════════════════════════════════════

  const _imgCaptures = [];
  let _imgIdx = 0;
  function _resetImgCaptures() { _imgCaptures.length = 0; _imgIdx = 0; }

  // Shadow-piercing querySelector — needed for Gemini's single-image which puts <img>
  // inside an open shadow root, invisible to regular querySelectorAll.
  function _deepQueryAll(root, selector) {
    const results = [];
    const walk = (node) => {
      if (!node) return;
      if (node.nodeType === Node.ELEMENT_NODE) {
        try { if (node.matches(selector)) results.push(node); } catch (_) {}
        if (node.shadowRoot) walk(node.shadowRoot);
      } else if (node.nodeType !== Node.DOCUMENT_FRAGMENT_NODE && node.nodeType !== Node.DOCUMENT_NODE) {
        return;
      }
      for (const c of node.children || []) walk(c);
    };
    walk(root);
    return results;
  }

  function _getImageSrc(imgEl) {
    if (!imgEl) return '';
    const direct = imgEl.currentSrc ||
                   imgEl.src ||
                   imgEl.dataset?.src ||
                   imgEl.dataset?.originalSrc ||
                   imgEl.getAttribute?.('src') ||
                   '';
    if (direct) return direct;

    const srcset = imgEl.srcset || imgEl.getAttribute?.('srcset') || '';
    if (!srcset) return '';
    const candidates = srcset.split(',')
      .map(part => part.trim().split(/\s+/)[0])
      .filter(Boolean);
    return candidates[candidates.length - 1] || '';
  }

  function _deepContains(root, node) {
    if (!root || !node) return false;
    let current = node;
    while (current) {
      if (current === root) return true;
      if (current.parentNode) {
        current = current.parentNode;
        continue;
      }
      const host = current.getRootNode?.().host;
      current = host || null;
    }
    return false;
  }

  function _addImageCapture(imgEl, alt, ignoreIfSmall = true) {
    const src = _getImageSrc(imgEl);
    if (!src || src.startsWith('data:image/svg')) return '';
    if (src.includes('favicon')) return '';

    const w = imgEl.naturalWidth, h = imgEl.naturalHeight;
    if (ignoreIfSmall && w && h && w < 50 && h < 50) return '';

    if (_imgCaptures.some(c => _getImageSrc(c.el) === src)) return '';
    _imgCaptures.push({ idx: _imgIdx, el: imgEl, alt: alt || imgEl.getAttribute?.('alt') || 'Image' });
    return `\n\n[[IMG:${_imgIdx++}]]\n\n`;
  }

  function _isLikelyGeminiGeneratedImage(imgEl) {
    if (!imgEl) return false;
    const className = String(imgEl.className || '');
    if (className.includes('hero-image') || className.includes('spark-licensed')) return true;

    const src = _getImageSrc(imgEl);
    if (!src) return false;
    const isGoogleImageHost = /(^https:\/\/[^/]*(?:gstatic|googleusercontent)\.com\/)/i.test(src);
    if (!isGoogleImageHost) return false;

    const w = imgEl.naturalWidth, h = imgEl.naturalHeight;
    if (w && h) return w >= 120 && h >= 120;

    const rect = imgEl.getBoundingClientRect?.();
    return !!rect && rect.width >= 120 && rect.height >= 120;
  }

  let _lastNavPath = location.pathname;
  let _panelAnchorEl = null;
  let _shouldReopenPanel = false;
  let _panelOpenedOnPath = null;

  // https://*/* is an optional permission (not auto-granted) — only requested here,
  // lazily, the first time a capture actually needs the cross-origin fetch fallback.
  // MUST be called from content.js (a user-gesture context), never from the background
  // service worker, where chrome.permissions.request() silently fails.
  async function _ensureImageFetchPermission() {
    try {
      const has = await new Promise(resolve => chrome.permissions.contains({ origins: ['https://*/*'] }, resolve));
      if (has) return true;
      return await new Promise(resolve => chrome.permissions.request({ origins: ['https://*/*'] }, resolve));
    } catch (_) { return false; }
  }

  async function _captureImages() {
    const map = {};
    let permissionChecked = false;
    for (const { idx, el, alt } of _imgCaptures) {
      // Strategy 1: canvas (works if same-origin or CORS-permissive)
      if (el && el.naturalWidth && el.naturalHeight) {
        try {
          const maxPx = 1200;
          let w = el.naturalWidth, h = el.naturalHeight;
          if (w > maxPx) { h = Math.round(h * maxPx / w); w = maxPx; }
          const c = document.createElement('canvas');
          c.width = w; c.height = h;
          c.getContext('2d').drawImage(el, 0, 0, w, h);
          const b64 = c.toDataURL('image/png').split(',')[1];
          if (b64) { map[idx] = { data: b64, w, h, alt: alt || '' }; continue; }
        } catch (_) { /* tainted canvas — try fetch */ }
      }
      // Strategy 2: background worker fetch → OffscreenCanvas → PNG
      // Works for AI platform CDNs listed in host_permissions, plus anything covered
      // by the optional https://*/* grant requested just below on first use.
      const src = _getImageSrc(el);
      if (!src || src.startsWith('data:') || src.startsWith('blob:')) continue;
      if (!permissionChecked) {
        permissionChecked = true;
        await _ensureImageFetchPermission();
      }
      try {
        const result = await new Promise(resolve => {
          chrome.runtime.sendMessage({ action: 'fetchImage', url: src }, resp => {
            resolve(resp || { success: false });
          });
        });
        if (result.success && result.base64 && result.w && result.h) {
          map[idx] = { data: result.base64, w: result.w, h: result.h, alt: alt || '' };
        }
      } catch (_) { /* background fetch failed — will show [Image] placeholder */ }
    }
    return map;
  }

  // ═══════════════════════════════════════════════════════════════
  //  MARKDOWN EXTRACTION (shared logic)
  // ═══════════════════════════════════════════════════════════════

  function processNode(node) {
    try {
      if (!node) return '';
      if (node.nodeType === Node.TEXT_NODE) return node.textContent || '';
      if (node.nodeType !== Node.ELEMENT_NODE) return '';
      const tag = node.tagName ? node.tagName.toLowerCase() : '';
      if (!tag) return '';

      // === MATH DETECTION (multiple strategies) ===

      // Strategy 0: Gemini's math-inline / math-block with data-math attribute
      if (node.classList && (node.classList.contains('math-inline') || node.classList.contains('math-block'))) {
        const tex = node.getAttribute('data-math');
        if (tex) {
          const isDisplay = node.classList.contains('math-block');
          return isDisplay ? `\n$$${tex}$$\n` : `$${tex}$`;
        }
      }

      // Strategy 0b: ChatGPT 2025+ format — role="math" wrapper stores TeX source in
      // data-math-source or aria-label (ChatGPT dropped <annotation> tags entirely).
      // Intercept here so child .katex-display/.katex-html nodes aren't processed separately.
      if (node.getAttribute && node.getAttribute('role') === 'math') {
        const src = node.getAttribute('data-math-source') || node.getAttribute('aria-label');
        if (src) {
          const isDisplay = !!node.querySelector('.katex-display');
          return isDisplay ? `\n$$${normalizeTeX(src.trim())}$$\n` : `$${normalizeTeX(src.trim())}$`;
        }
      }

      // Strategy 1: KaTeX display math wrapper
      if (node.classList && node.classList.contains('katex-display')) {
        const tex = extractTeX(node);
        if (tex) return `\n$$${tex}$$\n`;
      }

      // Strategy 2: KaTeX inline math
      if (node.classList && node.classList.contains('katex')) {
        const tex = extractTeX(node);
        if (tex) {
          const isDisplay = node.closest('.katex-display');
          return isDisplay ? `\n$$${tex}$$\n` : `$${tex}$`;
        }
      }

      // Strategy 3: wrapper span/div that directly contains .katex-mathml as a child
      // (Strategies 1/2 handle .katex-display and .katex; this catches any remaining wrapper)
      if (node.querySelector && node.querySelector(':scope > .katex-mathml annotation[encoding="application/x-tex"]')) {
        const tex = extractTeX(node);
        if (tex) {
          const isDisplay = !!node.closest('.katex-display');
          return isDisplay ? `\n$$${tex}$$\n` : `$${tex}$`;
        }
      }

      // Strategy 4: MathJax v3 (Gemini)
      if (tag === 'mjx-container') {
        const tex = node.getAttribute('data-formula') || node.getAttribute('aria-label') || '';
        if (tex) {
          const isDisplay = node.hasAttribute('display');
          return isDisplay ? `\n$$${tex}$$\n` : `$${tex}$`;
        }
      }

      // Strategy 5: <math> element directly
      if (tag === 'math') {
        const ann = node.querySelector('annotation[encoding="application/x-tex"]');
        if (ann) return `$${ann.textContent.trim()}$`;
      }

      // Strategy 6: Any span/div with a <math> descendant containing annotation
      // But DON'T process if it's a large container — only small math wrappers
      if ((tag === 'span' || tag === 'div') && node.childNodes.length <= 5) {
        const ann = node.querySelector('annotation[encoding="application/x-tex"]');
        if (ann && !node.querySelector('p') && !node.querySelector('li')) {
          const isDisplay = node.classList.contains('katex-display') || node.closest('.katex-display');
          const tex = ann.textContent.trim();
          return isDisplay ? `\n$$${tex}$$\n` : `$${tex}$`;
        }
      }

      // Skip katex-html (the visible rendered version) — we only want the annotation
      if (node.classList && node.classList.contains('katex-html')) return '';
      if (node.classList && node.classList.contains('katex-mathml')) return '';

      // === STANDARD HTML ELEMENTS ===

      if (/^h[1-6]$/.test(tag)) return `\n${'#'.repeat(parseInt(tag[1]))} ${getInner(node)}\n`;
      // ChatGPT 2025+: when KaTeX fails or data-math-source is empty, display math
      // appears as <p dir="auto"> containing raw TeX + <br> + literal "]". Detect this
      // pattern and wrap properly; the matching span[role="math"] may be in this same
      // paragraph or in the immediately preceding sibling element.
      if (tag === 'p' && node.getAttribute('dir') === 'auto') {
        const kids = Array.from(node.childNodes);
        const lastKid = kids[kids.length - 1];
        const secondLast = kids[kids.length - 2];
        if (
          lastKid && lastKid.nodeType === Node.TEXT_NODE && lastKid.textContent.trim() === ']' &&
          secondLast && secondLast.tagName === 'BR'
        ) {
          const mathSpan = node.querySelector('span[role="math"]') ||
            (node.previousElementSibling && node.previousElementSibling.querySelector &&
             node.previousElementSibling.querySelector('span[role="math"]'));
          if (mathSpan) {
            let rawTex = '';
            for (const kid of kids) {
              if (kid === secondLast || kid === lastKid) break;
              if (kid.nodeType === Node.TEXT_NODE) rawTex += kid.textContent;
            }
            rawTex = rawTex.trim();
            if (rawTex) {
              const isDisplay = !!mathSpan.querySelector('.katex-display');
              return isDisplay ? `\n$$${normalizeTeX(rawTex)}$$\n` : `$${normalizeTeX(rawTex)}$`;
            }
          }
        }
      }
      if (tag === 'p') return `\n${getInner(node)}\n`;
      if (tag === 'ol') { let r = '\n', n = 1; for (const li of node.querySelectorAll(':scope > li')) { r += `${n}. ${getInner(li).replace(/\n+/g, ' ').trim()}\n`; n++; } return r; }
      if (tag === 'ul') { let r = '\n'; for (const li of node.querySelectorAll(':scope > li')) r += `- ${getInner(li).replace(/\n+/g, ' ').trim()}\n`; return r; }
      if (tag === 'pre') { const code = node.querySelector('code'); return `\n\`\`\`\n${(code || node).textContent}\n\`\`\`\n`; }
      if (tag === 'code' && !node.closest('pre')) return `\`${node.textContent}\``;
      if (tag === 'img') {
        const alt = node.getAttribute('alt') || node.getAttribute('aria-label') || '';
        return _addImageCapture(node, alt, false).trim();
      }
      if (tag === 'br') return '\n';
      if (tag === 'hr') return '\n---\n';
      if (tag === 'strong' || tag === 'b') return `**${getInner(node)}**`;
      if (tag === 'em' || tag === 'i') return `*${getInner(node)}*`;
      if (tag === 'sub') { const i = getInner(node).trim(); return i ? `~${i}~` : ''; }
      if (tag === 'sup') {
        const i = getInner(node).trim();
        if (!i) return '';
        // Strip any literal ^ chars from inner content — prevents ^^^-type artifacts
        // when Gemini citation markers embed a caret character inside <sup>.
        const clean = i.replace(/\^/g, '');
        return clean ? `^${clean}^` : '';
      }
      if (tag === 'table') return processTable(node);
      if (tag === 'button' || tag === 'svg' || tag === 'select' || tag === 'input' || tag === 'textarea') return '';
      // Skip Gemini grounding / source-attribution structural elements —
      // these are metadata panels, not AI response content.
      if (tag === 'tool-use' || tag === 'response-sources' ||
          tag === 'source-attribution' || tag === 'grounding-metadata' ||
          tag === 'grounding-panel' || tag === 'sources-panel' ||
          (node.classList && (node.classList.contains('grounding') ||
                              node.classList.contains('sources-panel') ||
                              node.classList.contains('footnotes-panel')))) return '';
      if (tag === 'a') {
        if (node.querySelector('img')) {
          const inner = getInner(node);
          return (inner.match(/\[\[IMG:\d+\]\]/g) || []).join('');
        }
        return getInner(node);
      }
      return getInner(node);
    } catch(e) { return node.textContent || ''; }
  }

  // Extract TeX from any element that might contain KaTeX/MathJax annotations
  function extractTeX(el) {
    // Try data-math attribute (Gemini)
    const dataMath = el.getAttribute('data-math');
    if (dataMath) return normalizeTeX(dataMath.trim());
    // Try annotation element (KaTeX legacy — pre-2025 ChatGPT)
    const ann = el.querySelector('annotation[encoding="application/x-tex"]');
    if (ann) return normalizeTeX(ann.textContent.trim());
    // Try MathJax script
    const script = el.querySelector('script[type="math/tex"], script[type="math/tex; mode=display"]');
    if (script) return normalizeTeX(script.textContent.trim());
    // ChatGPT 2025+: TeX stored on role="math" ancestor (data-math-source or aria-label)
    const mathWrapper = (el.getAttribute && el.getAttribute('role') === 'math')
      ? el
      : (el.closest ? el.closest('[role="math"]') : null);
    if (mathWrapper) {
      const src = mathWrapper.getAttribute('data-math-source') || mathWrapper.getAttribute('aria-label');
      if (src) return normalizeTeX(src.trim());
    }
    // Try other data attributes on the element itself
    const formula = el.getAttribute('data-formula') || el.getAttribute('aria-label');
    if (formula) return normalizeTeX(formula.trim());
    return '';
  }

  function normalizeTeX(tex) {
    // LaTeX starting with ^ or _ has no base atom (e.g. ^5C_2 for combination notation).
    // Prepend {} so the OMML parser has a valid empty base: {}^5C_2 → pre-superscript ⁵C₂.
    return (tex && /^[_^]/.test(tex)) ? '{}' + tex : tex;
  }

  function getInner(node) { let r = ''; for (const c of node.childNodes) r += processNode(c); return r; }

  function processTable(table) {
    let md = '\n';
    const rows = table.querySelectorAll('tr');
    rows.forEach((row, idx) => {
      const cells = Array.from(row.querySelectorAll('th, td')).map(c => getInner(c).trim());
      md += '| ' + cells.join(' | ') + ' |\n';
      if (idx === 0) md += '| ' + cells.map(() => '---').join(' | ') + ' |\n';
    });
    return md;
  }

  function extractMarkdown(messageEl) {
    try {
      let contentDiv;
      if (isChatGPT) {
        contentDiv = messageEl.querySelector('.markdown') ||
                     messageEl.querySelector('[class*="markdown"]') ||
                     messageEl.querySelector('article') ||
                     messageEl;
      } else if (isGemini) {
        contentDiv = messageEl.querySelector('.markdown-main-panel') ||
                     messageEl.querySelector('.model-response-text') ||
                     messageEl.querySelector('.response-content') ||
                     messageEl.querySelector('[class*="response-text"]:not([class*="source"])') ||
                     messageEl.querySelector('message-content') ||
                     messageEl;
      } else if (isClaude) {
        // Primary: .standard-markdown (current Claude markdown wrapper).
        // If messageEl is already .standard-markdown (typical when called from
        // _claudeFindResponses), the descendant query returns null and we use messageEl.
        contentDiv = messageEl.querySelector('.standard-markdown') ||
                     messageEl.querySelector('[class*="markdown"]') ||
                     messageEl;
      } else if (isDeepSeek) {
        contentDiv = messageEl.querySelector('.ds-markdown') ||
                     messageEl.querySelector('[class*="markdown"]') ||
                     messageEl;
      } else if (isPerplexity) {
        contentDiv = messageEl.querySelector('.prose') ||
                     messageEl.querySelector('[class*="prose"]') ||
                     messageEl;
      } else {
        contentDiv = messageEl;
      }
      let md = '';
      for (const child of contentDiv.childNodes) md += processNode(child);

      // Claude image scan: look for images outside contentDiv (image search results, artifacts).
      // When _claudeFindResponses returns .standard-markdown, contentDiv === messageEl,
      // so we walk up to the parent to find sibling image containers.
      if (isClaude) {
        let scanRoot = messageEl;
        for (let i = 0; i < 4; i++) {
          if (!scanRoot.parentElement || scanRoot.parentElement === document.body) break;
          scanRoot = scanRoot.parentElement;
        }
        if (scanRoot && scanRoot !== document.body) {
          for (const imgEl of scanRoot.querySelectorAll('img')) {
            if (contentDiv.contains(imgEl)) continue;
            md += _addImageCapture(imgEl, imgEl.getAttribute('alt') || 'Image');
          }
        }
      }

      // Gemini image scan: generated images live in single-image > image-button siblings of model-response,
      // both of which are direct children of response-element (confirmed via DevTools DOM trace).
      if (isGemini) {
        const msgScope = messageEl.closest('response-element') ||
                         messageEl.closest('message-content') ||
                         messageEl.parentElement ||
                         messageEl;
        const beforeGeminiImages = _imgCaptures.length;
        for (const imgEl of _deepQueryAll(msgScope, 'img')) {
          if (_deepContains(contentDiv, imgEl)) continue;
          md += _addImageCapture(imgEl, imgEl.getAttribute('alt') || 'Image');
        }

        // Defensive fallback: if Gemini changes where single-image is attached, scan all
        // open-shadow images and keep only generated-looking images that belong to this turn.
        if (_imgCaptures.length === beforeGeminiImages) {
          for (const imgEl of _deepQueryAll(document, 'img')) {
            if (!_isLikelyGeminiGeneratedImage(imgEl)) continue;
            if (!_deepContains(msgScope, imgEl)) continue;
            md += _addImageCapture(imgEl, imgEl.getAttribute('alt') || 'Image');
          }
        }
      }

      // If the chosen contentDiv yielded almost nothing, retry with the original messageEl
      // (the wrapper might be a metadata/header div that doesn't contain the response body).
      if (!md.includes('[[IMG:') && md.trim().length < 20 && contentDiv !== messageEl) {
        let mdRetry = '';
        for (const child of messageEl.childNodes) mdRetry += processNode(child);
        if (mdRetry.trim().length > md.trim().length) md = mdRetry;
      }

      // VALIDATION: Check if math annotations exist but weren't captured
      const annotations = contentDiv.querySelectorAll('annotation[encoding="application/x-tex"], .math-inline[data-math], .math-block[data-math]');
      if (annotations.length > 0) {
        const hasMath = md.includes('$');
        if (!hasMath) md = directExtractWithMath(contentDiv);
      }

      // If still tiny, walk UP from messageEl looking for an ancestor with substantial text.
      // Handles the case where Claude's wrapper element (e.g. font-claude-response) is itself
      // empty and the actual response sits in a sibling subtree we missed.
      if (!md.includes('[[IMG:') && md.trim().length < 20) {
        let ancestor = messageEl.parentElement;
        for (let i = 0; i < 6 && ancestor && ancestor !== document.body; i++, ancestor = ancestor.parentElement) {
          if (ancestor.querySelector('[class*="font-user-message"]')) continue;
          const ancText = (ancestor.textContent || '').trim();
          if (ancText.length < 40) continue;
          let mdAnc = '';
          for (const child of ancestor.childNodes) mdAnc += processNode(child);
          if (mdAnc.trim().length > md.trim().length) {
            md = mdAnc;
            break;
          }
        }
      }

      // Last-resort fallback: if we still have almost nothing, use raw text content.
      if (!md.includes('[[IMG:') && md.trim().length < 20) {
        const text = (messageEl.textContent || messageEl.innerText || '').trim();
        if (text.length > md.trim().length) md = text;
      }

      return md.trim();
    } catch(e) {
      return messageEl.textContent || messageEl.innerText || '';
    }
  }

  // Direct extraction: walk the DOM more carefully, explicitly finding all math
  function directExtractWithMath(container) {
    let md = '';
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    const processedMathRoots = new Set();
    let node;

    while (node = walker.nextNode()) {
      // Skip descendants of already-processed math subtrees
      let el = node.parentElement;
      let insideMath = false;
      while (el && el !== container) {
        if (processedMathRoots.has(el)) { insideMath = true; break; }
        el = el.parentElement;
      }
      if (insideMath) continue;

      if (node.nodeType === Node.TEXT_NODE) {
        const parent = node.parentElement;
        if (parent && (
          parent.closest('.katex-html') ||
          parent.closest('.katex-mathml') ||
          parent.closest('annotation') ||
          parent.tagName === 'ANNOTATION'
        )) continue;
        md += node.textContent;
      } else {
        if (node.classList && (node.classList.contains('katex-display') || node.classList.contains('katex'))) {
          processedMathRoots.add(node);
          const tex = extractTeX(node);
          if (tex) {
            const isDisplay = node.classList.contains('katex-display') || !!node.closest('.katex-display');
            md += isDisplay ? `\n$$${tex}$$\n` : `$${tex}$`;
          }
          continue;
        }
        const blockTag = node.tagName.toLowerCase();
        if (['strong', 'b', 'em', 'i', 'code', 'a', 'sub', 'sup'].includes(blockTag)) {
          md += processNode(node);
          processedMathRoots.add(node);
          continue;
        }
        if (['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'br'].includes(blockTag)) {
          if (blockTag === 'br') md += '\n';
          else if (/^h[1-6]$/.test(blockTag)) md += '\n' + '#'.repeat(parseInt(blockTag[1])) + ' ';
          else if (blockTag === 'li') md += '\n- ';
          else md += '\n';
        }
      }
    }
    return md;
  }

  // ═══════════════════════════════════════════════════════════════
  //  CONVERSATION TITLE EXTRACTION
  // ═══════════════════════════════════════════════════════════════

  function getConversationTitle() {
    let title = '';

    if (isChatGPT) {
      // Active conversation in sidebar
      const el = document.querySelector('nav [aria-current="page"] [class*="truncate"]') ||
                 document.querySelector('nav li.active [class*="truncate"]') ||
                 document.querySelector('nav [data-active="true"] [class*="truncate"]');
      if (el) title = el.textContent.trim();
    } else if (isGemini) {
      // Active conversation in sidebar
      const el = document.querySelector('.conversation-title[aria-selected="true"]') ||
                 document.querySelector('[class*="conversation-title"][class*="selected"]') ||
                 document.querySelector('chat-window-title-bar');
      if (el) title = el.textContent.trim();
    } else if (isClaude) {
      // Active conversation in sidebar
      const el = document.querySelector('nav [aria-current="page"]') ||
                 document.querySelector('[class*="ConversationTitle"]') ||
                 document.querySelector('nav a[class*="active"] [class*="truncate"]');
      if (el) title = el.textContent.trim();
    } else if (isDeepSeek) {
      const el = document.querySelector('[class*="chat-title"]') ||
                 document.querySelector('[class*="conversation-title"]') ||
                 document.querySelector('nav [aria-current="page"]');
      if (el) title = el.textContent.trim();
    } else if (isPerplexity) {
      const el = document.querySelector('h1') ||
                 document.querySelector('[class*="query"] h1') ||
                 document.querySelector('[data-testid*="query"]');
      if (el) title = el.textContent.trim();
    }

    // Fallback: strip platform suffix from document.title
    if (!title) {
      title = document.title
        .replace(/\s*[-|–]\s*(Google\s+)?(ChatGPT|Claude|Gemini|DeepSeek|Perplexity)\s*$/i, '')
        .replace(/^(Google\s+)?(ChatGPT|Claude|Gemini|DeepSeek|Perplexity)\s*[-|–]?\s*/i, '')
        .trim();
    }

    // Sanitize: remove filename-unsafe chars only; preserve spaces for readability
    if (title) {
      title = title.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60);
    }

    return title || null;
  }

  // ═══════════════════════════════════════════════════════════════
  //  BLOB TO BASE64
  // ═══════════════════════════════════════════════════════════════

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  // ═══════════════════════════════════════════════════════════════
  //  CORE EXPORT PIPELINE  (markdown string → Drive / download)
  // ═══════════════════════════════════════════════════════════════

  function markdownToPlainText(md) {
    return md
      .replace(/\[\[IMG:\d+\]\]/g, '[Image]')
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/\*\*\*([\s\S]+?)\*\*\*/g, '$1')
      .replace(/\*\*([\s\S]+?)\*\*/g, '$1')
      .replace(/\*([\s\S]+?)\*/g, '$1')
      .replace(/~([^~]+)~/g, '$1')
      .replace(/\^([^^]+)\^/g, '$1')
      .replace(/```[\w]*\n?([\s\S]*?)```/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/^-{3,}$/gm, '────────────────────')
      .replace(/^\s*[-*+]\s/gm, '• ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  async function exportMarkdown(markdown, suffix, imageMap = {}, skipHeader = false) {
    suffix = suffix || '';
    // Replace image markers that couldn't be captured with text fallbacks
    markdown = markdown.replace(/\[\[IMG:(\d+)\]\]/g, (match, raw) => {
      const idx = parseInt(raw);
      if (imageMap[idx]) return match;
      const cap = _imgCaptures.find(c => c.idx === idx);
      const srcFallback = _getImageSrc(cap?.el);
      return srcFallback ? `(Image: ${srcFallback})` : cap?.alt ? `[Image: ${cap.alt}]` : '[Image]';
    });

    // Header: metadata line + MLA citation line (top of doc — survives appends).
    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
    const platformName = isGemini ? 'Gemini' : isClaude ? 'Claude' : isDeepSeek ? 'DeepSeek' : isPerplexity ? 'Perplexity' : 'ChatGPT';
    const convTitle = getConversationTitle();
    const metaParts = [platformName, dateStr, ...(convTitle ? [convTitle] : [])];
    const sourceUrl = location.origin + location.pathname;
    const vendor = isGemini ? 'Google' : isClaude ? 'Anthropic' : isDeepSeek ? 'DeepSeek' : isPerplexity ? 'Perplexity' : 'OpenAI';
    const mlaMonths = ['Jan.','Feb.','Mar.','Apr.','May','June','July','Aug.','Sept.','Oct.','Nov.','Dec.'];
    const mlaDate = `${now.getDate()} ${mlaMonths[now.getMonth()]} ${now.getFullYear()}`;
    const citeTitle = convTitle || 'AI conversation';
    const citation = `${vendor}. "${citeTitle}." ${platformName}, ${mlaDate}, ${sourceUrl}`;
    if (!skipHeader) markdown = `*${metaParts.join(' · ')}*\n*Citation (MLA): ${citation}*\n\n` + markdown;

    const timestamp = `${now.getFullYear()}${(now.getMonth()+1).toString().padStart(2,'0')}${now.getDate().toString().padStart(2,'0')}_${now.getHours().toString().padStart(2,'0')}${now.getMinutes().toString().padStart(2,'0')}`;
    const monthYear = now.toLocaleString('en-US', { month: 'long', year: 'numeric' });
    const platform = platformName;
    const safeTitle = convTitle ? convTitle.replace(/\s+/g, '_') : null;
    const filename = safeTitle
      ? `${safeTitle}${suffix}.docx`
      : `${platform}_Export${suffix}_${timestamp}.docx`;
    const docTitle = convTitle
      ? `${convTitle} — ${platformName} · ${monthYear}`
      : `${platformName} Export · ${monthYear}`;

    if (!chrome.runtime || !chrome.runtime.sendMessage) {
      showToast('❌ Extension reloaded. Please refresh this page.', true);
      return;
    }

    if (exportDest === 'markdown') {
      const mdFilename = filename.replace(/\.docx$/, '.md');
      const mdBytes = new TextEncoder().encode(markdown);
      let mdBinary = '';
      for (let i = 0; i < mdBytes.length; i += 8192) {
        mdBinary += String.fromCharCode(...mdBytes.subarray(i, Math.min(i + 8192, mdBytes.length)));
      }
      const mdBase64 = btoa(mdBinary);
      showToast('⏳ Preparing download...');
      try {
        await new Promise((resolve, reject) => {
          chrome.runtime.sendMessage(
            { action: 'downloadLocal', docxBase64: mdBase64, filename: mdFilename, mime: 'text/markdown;charset=utf-8' },
            (resp) => {
              if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
              else if (resp?.success) resolve();
              else reject(new Error(resp?.error || 'Download failed'));
            }
          );
        });
        showToast('✅ Saved as .md!', false, 4000);
      } catch(e) {
        showToast('❌ Save failed: ' + e.message, true);
      }
      return;
    }

    if (exportDest === 'obsidian') {
      showToast('⏳ Opening in Obsidian...');
      try {
        const { obsidianVault } = await new Promise(resolve => {
          chrome.storage.local.get('obsidianVault', resolve);
        });
        const vault = obsidianVault || '';
        const safeFile = (docTitle || 'AI Chat Export').replace(/[\\/:*?"<>|#^[\]]/g, '').trim().slice(0, 80);
        const yamlFrontmatter = `---\ntitle: "${safeFile.replace(/"/g, '\\"')}"\nsource: ${sourceUrl}\nplatform: ${platformName}\ndate: ${dateStr}\ntags: [ai-export]\n---\n\n`;
        const fullContent = yamlFrontmatter + markdown;
        const params = new URLSearchParams();
        if (vault) params.set('vault', vault);
        params.set('file', safeFile);
        params.set('content', fullContent);
        // Use <a> click instead of window.open — Chrome extension sandboxing blocks
        // custom protocol URIs opened via window.open, resulting in about:blank tabs.
        const obsA = document.createElement('a');
        // URLSearchParams encodes spaces as + but Obsidian URI only handles %20
        obsA.href = 'obsidian://new?' + params.toString().replace(/\+/g, '%20');
        obsA.style.display = 'none';
        document.body.appendChild(obsA);
        obsA.click();
        setTimeout(() => obsA.remove(), 100);
        showToast('✅ Sent to Obsidian! Check the app.', false, 4000);
      } catch (e) {
        showToast('❌ Obsidian export failed: ' + e.message, true);
      }
      return;
    }

    if (exportDest === 'notion') {
      showToast('⏳ Sending to Notion...');
      try {
        const settings = await new Promise(resolve => {
          chrome.storage.local.get(['notionToken', 'notionParentPageId'], resolve);
        });
        if (!settings.notionToken || !settings.notionParentPageId) {
          showToast('❌ Notion not configured. Please set your token and page ID in the extension popup.', true, 6000);
          return;
        }
        const result = await new Promise((resolve, reject) => {
          chrome.runtime.sendMessage(
            { action: 'exportToNotion', markdown, title: docTitle, token: settings.notionToken, parentPageId: settings.notionParentPageId },
            (resp) => {
              if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
              else if (resp?.success) resolve(resp);
              else reject(new Error(resp?.error || 'Notion export failed'));
            }
          );
        });
        showToast(`✅ Created page in Notion! <a href="${result.url}" target="_blank" style="color:#fff;text-decoration:underline">Open ↗</a>`, false, 6000);
      } catch (e) {
        showToast('❌ Notion export failed: ' + e.message, true);
      }
      return;
    }

    let blob;
    try {
      blob = window.convertChatGPTToDocx(markdown, imageMap);
    } catch(e) {
      showToast('❌ Error generating document: ' + e.message, true);
      return;
    }
    const base64 = await blobToBase64(blob);

    if (exportDest === 'local') {
      showToast('⏳ Preparing download...');
      try {
        await new Promise((resolve, reject) => {
          chrome.runtime.sendMessage(
            { action: 'downloadLocal', docxBase64: base64, filename },
            (resp) => {
              if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
              else if (resp?.success) resolve();
              else reject(new Error(resp?.error || 'Download failed'));
            }
          );
        });
        showToast('✅ Saved as .docx!', false, 4000);
      } catch(e) {
        showToast('❌ Save failed: ' + e.message, true);
      }
    } else {
      showToast('⏳ Uploading to Google Drive...');
      try {
        const result = await new Promise((resolve, reject) => {
          chrome.runtime.sendMessage(
            { action: 'uploadToDrive', docxBase64: base64, filename, docTitle, platform: platformName },
            (response) => {
              if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
              else if (response && response.success) resolve(response);
              else reject(new Error(response ? response.error : 'Unknown error'));
            }
          );
        });

        showToast(`✅ Created "<b>${escHtml(result.fileName)}</b>" in Google Drive! Opening...`, false, 5000);
        setTimeout(() => window.open(result.url, '_blank'), 500);
        const convKey = location.hostname + location.pathname;
        chrome.storage.local.get('lastExports', (d) => {
          const allExports = d.lastExports || {};
          const history = Array.isArray(allExports[convKey]) ? allExports[convKey] : (allExports[convKey] ? [allExports[convKey]] : []);
          const newEntry = { fileName: result.fileName, url: result.url, fileId: result.fileId, exportedAt: Date.now() };
          const filtered = history.filter(e => e.fileId !== newEntry.fileId && e.fileName !== newEntry.fileName);
          allExports[convKey] = [newEntry, ...filtered].slice(0, 3);
          chrome.storage.local.set({ lastExports: allExports });
          chrome.storage.local.get('globalRecentDocs', (gd) => {
            const global = Array.isArray(gd.globalRecentDocs) ? gd.globalRecentDocs : [];
            const gFiltered = global.filter(e => e.fileId !== newEntry.fileId && e.fileName !== newEntry.fileName);
            chrome.storage.local.set({ globalRecentDocs: [newEntry, ...gFiltered].slice(0, 5) });
          });
        });

      } catch(e) {
        const msg = e.message || '';
        if (msg.includes('not signed in') || msg.includes('Not signed in')) {
          showToast('⚠️ Sign in to Chrome with your Google account to use Drive export. Downloading .docx instead.', true, 7000);
        } else if (msg.includes('denied') || msg.includes('not granted')) {
          showToast('⚠️ Drive access denied. Please allow access when prompted. Downloading .docx instead.', true, 7000);
        } else if (msg.includes('invalid_client') || msg.includes('client_id')) {
          showToast('⚠️ Google Drive not set up yet. Downloading .docx instead.<br><small>See SETUP_GUIDE.md to enable one-click export.</small>', true, 6000);
        } else if (msg.includes('sign-in') || msg.includes('OAuth2')) {
          showToast('⚠️ Could not sign in to Google. Downloading .docx instead.', true, 6000);
        } else {
          showToast('⚠️ Drive upload failed. Downloading .docx instead.', true);
        }

        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = filename;
        document.body.appendChild(a); a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    }
  }

  async function exportMessage(messageEl, skipHeader = false) {
    showToast('⏳ Generating document...');
    _resetImgCaptures();
    const markdown = extractMarkdown(messageEl);
    if (!markdown || !markdown.trim()) {
      showToast('❌ Could not extract content from this message', true);
      return;
    }
    const imageMap = await _captureImages();
    await exportMarkdown(markdown, '', imageMap, skipHeader);
  }

  // ═══════════════════════════════════════════════════════════════
  //  POPUP: GET LAST AI MESSAGE
  // ═══════════════════════════════════════════════════════════════

  function getLastAIMessage() {
    if (isChatGPT) {
      const msgs = document.querySelectorAll('[data-message-author-role="assistant"]');
      const last = msgs[msgs.length - 1];
      return last ? (last.querySelector('.markdown') || last.querySelector('[class*="markdown"]') || last.querySelector('article') || last) : null;
    }
    if (isGemini) {
      const msgs = getAllAIMessages();
      return msgs[msgs.length - 1] || null;
    }
    if (isClaude) {
      const responses = _claudeFindResponses();
      return responses[responses.length - 1] || null;
    }
    if (isDeepSeek || isPerplexity) {
      const responses = getAllAIMessages();
      return responses[responses.length - 1] || null;
    }
    return null;
  }

  // ═══════════════════════════════════════════════════════════════
  //  POPUP: EXPORT FULL CONVERSATION
  // ═══════════════════════════════════════════════════════════════

  async function exportFullConversation() {
    showToast('⏳ Collecting conversation...');
    _resetImgCaptures();
    const turns = [];

    if (isChatGPT) {
      const allMsgs = document.querySelectorAll('[data-message-author-role]');
      for (const msg of allMsgs) {
        const role = msg.getAttribute('data-message-author-role');
        const contentEl = role === 'assistant' ? (msg.querySelector('.markdown') || msg.querySelector('[class*="markdown"]') || msg.querySelector('article') || msg) : msg;
        const text = extractMarkdown(contentEl).trim();
        if (text) turns.push({ role: role === 'user' ? 'You' : 'ChatGPT', text });
      }
    } else if (isGemini) {
      // User queries: query the top-level custom element directly to avoid
      // duplicate child matches. Fall back to message-content if not found.
      let userEls = Array.from(document.querySelectorAll('user-query'));
      if (userEls.length === 0) {
        userEls = Array.from(document.querySelectorAll(
          'message-content[data-content-type="user"]'
        ));
      }
      const aiEls = getAllAIMessages();
      const all = [
        ...userEls.map(el => ({ el, role: 'You' })),
        ...aiEls.map(el => ({ el, role: 'Gemini' }))
      ].sort((a, b) => a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1);
      for (const { el, role } of all) {
        const text = extractMarkdown(el).trim();
        if (text) turns.push({ role, text });
      }
    } else if (isClaude) {
      const userEls = Array.from(document.querySelectorAll('[class*="font-user-message"]'))
        .filter(el => !el.parentElement?.closest('[class*="font-user-message"]'));
      const aiEls = _claudeFindResponses();
      const all = [
        ...userEls.map(el => ({ el, role: 'You' })),
        ...aiEls.map(el => ({ el, role: 'Claude' }))
      ].sort((a, b) => a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1);
      for (const { el, role } of all) {
        const text = extractMarkdown(el).trim();
        if (text) turns.push({ role, text });
      }
    } else if (isDeepSeek) {
      const userEls = Array.from(document.querySelectorAll('[class*="user-message"], [class*="human-message"]'))
        .filter(el => !el.parentElement?.closest('[class*="user-message"], [class*="human-message"]'));
      const aiEls = _deepSeekFindResponses();
      const all = [
        ...userEls.map(el => ({ el, role: 'You' })),
        ...aiEls.map(el => ({ el, role: 'DeepSeek' }))
      ].sort((a, b) => a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1);
      for (const { el, role } of all) {
        const text = extractMarkdown(el).trim();
        if (text) turns.push({ role, text });
      }
    } else if (isPerplexity) {
      const userEls = Array.from(document.querySelectorAll('[class*="user"], [data-testid*="user"]'))
        .filter(el => !el.parentElement?.closest('[class*="user"], [data-testid*="user"]'));
      const aiEls = _perplexityFindResponses();
      const all = [
        ...userEls.map(el => ({ el, role: 'You' })),
        ...aiEls.map(el => ({ el, role: 'Perplexity' }))
      ].sort((a, b) => a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1);
      for (const { el, role } of all) {
        const text = extractMarkdown(el).trim();
        if (text) turns.push({ role, text });
      }
    }

    if (turns.length === 0) {
      showToast('❌ No conversation content found', true);
      return;
    }

    const markdown = turns.map(t => `## ${t.role}\n\n${t.text}`).join('\n\n---\n\n');
    const imageMap = await _captureImages();
    await exportMarkdown(markdown, '_full', imageMap);
  }

  // ═══════════════════════════════════════════════════════════════
  //  DEFAULT-MODE CLICK HANDLER
  // ═══════════════════════════════════════════════════════════════

  function handleExportClick(e, messageEl) {
    e.preventDefault();
    e.stopPropagation();
    chrome.storage.local.get(['defaultExportMode', 'exportDest'], (data) => {
      exportDest = data.exportDest || 'drive';
      const mode = data.defaultExportMode || 'select';
      if (mode === 'last') {
        const el = getLastAIMessage();
        if (el) exportMessage(el);
        else showToast('❌ No AI response found', true);
      } else if (mode === 'full') {
        exportFullConversation();
      } else {
        showSelectPanel(messageEl);
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════
  //  CSV TABLE EXPORT
  // ═══════════════════════════════════════════════════════════════

  function tableToCSV(tableEl) {
    return Array.from(tableEl.querySelectorAll('tr')).map(row =>
      Array.from(row.querySelectorAll('th, td'))
        .map(c => '"' + c.textContent.replace(/"/g, '""').replace(/\s+/g, ' ').trim() + '"')
        .join(',')
    ).join('\n');
  }

  function downloadCSV(tableEl, msgIndex, tableIndex) {
    const csv = tableToCSV(tableEl);
    const base = (getConversationTitle() || 'table').replace(/\s+/g, '_');
    const suffix = tableIndex > 0 ? `_table${tableIndex + 1}` : '_table';
    const filename = `${base}${suffix}.csv`;
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ═══════════════════════════════════════════════════════════════
  //  SELECTION PANEL
  // ═══════════════════════════════════════════════════════════════

  function getAllAIMessages() {
    if (isChatGPT) {
      const standard = Array.from(document.querySelectorAll('[data-message-author-role="assistant"]'))
        .map(el => el.querySelector('.markdown') || el.querySelector('[class*="markdown"]') || el.querySelector('article') || el);
      // Also include DALL-E / image turns that lack the assistant role attribute
      for (const turn of document.querySelectorAll('[data-testid^="conversation-turn"]')) {
        if (turn.querySelector('[data-message-author-role="assistant"]')) continue;
        if (turn.querySelector('[data-message-author-role="user"]')) continue;
        if (findChatGPTActionBar(turn)) standard.push(turn);
      }
      return standard.sort((a, b) => a.compareDocumentPosition(b) & 4 ? -1 : 1);
    }
    if (isGemini) {
      // Use only model-response (top-level) to avoid duplicates with child selectors
      const els = Array.from(document.querySelectorAll('model-response'));
      if (els.length > 0) return els.filter(el => !el.parentElement?.closest('model-response'));
      // Fallback for alternate Gemini DOM
      return Array.from(document.querySelectorAll('message-content[data-content-type="model"]'))
        .filter(el => !el.parentElement?.closest('message-content[data-content-type="model"]'));
    }
    if (isClaude) return _claudeFindResponses();
    if (isDeepSeek) return _deepSeekFindResponses();
    if (isPerplexity) return _perplexityFindResponses();
    return [];
  }

  function _deepSeekFindResponses() {
    const candidates = Array.from(document.querySelectorAll('.ds-markdown'));
    if (candidates.length > 0) {
      return candidates.filter(el => !el.parentElement?.closest('.ds-markdown'));
    }
    return Array.from(document.querySelectorAll(
      '[class*="assistant"] [class*="markdown"], [class*="bot"] [class*="markdown"]'
    )).filter(el => !el.parentElement?.closest('[class*="markdown"]'));
  }

  function _perplexityFindResponses() {
    // Primary: top-level .prose containers (Perplexity's markdown renderer)
    const byProse = Array.from(document.querySelectorAll('.prose'));
    if (byProse.length > 0) {
      return byProse.filter(el => !el.parentElement?.closest('.prose'));
    }
    // Fallback: answer containers by data-testid or class
    const byAttr = Array.from(document.querySelectorAll(
      '[data-testid*="answer"], [class*="answer__"] .prose, [class*="answer"] .markdown'
    )).filter(el => !el.parentElement?.closest('[data-testid*="answer"], [class*="answer"]'));
    if (byAttr.length > 0) return byAttr;
    // Last resort: any element containing meaningful prose-like content
    return Array.from(document.querySelectorAll('[class*="prose"], [class*="markdown"]'))
      .filter(el => !el.parentElement?.closest('[class*="prose"], [class*="markdown"]'));
  }

  // Robust Claude response finder. Primary signal is `.standard-markdown` — Claude's
  // current per-message markdown wrapper (verified ~1 match per response on the live DOM).
  // The older `font-claude-response` class is now a generic styling token used on hundreds
  // of unrelated elements, so we don't use it as a content selector anymore.
  function _claudeFindResponses() {
    let r = Array.from(document.querySelectorAll('.standard-markdown'))
      .filter(el => !el.parentElement?.closest('.standard-markdown'));
    if (r.length) return r;
    // Fallback: walk up from each non-code-block Copy button to the nearest .standard-markdown
    // sibling subtree. If still nothing, return the closest substantial-text ancestor.
    const out = [];
    document.querySelectorAll('button[aria-label="Copy"]').forEach(btn => {
      if (btn.closest('pre') || btn.closest('[data-code-block]') || btn.closest('.code-block') ||
          btn.closest('[class*="code-block"]') || btn.closest('[class*="codeblock"]')) return;
      let p = btn.parentElement;
      for (let i = 0; i < 12 && p && p !== document.body; i++, p = p.parentElement) {
        const md = p.querySelector('.standard-markdown, [class*="markdown"]');
        if (md && !p.querySelector('[class*="font-user-message"]')) {
          if (!out.includes(md)) out.push(md);
          return;
        }
      }
    });
    return out;
  }

  function getAllUserMessages() {
    if (isChatGPT) return Array.from(document.querySelectorAll('[data-message-author-role="user"]'));
    if (isClaude)  return Array.from(document.querySelectorAll('[class*="font-user-message"]'))
                     .filter(el => !el.parentElement?.closest('[class*="font-user-message"]'));
    if (isGemini)  {
      const qs = Array.from(document.querySelectorAll('user-query'));
      return qs.length ? qs : Array.from(document.querySelectorAll('message-content[data-content-type="user"]'));
    }
    if (isDeepSeek) return Array.from(document.querySelectorAll('[class*="user-message"], [class*="human-message"]'))
                      .filter(el => !el.parentElement?.closest('[class*="user-message"], [class*="human-message"]'));
    if (isPerplexity) return Array.from(document.querySelectorAll('[data-testid*="user-query"], [class*="userQuery"], [class*="user-query"]'))
                        .filter(el => !el.parentElement?.closest('[data-testid*="user-query"]'));
    return [];
  }

  function getCleanPreview(msgEl) {
    const clone = msgEl.cloneNode(true);
    // Remove our injected buttons and any native UI buttons
    clone.querySelectorAll('.' + BUTTON_CLASS + ', button, [role="button"], svg, style, script').forEach(el => el.remove());
    // Remove external image attribution links (e.g. "Opens in a new window · stockcake.com")
    clone.querySelectorAll('a[target="_blank"]').forEach(el => el.remove());
    const text = (clone.textContent || '').replace(/\s+/g, ' ').trim();
    if (!text) return '[Image]';
    const firstMeaningful = text.split(/\.|\n/).find(s => s.trim().length > 12) || text;
    return firstMeaningful.trim().slice(0, 85);
  }


  function _appendToRecent(exp) {
    if (!exp.fileId) return;
    const el = getLastAIMessage();
    if (!el) { showToast('❌ No AI response found', true); return; }
    showToast('⏳ Appending…');
    const text = extractMarkdown(el);
    chrome.runtime.sendMessage({ action: 'appendToDoc', fileId: exp.fileId, text }, (resp) => {
      if (resp?.success) showToast(`✅ Appended to "<b>${escHtml(exp.fileName)}</b>"`, false, 4000);
      else showToast('❌ Append failed: ' + (resp?.error || ''), true);
    });
  }

  function _appendFullToDoc(exp) {
    if (!exp.fileId) return;
    const msgs = getAllAIMessages();
    if (!msgs.length) { showToast('❌ No AI responses found', true); return; }
    showToast('⏳ Appending full conversation…');
    const parts = msgs.map((el, i) => {
      const t = extractMarkdown(el).trim();
      return t ? `## Response ${i + 1}\n\n${t}` : '';
    }).filter(Boolean);
    chrome.runtime.sendMessage({ action: 'appendToDoc', fileId: exp.fileId, text: parts.join('\n\n---\n\n') }, (resp) => {
      if (resp?.success) showToast(`✅ Appended to "<b>${escHtml(exp.fileName)}</b>"`, false, 4000);
      else showToast('❌ Append failed: ' + (resp?.error || ''), true);
    });
  }

  function showSelectPanel(thisMessageEl, appendTarget = null) {
    const existing = document.querySelector('.cgd-panel');
    if (existing) {
      existing.remove();
      if (!appendTarget) return; // toggle-close in normal mode; in append mode, continue to open new panel
    }

    const messages = getAllAIMessages();
    if (messages.length === 0) { showToast('❌ No AI responses found', true); return; }
    _panelAnchorEl = messages[0];
    _panelOpenedOnPath = location.pathname;

    chrome.storage.local.get(['lastExports', 'globalRecentDocs'], (storageData) => {
      _buildSelectPanel(messages, thisMessageEl, storageData, appendTarget);
    });
  }

  function _buildSelectPanel(messages, thisMessageEl, storageData = {}, appendTarget = null) {
    const platform = isGemini ? 'Gemini' : isClaude ? 'Claude' : isDeepSeek ? 'DeepSeek' : isPerplexity ? 'Perplexity' : 'ChatGPT';
    const dark = isDarkMode();

    const thisIdx = thisMessageEl
      ? messages.findIndex(m => m === thisMessageEl || m.contains(thisMessageEl) || thisMessageEl.contains(m))
      : -1;

    const panel = document.createElement('div');
    panel.className = 'cgd-panel' + (dark ? ' cgd-dark' : '');

    // ── Header ──
    const header = document.createElement('div');
    header.className = 'cgd-panel-header';
    const headerTitle = appendTarget
      ? `Append · ${platform}`
      : `Export · ${platform}`;
    header.innerHTML = `<span class="cgd-panel-title">${headerTitle}</span><button class="cgd-panel-close" title="Close">✕</button>`;

    header.addEventListener('mousedown', (e) => {
      if (e.target.closest('.cgd-panel-close')) return;
      const startX = e.clientX, startY = e.clientY;
      const rect = panel.getBoundingClientRect();
      const origLeft = rect.left, origTop = rect.top;
      document.removeEventListener('click', outsideClickHandler);
      function onMove(me) {
        panel.style.left = (origLeft + me.clientX - startX) + 'px';
        panel.style.top  = (origTop  + me.clientY - startY) + 'px';
        panel.style.right = 'auto';
        panel.style.transform = 'none';
      }
      function onUp() {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        setTimeout(() => document.addEventListener('click', outsideClickHandler), 0);
      }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
      e.preventDefault();
    });

    // ── Dest row: Drive (shows folder name) / Local ──
    const destRow = document.createElement('div');
    destRow.className = 'cgd-dest-row';

    const btnDrive = document.createElement('button');
    btnDrive.className = 'cgd-dest-btn';
    btnDrive.title = 'Google Drive';
    btnDrive.innerHTML = DRIVE_ICON_SVG + '<span>Drive</span>';

    const btnLocal = document.createElement('button');
    btnLocal.className = 'cgd-dest-btn';
    btnLocal.title = 'Local Word file (.docx)';
    btnLocal.innerHTML = DOCX_ICON_SVG + '<span>Word</span>';

    const btnMd = document.createElement('button');
    btnMd.className = 'cgd-dest-btn';
    btnMd.title = 'Local Markdown file (.md)';
    btnMd.innerHTML = '<span style="font-size:13px;line-height:1">📝</span><span>Markdown</span>';

    const btnNotion = document.createElement('button');
    btnNotion.className = 'cgd-dest-btn';
    btnNotion.title = 'Export to Notion';
    btnNotion.innerHTML = '<span style="font-size:13px;line-height:1">📋</span><span>Notion</span>';

    const btnObsidian = document.createElement('button');
    btnObsidian.className = 'cgd-dest-btn';
    btnObsidian.title = 'Open in Obsidian';
    btnObsidian.innerHTML = '<span style="font-size:13px;line-height:1">🔮</span><span>Obsidian</span>';

    destRow.appendChild(btnDrive);
    destRow.appendChild(btnLocal);
    destRow.appendChild(btnMd);
    destRow.appendChild(btnNotion);
    destRow.appendChild(btnObsidian);

    // ── Path confirmation row ──
    const pathRow = document.createElement('div');
    pathRow.className = 'cgd-path-row';
    const pathRowText = document.createElement('span');
    pathRow.appendChild(pathRowText);

    // ── Recent exports (Drive only, up to 2 chips with hover-reveal actions) ──
    const recentRow = document.createElement('div');
    recentRow.className = 'cgd-recent-row';

    const convKey = location.hostname + location.pathname;
    const rawExp = (storageData.lastExports || {})[convKey] || null;
    const convHistory = Array.isArray(rawExp) ? rawExp : (rawExp ? [rawExp] : []);
    const convIds = new Set(convHistory.map(e => e.fileId));
    const globalExtra = (Array.isArray(storageData.globalRecentDocs) ? storageData.globalRecentDocs : [])
      .filter(e => !convIds.has(e.fileId));
    const _seenIds = new Set(), _seenNames = new Set();
    const recents = [...convHistory, ...globalExtra]
      .filter(e => {
        if (_seenIds.has(e.fileId) || _seenNames.has(e.fileName)) return false;
        _seenIds.add(e.fileId); _seenNames.add(e.fileName);
        return true;
      })
      .slice(0, 2);

    let selectedChip = null;

    function updatePathRow() {
      if (selectedChip) {
        const shortName = selectedChip.fileName.length > 25 ? selectedChip.fileName.slice(0, 23) + '…' : selectedChip.fileName;
        pathRowText.textContent = `📄 Appending to: ${shortName}`;
      } else if (exportDest === 'markdown') {
        pathRowText.textContent = 'Saving as: 📝 Markdown (.md)';
      } else if (exportDest === 'notion') {
        pathRowText.textContent = 'Saving to: 📋 Notion';
      } else if (exportDest === 'obsidian') {
        pathRowText.textContent = 'Opening in: 🔮 Obsidian';
      } else if (exportDest === 'drive') {
        const _platLabel = isGemini ? 'Gemini' : isClaude ? 'Claude' : isDeepSeek ? 'DeepSeek' : isPerplexity ? 'Perplexity' : 'ChatGPT';
        pathRowText.textContent = `Saving to: 📁 AI Chat Exports / ${_platLabel}`;
      } else {
        pathRowText.textContent = 'Saving to: 💾 local .docx';
      }
    }

    function updateExportBtnLabel() {
      const target = appendTarget || selectedChip;
      if (target) {
        const shortName = (target.fileName || '').length > 20 ? target.fileName.slice(0, 18) + '…' : (target.fileName || 'doc');
        exportBtn.textContent = `Append to "${shortName}" →`;
      } else {
        if (exportDest === 'local')          exportBtn.textContent = 'Save .docx →';
        else if (exportDest === 'notion')    exportBtn.textContent = 'Send to Notion →';
        else if (exportDest === 'obsidian')  exportBtn.textContent = 'Open in Obsidian →';
        else                                 exportBtn.textContent = 'Export to Docs →';
      }
    }

    function buildRecentChips() {
      recentRow.innerHTML = '';
      recentRow.style.display = (exportDest === 'drive' && recents.length > 0) ? 'flex' : 'none';
      if (exportDest !== 'drive' || recents.length === 0) return;
      const recentLabel = document.createElement('div');
      recentLabel.className = 'cgd-recent-label';
      recentLabel.textContent = 'Append to recent:';
      recentRow.appendChild(recentLabel);
      recents.forEach(exp => {
        const chip = document.createElement('div');
        chip.className = 'cgd-recent-chip';

        // Click chip body → select/deselect as append target for Last/Full/Pick
        chip.addEventListener('click', (e) => {
          if (e.target.closest('.cgd-rc-btn')) return;
          if (selectedChip && selectedChip.fileId === exp.fileId) {
            selectedChip = null;
            chip.classList.remove('cgd-chip-selected');
          } else {
            selectedChip = exp;
            recentRow.querySelectorAll('.cgd-recent-chip').forEach(c => c.classList.remove('cgd-chip-selected'));
            chip.classList.add('cgd-chip-selected');
          }
          updatePathRow();
          updateExportBtnLabel();
        });

        const icon = document.createElement('span');
        icon.className = 'cgd-rc-icon';
        icon.textContent = '📄';

        const nameEl = document.createElement('span');
        nameEl.className = 'cgd-rc-name';
        const fn = exp.fileName || 'Untitled';
        nameEl.textContent = fn.length > 24 ? fn.slice(0, 22) + '…' : fn;
        nameEl.title = fn;

        const tsEl = document.createElement('span');
        tsEl.className = 'cgd-rc-ts';
        tsEl.textContent = _formatRelativeTime(exp.exportedAt);

        const actions = document.createElement('span');
        actions.className = 'cgd-rc-actions';

        const openBtn = document.createElement('a');
        openBtn.className = 'cgd-rc-btn';
        openBtn.href = exp.url || `https://docs.google.com/document/d/${exp.fileId}/edit`;
        openBtn.target = '_blank';
        openBtn.textContent = '↗';
        openBtn.title = 'Open in Drive';
        openBtn.addEventListener('click', e => e.stopPropagation());

        actions.appendChild(openBtn);
        chip.appendChild(icon);
        chip.appendChild(nameEl);
        chip.appendChild(tsEl);
        chip.appendChild(actions);
        recentRow.appendChild(chip);
      });
    }
    buildRecentChips();

    function applyDestUI() {
      btnDrive.classList.toggle('cgd-dest-active', exportDest === 'drive');
      btnLocal.classList.toggle('cgd-dest-active', exportDest === 'local');
      btnMd.classList.toggle('cgd-dest-active', exportDest === 'markdown');
      btnNotion.classList.toggle('cgd-dest-active',    exportDest === 'notion');
      btnObsidian.classList.toggle('cgd-dest-active', exportDest === 'obsidian');
      if (exportDest !== 'drive') {
        selectedChip = null;
        recentRow.querySelectorAll('.cgd-recent-chip').forEach(c => c.classList.remove('cgd-chip-selected'));
      }
      recentRow.style.display = (exportDest === 'drive' && recents.length > 0) ? 'flex' : 'none';
      updatePathRow();
    }
    applyDestUI();

    function setDest(dest) {
      if (exportDest === dest) return;
      exportDest = dest;
      chrome.storage.local.set({ exportDest: dest });
      applyDestUI();
      document.querySelectorAll('.' + BUTTON_CLASS).forEach(btn => _updateExportBtnContent(btn));
      updateExportBtnLabel();
    }
    btnDrive.addEventListener('click',  () => setDest('drive'));
    btnLocal.addEventListener('click',  () => setDest('local'));
    btnMd.addEventListener('click',     () => setDest('markdown'));
    btnNotion.addEventListener('click',    () => setDest('notion'));
    btnObsidian.addEventListener('click', () => setDest('obsidian'));

    // ── Pick area ──
    const pickArea = document.createElement('div');
    pickArea.className = 'cgd-pick-area';
    pickArea.style.display = 'flex';

    // ── Select all / none ──
    const controls = document.createElement('div');
    controls.className = 'cgd-panel-controls';
    controls.innerHTML = `<button class="cgd-ctrl-btn" id="cgd-sa">Select all</button><button class="cgd-ctrl-btn" id="cgd-sn">Deselect all</button>`;

    // ── Message list ──
    const list = document.createElement('div');
    list.className = 'cgd-panel-list';
    const checkboxes = [];
    const rowEls = [];

    const userMsgs = getAllUserMessages();

    messages.forEach((msgEl, i) => {
      const preview = getCleanPreview(msgEl);

      const row = document.createElement('label');
      row.className = 'cgd-msg-row';

      if (i === thisIdx) {
        row.style.background = dark ? 'rgba(138,180,248,0.12)' : '#e8f0fe';
        row.style.borderRadius = '8px';
      }

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = (i === thisIdx);
      checkboxes.push(cb);
      cb.addEventListener('change', updateCount);

      const textWrap = document.createElement('div');
      textWrap.style.flex = '1';
      textWrap.style.cursor = 'pointer';
      textWrap.title = 'Click to jump to this response';

      const numDiv = document.createElement('div');
      numDiv.className = 'cgd-msg-num';

      const numText = document.createElement('span');
      const _uqText = ((userMsgs[i]?.textContent || '').replace(/\s+/g, ' ').trim()).slice(0, 60);
      numText.textContent = _uqText ? `"${_uqText}…"` : `Response ${i + 1}`;

      // Small jump button — separate from label so it doesn't block checkbox toggle
      const jumpBtn = document.createElement('button');
      jumpBtn.textContent = '↗';
      jumpBtn.title = 'Jump to this response';
      jumpBtn.style.cssText = 'background:none;border:none;cursor:pointer;font-size:10px;color:inherit;padding:0 2px;opacity:0.6;';
      jumpBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        msgEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        msgEl.style.outline = '2px solid #1a73e8';
        msgEl.style.borderRadius = '6px';
        setTimeout(() => { msgEl.style.outline = ''; msgEl.style.borderRadius = ''; }, 1800);
      });
      numDiv.appendChild(numText);
      numDiv.appendChild(jumpBtn);

      const prevDiv = document.createElement('div');
      prevDiv.className = 'cgd-msg-preview';
      prevDiv.textContent = preview;
      textWrap.appendChild(numDiv);
      textWrap.appendChild(prevDiv);

      row.appendChild(cb);
      row.appendChild(textWrap);

      const tables = Array.from(msgEl.querySelectorAll('table'))
        .filter(t => !t.closest('pre') && !t.closest('code'));
      if (tables.length > 0) {
        const csvBtn = document.createElement('button');
        csvBtn.className = 'cgd-csv-btn';
        csvBtn.textContent = tables.length > 1 ? `📊 ${tables.length} CSV` : '📊 CSV';
        csvBtn.title = tables.length > 1 ? `Download ${tables.length} tables as CSV` : 'Download table as CSV';
        csvBtn.addEventListener('click', (e) => {
          e.preventDefault(); e.stopPropagation();
          tables.forEach((tbl, tIdx) => downloadCSV(tbl, i, tIdx));
        });
        row.appendChild(csvBtn);
      }

      list.appendChild(row);
      rowEls.push(row);
    });

    // ── Footer ──
    const footer = document.createElement('div');
    footer.className = 'cgd-panel-footer';
    const footerMain = document.createElement('div');
    footerMain.className = 'cgd-footer-main';

    const countLabel = document.createElement('span');
    countLabel.className = 'cgd-count-label';
    countLabel.textContent = '0 selected';

    const exportBtn = document.createElement('button');
    exportBtn.className = 'cgd-export-sel-btn';
    if (appendTarget) {
      const shortName = (appendTarget.fileName || '').length > 20 ? appendTarget.fileName.slice(0, 18) + '…' : (appendTarget.fileName || 'doc');
      exportBtn.textContent = `Append to "${shortName}" →`;
    } else {
      if (exportDest === 'local')          exportBtn.textContent = 'Save .docx →';
      else if (exportDest === 'notion')   exportBtn.textContent = 'Send to Notion →';
      else if (exportDest === 'obsidian') exportBtn.textContent = 'Open in Obsidian →';
      else                                exportBtn.textContent = 'Export to Docs →';
    }

    footerMain.appendChild(countLabel);
    footerMain.appendChild(exportBtn);
    footer.appendChild(footerMain);
    updateCount();
    const feedbackNote = document.createElement('div');
    feedbackNote.className = 'cgd-feedback-note';
    feedbackNote.style.cssText = 'padding:5px 14px 8px;font-size:10px;text-align:center;color:#999;line-height:1.4;display:block;flex-shrink:0;border-top:1px solid rgba(0,0,0,0.06);';
    const feedbackA = document.createElement('a');
    feedbackA.className = 'cgd-feedback-link';
    feedbackA.href = 'https://forms.gle/XGW5JQ2kRjTgz2bB8';
    feedbackA.target = '_blank';
    feedbackA.textContent = 'share feedback';
    feedbackA.style.cssText = 'color:#999;text-decoration:underline;cursor:pointer;';
    feedbackNote.appendChild(document.createTextNode('I read every response — '));
    feedbackNote.appendChild(feedbackA);
    feedbackNote.appendChild(document.createTextNode(' →'));

    pickArea.appendChild(controls);
    pickArea.appendChild(list);
    pickArea.appendChild(footer);

    // ── Assemble: skip dest/recent/path rows in append mode ──
    panel.appendChild(header);
    if (!appendTarget) {
      panel.appendChild(destRow);
      panel.appendChild(recentRow);
      panel.appendChild(pathRow);
    }
    panel.appendChild(pickArea);
    panel.appendChild(feedbackNote);

    // ── Shared logic ──
    function close() {
      darkWatcher.disconnect();
      document.removeEventListener('click', outsideClickHandler);
      panel.remove();
    }

    function outsideClickHandler(e) {
      if (!document.body.contains(e.target)) return;
      if (!panel.contains(e.target)) close();
    }

    const darkWatcher = new MutationObserver(() => {
      panel.classList.toggle('cgd-dark', isDarkMode());
    });
    darkWatcher.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme', 'data-color-scheme', 'data-color-mode', 'style'] });
    darkWatcher.observe(document.body, { attributes: true, attributeFilter: ['class', 'data-theme', 'style'] });

    function updateCount() {
      const n = checkboxes.filter(cb => cb.checked).length;
      countLabel.textContent = n + ' selected';
      exportBtn.disabled = n === 0;
    }

    function getSelectedIndices() {
      return checkboxes.reduce((acc, cb, i) => { if (cb.checked) acc.push(i); return acc; }, []);
    }

    async function exportSelected() {
      const selectedIndices = getSelectedIndices();
      if (selectedIndices.length === 0) return;

      const target = appendTarget || selectedChip;
      exportBtn.disabled = true;
      exportBtn.textContent = target ? 'Appending…' : 'Exporting…';

      if (target) {
        // Append mode: send selected responses to existing Doc
        const parts = selectedIndices.map(i => extractMarkdown(messages[i]).trim()).filter(Boolean);
        const text = parts.join('\n\n---\n\n');
        chrome.runtime.sendMessage({ action: 'appendToDoc', fileId: target.fileId, text }, (resp) => {
          exportBtn.disabled = false;
          updateExportBtnLabel();
          if (resp?.success) showToast(`✅ Appended to "<b>${escHtml(target.fileName)}</b>"`, false, 4000);
          else showToast('❌ Append failed: ' + (resp?.error || ''), true);
        });
        return;
      }

      // Normal export mode — panel stays open for re-export
      if (selectedIndices.length === 1) {
        await exportMessage(messages[selectedIndices[0]]);
      } else {
        _resetImgCaptures();
        showToast('⏳ Generating document...');
        const parts = selectedIndices.map(origIdx => {
          const text = extractMarkdown(messages[origIdx]).trim();
          return text ? `## ${platform} (Response ${origIdx + 1})\n\n${text}` : '';
        }).filter(Boolean);
        const imageMap = await _captureImages();
        if (parts.length) await exportMarkdown(parts.join('\n\n---\n\n'), '_selected', imageMap);
        else showToast('❌ Could not extract content', true);
      }

      exportBtn.disabled = false;
      updateExportBtnLabel();
    }

    header.querySelector('.cgd-panel-close').addEventListener('click', close);

    controls.querySelector('#cgd-sa').addEventListener('click', () => { checkboxes.forEach(cb => cb.checked = true); updateCount(); });
    controls.querySelector('#cgd-sn').addEventListener('click', () => { checkboxes.forEach(cb => cb.checked = false); updateCount(); });

    exportBtn.addEventListener('click', exportSelected);

    document.body.appendChild(panel);
    setTimeout(() => {
      if (thisIdx !== -1 && rowEls[thisIdx]) rowEls[thisIdx].scrollIntoView({ block: 'nearest' });
      document.addEventListener('click', outsideClickHandler);
    }, 0);
  }

  // ═══════════════════════════════════════════════════════════════
  //  CHATGPT: INJECT BUTTONS
  // ═══════════════════════════════════════════════════════════════

  function addChatGPTButtons() {
    const messages = document.querySelectorAll('[data-message-author-role="assistant"]');
    for (const msg of messages) {
      const container = msg.closest('.group\\/conversation-turn') || msg.closest('[data-testid^="conversation-turn"]');
      if (!container) continue;
      const actionArea = findChatGPTActionBar(container);
      // "Reliable" = the real per-message action bar (has more/thumbs/copy button),
      // as opposed to a generic div.flex fallback match that could be anything.
      const reliable = !!(actionArea && (
        actionArea.querySelector('button[data-testid*="more"]') ||
        actionArea.querySelector('button[data-testid*="thumbs"]') ||
        actionArea.querySelector('button[data-testid*="copy"]')
      ));
      const existingBtn = container.querySelector('.' + BUTTON_CLASS);
      if (existingBtn) {
        // Button was placed provisionally while the response was still generating
        // (no real action bar existed yet). Now that one has rendered, relocate it —
        // otherwise it stays stuck in the wrong spot until the page is reloaded.
        if (existingBtn.dataset.cgdFallback === '1' && reliable) {
          const oldWrapper = existingBtn.closest('.cgd-fallback-wrapper');
          insertBeforeMoreButton(actionArea, existingBtn);
          delete existingBtn.dataset.cgdFallback;
          if (oldWrapper) oldWrapper.remove();
        }
        continue;
      }
      const contentEl = msg.querySelector('.markdown') || msg.querySelector('[class*="markdown"]') || msg.querySelector('article') || msg;
      const btn = createExportButton();
      btn.addEventListener('click', (e) => handleExportClick(e, contentEl));
      if (actionArea && reliable) {
        insertBeforeMoreButton(actionArea, btn);
      } else {
        // No reliable action bar yet (short response, or still generating) — inject
        // provisionally after response content; relocated once the real bar appears.
        btn.dataset.cgdFallback = '1';
        const wrapper = document.createElement('div');
        wrapper.className = 'cgd-fallback-wrapper';
        wrapper.style.cssText = 'display:flex;justify-content:flex-end;padding:2px 0;';
        wrapper.appendChild(btn);
        contentEl.appendChild(wrapper);
      }
    }

    // Second pass: DALL-E / image-gen turns (no data-message-author-role="assistant" child)
    const imageButtons = document.querySelectorAll('[data-testid="good-image-turn-action-button"]');
    for (const goodBtn of imageButtons) {
      const container = goodBtn.closest('[data-testid^="conversation-turn"]');
      if (!container || container.querySelector('.' + BUTTON_CLASS)) continue;
      const actionArea = findChatGPTActionBar(container);
      if (!actionArea) continue;
      const btn = createExportButton();
      btn.addEventListener('click', (e) => handleExportClick(e, container));
      insertBeforeMoreButton(actionArea, btn);
    }

    // Third pass: catch-all for any turn with an action bar but no export button yet
    const allChatTurns = document.querySelectorAll('[data-testid^="conversation-turn"]');
    for (const turn of allChatTurns) {
      if (turn.querySelector('.' + BUTTON_CLASS)) continue;
      const hasUser = !!turn.querySelector('[data-message-author-role="user"]');
      const hasAssistant = !!turn.querySelector('[data-message-author-role="assistant"]');
      if (hasUser && !hasAssistant) continue;
      const actionArea = findChatGPTActionBar(turn);
      if (!actionArea) continue;
      const msgEl = turn.querySelector('[data-message-author-role="assistant"]');
      const contentEl = msgEl ? (msgEl.querySelector('.markdown') || msgEl.querySelector('[class*="markdown"]') || msgEl.querySelector('article') || msgEl) : turn;
      const btn = createExportButton();
      btn.addEventListener('click', (e) => handleExportClick(e, contentEl));
      insertBeforeMoreButton(actionArea, btn);
    }
  }

  function findChatGPTActionBar(container) {
    // Primary: copy action button is the most specific ChatGPT action-bar indicator.
    // Walk up until we find the bar that also has the "more" button (three dots).
    const copyBtn = container.querySelector('button[data-testid="copy-turn-action-button"]');
    if (copyBtn) {
      let bar = copyBtn.parentElement;
      for (let i = 0; i < 4 && bar; i++) {
        if (bar.querySelector('button[data-testid*="more"]')) return bar;
        bar = bar.parentElement;
      }
      return copyBtn.parentElement;
    }

    // Secondary: role="group" with aria-label — but only if it contains thumbs/copy buttons
    // (avoids matching code-block toolbars or other groups inside the content area).
    const actionGroup = container.querySelector('div[role="group"][aria-label]');
    if (actionGroup &&
        actionGroup.querySelectorAll('button').length >= 1 &&
        (actionGroup.querySelector('button[data-testid*="thumbs"]') ||
         actionGroup.querySelector('button[data-testid*="copy"]') ||
         actionGroup.querySelector('button[aria-label*="Thumb" i]') ||
         actionGroup.querySelector('button[aria-label*="Copy" i]'))) {
      return actionGroup;
    }

    // Fallback: thumbs bar (works when role="group" is absent)
    const thumbBtn = container.querySelector(
      'button[data-testid="thumbs-up-button"], button[data-testid="thumbs-down-button"], ' +
      'button[aria-label="Good response"], button[aria-label="Bad response"], ' +
      'button[aria-label="Thumbs up"], button[aria-label="Thumbs down"]'
    );
    if (thumbBtn) {
      let bar = thumbBtn.parentElement;
      for (let i = 0; i < 4 && bar; i++) {
        if (bar.querySelectorAll('button').length >= 2 && bar.offsetHeight < 60) return bar;
        bar = bar.parentElement;
      }
      return thumbBtn.parentElement;
    }
    // DALL-E / image-generation card: download or regenerate button lives in the bottom bar
    const dalleBtn = container.querySelector(
      'button[aria-label="Download image"], button[aria-label="Regenerate"], ' +
      'button[data-testid*="download"], button[data-testid*="regenerate"], ' +
      'button[aria-label*="download" i], button[aria-label*="regenerate" i]'
    );
    if (dalleBtn) {
      let bar = dalleBtn.parentElement;
      for (let i = 0; i < 4 && bar; i++) {
        if (bar.querySelectorAll('button').length >= 2) return bar;
        bar = bar.parentElement;
      }
      return dalleBtn.parentElement;
    }
    const allDivs = container.querySelectorAll('div.flex');
    for (const div of allDivs) {
      if (div.querySelectorAll('button').length >= 2 && div.offsetHeight < 50) return div;
    }
    return null;
  }

  // ═══════════════════════════════════════════════════════════════
  //  GEMINI: INJECT BUTTONS
  // ═══════════════════════════════════════════════════════════════

  function addGeminiButtons() {
    // Gemini response containers
    const responses = document.querySelectorAll(
      'model-response, .model-response-text, .response-container, message-content[data-content-type="model"]'
    );

    for (const resp of responses) {
      // Walk up to find the message turn container
      const turnContainer = resp.closest('.conversation-turn') ||
                            resp.closest('message-content') ||
                            resp.closest('.response-turn') ||
                            resp;

      turnContainer.querySelectorAll('.' + BUTTON_CLASS).forEach(existingBtn => {
        const existingBar = existingBtn.parentElement;
        if (existingBar && !isGeminiResponseActionBar(existingBar)) existingBtn.remove();
      });

      if (turnContainer.querySelector('.' + BUTTON_CLASS)) continue;

      // Find action bar (Gemini has copy, thumbs up/down buttons)
      const actionArea = findGeminiActionBar(turnContainer) || findGeminiActionBar(resp);

      if (actionArea) {
        const btn = createExportButton();
        btn.addEventListener('click', (e) => handleExportClick(e, resp));
        insertBeforeMoreButton(actionArea, btn);
      }
    }

    // Also try to find responses by looking for the "copy" button in Gemini
    const copyButtons = document.querySelectorAll('button[aria-label="Copy"], button[data-tooltip="Copy"]');
    for (const copyBtn of copyButtons) {
      // Walk up to find the full action bar including three-dots button
      let actionBar = findGeminiActionRowFromButton(copyBtn) || copyBtn.parentElement;
      for (let i = 0; i < 3 && actionBar; i++) {
        const hasMore = actionBar.querySelector('button[aria-label*="more" i], button[data-tooltip*="more" i]');
        if (hasMore) break;
        actionBar = actionBar.parentElement;
      }
      if (!actionBar || actionBar.querySelector('.' + BUTTON_CLASS)) continue;

      if (!isGeminiResponseActionBar(actionBar)) continue;

      // Find the associated response content
      const turnContainer = copyBtn.closest('.conversation-turn') ||
                            copyBtn.closest('message-content') ||
                            copyBtn.closest('.response-container') ||
                            copyBtn.closest('div[class*="response"]');

      if (!turnContainer) continue;

      const contentEl = turnContainer.querySelector('.markdown-main-panel') ||
                        turnContainer.querySelector('.model-response-text') ||
                        turnContainer.querySelector('.response-content') ||
                        turnContainer;

      const btn = createExportButton();
      btn.addEventListener('click', (e) => handleExportClick(e, contentEl));
      insertBeforeMoreButton(actionBar, btn);
    }
  }

  function findGeminiActionBar(container) {
    const buttons = container.querySelectorAll('button');
    for (const btn of buttons) {
      const label = (btn.getAttribute('aria-label') || btn.getAttribute('data-tooltip') || '').toLowerCase();
      if (label.includes('copy') || label.includes('share') || label.includes('thumb') || label.includes('like') || label.includes('dislike')) {
        const bar = findGeminiActionRowFromButton(btn);
        if (bar) return bar;
      }
    }
    return Array.from(container.querySelectorAll('.action-buttons, .response-actions, [class*="action"]'))
      .find(isGeminiResponseActionBar) || null;
  }

  function findGeminiActionRowFromButton(btn) {
    let bar = btn?.parentElement;
    for (let i = 0; i < 6 && bar; i++, bar = bar.parentElement) {
      if (isGeminiResponseActionBar(bar)) return bar;
    }
    return null;
  }

  function isGeminiResponseActionBar(bar) {
    if (!bar) return false;
    const buttons = Array.from(bar.querySelectorAll('button'));
    if (buttons.length < 2) return false;

    const labels = buttons.map(btn =>
      (btn.getAttribute('aria-label') || btn.getAttribute('data-tooltip') || btn.textContent || '').toLowerCase()
    );
    const hasDownload = labels.some(label => label.includes('download'));
    const hasFeedback = labels.some(label =>
      label.includes('thumb') ||
      label.includes('like') ||
      label.includes('dislike') ||
      label.includes('good') ||
      label.includes('bad')
    );
    const hasResponseUtility = labels.some(label =>
      label.includes('share') ||
      label.includes('more') ||
      label.includes('option')
    );

    return !hasDownload && hasSingleGeminiButtonRow(buttons) && (hasFeedback || hasResponseUtility);
  }

  function hasSingleGeminiButtonRow(buttons) {
    const centers = buttons
      .map(btn => btn.getBoundingClientRect())
      .filter(rect => rect.width > 0 && rect.height > 0)
      .map(rect => rect.top + rect.height / 2);

    if (centers.length < 2) return true;
    return Math.max(...centers) - Math.min(...centers) <= 28;
  }

  // ═══════════════════════════════════════════════════════════════
  //  SHARED: CREATE BUTTON
  // ═══════════════════════════════════════════════════════════════

  function insertBeforeMoreButton(container, el) {
    // ChatGPT injects "询问 ChatGPT / 开始写作" spans (class: whitespace-nowrap + select-none)
    // into the action bar. Insert our button before them to keep it visible.
    const promptSpan = container.querySelector(
      'span[class*="whitespace-nowrap"][class*="select-none"]'
    );
    if (promptSpan) {
      let anchor = promptSpan;
      while (anchor.parentElement !== container) anchor = anchor.parentElement;
      container.insertBefore(el, anchor);
      return;
    }
    const moreBtn = container.querySelector(
      'button[aria-label*="more" i], button[aria-label*="option" i], ' +
      'button[data-tooltip*="more" i], button[data-testid*="more"]'
    );
    if (!moreBtn) { container.appendChild(el); return; }
    let anchor = moreBtn;
    while (anchor.parentElement !== container) anchor = anchor.parentElement;
    container.insertBefore(el, anchor);
  }

  function _updateExportBtnContent(btn) {
    const pathSpan  = btn.querySelector('.cgd-btn-path');
    const labelSpan = btn.querySelector('.cgd-btn-label');
    if (!pathSpan || !labelSpan) return;
    if (exportDest === 'local') {
      pathSpan.innerHTML = DOCX_ICON_SVG + '<span>Export .docx</span>';
      btn.title = 'Export as Word file';
    } else if (exportDest === 'markdown') {
      pathSpan.innerHTML = MARKDOWN_ICON_SVG + '<span>Export .md</span>';
      btn.title = 'Export as Markdown';
    } else if (exportDest === 'notion') {
      pathSpan.innerHTML = '<span style="font-size:12px;line-height:1;margin-right:3px">📋</span><span>Notion</span>';
      btn.title = 'Export to Notion';
    } else if (exportDest === 'obsidian') {
      pathSpan.innerHTML = '<span style="font-size:12px;line-height:1;margin-right:3px">🔮</span><span>Obsidian</span>';
      btn.title = 'Open in Obsidian';
    } else {
      pathSpan.innerHTML = DRIVE_ICON_SVG + '<span>Export</span>';
      btn.title = 'Export to Google Docs';
    }
    labelSpan.textContent = '';
    labelSpan.style.display = 'none';
  }

  function createExportButton() {
    const btn = document.createElement('button');
    btn.className = BUTTON_CLASS;

    const svgChevron = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>`;

    const pathSpan = document.createElement('span');
    pathSpan.className = 'cgd-btn-path';

    const labelSpan = document.createElement('span');
    labelSpan.className = 'cgd-btn-label';

    btn.appendChild(pathSpan);
    btn.appendChild(labelSpan);
    btn.insertAdjacentHTML('beforeend', svgChevron);

    btn.title = 'Export options';
    _updateExportBtnContent(btn);
    return btn;
  }

  // ═══════════════════════════════════════════════════════════════
  //  CLAUDE: INJECT BUTTONS
  // ═══════════════════════════════════════════════════════════════

  function addClaudeButtons() {
    const copyButtons = document.querySelectorAll('button[aria-label="Copy"]');

    for (const copyBtn of copyButtons) {
      // Exclude code-block copy buttons. Claude's code block header is a sibling of <pre>,
      // not inside it, so we also check whether a <pre> is a direct child of the button's
      // nearby ancestors (up to 3 hops) to catch the current Claude DOM structure.
      let isCodeBlockCopy = !!(
        copyBtn.closest('pre') ||
        copyBtn.closest('[data-code-block]') ||
        copyBtn.closest('.code-block') ||
        copyBtn.closest('[class*="code-block"]') ||
        copyBtn.closest('[class*="codeblock"]') ||
        copyBtn.closest('[class*="CodeBlock"]')
      );
      if (!isCodeBlockCopy) {
        let el = copyBtn.parentElement;
        for (let j = 0; j < 3 && el; j++, el = el.parentElement) {
          if (el.querySelector && el.querySelector(':scope > pre, :scope > code')) {
            isCodeBlockCopy = true;
            break;
          }
        }
      }
      if (isCodeBlockCopy) continue;

      // Find the message-level action bar (try multiple class names Claude has used)
      const actionBar = copyBtn.closest('.text-text-300') ||
                        copyBtn.closest('[class*="message-actions"]') ||
                        copyBtn.closest('[class*="action-bar"]') ||
                        copyBtn.parentElement?.parentElement;

      if (!actionBar) continue;
      if (actionBar.querySelector('.' + BUTTON_CLASS)) continue;

      // Walk up from the action bar to find the first ancestor containing a
      // `.standard-markdown` element — that's the AI response body in current Claude.
      let responseContainer = actionBar.parentElement;
      for (let i = 0; i < 10 && responseContainer && responseContainer !== document.body; i++) {
        if (responseContainer.querySelector('.standard-markdown')) break;
        responseContainer = responseContainer.parentElement;
      }
      if (!responseContainer || responseContainer === document.body) continue;

      // Skip user message containers
      if (responseContainer.querySelector('[class*="font-user-message"]')) continue;

      // Click handler runs against the response prose itself.
      const contentEl =
        responseContainer.querySelector('.standard-markdown') ||
        responseContainer.querySelector('[class*="markdown"]') ||
        responseContainer;

      const btn = createExportButton();
      btn.addEventListener('click', (e) => handleExportClick(e, contentEl));

      const wrapper = document.createElement('div');
      wrapper.className = 'w-fit';
      wrapper.appendChild(btn);
      actionBar.appendChild(wrapper);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  DEEPSEEK: INJECT BUTTONS
  // ═══════════════════════════════════════════════════════════════

  function addDeepSeekButtons() {
    const responses = _deepSeekFindResponses();
    for (const resp of responses) {
      if (resp.dataset.cgdInjected) continue;
      const container = resp.closest('[class*="message"]') ||
                        resp.closest('[class*="chat-message"]') ||
                        resp.parentElement;
      if (!container) continue;
      if (container.querySelector('.' + BUTTON_CLASS)) continue;

      const copyBtn = container.querySelector(
        'button[aria-label*="copy" i], button[title*="copy" i], ' +
        'button[class*="copy"], span[class*="copy"]'
      );

      let injected = false;
      if (copyBtn) {
        let actionBar = copyBtn.parentElement;
        for (let i = 0; i < 5 && actionBar; i++) {
          if (actionBar.querySelectorAll('button, span[role="button"]').length >= 2) break;
          actionBar = actionBar.parentElement;
        }
        if (actionBar && !actionBar.querySelector('.' + BUTTON_CLASS)) {
          const btn = createExportButton();
          btn.addEventListener('click', (e) => handleExportClick(e, resp));
          actionBar.appendChild(btn);
          injected = true;
        }
      }
      if (!injected) {
        const wrapper = document.createElement('div');
        wrapper.style.cssText = 'display:flex;justify-content:flex-end;padding:4px 0;';
        const btn = createExportButton();
        btn.addEventListener('click', (e) => handleExportClick(e, resp));
        wrapper.appendChild(btn);
        resp.parentElement?.insertBefore(wrapper, resp.nextSibling);
      }
      resp.dataset.cgdInjected = '1';
    }
  }

  function addPerplexityButtons() {
    const responses = _perplexityFindResponses();
    for (const resp of responses) {
      if (resp.dataset.cgdInjected) continue;
      const container = resp.closest('[class*="answer"], [data-testid*="answer"]') ||
                        resp.closest('[class*="response"]') ||
                        resp.parentElement;
      if (!container) continue;
      if (container.querySelector('.' + BUTTON_CLASS)) continue;

      const copyBtn = container.querySelector(
        'button[aria-label*="copy" i], button[title*="copy" i], ' +
        'button[class*="copy"], [data-testid*="copy"]'
      );

      let injected = false;
      if (copyBtn) {
        let actionBar = copyBtn.parentElement;
        for (let i = 0; i < 5 && actionBar; i++) {
          if (actionBar.querySelectorAll('button, [role="button"]').length >= 2) break;
          actionBar = actionBar.parentElement;
        }
        if (actionBar && !actionBar.querySelector('.' + BUTTON_CLASS)) {
          const btn = createExportButton();
          btn.addEventListener('click', (e) => handleExportClick(e, resp));
          actionBar.appendChild(btn);
          injected = true;
        }
      }
      if (!injected) {
        const wrapper = document.createElement('div');
        wrapper.style.cssText = 'display:flex;justify-content:flex-end;padding:4px 0;';
        const btn = createExportButton();
        btn.addEventListener('click', (e) => handleExportClick(e, resp));
        wrapper.appendChild(btn);
        resp.parentElement?.insertBefore(wrapper, resp.nextSibling);
      }
      resp.dataset.cgdInjected = '1';
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  INIT
  // ═══════════════════════════════════════════════════════════════

  function addButtons() {
    if (isChatGPT) addChatGPTButtons();
    if (isGemini) addGeminiButtons();
    if (isClaude) addClaudeButtons();
    if (isDeepSeek) addDeepSeekButtons();
    if (isPerplexity) addPerplexityButtons();

    // Gemini / URL-invariant: close panel when anchor leaves DOM
    const panel = document.querySelector('.cgd-panel');
    if (panel && _panelAnchorEl && !document.body.contains(_panelAnchorEl)) {
      panel.remove();
      _shouldReopenPanel = true;
      // 保留 _panelAnchorEl（已 detach，!contains() 持续为 true）
    }
    // Reopen: anchor gone from DOM = old content cleared; new messages ready
    if (!document.querySelector('.cgd-panel') && _shouldReopenPanel &&
        getAllAIMessages().length > 0 &&
        ((_panelOpenedOnPath && location.pathname !== _panelOpenedOnPath) ||
         !_panelAnchorEl || !document.body.contains(_panelAnchorEl))) {
      _shouldReopenPanel = false;
      showSelectPanel(null, null);
    }
  }

  function _onNavigation() {
    if (location.pathname !== _lastNavPath) {
      _lastNavPath = location.pathname;
      const panel = document.querySelector('.cgd-panel');
      if (panel) {
        panel.remove();
        _shouldReopenPanel = true;
        // 保留 _panelAnchorEl — 用于确认旧内容已从 DOM 清除后再重开
      }
    }
  }
  const _origPushState = history.pushState.bind(history);
  history.pushState = function(...args) {
    _origPushState(...args);
    setTimeout(_onNavigation, 100);
  };
  const _origReplaceState = history.replaceState.bind(history);
  history.replaceState = function(...args) {
    _origReplaceState(...args);
    setTimeout(_onNavigation, 100);
  };
  window.addEventListener('popstate', () => setTimeout(_onNavigation, 100));

  function setupSelectionButton() {
    let selBtn = null;

    function createSelBtn() {
      const btn = document.createElement('div');
      btn.className = 'cgd-sel-float' + (isDarkMode() ? ' cgd-dark' : '');
      btn.style.cssText = 'position:fixed;z-index:100002;display:none;';
      document.body.appendChild(btn);
      return btn;
    }

    function hideBtn() {
      if (selBtn) selBtn.style.display = 'none';
    }

    document.addEventListener('mouseup', () => {
      setTimeout(() => {
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed || !sel.toString().trim()) { hideBtn(); return; }
        if (!selBtn) selBtn = createSelBtn();

        chrome.storage.local.get(['globalRecentDocs', 'lastExports'], (data) => {
          const convKey = location.hostname + location.pathname;
          const convHistory = Array.isArray((data.lastExports || {})[convKey])
            ? (data.lastExports || {})[convKey] : [];
          const globalDocs = Array.isArray(data.globalRecentDocs) ? data.globalRecentDocs : [];
          const seen = new Set();
          const recents = [...convHistory, ...globalDocs].filter(e => {
            if (seen.has(e.fileId)) return false;
            seen.add(e.fileId); return true;
          }).slice(0, 2);

          const topDoc = recents[0] || null;
          const mainLabel = topDoc
            ? `→ Append to “${(topDoc.fileName || '').slice(0, 20)}”`
            : 'Export to Docs';

          selBtn.innerHTML = '';
          selBtn.className = 'cgd-sel-float' + (isDarkMode() ? ' cgd-dark' : '');
          const mainPart = document.createElement('span');
          mainPart.className = 'cgd-sel-main';
          mainPart.textContent = mainLabel;
          selBtn.appendChild(mainPart);

          if (recents.length > 0) {
            const arrow = document.createElement('span');
            arrow.className = 'cgd-sel-arrow';
            arrow.textContent = '▾';
            selBtn.appendChild(arrow);
          }

          const range = sel.getRangeAt(0);
          const rect = range.getBoundingClientRect();
          selBtn.style.left = `${Math.max(8, rect.left)}px`;
          selBtn.style.top = `${rect.top - 40}px`;
          selBtn.style.display = 'flex';

          mainPart.onclick = (e) => {
            e.stopPropagation();
            const curSel = window.getSelection();
            const wrapper = document.createElement('div');
            if (curSel && !curSel.isCollapsed) wrapper.appendChild(curSel.getRangeAt(0).cloneContents());
            hideBtn();
            if (topDoc) {
              showToast('⏳ Appending…');
              const text = extractMarkdown(wrapper);
              chrome.runtime.sendMessage({ action: 'appendToDoc', fileId: topDoc.fileId, text }, (resp) => {
                if (resp?.success) {
                  const _u = topDoc.url || `https://docs.google.com/document/d/${topDoc.fileId}/edit`;
                  showToast(`✅ Appended to "<b>${escHtml(topDoc.fileName)}</b>" · <a href="${_u}" target="_blank" style="color:#fff;text-decoration:underline">Open ↗</a>`, false, 6000);
                } else showToast('❌ Append failed: ' + (resp?.error || ''), true);
              });
            } else {
              exportMessage(wrapper, true);
            }
          };

          if (recents.length > 0) {
            selBtn.querySelector('.cgd-sel-arrow').onclick = (e) => {
              e.stopPropagation();
              _showSelDropdown(selBtn, recents, sel);
            };
          }
        });
      }, 10);
    });

    document.addEventListener('mousedown', (e) => {
      if (!selBtn || !selBtn.contains(e.target)) hideBtn();
    });
  }

  function _showSelDropdown(anchor, recents, sel) {
    document.querySelector('.cgd-sel-drop')?.remove();
    const drop = document.createElement('div');
    drop.className = 'cgd-sel-drop' + (isDarkMode() ? ' cgd-dark' : '');
    const wrapper = document.createElement('div');
    if (sel && !sel.isCollapsed) wrapper.appendChild(sel.getRangeAt(0).cloneContents());

    recents.forEach(doc => {
      const btn = document.createElement('button');
      btn.className = 'cgd-sel-drop-item';
      btn.textContent = `📄 ${(doc.fileName || '').slice(0, 28)}`;
      btn.addEventListener('click', () => {
        drop.remove();
        anchor.style.display = 'none';
        showToast('⏳ Appending…');
        const text = extractMarkdown(wrapper);
        chrome.runtime.sendMessage({ action: 'appendToDoc', fileId: doc.fileId, text }, (resp) => {
          if (resp?.success) {
            const _u = doc.url || `https://docs.google.com/document/d/${doc.fileId}/edit`;
            showToast(`✅ Appended to "<b>${escHtml(doc.fileName)}</b>" · <a href="${_u}" target="_blank" style="color:#fff;text-decoration:underline">Open ↗</a>`, false, 6000);
          } else showToast('❌ Append failed: ' + (resp?.error || ''), true);
        });
      });
      drop.appendChild(btn);
    });

    const divider = document.createElement('div');
    divider.className = 'cgd-sel-drop-divider';
    drop.appendChild(divider);

    const newBtn = document.createElement('button');
    newBtn.className = 'cgd-sel-drop-item';
    newBtn.textContent = 'Export to new Doc';
    newBtn.addEventListener('click', () => {
      drop.remove();
      anchor.style.display = 'none';
      exportMessage(wrapper, true);
    });
    drop.appendChild(newBtn);

    const rect = anchor.getBoundingClientRect();
    drop.style.cssText = `position:fixed;left:${rect.left}px;top:${rect.bottom + 4}px;z-index:100003;`;
    document.body.appendChild(drop);
    setTimeout(() => {
      const h = (ev) => {
        if (!drop.contains(ev.target) && !anchor.contains(ev.target)) {
          drop.remove();
          document.removeEventListener('click', h);
        }
      };
      document.addEventListener('click', h);
    }, 0);
  }

  function init() { addButtons(); setupSelectionButton(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  const observer = new MutationObserver(() => {
    clearTimeout(observer._t);
    observer._t = setTimeout(addButtons, 200);
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // ═══════════════════════════════════════════════════════════════
  //  POPUP MESSAGE LISTENER
  // ═══════════════════════════════════════════════════════════════

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'getPlatform') {
      const platform = isChatGPT ? 'ChatGPT' : isGemini ? 'Gemini' : isClaude ? 'Claude' : isDeepSeek ? 'DeepSeek' : isPerplexity ? 'Perplexity' : null;
      const responseCount = platform ? getAllAIMessages().length : 0;
      sendResponse({ platform, responseCount });
      return;
    }
    if (request.action === 'exportLast') {
      if (request.dest) exportDest = request.dest;
      sendResponse({ ok: true });
      const el = getLastAIMessage();
      if (!el) { showToast('❌ No AI response found on this page', true); return; }
      exportMessage(el);
      return;
    }
    if (request.action === 'exportFull') {
      if (request.dest) exportDest = request.dest;
      sendResponse({ ok: true });
      exportFullConversation();
      return;
    }
    if (request.action === 'openPanel') {
      if (request.dest) exportDest = request.dest;
      sendResponse({ ok: true });
      showSelectPanel(null);
      return;
    }
    if (request.action === 'triggerDefault') {
      sendResponse({ ok: true });
      chrome.storage.local.get(['defaultExportMode', 'exportDest'], (data) => {
        exportDest = data.exportDest || 'drive';
        const mode = data.defaultExportMode || 'select';
        if (mode === 'last') {
          const el = getLastAIMessage();
          if (el) exportMessage(el); else showToast('❌ No AI response found', true);
        } else if (mode === 'full') {
          exportFullConversation();
        } else {
          showSelectPanel(null);
        }
      });
      return;
    }
    if (request.action === 'exportSelection') {
      sendResponse({ ok: true });
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) { showToast('❌ No text selected', true); return; }
      const range = sel.getRangeAt(0);
      const wrapper = document.createElement('div');
      wrapper.appendChild(range.cloneContents());
      exportMessage(wrapper, true);
      return;
    }
  });
})();
