/* global WordPopCore */
'use strict';

const DEFAULTS = Object.assign({}, WordPopCore.DEFAULTS, { pdfViewer: true });
const VIEWER = browser.runtime.getURL('pdfjs/web/viewer.html');

const engine = WordPopCore.createEngine({
  async loadJSON(path) {
    const r = await fetch(browser.runtime.getURL(path));
    if (!r.ok) throw new Error(`HTTP ${r.status} for ${path}`);
    return r.json();
  },
  async fetchText(url) {
    const r = await fetch(url, { credentials: 'omit' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.text();
  },
  parseHTML(text) {
    return new DOMParser().parseFromString(text, 'text/html');
  },
});

async function getSettings() {
  return Object.assign({}, DEFAULTS, await browser.storage.local.get());
}

// The PDF redirect listener must answer synchronously, so keep a cached flag.
let pdfViewerEnabled = DEFAULTS.pdfViewer;
getSettings().then((s) => { pdfViewerEnabled = s.pdfViewer; });
browser.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.pdfViewer) pdfViewerEnabled = changes.pdfViewer.newValue !== false;
});

// URLs the user chose to open once in Firefox's own PDF viewer.
const bypass = new Set();

browser.runtime.onMessage.addListener((msg) => {
  switch (msg && msg.type) {
    case 'lookup':
      return getSettings().then((s) => engine.lookup(msg.text, s));
    case 'settings':
      return getSettings();
    case 'speak':
      new Audio(msg.url).play().catch(() => {});
      return Promise.resolve(true);
    case 'bypass':
      bypass.add(msg.url);
      return Promise.resolve(true);
    default:
      return undefined;
  }
});

function header(details, name) {
  const h = (details.responseHeaders || []).find((x) => x.name.toLowerCase() === name);
  return h && h.value ? h.value : '';
}

function isPdfResponse(details) {
  const type = header(details, 'content-type').toLowerCase().split(';')[0].trim();
  if (type === 'application/pdf' || type === 'application/x-pdf') return true;
  const generic = ['application/octet-stream', 'binary/octet-stream', 'application/download'];
  if (!generic.includes(type)) return false;
  let pathname = '';
  try { pathname = new URL(details.url).pathname; } catch (e) { return false; }
  const attachment = header(details, 'content-disposition').toLowerCase().startsWith('attachment');
  return /\.pdf$/i.test(pathname) && !attachment;
}

browser.webRequest.onHeadersReceived.addListener(
  (details) => {
    if (!pdfViewerEnabled || details.method !== 'GET') return undefined;
    if (details.statusCode < 200 || details.statusCode >= 300) return undefined;
    if (bypass.delete(details.url)) return undefined;
    if (!isPdfResponse(details)) return undefined;
    return { redirectUrl: `${VIEWER}?src=${encodeURIComponent(details.url)}` };
  },
  { urls: ['http://*/*', 'https://*/*'], types: ['main_frame'] },
  ['blocking', 'responseHeaders']
);

browser.action.onClicked.addListener(() => {
  browser.tabs.create({ url: VIEWER });
});

browser.runtime.onInstalled.addListener(async () => {
  const granted = await browser.permissions.contains({ origins: ['<all_urls>'] });
  if (!granted) browser.runtime.openOptionsPage();
});
