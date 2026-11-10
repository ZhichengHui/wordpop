"""End-to-end test of the Firefox extension in headless Firefox.

Usage:  python3 tests/e2e/firefox_e2e.py <work-dir>

Needs: selenium (pip), geckodriver, network access (Youdao), and a built
dist/ (tools/build.sh). <work-dir> must not be inside a hidden directory when
Firefox is the snap package (snap cannot read dot-directories in $HOME).

Checks, writing screenshots to <work-dir>:
  1. web page: selecting words shows the popup (Collins and Youdao results);
  2. PDF: an http PDF is redirected to the bundled viewer (moz-extension URL);
  3. viewer: double-clicking words in the bundled pdf.js viewer shows the popup.
     WebDriver cannot drive moz-extension pages, so this step serves a copy of
     dist/firefox over http with a shim for the `browser` API (Collins only).
Exit code 0 when every check passed.
"""
import functools
import glob
import http.server
import os
import shutil
import sys
import threading
import time

from selenium import webdriver
from selenium.webdriver.common.action_chains import ActionChains
from selenium.webdriver.firefox.options import Options
from selenium.webdriver.firefox.service import Service

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
WORK = os.path.abspath(sys.argv[1])
SITE = os.path.join(WORK, 'site')
GECKODRIVER = shutil.which('geckodriver') or '/snap/bin/geckodriver'
PORT = 8765

failures = []


def check(cond, msg):
    print(('PASS ' if cond else 'FAIL ') + msg)
    if not cond:
        failures.append(msg)


def prepare():
    shutil.rmtree(SITE, ignore_errors=True)
    os.makedirs(SITE)
    zips = sorted(glob.glob(os.path.join(ROOT, 'dist', 'wordpop-firefox-*.zip')))
    if not zips:
        sys.exit('dist/wordpop-firefox-*.zip not found; run tools/build.sh')
    shutil.copy(zips[-1], os.path.join(WORK, 'wordpop-firefox.zip'))
    shutil.copy(os.path.join(ROOT, 'tests', 'e2e', 'paper.pdf'), os.path.join(SITE, 'paper.pdf'))
    with open(os.path.join(SITE, 'index.html'), 'w') as f:
        f.write('<!doctype html><html><head><meta charset="utf-8">'
                # A strict CSP: the popup must still be styled.
                '<meta http-equiv="Content-Security-Policy" content="default-src \'self\'; style-src \'self\'">'
                '</head><body><p style="font:18px serif">We endeavor to prove the soundness of the type '
                'system, and we show that pertinent results hold.</p></body></html>')
    # Unprivileged copy of the extension for the viewer test.
    ext = os.path.join(SITE, 'ext')
    shutil.copytree(os.path.join(ROOT, 'dist', 'firefox'), ext)
    with open(os.path.join(ext, 'shim.js'), 'w') as f:
        f.write("""window.browser = (() => {
  const engine = WordPopCore.createEngine({
    loadJSON: (p) => fetch('/ext/' + p).then((r) => r.json()),
    fetchText: () => Promise.reject(new Error('no network in shim')),
    parseHTML: (t) => new DOMParser().parseFromString(t, 'text/html'),
  });
  return {
    storage: { local: { get: async () => ({}) }, onChanged: { addListener() {} } },
    runtime: { sendMessage: async (m) => (m.type === 'lookup' ? engine.lookup(m.text, {}) : true) },
  };
})();
""")
    viewer = os.path.join(ext, 'pdfjs', 'web', 'viewer.html')
    s = open(viewer).read()
    s = s.replace('<script src="../../viewer-bootstrap.js"></script>',
                  '<script src="../../core/lookup.js"></script>\n<script src="../../shim.js"></script>\n'
                  '<script src="../../viewer-bootstrap.js"></script>', 1)
    open(viewer, 'w').write(s)


def driver(system_access=False):
    opts = Options()
    opts.add_argument('-headless')
    opts.page_load_strategy = 'none' if system_access else 'normal'
    args = ['--allow-system-access'] if system_access else []
    d = webdriver.Firefox(options=opts, service=Service(GECKODRIVER, service_args=args))
    d.set_window_size(1100, 900)
    return d


