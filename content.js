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

  async function _captureImages() {
    const map = {};
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
      // Works for AI platform CDNs listed in host_permissions (oaiusercontent.com, googleusercontent.com)
      const src = (el && (el.src || el.getAttribute('src'))) || '';
      if (!src || src.startsWith('data:')) continue;
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
      if (tag === 'p') return `\n${getInner(node)}\n`;
      if (tag === 'ol') { let r = '\n', n = 1; for (const li of node.querySelectorAll(':scope > li')) { r += `${n}. ${getInner(li).replace(/\n+/g, ' ').trim()}\n`; n++; } return r; }
      if (tag === 'ul') { let r = '\n'; for (const li of node.querySelectorAll(':scope > li')) r += `- ${getInner(li).replace(/\n+/g, ' ').trim()}\n`; return r; }
      if (tag === 'pre') { const code = node.querySelector('code'); return `\n\`\`\`\n${(code || node).textContent}\n\`\`\`\n`; }
      if (tag === 'code' && !node.closest('pre')) return `\`${node.textContent}\``;
      if (tag === 'img') {
        const alt = node.getAttribute('alt') || node.getAttribute('aria-label') || '';
        const src = node.src || node.getAttribute('src') || '';
        if (src && !src.startsWith('data:image/svg')) {
          _imgCaptures.push({ idx: _imgIdx, el: node, alt });
          return `[[IMG:${_imgIdx++}]]`;
        }
        return alt || '[Image]';
      }
      if (tag === 'br') return '\n';
      if (tag === 'hr') return '\n---\n';
      if (tag === 'strong' || tag === 'b') return `**${getInner(node)}**`;
      if (tag === 'em' || tag === 'i') return `*${getInner(node)}*`;
      if (tag === 'sub') return `~${getInner(node)}~`;
      if (tag === 'sup') return `^${getInner(node)}^`;
      if (tag === 'table') return processTable(node);
      return getInner(node);
    } catch(e) { return node.textContent || ''; }
  }

  // Extract TeX from any element that might contain KaTeX/MathJax annotations
  function extractTeX(el) {
    // Try data-math attribute (Gemini)
    const dataMath = el.getAttribute('data-math');
    if (dataMath) return dataMath.trim();
    // Try annotation element (ChatGPT KaTeX)
    const ann = el.querySelector('annotation[encoding="application/x-tex"]');
    if (ann) return ann.textContent.trim();
    // Try MathJax script
    const script = el.querySelector('script[type="math/tex"], script[type="math/tex; mode=display"]');
    if (script) return script.textContent.trim();
    // Try other data attributes
    const formula = el.getAttribute('data-formula') || el.getAttribute('aria-label');
    if (formula) return formula.trim();
    return '';
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
        contentDiv = messageEl.querySelector('.markdown') || messageEl;
      } else if (isGemini) {
        contentDiv = messageEl.querySelector('.markdown-main-panel') ||
                     messageEl.querySelector('.model-response-text') ||
                     messageEl.querySelector('.response-content') ||
                     messageEl;
      } else if (isClaude) {
        // Primary: .standard-markdown (current Claude markdown wrapper).
        // If messageEl is already .standard-markdown (typical when called from
        // _claudeFindResponses), the descendant query returns null and we use messageEl.
        contentDiv = messageEl.querySelector('.standard-markdown') ||
                     messageEl.querySelector('[class*="markdown"]') ||
                     messageEl;
      } else {
        contentDiv = messageEl;
      }
      let md = '';
      for (const child of contentDiv.childNodes) md += processNode(child);

      // If the chosen contentDiv yielded almost nothing, retry with the original messageEl
      // (the wrapper might be a metadata/header div that doesn't contain the response body).
      if (md.trim().length < 20 && contentDiv !== messageEl) {
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
      if (md.trim().length < 20) {
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
      if (md.trim().length < 20) {
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
        if (['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'br'].includes(blockTag)) {
          if (blockTag === 'br') md += '\n';
          else if (/^h[1-6]$/.test(blockTag)) md += '\n' + '#'.repeat(parseInt(blockTag[1])) + ' ';
          else if (blockTag === 'li') md += '\n- ';
          else md += '\n';
        }
        if (blockTag === 'strong' || blockTag === 'b') md += '**';
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
    }

    // Fallback: strip platform suffix from document.title
    if (!title) {
      title = document.title
        .replace(/\s*[-|–]\s*(Google\s+)?(ChatGPT|Claude|Gemini)\s*$/i, '')
        .replace(/^(Google\s+)?(ChatGPT|Claude|Gemini)\s*[-|–]?\s*/i, '')
        .trim();
    }

    // Sanitize: remove filename-unsafe chars, collapse spaces, cap at 50 chars
    if (title) {
      title = title.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, '_').slice(0, 50);
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

  async function exportMarkdown(markdown, suffix, imageMap = {}) {
    suffix = suffix || '';
    // Replace image markers that couldn't be captured with text fallbacks
    markdown = markdown.replace(/\[\[IMG:(\d+)\]\]/g, (match, raw) => {
      const idx = parseInt(raw);
      if (imageMap[idx]) return match;
      const cap = _imgCaptures.find(c => c.idx === idx);
      return cap?.alt ? `[Image: ${cap.alt}]` : '[Image]';
    });

    // Header: metadata line + MLA citation line (top of doc — survives appends).
    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
    const platformName = isGemini ? 'Gemini' : isClaude ? 'Claude' : 'ChatGPT';
    const convTitle = getConversationTitle();
    const metaParts = [platformName, dateStr, ...(convTitle ? [convTitle] : [])];
    const sourceUrl = location.origin + location.pathname;
    const vendor = isGemini ? 'Google' : isClaude ? 'Anthropic' : 'OpenAI';
    const mlaMonths = ['Jan.','Feb.','Mar.','Apr.','May','June','July','Aug.','Sept.','Oct.','Nov.','Dec.'];
    const mlaDate = `${now.getDate()} ${mlaMonths[now.getMonth()]} ${now.getFullYear()}`;
    const citeTitle = (convTitle ? convTitle.replace(/_/g, ' ') : 'AI conversation');
    const citation = `${vendor}. "${citeTitle}." ${platformName}, ${mlaDate}, ${sourceUrl}.`;
    markdown = `*${metaParts.join(' · ')}*\n*Citation (MLA): ${citation}*\n\n` + markdown;

    const timestamp = `${now.getFullYear()}${(now.getMonth()+1).toString().padStart(2,'0')}${now.getDate().toString().padStart(2,'0')}_${now.getHours().toString().padStart(2,'0')}${now.getMinutes().toString().padStart(2,'0')}`;
    const platform = platformName;
    const filename = convTitle
      ? `${convTitle}${suffix}.docx`
      : `${platform}_Export${suffix}_${timestamp}.docx`;

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
            { action: 'uploadToDrive', docxBase64: base64, filename, platform: platformName },
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

  async function exportMessage(messageEl) {
    showToast('⏳ Generating document...');
    _resetImgCaptures();
    const markdown = extractMarkdown(messageEl);
    if (!markdown || !markdown.trim()) {
      showToast('❌ Could not extract content from this message', true);
      return;
    }
    const imageMap = await _captureImages();
    await exportMarkdown(markdown, '', imageMap);
  }

  // ═══════════════════════════════════════════════════════════════
  //  POPUP: GET LAST AI MESSAGE
  // ═══════════════════════════════════════════════════════════════

  function getLastAIMessage() {
    if (isChatGPT) {
      const msgs = document.querySelectorAll('[data-message-author-role="assistant"]');
      const last = msgs[msgs.length - 1];
      return last ? (last.querySelector('.markdown') || last) : null;
    }
    if (isGemini) {
      const msgs = getAllAIMessages();
      return msgs[msgs.length - 1] || null;
    }
    if (isClaude) {
      const responses = _claudeFindResponses();
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
        const contentEl = role === 'assistant' ? (msg.querySelector('.markdown') || msg) : msg;
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
    const base = getConversationTitle() || 'table';
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
      return Array.from(document.querySelectorAll('[data-message-author-role="assistant"]'))
        .map(el => el.querySelector('.markdown') || el);
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
    return [];
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
      if (btn.closest('pre') || btn.closest('[data-code-block]') || btn.closest('.code-block')) return;
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

  function getCleanPreview(msgEl) {
    const clone = msgEl.cloneNode(true);
    // Remove our injected buttons and any native UI buttons
    clone.querySelectorAll('.' + BUTTON_CLASS + ', button, [role="button"], svg, style, script').forEach(el => el.remove());
    // Remove external image attribution links (e.g. "Opens in a new window · stockcake.com")
    clone.querySelectorAll('a[target="_blank"]').forEach(el => el.remove());
    const text = (clone.textContent || '').replace(/\s+/g, ' ').trim();
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

  function _showAppendDropdown(anchor, exp) {
    document.querySelector('.cgd-append-drop')?.remove();
    const drop = document.createElement('div');
    drop.className = 'cgd-append-drop' + (isDarkMode() ? ' cgd-dark' : '');
    const items = [
      { text: '↩ Last response', fn: () => _appendToRecent(exp) },
      { text: '≡ Full conversation', fn: () => _appendFullToDoc(exp) },
      { text: '☑ Pick responses', fn: () => showSelectPanel(null, exp) }
    ];
    items.forEach(({ text, fn }) => {
      const btn = document.createElement('button');
      btn.className = 'cgd-append-drop-item';
      btn.textContent = text;
      btn.addEventListener('click', (e) => { e.stopPropagation(); drop.remove(); fn(); });
      drop.appendChild(btn);
    });
    const rect = anchor.getBoundingClientRect();
    drop.style.cssText = `position:fixed;bottom:${window.innerHeight - rect.top + 4}px;left:${rect.left}px;z-index:100001;`;
    document.body.appendChild(drop);
    setTimeout(() => {
      const handler = (e) => { if (!drop.contains(e.target)) { drop.remove(); document.removeEventListener('click', handler); } };
      document.addEventListener('click', handler);
    }, 0);
  }

  function showSelectPanel(thisMessageEl, appendTarget = null) {
    const existing = document.querySelector('.cgd-panel');
    if (existing) {
      existing.remove();
      if (!appendTarget) return; // toggle-close in normal mode; in append mode, continue to open new panel
    }

    const messages = getAllAIMessages();
    if (messages.length === 0) { showToast('❌ No AI responses found', true); return; }

    chrome.storage.local.get(['lastExports', 'globalRecentDocs'], (storageData) => {
      _buildSelectPanel(messages, thisMessageEl, storageData, appendTarget);
    });
  }

  function _buildSelectPanel(messages, thisMessageEl, storageData = {}, appendTarget = null) {
    const platform = isGemini ? 'Gemini' : isClaude ? 'Claude' : 'ChatGPT';
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

    destRow.appendChild(btnDrive);
    destRow.appendChild(btnLocal);
    destRow.appendChild(btnMd);

    // ── Path confirmation row (below export buttons — created here, appended after actionRow) ──
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
      } else if (exportDest === 'drive') {
        const _platLabel = isGemini ? 'Gemini' : isClaude ? 'Claude' : 'ChatGPT';
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
        exportBtn.textContent = exportDest === 'local' ? 'Save .docx →' : 'Export to Docs →';
      }
    }

    function buildRecentChips() {
      recentRow.innerHTML = '';
      recentRow.style.display = (exportDest === 'drive' && recents.length > 0) ? 'flex' : 'none';
      if (exportDest !== 'drive' || recents.length === 0) return;
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
        icon.textContent = '↩';

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

        const appendBtn = document.createElement('button');
        appendBtn.className = 'cgd-rc-btn';
        appendBtn.textContent = '+↩';
        const isSameConv = convHistory.some(e => e.fileId === exp.fileId);
        appendBtn.title = isSameConv ? 'Continue this document' : 'Append last response to this doc';
        appendBtn.addEventListener('click', (e) => { e.stopPropagation(); _showAppendDropdown(appendBtn, exp); });

        const openBtn = document.createElement('a');
        openBtn.className = 'cgd-rc-btn';
        openBtn.href = exp.url || `https://docs.google.com/document/d/${exp.fileId}/edit`;
        openBtn.target = '_blank';
        openBtn.textContent = '↗';
        openBtn.title = 'Open in Drive';
        openBtn.addEventListener('click', e => e.stopPropagation());

        actions.appendChild(appendBtn);
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
    btnDrive.addEventListener('click', () => setDest('drive'));
    btnLocal.addEventListener('click', () => setDest('local'));
    btnMd.addEventListener('click',    () => setDest('markdown'));

    // ── Action row: Last / Full / Pick ──
    const actionRow = document.createElement('div');
    actionRow.className = 'cgd-action-row';

    const btnLast = document.createElement('button');
    btnLast.className = 'cgd-action-btn';
    btnLast.textContent = '↩ Last';
    btnLast.title = 'Export last AI response';

    const btnFull = document.createElement('button');
    btnFull.className = 'cgd-action-btn';
    btnFull.textContent = '≡ Full';
    btnFull.title = 'Export full conversation';

    const btnPick = document.createElement('button');
    btnPick.className = 'cgd-action-btn';
    btnPick.textContent = '☑ Pick';
    btnPick.title = 'Select specific responses';

    actionRow.appendChild(btnLast);
    actionRow.appendChild(btnFull);
    actionRow.appendChild(btnPick);

    // ── Pick area (collapsed by default) ──
    const pickArea = document.createElement('div');
    pickArea.className = 'cgd-pick-area';
    pickArea.style.display = 'none';

    // ── Select all / none ──
    const controls = document.createElement('div');
    controls.className = 'cgd-panel-controls';
    controls.innerHTML = `<button class="cgd-ctrl-btn" id="cgd-sa">Select all</button><button class="cgd-ctrl-btn" id="cgd-sn">Deselect all</button>`;

    // ── Message list ──
    const list = document.createElement('div');
    list.className = 'cgd-panel-list';
    const checkboxes = [];
    const rowEls = [];

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
      cb.checked = true;
      checkboxes.push(cb);
      cb.addEventListener('change', updateCount);

      const textWrap = document.createElement('div');
      textWrap.style.flex = '1';
      textWrap.style.cursor = 'pointer';
      textWrap.title = 'Click to jump to this response';

      const numDiv = document.createElement('div');
      numDiv.className = 'cgd-msg-num';

      const numText = document.createElement('span');
      numText.textContent = `Response ${i + 1}`;

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
    countLabel.textContent = messages.length + ' selected';

    const exportBtn = document.createElement('button');
    exportBtn.className = 'cgd-export-sel-btn';
    if (appendTarget) {
      const shortName = (appendTarget.fileName || '').length > 20 ? appendTarget.fileName.slice(0, 18) + '…' : (appendTarget.fileName || 'doc');
      exportBtn.textContent = `Append to "${shortName}" →`;
    } else {
      exportBtn.textContent = exportDest === 'local' ? 'Save .docx →' : 'Export to Docs →';
    }

    footerMain.appendChild(countLabel);
    footerMain.appendChild(exportBtn);
    footer.appendChild(footerMain);

    pickArea.appendChild(controls);
    pickArea.appendChild(list);
    pickArea.appendChild(footer);

    // ── Assemble: skip dest/recent/path rows in append mode ──
    panel.appendChild(header);
    if (!appendTarget) {
      panel.appendChild(destRow);
      panel.appendChild(recentRow);
      panel.appendChild(actionRow);
      panel.appendChild(pathRow);
    }
    panel.appendChild(pickArea);
    if (appendTarget) {
      pickArea.style.display = 'flex'; // auto-expand pick area in append mode
    }

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

    btnLast.addEventListener('click', () => {
      if (selectedChip) {
        _appendToRecent(selectedChip);
        close();
      } else {
        close();
        const el = getLastAIMessage();
        if (el) exportMessage(el); else showToast('❌ No AI response found', true);
      }
    });

    btnFull.addEventListener('click', () => {
      if (selectedChip) {
        _appendFullToDoc(selectedChip);
        close();
      } else {
        close();
        exportFullConversation();
      }
    });

    btnPick.addEventListener('click', () => {
      const open = pickArea.style.display !== 'none';
      pickArea.style.display = open ? 'none' : 'flex';
      btnPick.classList.toggle('cgd-action-btn-active', !open);
      if (!open) {
        setTimeout(() => {
          if (thisIdx !== -1 && rowEls[thisIdx]) rowEls[thisIdx].scrollIntoView({ block: 'nearest' });
          else list.scrollTop = list.scrollHeight;
        }, 30);
      }
    });

    controls.querySelector('#cgd-sa').addEventListener('click', () => { checkboxes.forEach(cb => cb.checked = true); updateCount(); });
    controls.querySelector('#cgd-sn').addEventListener('click', () => { checkboxes.forEach(cb => cb.checked = false); updateCount(); });

    exportBtn.addEventListener('click', exportSelected);

    document.body.appendChild(panel);
    setTimeout(() => document.addEventListener('click', outsideClickHandler), 0);
  }

  // ═══════════════════════════════════════════════════════════════
  //  CHATGPT: INJECT BUTTONS
  // ═══════════════════════════════════════════════════════════════

  function addChatGPTButtons() {
    const messages = document.querySelectorAll('[data-message-author-role="assistant"]');
    for (const msg of messages) {
      const container = msg.closest('.group\\/conversation-turn') || msg.closest('[data-testid^="conversation-turn"]');
      if (!container || container.querySelector('.' + BUTTON_CLASS)) continue;
      const actionArea = findChatGPTActionBar(container);
      if (!actionArea) continue;

      const btn = createExportButton();
      btn.addEventListener('click', (e) => handleExportClick(e, msg.querySelector('.markdown') || msg));
      insertBeforeMoreButton(actionArea, btn);
    }
  }

  function findChatGPTActionBar(container) {
    // Always prefer the thumbs bar — it's the canonical bottom action bar on both text
    // and image responses. Checking copy-turn-action-button first was wrong because
    // ChatGPT image cards also expose a copy button in the top-right overlay, causing
    // the export button to land there instead of the bottom bar.
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
    // Fallback for text responses where thumbs haven't rendered yet
    const copyBtn = container.querySelector('button[data-testid="copy-turn-action-button"]');
    if (copyBtn) {
      let bar = copyBtn.parentElement;
      for (let i = 0; i < 3 && bar; i++) {
        if (bar.querySelector('button[data-testid*="more"]')) return bar;
        bar = bar.parentElement;
      }
      return copyBtn.parentElement;
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
      // Exclude code-block copy buttons — they live inside <pre> or a code toolbar
      if (copyBtn.closest('pre') || copyBtn.closest('[data-code-block]') || copyBtn.closest('.code-block')) continue;

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
  //  INIT
  // ═══════════════════════════════════════════════════════════════

  function addButtons() {
    if (isChatGPT) addChatGPTButtons();
    if (isGemini) addGeminiButtons();
    if (isClaude) addClaudeButtons();
  }

  function init() { addButtons(); }
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
      const platform = isChatGPT ? 'ChatGPT' : isGemini ? 'Gemini' : isClaude ? 'Claude' : null;
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
  });
})();
