# AGENTS.md — working on WordPop

WordPop is an English→Chinese pop-up dictionary shipped as a Firefox extension
and a Zotero plugin that share one lookup engine. Read this file before
changing anything; it records how the pieces fit and the traps already found.

## Layout

```
core/lookup.js      lookup engine (Collins offline + Youdao online), shared
core/render.js      result → DOM nodes (XHTML namespace, no innerHTML), shared
firefox/            Firefox MV3 extension sources
  background.js     lookups, Youdao fetch, audio, PDF redirect (webRequest)
  content.js        selection popup (shadow DOM); also loaded by the PDF viewer
  viewer-bootstrap.js  opens ?src=<pdf url> in the bundled pdf.js viewer
  options.html/js   settings page
zotero/             Zotero 7+ bootstrap plugin
  bootstrap.js      loads core/*.js and plugin.js with loadSubScript
  plugin.js         engine host, reader popup handler, prefs, pref pane
  prefs.js          default prefs (extensions.wordpop.*)
  prefs.xhtml       preference pane (XUL fragment, `preference=` bindings)
vendor/pdfjs/       pdf.js generic viewer, unmodified release (see VERSION)
tools/
  fetch-data.sh     download ODH Revival from AMO → build data/ (pinned sha256)
  build-data.py     ODH bg/data → data/collins/<a-z|_>.json + data/wordforms.json
  build.sh          assemble dist/firefox, dist/wordpop-firefox-*.zip, dist/wordpop-zotero.xpi
  amo-status.py     query AMO signing status of a version, download when signed
tests/
  core.test.mjs     unit tests (node --test), Youdao fixtures in tests/fixtures/
  e2e/firefox_e2e.py   headless Firefox end-to-end test (selenium)
  e2e/zotero_e2e.sh    headless Zotero end-to-end test (throw-away profile)
```

`data/` and `dist/` are generated and git-ignored. The Collins data is
copyrighted and must never be committed (the repository is public).

## Lookup engine (core/lookup.js)

`WordPopCore.createEngine(host)` takes three host functions: `loadJSON(path)`
(path relative to the plugin root), `fetchText(url)`, `parseHTML(text)`.
`engine.lookup(text, settings)` returns:

```
{ query, mode, source: 'collins'|'youdao'|null, via: 'exact'|'wordform'|'online'|null,
  collins?, youdao?, base?, errors: [{ source: 'collins'|'youdao'|'internal', message }] }
```

- Rules: `strict` = exact Collins → Youdao → Collins via wordforms;
  `loose` = exact Collins → Collins via wordforms → Youdao.
- A failing source is skipped and reported in `errors`; the other source still
  answers. Results with errors are not cached (successful ones are, LRU 200).
- `wordforms.json` maps inflected *and derived* forms to a base form
  (soundness → sound). That is why `strict` exists.
- Collins keys are all lower case; data is sharded by first letter and loaded
  lazily.
- Youdao is scraped from `https://dict.youdao.com/w/<word>/`: `#phrsListTab`
  (basic), `#tPETrans` (professional, by domain), `#tWebTrans` (web),
  `#fanyiToggle` (machine translation of phrases/sentences). If Youdao changes
  its page, update `parseYoudao` and refresh `tests/fixtures/` (keep fixtures
  trimmed to these blocks).
- `normalize()` handles PDF artefacts (ligatures, soft hyphens, "endea-\nvor").
  `shouldLookup()` decides whether a selection triggers a lookup.

Shared code must stay a plain classic script defining one top-level `var`
(`WordPopCore`, `WordPopRender`): it is loaded as a background/content script,
by `<script>` in the pdf.js viewer, and by `loadSubScript` in Zotero.

## Firefox specifics

- MV3, `browser_specific_settings.gecko.id = wordpop@s2982359.local`. This ID
  is registered on AMO under the owner's account; keep it so updates stay one
  add-on. `strict_min_version` 142 (needed for `data_collection_permissions`).
- Host permission `<all_urls>` is needed for Youdao and for fetching PDFs.
  MV3 host permissions can be withheld by the user; the options page offers a
  grant button and `onInstalled` opens it when missing.
