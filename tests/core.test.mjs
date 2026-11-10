import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { DOMParser } from 'linkedom';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIX = path.join(ROOT, 'tests', 'fixtures');

const ctx = vm.createContext({});
for (const f of ['core/lookup.js', 'core/render.js']) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8') +
    '\nthis.WordPopCore = typeof WordPopCore !== "undefined" ? WordPopCore : undefined;' +
    '\nthis.WordPopRender = typeof WordPopRender !== "undefined" ? WordPopRender : undefined;', ctx);
}
const { WordPopCore, WordPopRender } = ctx;

const pages = {
  endeavor: 'endeavor.html',
  soundness: 'soundness.html',
  xqzvbn: 'xqzvbn.html',
  'proof obligation': 'proof-obligation.html',
  'the proof is sound and complete': 'sentence.html',
};

function makeEngine({ failNetwork = false, failData = false } = {}) {
  const fetched = [];
  const engine = WordPopCore.createEngine({
    loadJSON: async (p) => {
      if (failData) throw new Error('cannot read ' + p);
      return JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
    },
    fetchText: async (url) => {
      fetched.push(url);
      if (failNetwork) throw new Error('offline');
      const word = decodeURIComponent(url.replace('https://dict.youdao.com/w/', '').replace(/\/$/, ''));
      const f = pages[word] || 'xqzvbn.html';
      return fs.readFileSync(path.join(FIX, f), 'utf8');
    },
    parseHTML: (html) => new DOMParser().parseFromString(html, 'text/html'),
  });
  return { engine, fetched };
}

test('normalize handles PDF artefacts', () => {
  assert.equal(WordPopCore.normalize('  “endea-\nvor,”  '), 'endeavor');
  assert.equal(WordPopCore.normalize('ﬁnite'), 'finite');
  assert.equal(WordPopCore.normalize('proof\n obligation.'), 'proof obligation');
});

test('shouldLookup limits selections', () => {
  assert.equal(WordPopCore.shouldLookup('soundness', {}), true);
  assert.equal(WordPopCore.shouldLookup('a b c d e f', { maxWords: 5 }), false);
  assert.equal(WordPopCore.shouldLookup('中文', {}), false);
  assert.equal(WordPopCore.shouldLookup('1234', {}), false);
  assert.equal(WordPopCore.shouldLookup('x'.repeat(100), {}), false);
});

test('strict: exact Collins hit stays offline', async () => {
  const { engine, fetched } = makeEngine();
  const r = await engine.lookup('Endeavour', { mode: 'strict' });
  assert.equal(r.source, 'collins');
  assert.equal(r.via, 'exact');
  assert.equal(fetched.length, 0);
});

test('strict: missing word goes to Youdao', async () => {
  const { engine } = makeEngine();
  const r = await engine.lookup('endeavor', { mode: 'strict' });
  assert.equal(r.source, 'youdao');
  assert.equal(r.youdao.headword, 'endeavor');
  assert.equal(r.youdao.phonetics.length, 2);
  assert.ok(r.youdao.defs[0].startsWith('n. 努力'));
  assert.match(r.youdao.forms, /endeavored/);
});

test('strict: derived form prefers Youdao over Collins base form', async () => {
  const { engine } = makeEngine();
  const r = await engine.lookup('soundness', { mode: 'strict' });
  assert.equal(r.source, 'youdao');
  assert.equal(r.youdao.professional[0].domain, '计算机科学技术');
  assert.ok(r.youdao.professional[0].terms.includes('可靠性'));
});

test('loose: derived form uses Collins base form offline', async () => {
  const { engine, fetched } = makeEngine();
  const r = await engine.lookup('soundness', { mode: 'loose' });
  assert.equal(r.source, 'collins');
  assert.equal(r.via, 'wordform');
  assert.equal(r.base, 'sound');
  assert.equal(fetched.length, 0);
});

test('strict: Youdao failure falls back to Collins base form and reports error', async () => {
  const { engine } = makeEngine({ failNetwork: true });
  const r = await engine.lookup('soundness', { mode: 'strict' });
  assert.equal(r.source, 'collins');
  assert.equal(r.via, 'wordform');
  assert.deepEqual(JSON.parse(JSON.stringify(r.errors)), [{ source: 'youdao', message: 'offline' }]);
});

test('Collins data failure still queries Youdao and reports the Collins error', async () => {
  const { engine } = makeEngine({ failData: true });
  const r = await engine.lookup('endeavor', { mode: 'strict' });
  assert.equal(r.source, 'youdao');
  assert.equal(r.errors.length, 1);
  assert.equal(r.errors[0].source, 'collins');
  const doc = new DOMParser().parseFromString('<html><body></body></html>', 'text/html');
  const text = WordPopRender.render(doc, r, {}).textContent;
  assert.ok(text.includes('柯林斯词库读取失败'), text);
  assert.ok(!text.includes('有道查询失败'), text);
});

test('results with errors are not cached', async () => {
  let fail = true;
  const engine = WordPopCore.createEngine({
    loadJSON: async (p) => {
      if (fail) throw new Error('boom');
      return JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
    },
    fetchText: async () => { throw new Error('offline'); },
    parseHTML: (html) => new DOMParser().parseFromString(html, 'text/html'),
  });
  assert.equal((await engine.lookup('pertinent', {})).source, null);
  fail = false;
  assert.equal((await engine.lookup('pertinent', {})).source, 'collins');
});

test('unknown word gives no result', async () => {
  const { engine } = makeEngine();
  const r = await engine.lookup('xqzvbn', { mode: 'strict' });
  assert.equal(r.source, null);
});

test('phrase and sentence', async () => {
  const { engine } = makeEngine();
  const p = await engine.lookup('proof obligation', {});
  assert.equal(p.source, 'youdao');
  assert.deepEqual([...p.youdao.defs], ['证明义务']);
  const s = await engine.lookup('the proof is sound and complete', { maxWords: 10 });
  assert.equal(s.source, 'youdao');
  assert.equal(s.youdao.translation, '证据确凿而完整');
});

test('render produces text for each source', async () => {
  const { engine } = makeEngine();
  const doc = new DOMParser().parseFromString('<html><body></body></html>', 'text/html');
  for (const [w, expect] of [['Endeavour', '柯林斯'], ['endeavor', '有道'], ['xqzvbn', '未找到']]) {
    const r = await engine.lookup(w, {});
    const node = WordPopRender.render(doc, r, { maxExamples: 1 });
    assert.ok(node.textContent.includes(expect), `${w}: ${node.textContent}`);
  }
});
