/* Verhandlungspaket erstellen (Büro): vier Felder Protokoll · GFN · Begehungsskizze · Weitere Unterlagen → ZIP mit verhandlung.json, skizze.pdf, behelfe/, unterlagen/ */
'use strict';
const $ = s => document.querySelector(s);
const el = (tag, attrs = {}, ...kids) => { const e = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (k === 'class') e.className = v; else if (k.startsWith('on')) e[k] = v; else e.setAttribute(k, v); } e.append(...kids.filter(k => k != null)); return e; };
const fileName = s => String(s || 'Dokument').normalize('NFC').replace(/[^\wäöüÄÖÜß.-]+/g, '_').replace(/_+/g, '_');
const titleOf = n => n.replace(/\.pdf$/i, '').replace(/_+/g, ' ').trim();
const isPdf = f => f && (f.type === 'application/pdf' || /\.pdf$/i.test(f.name));
const digits = s => String(s || '').replace(/\D+/g, '');
let toastT;
function toast(m) { const t = $('#toast'); t.textContent = m; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, Math.max(3400, String(m).length * 65)); }

const state = {
  kopf: { verhandlungsleiter: 'DI Gerald Fuxjäger', kanzlei: 'ADP Rinner ZT GmbH, Münzgrabenstraße 4/1, 8010 Graz' },
  prot: null, bet: [], beh: [], skizze: null, unt: [],
};

/* Ablagen für Dateien */
function dropzone(box, multiple, onFiles) {
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'application/pdf'; inp.multiple = multiple; inp.hidden = true;
  box.after(inp);
  const take = list => { const fs = [...list].filter(isPdf); if (fs.length < list.length) toast('Nur PDF-Dateien. Word bitte vorher als PDF speichern.'); if (fs.length) onFiles(fs); };
  box.onclick = () => inp.click();
  box.tabIndex = 0; box.setAttribute('role', 'button');
  box.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inp.click(); } };
  inp.onchange = () => { take(inp.files); inp.value = ''; };
  box.ondragover = e => { e.preventDefault(); box.classList.add('over'); };
  box.ondragleave = () => box.classList.remove('over');
  box.ondrop = e => { e.preventDefault(); box.classList.remove('over'); take(e.dataTransfer.files); };
  // Einfügen (Strg+V): in das Feld, über dem die Maus steht oder das den Fokus hat
  box.onmouseenter = () => { pasteTarget = take; };
  box.onfocus = () => { pasteTarget = take; };
  box.onmouseleave = () => { if (document.activeElement !== box) pasteTarget = null; };
  box.onblur = () => { pasteTarget = null; };
  const hint = document.createElement('span'); hint.className = 'hint small'; hint.textContent = 'oder kopieren und mit Strg+V einfügen (Maus über dem Feld)';
  box.append(hint);
}
let pasteTarget = null;
document.addEventListener('paste', e => {
  const fs = [...(e.clipboardData ? e.clipboardData.files : [])];
  if (!fs.length || (e.target && e.target.matches && e.target.matches('input, textarea'))) return;
  e.preventDefault();
  if (!pasteTarget) { toast('Maus über das passende Feld (1–4) halten und dann Strg+V drücken.'); return; }
  pasteTarget(fs);
});
const delBtn = (arr, obj, redraw) => el('button', { type: 'button', class: 'x', title: 'Entfernen', 'aria-label': 'Entfernen', onclick: () => { arr.splice(arr.indexOf(obj), 1); redraw(); check(); } }, '✕');
const field = (obj, key, ph, cls) => { const i = el('input', { placeholder: ph || '' }); if (cls) i.className = cls; i.value = obj[key] || ''; i.oninput = () => { obj[key] = i.value; check(); }; return i; };

/* 1 · Protokoll: Zusammenfassung zum Prüfen */
function drawProt() {
  const box = $('#prot-sum'), k = state.kopf;
  if (!state.prot) { box.hidden = true; return; }
  const dl = el('dl', { class: 'sum' });
  for (const [key, lab] of [['gz', 'Geschäftszahl'], ['vermessungsamt', 'Vermessungsamt'], ['katastralgemeinde', 'Katastralgemeinde'], ['ort', 'Ort']])
    dl.append(el('dt', {}, lab), el('dd', {}, k[key] || '–'));
  const ol = el('ol', { class: 'ppl' });
  for (const p of state.bet) ol.append(el('li', {}, p.name, ' ', el('span', { class: 'muted' }, [p.ez && 'EZ ' + p.ez, p.gst && 'Gst. ' + p.gst].filter(Boolean).join(' · '))));
  box.replaceChildren(dl, el('div', { style: 'margin-top:10px;font-weight:600' }, `${state.bet.length} Eigentümer`), ol);
  box.hidden = false;
}

