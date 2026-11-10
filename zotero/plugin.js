/* global Zotero, WordPopCore, WordPopRender */
var WordPopPlugin = {
  PREFIX: 'extensions.wordpop.',
  XHTML: 'http://www.w3.org/1999/xhtml',
  id: null,
  engine: null,
  handler: null,
  paneID: null,

  getSettings() {
    const d = Object.assign({ popupWidth: 380, popupHeight: 360 }, WordPopCore.DEFAULTS);
    const get = (k) => {
      const v = Zotero.Prefs.get(this.PREFIX + k, true);
      return v === undefined || v === null || v === '' ? d[k] : v;
    };
    const int = (k, lo, hi) => {
      const n = parseInt(get(k), 10);
      return Number.isNaN(n) ? d[k] : Math.max(lo, Math.min(hi, n));
    };
    return {
      enabled: !!get('enabled'),
      mode: get('mode') === 'loose' ? 'loose' : 'strict',
      maxWords: int('maxWords', 1, 20),
      maxExamples: int('maxExamples', 0, 5),
      showEnglish: !!get('showEnglish'),
      popupWidth: int('popupWidth', 200, 1000),
      popupHeight: int('popupHeight', 120, 1000),
    };
  },

  async startup({ id, rootURI }) {
    this.id = id;
    this.engine = WordPopCore.createEngine({
      // rootURI is a jar: URL when the plugin is installed from an .xpi.
      // Zotero.File.getContentsFromURLAsync (Zotero.HTTP) rejects jar: URLs, fetch does not.
      async loadJSON(path) {
        const r = await Zotero.getMainWindow().fetch(rootURI + path);
        if (!r.ok) throw new Error(`HTTP ${r.status} for ${path}`);
        return r.json();
      },
      async fetchText(url) {
        const xhr = await Zotero.HTTP.request('GET', url, { responseType: 'text', timeout: 15000 });
        return xhr.response;
      },
      parseHTML(text) {
        const win = Zotero.getMainWindow();
        return new win.DOMParser().parseFromString(text, 'text/html');
      },
    });

    this.handler = (event) => {
      try {
        this.onTextSelectionPopup(event);
      } catch (e) {
        Zotero.logError(e);
      }
    };
    Zotero.Reader.registerEventListener('renderTextSelectionPopup', this.handler, id);
    Zotero.WordPop = this;

    this.paneID = await Zotero.PreferencePanes.register({
      pluginID: id,
      src: rootURI + 'prefs.xhtml',
      label: 'WordPop 划词词典',
    });
  },

  shutdown() {
    if (this.handler) Zotero.Reader.unregisterEventListener('renderTextSelectionPopup', this.handler);
    if (this.paneID) Zotero.PreferencePanes.unregister(this.paneID);
    this.handler = null;
    this.paneID = null;
    this.engine = null;
    if (Zotero.WordPop === this) delete Zotero.WordPop;
  },

  onTextSelectionPopup({ doc, params, append }) {
    const s = this.getSettings();
    const text = (params && params.annotation && params.annotation.text) || '';
    if (!s.enabled || !WordPopCore.shouldLookup(text, s)) return;

    const box = doc.createElementNS(this.XHTML, 'div');
    box.className = 'wordpop-zotero';
    // The reader caps .selection-popup at max-width: 198px and otherwise sizes it to
    // its content, so lift the cap and give the box a real width (kept inside the
    // reader view when the window is narrow). Translate for Zotero does the same.
    const popup = doc.querySelector('.selection-popup');
    if (popup) {
      popup.style.maxWidth = 'none';
      const colors = popup.querySelector('.colors');
      if (colors) {
        colors.style.width = '100%';
        colors.style.justifyContent = 'space-evenly';
      }
    }
    box.style.width = `${s.popupWidth}px`;
    box.style.maxWidth = 'calc(100vw - 48px)';
    box.style.boxSizing = 'border-box';
    box.style.maxHeight = `${s.popupHeight}px`;
    box.style.overflowY = 'auto';
    box.style.padding = '4px 6px';
    box.append(WordPopRender.styleElement(doc), WordPopRender.loading(doc, WordPopCore.normalize(text)));
    append(box);

    this.engine.lookup(text, s)
      .catch((e) => ({
        query: WordPopCore.normalize(text), source: null,
        errors: [{ source: 'internal', message: String(e) }],
      }))
      .then((result) => {
        box.replaceChildren(
          WordPopRender.styleElement(doc),
          WordPopRender.render(doc, result, {
            maxExamples: s.maxExamples,
            showEnglish: s.showEnglish,
            onSpeak: (url) => this.speak(url),
          })
        );
      });
  },

  speak(url) {
    try {
      const win = Zotero.getMainWindow();
      new win.Audio(url).play().catch((e) => Zotero.logError(e));
    } catch (e) {
      Zotero.logError(e);
    }
  },
};
