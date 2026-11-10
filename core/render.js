/* WordPop result rendering, shared by the Firefox extension and the Zotero plugin.
 * Builds DOM nodes only (no innerHTML), in the XHTML namespace so that it also
 * works inside Zotero's XUL/HTML documents.
 */
var WordPopRender = (() => {
  'use strict';

  const NS = 'http://www.w3.org/1999/xhtml';

  const CSS = `
.wp-root { font: 13px/1.45 system-ui, -apple-system, "Segoe UI", "Noto Sans CJK SC", sans-serif;
  color: inherit; text-align: left; }
.wp-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 8px; margin-bottom: 4px; }
.wp-word { font-weight: 600; font-size: 15px; }
.wp-star { color: #d4a017; font-size: 11px; }
.wp-phon { opacity: .75; }
.wp-speak { cursor: pointer; border: none; background: none; padding: 0 2px; font-size: 12px;
  color: inherit; opacity: .7; }
.wp-speak:hover { opacity: 1; }
.wp-note { font-size: 12px; opacity: .7; margin: 2px 0 4px; }
.wp-defs { margin: 0; padding-left: 18px; }
.wp-defs > li { margin: 3px 0; }
.wp-pos { font-size: 11px; opacity: .7; margin-right: 4px; }
.wp-en { font-size: 12px; opacity: .75; }
.wp-ex { font-size: 12px; opacity: .8; margin: 2px 0 0; padding-left: 8px;
  border-left: 2px solid rgba(127,127,127,.35); }
.wp-sec { margin-top: 6px; }
.wp-sec-title { font-size: 11px; opacity: .65; margin-bottom: 1px; }
.wp-dom { font-size: 11px; opacity: .7; margin-right: 4px; }
.wp-foot { margin-top: 6px; font-size: 11px; opacity: .55; }
.wp-error { color: #c0392b; font-size: 12px; }
`;

  function el(doc, tag, cls, text) {
    const e = doc.createElementNS(NS, tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function speakButton(doc, word, type, label, onSpeak) {
    const b = el(doc, 'button', 'wp-speak', '🔊');
    b.title = label ? `${label}发音` : '发音';
    b.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      onSpeak(`https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(word)}&type=${type}`);
    });
    return b;
  }

  function renderCollins(doc, root, r, opts) {
    const c = r.collins;
    const head = el(doc, 'div', 'wp-head');
    head.append(el(doc, 'span', 'wp-word', c.headword));
    if (c.star) head.append(el(doc, 'span', 'wp-star', c.star));
    const labels = ['英', '美'];
    (c.readings || []).slice(0, 2).forEach((rd, i) => {
      if (!rd) return;
      head.append(el(doc, 'span', 'wp-phon', `${labels[i]} /${rd}/`));
      if (opts.onSpeak) head.append(speakButton(doc, c.headword, i + 1, labels[i], opts.onSpeak));
    });
    root.append(head);

    if (r.via === 'wordform') {
      root.append(el(doc, 'div', 'wp-note', `${r.query} → ${r.base}（词形还原）`));
    }

    const ol = el(doc, 'ol', 'wp-defs');
    for (const d of c.defs || []) {
      const li = el(doc, 'li');
      // Some Collins Chinese POS labels are whole sentences; use the short English tag then.
      const pos = d.pos_cn && d.pos_cn.length <= 6 ? d.pos_cn : (d.pos_en || d.pos_cn);
      if (pos) li.append(el(doc, 'span', 'wp-pos', pos));
      li.append(el(doc, 'span', null, d.def_cn || ''));
      if (opts.showEnglish && d.def_en) li.append(el(doc, 'div', 'wp-en', d.def_en.trim()));
      for (const ex of (d.ext || []).slice(0, opts.maxExamples)) {
        const p = el(doc, 'div', 'wp-ex');
        p.append(el(doc, 'div', null, ex.ext_en || ''));
        if (ex.ext_cn) p.append(el(doc, 'div', null, ex.ext_cn));
        li.append(p);
      }
      ol.append(li);
    }
    root.append(ol);
  }

  function renderYoudao(doc, root, r, opts) {
    const y = r.youdao;
    const word = y.headword || r.query;
    const head = el(doc, 'div', 'wp-head');
    head.append(el(doc, 'span', 'wp-word', word));
    y.phonetics.forEach((p, i) => {
      head.append(el(doc, 'span', 'wp-phon', `${p.label} ${p.text}`.trim()));
      if (opts.onSpeak) head.append(speakButton(doc, word, i + 1, p.label, opts.onSpeak));
    });
    root.append(head);

    if (y.defs.length) {
      const ul = el(doc, 'ul', 'wp-defs');
      for (const d of y.defs) ul.append(el(doc, 'li', null, d));
      root.append(ul);
    }
    if (y.forms) root.append(el(doc, 'div', 'wp-note', y.forms));

    if (y.professional.length) {
      const sec = el(doc, 'div', 'wp-sec');
      sec.append(el(doc, 'div', 'wp-sec-title', '专业释义'));
      for (const p of y.professional.slice(0, 3)) {
        const line = el(doc, 'div');
        if (p.domain) line.append(el(doc, 'span', 'wp-dom', p.domain));
        line.append(el(doc, 'span', null, p.terms.slice(0, 4).join('；')));
        sec.append(line);
      }
      root.append(sec);
    }
    if (!y.defs.length && y.web.length) {
      const sec = el(doc, 'div', 'wp-sec');
      sec.append(el(doc, 'div', 'wp-sec-title', '网络释义'));
      sec.append(el(doc, 'div', null, y.web.join('；')));
      root.append(sec);
    }
    if (!y.defs.length && y.translation) {
      const sec = el(doc, 'div', 'wp-sec');
      sec.append(el(doc, 'div', 'wp-sec-title', '机器翻译'));
      sec.append(el(doc, 'div', null, y.translation));
      root.append(sec);
    }
  }

  /* opts: { maxExamples, showEnglish, onSpeak(url) } */
  function render(doc, result, opts) {
    const o = Object.assign({ maxExamples: 1, showEnglish: true, onSpeak: null }, opts);
    const root = el(doc, 'div', 'wp-root');
    if (!result) {
      root.append(el(doc, 'div', 'wp-note', '查询中…'));
      return root;
    }
    if (result.source === 'collins') renderCollins(doc, root, result, o);
    else if (result.source === 'youdao') renderYoudao(doc, root, result, o);
    else root.append(el(doc, 'div', 'wp-note', `未找到：${result.query}`));

    const labels = { collins: '柯林斯词库读取失败', youdao: '有道查询失败' };
    for (const err of result.errors || []) {
      root.append(el(doc, 'div', 'wp-error', `${labels[err.source] || '查询出错'}：${err.message}`));
    }

    const src = { collins: '柯林斯（离线）', youdao: '有道（在线）' }[result.source];
    if (src) root.append(el(doc, 'div', 'wp-foot', src));
    return root;
  }

  function loading(doc, text) {
    const root = el(doc, 'div', 'wp-root');
    root.append(el(doc, 'div', 'wp-note', `查询中：${text}`));
    return root;
  }

  function styleElement(doc) {
    return el(doc, 'style', null, CSS);
  }

  return { CSS, render, loading, styleElement };
})();