/* 2 · GFN */
function drawBeh() {
  $('#beh').replaceChildren(...state.beh.map(b => el('li', {},
    el('span', { class: 'tag' }, 'GFN'), field(b, 'geschaeftszahl', 'Nummer', 'nr'), field(b, 'planverfasser', 'Planverfasser (optional)'),
    el('span', { class: 'fn', title: b.file.name }, b.file.name), delBtn(state.beh, b, drawBeh))));
}
dropzone($('#drop-beh'), true, fs => {
  for (const f of fs) {
    if (state.beh.some(b => b.file.name === f.name && b.file.size === f.size)) continue;
    state.beh.push({ planverfasser: '', geschaeftszahl: 'GFN ' + titleOf(f.name).replace(/^GFN\s*/i, ''), anmerkung: '', file: f });
  }
  drawBeh(); check();
});

/* 3 · Begehungsskizze */
function drawSk() {
  $('#sk').replaceChildren(...(state.skizze ? [el('li', {}, el('span', { class: 'tag' }, 'Skizze'), el('span', { style: 'flex:1;font-weight:600' }, state.skizze.name),
    el('button', { type: 'button', class: 'x', title: 'Entfernen', 'aria-label': 'Entfernen', onclick: () => { state.skizze = null; drawSk(); check(); } }, '✕'))] : []));
  $('#drop-sk').querySelector('strong').textContent = state.skizze ? 'Begehungsskizze ersetzen' : 'Begehungsskizze (PDF) hierher ziehen';
}
dropzone($('#drop-sk'), false, fs => { if (fs.length > 1) toast('Nur eine Begehungsskizze möglich, die erste Datei wurde genommen.'); state.skizze = fs[0]; drawSk(); check(); });

/* 4 · Weitere Unterlagen */
function drawUnt() {
  $('#unt').replaceChildren(...state.unt.map(u => el('li', {}, el('span', { class: 'tag' }, 'Unterlage'), field(u, 'titel', 'Titel in der App'),
    el('span', { class: 'fn', title: u.file.name }, u.file.name), delBtn(state.unt, u, drawUnt))));
}
dropzone($('#drop-unt'), true, fs => {
  for (const f of fs) if (!state.unt.some(u => u.file.name === f.name && u.file.size === f.size)) state.unt.push({ titel: titleOf(f.name), file: f });
  drawUnt(); check();
});