- Content scripts cannot run in Firefox's built-in PDF viewer (from memory of
  Firefox behaviour; consistent with what we observed). Hence the bundled
  viewer: `background.js` redirects main-frame PDF responses (by Content-Type)
  to `pdfjs/web/viewer.html?src=<url>`. Required for this to work:
  - `pdfjs/web/viewer.html` must be in `web_accessible_resources`, otherwise
    the redirect silently fails (tab stays on about:blank).
  - pdf.js rejects a cross-origin `?file=`, so `viewer-bootstrap.js` sets
    `defaultUrl` to '' on `webviewerloaded` and calls
    `PDFViewerApplication.open({url, withCredentials: true})` itself.
  - `build.sh` injects our scripts into the copied `viewer.html` after the
    `viewer.mjs` tag; it fails loudly if that tag changes in a new pdf.js.
  - extension CSP needs `'wasm-unsafe-eval'` for pdf.js decoders.
  - "Open in Firefox's viewer" adds the URL to a one-shot bypass set.
- The popup uses a closed shadow root with `adoptedStyleSheets`, so strict page
  CSPs (and the viewer's own CSP) do not block its styles.
- `file://` PDFs are not redirected (an extension cannot read them); users open
  them via the toolbar button + drag and drop.

## Zotero specifics

- Installed plugins live in an `.xpi`, so `rootURI` is a `jar:file:…!/` URL.
  `Zotero.File.getContentsFromURLAsync` / `Zotero.HTTP.request` **fail on
  jar: URLs** (NS_ERROR_FAILURE in `_parseURI`). Load files with
  `Zotero.getMainWindow().fetch(rootURI + path)`. Loading the plugin from an
  unpacked directory hides this bug — always test the built `.xpi`.
- The reader selection popup (`renderTextSelectionPopup`) is capped by the
  reader CSS at `.selection-popup { max-width: 198px }` and sizes to its
  content. `plugin.js` lifts the cap and gives the box an explicit width
  (prefs `popupWidth`, `popupHeight`).
- Preference pane: registered with `Zotero.PreferencePanes.register`; parsed as
  a XUL fragment. Number inputs are stored as strings by Zotero's binding;
  `getSettings()` parses and clamps them.
- `Zotero.WordPop` exposes the plugin object for tests and debugging.

## Build, test, verify

```sh
npm install
tools/fetch-data.sh                 # once; needs network
npm test                            # unit tests
tools/build.sh
python3 tests/e2e/firefox_e2e.py ~/wordpop-e2e/firefox   # needs selenium + geckodriver
tests/e2e/zotero_e2e.sh ~/wordpop-e2e/zotero             # needs Zotero 7+
```

- Run both e2e tests after any change that touches a plugin, and look at the
  screenshots they write, not only at PASS lines.
- Work directories for e2e tests must not be under a hidden directory when
  Firefox is a snap (snap cannot read `~/.something`). The same applies to
  `.xpi` files the user should install: copy them to e.g. `~/Downloads`.
- The Zotero e2e test runs with `-no-remote` and its own profile/data dir, so
  it can run while the user's Zotero is open. It drives the real reader popup
  through the internal `reader._internalReader._updateState(...)`; adjust if a
  Zotero update breaks it.
- WebDriver cannot script `moz-extension://` pages, so the Firefox viewer test
  serves `dist/firefox` over http with a `browser` API shim.

## Releasing

1. Bump `version` in `firefox/manifest.json` and/or `zotero/manifest.json`
   (AMO rejects a version number it has seen before).
2. `npm test`, `tools/build.sh`, both e2e tests.
3. Zotero: hand the user `dist/wordpop-zotero.xpi` (copied to a non-hidden
   directory). No signing needed.
4. Firefox: the owner signs with their AMO key (kept in
   `~/.config/amo/credentials` as `export WEB_EXT_API_KEY=… WEB_EXT_API_SECRET=…`;
   never print or commit it):
   `. ~/.config/amo/credentials && npx web-ext sign --source-dir dist/firefox --artifacts-dir dist --channel=unlisted`
   - Approval of unlisted versions is automatic but can take several minutes;
     `web-ext` may exit while "Waiting for approval".
   - Do **not** rerun `web-ext sign` for the same build: it resubmits the same
     upload and AMO answers "This upload has already been submitted".
     Instead poll and download with
     `. ~/.config/amo/credentials && python3 -I tools/amo-status.py wordpop@s2982359.local <version> dist`
     (status `unreviewed` → wait; `public` → the signed file is downloaded).
   - Do not rebuild between submitting and downloading.

## Conventions

- Plain JavaScript, no bundler, no runtime dependencies. Dev dependencies are
  pinned in `package.json`.
- UI strings are Chinese; code, comments and commit messages are English.
- Do not commit `data/`, `dist/`, credentials, or the user's e-mail address.
  Commits use the GitHub noreply address.