SELECT_IN_PAGE = """
const word = arguments[0];
const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
let n;
while ((n = walker.nextNode())) {
  const i = n.data.indexOf(word);
  if (i < 0) continue;
  const r = document.createRange();
  r.setStart(n, i); r.setEnd(n, i + word.length);
  const s = getSelection(); s.removeAllRanges(); s.addRange(r);
  document.dispatchEvent(new MouseEvent('mouseup', {bubbles: true, button: 0}));
  return true;
}
return false;
"""

FIND_IN_TEXT_LAYER = r"""
const word = arguments[0];
for (const span of document.querySelectorAll('.textLayer span')) {
  const t = span.firstChild;
  if (!t || t.nodeType !== 3) continue;
  const m = new RegExp('\\b' + word + '\\b').exec(t.data);
  if (!m) continue;
  const r = document.createRange();
  r.setStart(t, m.index); r.setEnd(t, m.index + word.length);
  const wr = r.getBoundingClientRect(), sr = span.getBoundingClientRect();
  if (wr.top < 40 || wr.bottom > innerHeight) continue;
  return [span, Math.round(wr.left + wr.width / 2 - (sr.left + sr.width / 2)),
          Math.round(wr.top + wr.height / 2 - (sr.top + sr.height / 2))];
}
return null;
"""

POPUP_VISIBLE = """
const h = document.querySelector('wordpop-popup');
return !!h && h.style.display !== 'none';
"""


def main():
    prepare()
    os.environ['TMPDIR'] = WORK  # snap Firefox needs a profile dir it can read
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=SITE)
    handler.log_message = lambda *a: None
    httpd = http.server.ThreadingHTTPServer(('127.0.0.1', PORT), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    try:
        # 1. web page
        d = driver()
        try:
            d.install_addon(os.path.join(WORK, 'wordpop-firefox.zip'), temporary=True)
            time.sleep(2)
            d.get(f'http://127.0.0.1:{PORT}/index.html')
            time.sleep(1)
            for w in ['endeavor', 'soundness', 'pertinent']:
                d.execute_script(SELECT_IN_PAGE, w)
                time.sleep(4)
                d.save_screenshot(os.path.join(WORK, f'page-{w}.png'))
                check(d.execute_script(POPUP_VISIBLE), f'page popup shown for {w!r} (see page-{w}.png)')
        finally:
            d.quit()

        # 2. PDF redirect (needs chrome context: the target is a privileged page)
        d = driver(system_access=True)
        try:
            d.install_addon(os.path.join(WORK, 'wordpop-firefox.zip'), temporary=True)
            time.sleep(2)
            d.get(f'http://127.0.0.1:{PORT}/paper.pdf')
            time.sleep(8)
            with d.context(d.CONTEXT_CHROME):
                url = d.execute_script('return gBrowser.selectedBrowser.currentURI.spec')
            check(url.startswith('moz-extension://') and 'pdfjs/web/viewer.html?src=' in url,
                  f'PDF redirected to bundled viewer ({url})')
        finally:
            d.quit()

        # 3. bundled viewer, real double-clicks
        d = driver()
        try:
            d.get(f'http://127.0.0.1:{PORT}/ext/pdfjs/web/viewer.html?src=/paper.pdf')
            time.sleep(6)
            check(d.execute_script("return document.querySelectorAll('.textLayer span').length") > 0,
                  'viewer rendered a text layer')
            for w in ['Specialization', 'compilers']:
                found = d.execute_script(FIND_IN_TEXT_LAYER, w)
                if not found:
                    check(False, f'viewer: word {w!r} found')
                    continue
                span, dx, dy = found
                ActionChains(d).move_to_element_with_offset(span, dx, dy).double_click().perform()
                time.sleep(2)
                d.save_screenshot(os.path.join(WORK, f'viewer-{w}.png'))
                check(d.execute_script(POPUP_VISIBLE), f'viewer popup shown for {w!r} (see viewer-{w}.png)')
        finally:
            d.quit()
    finally:
        httpd.shutdown()

    print('\n%d failure(s)' % len(failures))
    sys.exit(1 if failures else 0)


if __name__ == '__main__':
    main()
