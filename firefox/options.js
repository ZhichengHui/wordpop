/* global WordPopCore */
'use strict';

const DEFAULTS = Object.assign({}, WordPopCore.DEFAULTS, { pdfViewer: true });
const ORIGINS = { origins: ['<all_urls>'] };

async function load() {
  const s = Object.assign({}, DEFAULTS, await browser.storage.local.get());
  for (const r of document.querySelectorAll('input[name=mode]')) r.checked = r.value === s.mode;
  for (const id of ['enabled', 'showEnglish', 'pdfViewer']) document.getElementById(id).checked = !!s[id];
  for (const id of ['maxWords', 'maxExamples']) document.getElementById(id).value = s[id];
  document.getElementById('perm').hidden = await browser.permissions.contains(ORIGINS);
}

function save(ev) {
  const t = ev.target;
  let value;
  if (t.name === 'mode') value = t.value;
  else if (t.type === 'checkbox') value = t.checked;
  else if (t.type === 'number') {
    value = parseInt(t.value, 10);
    if (Number.isNaN(value)) return;
    value = Math.max(Number(t.min), Math.min(Number(t.max), value));
  } else return;
  browser.storage.local.set({ [t.name || t.id]: value });
}

document.addEventListener('change', save);
document.getElementById('grant').addEventListener('click', async () => {
  await browser.permissions.request(ORIGINS);
  load();
});
load();
