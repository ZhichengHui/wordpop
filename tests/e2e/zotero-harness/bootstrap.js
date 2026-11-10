/* global Zotero, Services, ChromeUtils, IOUtils, Components, Ci */
/* Test harness plugin for tests/e2e/zotero_e2e.sh.
 * Installs dist/wordpop-zotero.xpi like a user would (AddonManager), then checks
 * lookups, the preference pane and the real reader selection popup, writes
 * result.json and reader-popup.png into $WORDPOP_E2E_DIR and quits Zotero. */
async function startup() {
  await Zotero.initializationPromise;
  const dir = Services.env.get('WORDPOP_E2E_DIR');
  const xpi = Services.env.get('WORDPOP_XPI');
  const out = { checks: [] };
  const check = (ok, msg) => out.checks.push({ ok: !!ok, msg });
  try {
    const { AddonManager } = ChromeUtils.importESModule('resource://gre/modules/AddonManager.sys.mjs');
    const inst = await AddonManager.getInstallForFile(Zotero.File.pathToFile(xpi));
    await inst.install();
    for (let i = 0; i < 100 && !(Zotero.WordPop && Zotero.WordPop.paneID); i++) await Zotero.Promise.delay(100);
    check(Zotero.WordPop, `plugin loaded from .xpi (version ${inst.addon && inst.addon.version})`);

    // Lookups through the engine (Collins data is read from the jar: URL).
    const expect = [
      ['pertinent', 'strict', 'collins'], ['soundness', 'strict', 'youdao'],
      ['soundness', 'loose', 'collins'], ['endeavor', 'strict', 'youdao'],
    ];
    for (const [w, mode, src] of expect) {
      const r = await Zotero.WordPop.engine.lookup(w, { mode });
      check(r.source === src && !r.errors.length,
        `lookup ${w}/${mode} -> ${r.source} (expected ${src}) errors=${JSON.stringify(r.errors)}`);
    }

    // Preference pane renders.
    Zotero.Utilities.Internal.openPreferences(Zotero.WordPop.paneID);
    await Zotero.Promise.delay(4000);
    const pw = Services.wm.getMostRecentWindow('zotero:pref');
    check(pw && pw.document.getElementById('wordpop-prefs'), 'preference pane rendered');
    check(pw && pw.document.querySelectorAll('#wordpop-prefs radio').length === 2, 'preference pane has two rule options');
    if (pw) pw.close();

    // Real reader selection popup.
    const win = Zotero.getMainWindow();
    win.resizeTo(1300, 900);
    const item = await Zotero.Attachments.importFromFile({ file: Zotero.File.pathToFile(dir + '/paper.pdf') });
    const reader = await Zotero.Reader.open(item.id);
    await reader._initPromise;
    await Zotero.Promise.delay(6000);
    const iwin = reader._iframeWindow;
    const params = {
      rect: [300, 300, 380, 316], anchorPoint: [380, 316], preferLeft: false, preferTop: false,
      annotation: {
        type: 'highlight', text: 'soundness', color: '#ffd400', sortIndex: '00000|000000|00000',
        position: { pageIndex: 0, rects: [[100, 600, 160, 612]] },
      },
    };
    // Internal API: may change between Zotero versions.
    reader._internalReader._updateState(Components.utils.cloneInto({ primaryViewSelectionPopup: params }, iwin));
    await Zotero.Promise.delay(5000);
    const popup = iwin.document.querySelector('.selection-popup');
    const box = iwin.document.querySelector('.wordpop-zotero');
    check(box && /soundness/.test(box.textContent) && /有道/.test(box.textContent), 'reader popup shows the lookup');
    const width = popup ? popup.getBoundingClientRect().width : 0;
    check(width > 300, `reader popup is wide enough (${width}px)`);

    const bmp = await win.browsingContext.currentWindowGlobal.drawSnapshot(null, 1, 'white');
    const c = win.document.createElementNS('http://www.w3.org/1999/xhtml', 'canvas');
    c.width = bmp.width; c.height = bmp.height;
    c.getContext('2d').drawImage(bmp, 0, 0);
    const data = c.toDataURL('image/png').split(',')[1];
    await IOUtils.write(dir + '/reader-popup.png', Uint8Array.from(atob(data), (ch) => ch.charCodeAt(0)));
  } catch (e) {
    check(false, 'exception: ' + e + '\n' + e.stack);
  }
  await Zotero.File.putContentsAsync(dir + '/result.json', JSON.stringify(out, null, 1));
  Services.startup.quit(Ci.nsIAppStartup.eForceQuit);
}
function shutdown() {}
function install() {}
function uninstall() {}
