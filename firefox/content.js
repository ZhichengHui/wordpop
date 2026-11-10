/* global WordPopCore, WordPopRender */
/* Selection popup. Runs as a content script in web pages and is also loaded
 * directly by the bundled pdf.js viewer page. */
(() => {
  'use strict';
  if (window.__wordpopLoaded) return;
  window.__wordpopLoaded = true;

  const CARD_CSS = `
:host { all: initial; }
.wp-card { box-sizing: border-box; min-width: 220px; max-width: 380px; max-height: 360px;
  overflow: auto; padding: 10px 12px; border-radius: 8px;
  background: #fff; color: #1f1f1f; border: 1px solid rgba(0,0,0,.15);
  box-shadow: 0 6px 20px rgba(0,0,0,.18); }
@media (prefers-color-scheme: dark) {
  .wp-card { background: #2b2a33; color: #ececf0; border-color: rgba(255,255,255,.15); }
}
`;

  const DEFAULTS = Object.assign({}, WordPopCore.DEFAULTS, { pdfViewer: true });
  let settings = null;
  let host = null;
  let card = null;
  let seq = 0;
  let last = { text: '', time: 0 };

  async function getSettings() {
    if (!settings) settings = Object.assign({}, DEFAULTS, await browser.storage.local.get());
    return settings;
  }
  browser.storage.onChanged.addListener(() => { settings = null; });

  function ensureHost() {
    if (host && host.isConnected) return;
    host = document.createElement('wordpop-popup');
    host.style.position = 'fixed';
    host.style.zIndex = '2147483647';
    host.style.top = '0';
    host.style.left = '0';
    host.style.display = 'none';
    const shadow = host.attachShadow({ mode: 'closed' });
    const css = CARD_CSS + WordPopRender.CSS;
    try {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(css);
      shadow.adoptedStyleSheets = [sheet];
    } catch (e) {
      const style = document.createElement('style');
      style.textContent = css;
      shadow.append(style);
    }
    card = document.createElement('div');
    card.className = 'wp-card';
    shadow.append(card);
    (document.body || document.documentElement).append(host);
  }

  function hide() {
    seq++;
    if (host) host.style.display = 'none';
  }

  function place(rect) {
    host.style.display = 'block';
    const w = card.offsetWidth;
    const h = card.offsetHeight;
    const vw = document.documentElement.clientWidth || window.innerWidth;
    const vh = window.innerHeight;
    let top = rect.bottom + 8;
    if (top + h > vh - 8 && rect.top - h - 8 >= 8) top = rect.top - h - 8;
    top = Math.max(8, Math.min(top, vh - h - 8));
    const left = Math.max(8, Math.min(rect.left, vw - w - 8));
    host.style.top = `${top}px`;
    host.style.left = `${left}px`;
  }

  function isEditable(node) {
    const el = node && (node.nodeType === 1 ? node : node.parentElement);
    return !!(el && el.closest('input, textarea, [contenteditable=""], [contenteditable="true"]'));
  }

  async function onSelectionDone() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
    const text = sel.toString();
    if (!text.trim() || isEditable(sel.anchorNode)) return;

    const s = await getSettings();
    if (!s.enabled || !WordPopCore.shouldLookup(text, s)) return;

    const query = WordPopCore.normalize(text);
    const now = Date.now();
    if (query === last.text && now - last.time < 400) return;
    last = { text: query, time: now };

    const rect = sel.getRangeAt(0).getBoundingClientRect();
    if (!rect.width && !rect.height) return;

    ensureHost();
    const mine = ++seq;
    card.replaceChildren(WordPopRender.loading(document, query));
    place(rect);

    let result;
    try {
      result = await browser.runtime.sendMessage({ type: 'lookup', text });
    } catch (e) {
      result = { query, source: null, errors: [{ source: 'internal', message: String(e && e.message ? e.message : e) }] };
    }
    if (mine !== seq) return;
    card.replaceChildren(WordPopRender.render(document, result, {
      maxExamples: Number(s.maxExamples),
      showEnglish: !!s.showEnglish,
      onSpeak: (url) => browser.runtime.sendMessage({ type: 'speak', url }),
    }));
    card.scrollTop = 0;
    place(rect);
  }

  function insidePopup(ev) {
    return !!host && ev.composedPath().includes(host);
  }

  document.addEventListener('mouseup', (ev) => {
    if (ev.button !== 0 || insidePopup(ev)) return;
    setTimeout(onSelectionDone, 10);
  }, true);

  document.addEventListener('mousedown', (ev) => {
    if (!insidePopup(ev)) hide();
  }, true);

  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') hide();
  }, true);

  // pdf.js scrolls an inner container, so listen in the capture phase.
  document.addEventListener('scroll', (ev) => {
    if (host && host.style.display !== 'none' && ev.target !== host) hide();
  }, true);
  window.addEventListener('resize', hide);
})();