/* Protokoll der Kanzlei (Word-PDF) einlesen: Kopf und Zustimmungstabelle */
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('libs/pdf.worker.min.js', document.currentScript ? document.currentScript.src : location.href).href;
// Wörter zusammensetzen: Leerzeichen nur, wo im PDF wirklich eine Lücke ist (Word trennt z. B. Bindestriche ab)
function joinItems(items) {
  let t = '', prev = null;
  for (const it of items) { t += (prev && it.x - (prev.x + prev.w) > 1.2 && !/\s$/.test(t) && !/^\s/.test(it.s) ? ' ' : '') + it.s; prev = it; }
  return t.replace(/\s+/g, ' ').trim();
}
async function pageLines(page) {
  const tc = await page.getTextContent();
  const items = tc.items.filter(i => i.str && i.str.trim()).map(i => ({ x: i.transform[4], y: i.transform[5], w: i.width || 0, s: i.str }));
  const lines = [];
  for (const it of items.sort((a, b) => b.y - a.y || a.x - b.x)) {
    const l = lines.find(l => Math.abs(l.y - it.y) < 2.5);
    if (l) l.items.push(it); else lines.push({ y: it.y, items: [it] });
  }
  lines.forEach(l => { l.items.sort((a, b) => a.x - b.x); l.text = joinItems(l.items); });
  return lines.sort((a, b) => b.y - a.y);
}
const after = (text, label, stop) => {
  const m = text.match(new RegExp(label + '\\s*:?\\s*(.+?)' + (stop ? '\\s*(?:' + stop + '|$)' : '$'), 'i'));
  return m ? m[1].trim() : '';
};
async function readProtocol(file) {
  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const out = { kopf: {}, people: [] };
  for (let n = 1; n <= doc.numPages; n++) {
    const lines = await pageLines(await doc.getPage(n));
    for (const l of lines) {
      if (/^Vermessungsamt/i.test(l.text) && !out.kopf.vermessungsamt) out.kopf.vermessungsamt = after(l.text, 'Vermessungsamt', 'Seite');
      if (/^Katastralgemeinde/i.test(l.text) && !out.kopf.katastralgemeinde) out.kopf.katastralgemeinde = after(l.text, 'Katastralgemeinde', 'Projekt');
      if (/Projekt\s*:/i.test(l.text) && !out.kopf.gz) out.kopf.gz = after(l.text, 'Projekt');
      const ort = l.text.match(/^([^,.…]{2,}?),\s*am\b/);
      if (ort && !/Verhandlung/i.test(ort[1])) out.kopf.ort = ort[1].trim();
    }
    // Zustimmungstabelle: Spalten über die Kopfzeile (EZ, Gst.Nr., Name und Anschrift, Unterschrift, Anmerkung)
    const hi = lines.findIndex(l => /\bEZ\b/.test(l.text) && /Gst/i.test(l.text) && /Name/i.test(l.text));
    if (hi < 0) continue;
    const hx = re => { const it = lines[hi].items.find(i => re.test(i.s)); return it ? it.x : null; };
    const xGst = hx(/Gst/i), xName = hx(/Name/i), xUnt = hx(/Unterschrift/i) ?? 1e9, xAnm = hx(/Anmerkung/i) ?? 1e9;
    if (xGst == null || xName == null) continue;
    const cut = [xGst - 25, xName - 25, xUnt - 25, xAnm - 25];
    const col = x => cut.findIndex(c => x < c) === -1 ? 4 : cut.findIndex(c => x < c);
    let rec = null;
    const flush = () => { if (rec && rec.name.length) out.people.push(rec); rec = null; };
    for (const l of lines.slice(hi + 1)) {
      if (/^\*?\s*ID\s*=|^V\.i\.A\.|Verhandlung über den Verlauf|^Die Verhandlung/i.test(l.text)) break;
      if (/^des Eigentümers$/i.test(l.text)) continue;
      const c = [[], [], [], [], []];
      for (const it of l.items) c[col(it.x)].push(it);
      const [ez, gst, nm, , anm] = c.map(joinItems);
      const hasPlz = rec && rec.name.some(t => /^(A-)?\d{4,5}\s+\S/.test(t));
      if (ez || (nm && hasPlz && !ez && !gst)) { flush(); rec = { ez, gst: [], name: [], anm: [] }; }
      if (!rec) continue;
      if (gst) rec.gst.push(...gst.split(/[,;]\s*|\s+/).filter(Boolean));
      if (nm) rec.name.push(nm);
      if (anm) rec.anm.push(anm);
    }
    flush();
  }
  out.people = out.people.map(r => {
    const t = r.name, pi = t.findIndex(x => /^(A-)?\d{4,5}\s+\S/.test(x));
    let name, adr;
    if (pi >= 1) { const st = pi >= 2 ? pi - 1 : pi; name = t.slice(0, st).join(' '); adr = t.slice(st).join(', '); }
    else { name = t[0]; adr = t.slice(1).join(', '); }
    if (!name) { name = t.join(' '); adr = ''; }
    return { rolle: 'Eigentümer', ez: r.ez, gst: r.gst.join(', '), name: name.replace(/\s+/g, ' ').trim(), anschrift: adr, vertritt: '' };
  });
  return out;
}
dropzone($('#drop-prot'), false, async fs => {
  const f = fs[0], box = $('#drop-prot');
  box.querySelector('strong').textContent = 'Wird gelesen …';
  try {
    const r = await readProtocol(f);
    if (!r.people.length || !r.kopf.gz) {
      toast(!r.people.length && !r.kopf.gz ? 'Im PDF wurde kein Protokoll erkannt (gescannt? Dann bitte das PDF aus Word speichern).'
        : !r.kopf.gz ? 'Im Protokoll wurde keine GZ („Projekt:“) gefunden.' : 'Im Protokoll wurden keine Eigentümer gefunden (Zustimmungstabelle).');
      box.querySelector('strong').textContent = state.prot ? 'Anderes Protokoll einlesen' : 'Protokoll (PDF) hierher ziehen';
      return;
    }
    state.prot = f;
    state.kopf = { verhandlungsleiter: state.kopf.verhandlungsleiter, kanzlei: state.kopf.kanzlei, ...Object.fromEntries(Object.entries(r.kopf).filter(([, v]) => v)) };
    state.bet = r.people;
    box.classList.remove('big');
    box.replaceChildren(el('span', { class: 'file-chip' }, '✓ ' + f.name), el('span', {}, '  · '), el('strong', {}, 'Anderes Protokoll einlesen'), box.querySelector('.hint'));
    drawProt(); check();
    toast(`GZ ${r.kopf.gz}: ${r.people.length} Eigentümer übernommen. Bitte kurz prüfen.`);
  } catch (e) { toast('Protokoll konnte nicht gelesen werden: ' + e.message); box.querySelector('strong').textContent = 'Protokoll (PDF) hierher ziehen'; }
});
window.addEventListener('dragover', e => e.preventDefault());
window.addEventListener('drop', e => e.preventDefault());

