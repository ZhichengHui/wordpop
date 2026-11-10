/* WordPop lookup engine, shared by the Firefox extension and the Zotero plugin.
 *
 * The host supplies three functions:
 *   loadJSON(path)   -> Promise<object>   path is relative to the plugin root
 *   fetchText(url)   -> Promise<string>   GET request, rejects on HTTP errors
 *   parseHTML(text)  -> Document
 *
 * Rules ("mode"):
 *   strict: Collins entry for the word itself -> Youdao online
 *           -> Collins entry of the base form (wordforms.json)
 *   loose:  Collins entry for the word itself -> Collins entry of the base form
 *           -> Youdao online
 */
var WordPopCore = (() => {
  'use strict';

  const DEFAULTS = { mode: 'strict', maxWords: 5, maxExamples: 1 };
  const MAX_CHARS = 80;

  function normalize(text) {
    if (typeof text !== 'string') return '';
    let t = text.normalize('NFKC');
    t = t.replace(/­/g, '');                     // soft hyphen
    t = t.replace(/([A-Za-z])-\s*[\r\n]+\s*([a-z])/g, '$1$2'); // "endea-\nvor" from PDFs
    t = t.replace(/[‘’]/g, "'");
    t = t.replace(/\s+/g, ' ').trim();
    t = t.replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, '');    // surrounding punctuation, digits
    return t;
  }

  function countWords(t) {
    return t ? t.split(' ').length : 0;
  }

  // Whether a selection should trigger a lookup at all.
  function shouldLookup(text, settings) {
    const s = Object.assign({}, DEFAULTS, settings);
    const t = normalize(text);
    if (!t || t.length > MAX_CHARS) return false;
    if (/[぀-ヿ㐀-鿿가-힯]/.test(t)) return false; // CJK
    if (!/^[A-Za-z][A-Za-z0-9 '.,;:\-\/()]*$/.test(t)) return false;
    return countWords(t) <= s.maxWords;
  }

  function textOf(node) {
    return node ? node.textContent.replace(/\s+/g, ' ').trim() : '';
  }

  function parseYoudao(doc) {
    const result = {
      headword: '', phonetics: [], defs: [], forms: '',
      professional: [], web: [], translation: ''
    };
    const basic = doc.querySelector('#phrsListTab');
    if (basic) {
      result.headword = textOf(basic.querySelector('.keyword'));
      for (const p of basic.querySelectorAll('.baav .pronounce')) {
        const phon = textOf(p.querySelector('.phonetic'));
        if (!phon) continue;
        const label = textOf(p).replace(phon, '').trim();
        result.phonetics.push({ label, text: phon });
      }
      for (const li of basic.querySelectorAll('.trans-container ul li')) {
        const d = textOf(li);
        if (d) result.defs.push(d);
      }
      result.forms = textOf(basic.querySelector('.trans-container .additional'))
        .replace(/^\[\s*|\s*\]$/g, '');
    }

    const pe = doc.querySelector('#tPETrans');
    if (pe) {
      const domains = {};
      for (const a of pe.querySelectorAll('.type-list .p-type')) {
        domains[a.getAttribute('rel')] = textOf(a);
      }
      for (const li of pe.querySelectorAll('#tPETrans-all-trans > li')) {
        const cls = Array.from(li.classList).find((c) => /^ptype_\d+$/.test(c));
        const terms = [];
        for (const t of li.querySelectorAll('.items > .title')) {
          const term = textOf(t);
          if (term && !terms.includes(term)) terms.push(term);
        }
        if (terms.length) result.professional.push({ domain: domains[cls] || '', terms });
      }
    }

    for (const t of doc.querySelectorAll('#tWebTrans .wt-container > .title > span')) {
      const term = textOf(t);
      if (term && !result.web.includes(term)) result.web.push(term);
      if (result.web.length >= 5) break;
    }

    const fanyi = doc.querySelectorAll('#fanyiToggle .trans-container p');
    if (fanyi.length >= 2) result.translation = textOf(fanyi[1]);

    const empty = !result.defs.length && !result.professional.length &&
      !result.web.length && !result.translation;
    return empty ? null : result;
  }

  function createEngine(host) {
    const shards = new Map();
    let wordforms = null;

    function shardName(word) {
      const c = word.charAt(0).toLowerCase();
      return c >= 'a' && c <= 'z' ? c : '_';
    }

    async function collinsEntry(word) {
      if (!word) return null;
      const key = word.toLowerCase();
      const name = shardName(key);
      if (!shards.has(name)) {
        // Cache the promise so concurrent lookups load a shard once.
        const p = host.loadJSON(`data/collins/${name}.json`).catch((e) => {
          shards.delete(name);
          throw e;
        });
        shards.set(name, p);
      }
      const shard = await shards.get(name);
      const entry = shard[key];
      return entry ? Object.assign({ headword: key }, entry) : null;
    }

    async function baseForm(word) {
      if (!wordforms) {
        wordforms = host.loadJSON('data/wordforms.json').catch((e) => {
          wordforms = null;
          throw e;
        });
      }
      const forms = await wordforms;
      const base = forms[word] || forms[word.toLowerCase()] || null;
      return base && base.toLowerCase() !== word.toLowerCase() ? base : null;
    }

    async function youdao(word) {
      const url = 'https://dict.youdao.com/w/' + encodeURIComponent(word) + '/';
      const html = await host.fetchText(url);
      return parseYoudao(host.parseHTML(html));
    }

    async function lookup(text, settings) {
      const s = Object.assign({}, DEFAULTS, settings);
      const query = normalize(text);
      const result = { query, mode: s.mode, source: null, via: null };
      if (!query) return result;

      const exact = await collinsEntry(query);
      if (exact) return Object.assign(result, { source: 'collins', via: 'exact', collins: exact });

      const base = await baseForm(query);
      const stemmed = base ? await collinsEntry(base) : null;
      const viaForm = () =>
        Object.assign(result, { source: 'collins', via: 'wordform', base, collins: stemmed });

      if (s.mode === 'loose' && stemmed) return viaForm();

      try {
        const online = await youdao(query);
        if (online) return Object.assign(result, { source: 'youdao', via: 'online', youdao: online });
      } catch (e) {
        result.error = String(e && e.message ? e.message : e);
      }

      if (stemmed) return viaForm();
      return result;
    }

    return { lookup };
  }

  return { DEFAULTS, normalize, shouldLookup, parseYoudao, createEngine };
})();
