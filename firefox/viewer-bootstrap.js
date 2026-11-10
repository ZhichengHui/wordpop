/* Loaded by the bundled pdf.js viewer before viewer.mjs runs.
 * The viewer is opened as viewer.html?src=<pdf url>. pdf.js refuses a
 * cross-origin ?file= parameter, so we start it empty and open the URL here. */
'use strict';

(() => {
  const src = new URLSearchParams(location.search).get('src');

  document.addEventListener('webviewerloaded', () => {
    const opts = window.PDFViewerApplicationOptions;
    opts.set('disablePreferences', true);
    opts.set('defaultUrl', '');
    opts.set('enableScripting', false);
  }, { once: true });

  function addNativeButton() {
    const a = document.createElement('a');
    a.textContent = '用 Firefox 自带阅读器打开';
    a.href = src;
    a.style.cssText = 'position:fixed;right:12px;bottom:10px;z-index:100000;font:12px system-ui,sans-serif;' +
      'padding:4px 8px;border-radius:6px;background:rgba(0,0,0,.55);color:#fff;text-decoration:none;opacity:.6;';
    a.addEventListener('mouseenter', () => { a.style.opacity = '1'; });
    a.addEventListener('mouseleave', () => { a.style.opacity = '.6'; });
    a.addEventListener('click', async (ev) => {
      ev.preventDefault();
      await browser.runtime.sendMessage({ type: 'bypass', url: src });
      location.href = src;
    });
    document.body.append(a);
  }

  window.addEventListener('DOMContentLoaded', async () => {
    const app = window.PDFViewerApplication;
    if (!app || !src) return;
    addNativeButton();
    await app.initializedPromise;
    try {
      await app.open({ url: src, originalUrl: src, withCredentials: true });
    } catch (e) {
      console.error('WordPop: failed to open PDF', e);
    }
  });
})();