/* Prüfen und speichern */
function problems() {
  const p = [];
  if (!state.prot) p.push('Protokoll einlesen');
  return p;
}
function check() {
  const p = problems(), st = $('#status');
  $('#st-prot').classList.toggle('done', !!state.prot);
  $('#st-gfn').classList.toggle('done', state.beh.length > 0);
  $('#st-sk').classList.toggle('done', !!state.skizze);
  $('#st-unt').classList.toggle('done', state.unt.length > 0);
  const parts = [state.prot ? `GZ ${state.kopf.gz} · ${state.bet.length} Eigentümer` : '', `${state.beh.length} GFN`, state.skizze ? 'Skizze' : 'ohne Skizze (am Tablet leeres Blatt)', `${state.unt.length} weitere Unterlagen`].filter(Boolean);
  st.className = p.length ? 'pk-err' : 'muted';
  st.textContent = p.length ? 'Noch offen: ' + p.join(' · ') : parts.join(' · ');
  $('#save').disabled = !state.prot;
  return !p.length;
}
function uniq(dir, name, used) {
  let n = fileName(name).replace(/(\.pdf)?$/i, '.pdf'), i = 2;
  while (used.has(dir + n)) n = fileName(name).replace(/(\.pdf)?$/i, '') + `_${i++}.pdf`;
  used.add(dir + n); return dir + n;
}
$('#save').onclick = async () => {
  if (!state.prot) { toast('Zuerst das Protokoll einlesen.'); return; }
  const btn = $('#save'); btn.disabled = true;
  try {
    const zip = new JSZip(), used = new Set();
    const json = { ...state.kopf };
    if (state.skizze) { json.skizze = 'skizze.pdf'; zip.file('skizze.pdf', state.skizze); }
    json.behelfe = state.beh.map(b => {
      const o = { planverfasser: b.planverfasser.trim(), geschaeftszahl: b.geschaeftszahl.trim() || titleOf(b.file.name), anmerkung: b.anmerkung.trim() };
      o.datei = uniq('behelfe/', o.geschaeftszahl, used); zip.file(o.datei, b.file);
      return o;
    });
    // Protokoll steht wie bisher als erste Unterlage im Paket (gleiches Format für die App)
    json.unterlagen = [{ titel: 'Vorbereitetes Protokoll (Papier)', file: state.prot }, ...state.unt].map(u => {
      const datei = uniq('unterlagen/', u.file.name, used); zip.file(datei, u.file);
      return { titel: u.titel.trim() || titleOf(u.file.name), datei };
    });
    json.beteiligte = state.bet.map(b => {
      const o = { rolle: b.rolle, name: b.name.trim(), anschrift: b.anschrift.trim() };
      if (b.ez.trim()) o.ez = b.ez.trim();
      if (b.gst.trim()) o.gst = b.gst.trim();
      return o;
    });
    zip.file('verhandlung.json', JSON.stringify(json, null, 2));
    const blob = await zip.generateAsync({ type: 'blob' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `Verhandlungspaket_GZ${fileName(state.kopf.gz)}.zip`;
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast('Paket gespeichert. In den Projektordner legen und am Tablet importieren.');
    $('#neu').hidden = false;
  } catch (e) { toast('Fehler: ' + e.message); }
  btn.disabled = false;
};
$('#neu').onclick = () => location.reload();
check();

/* Offline-Cache und Installierbarkeit als eigene Büro-App */
if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
