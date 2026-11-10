/* global Zotero, Services, APP_SHUTDOWN */
var WordPop;

function install() {}

async function startup({ id, version, rootURI }) {
  await Zotero.initializationPromise;
  const ctx = { rootURI };
  for (const f of ['core/lookup.js', 'core/render.js', 'plugin.js']) {
    Services.scriptloader.loadSubScript(rootURI + f, ctx);
  }
  WordPop = ctx.WordPopPlugin;
  await WordPop.startup({ id, rootURI });
}

function shutdown(data, reason) {
  if (reason === APP_SHUTDOWN) return;
  if (WordPop) WordPop.shutdown();
  WordPop = null;
}

function uninstall() {}
