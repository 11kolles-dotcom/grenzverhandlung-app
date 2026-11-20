/* Verhandlungspaket erstellen (Büro): Formular → ZIP mit verhandlung.json, skizze.pdf, behelfe/, unterlagen/ */
'use strict';
const $ = s => document.querySelector(s);
const ROLLEN = ['Eigentümer', 'Vertreter', 'Anwesend (sonstige)'];
const fileName = s => String(s || 'Dokument').normalize('NFC').replace(/[^\wäöüÄÖÜß.-]+/g, '_').replace(/_+/g, '_');
const titleOf = n => n.replace(/\.pdf$/i, '').replace(/_+/g, ' ').trim();
const isPdf = f => f && (f.type === 'application/pdf' || /\.pdf$/i.test(f.name));
let toastT;
function toast(m) { const t = $('#toast'); t.textContent = m; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 3400); }

const state = {
  kopf: { gz: '', vermessungsamt: 'Graz', katastralgemeinde: '', gemeinde: '', ort: '', datum: '', verhandlungsleiter: 'DI Gerald Fuxjäger',
    kanzlei: 'ADP Rinner ZT GmbH, Münzgrabenstraße 4/1, 8010 Graz', gegenstand: '' },
  bet: [], beh: [], skizze: null, unt: [],
};

/* Kopfdaten */
const KOPF = [['gz', 'Geschäftszahl (GZ) *'], ['vermessungsamt', 'Vermessungsamt'], ['katastralgemeinde', 'Katastralgemeinde (Nr. und Name)'],
  ['gemeinde', 'Gemeinde'], ['ort', 'Ort der Verhandlung'], ['datum', 'Datum', 'date'], ['verhandlungsleiter', 'Verhandlungsleiter'],
  ['gegenstand', 'Gegenstand der Verhandlung'], ['kanzlei', 'Kanzlei']];
for (const [k, label, type] of KOPF) {
  const id = 'k-' + k;
  const d = document.createElement('div'); d.className = 'field';
  if (k === 'gegenstand' || k === 'kanzlei') d.style.gridColumn = '1 / -1';
  d.innerHTML = `<label for="${id}"></label><input id="${id}" type="${type || 'text'}">`;
  d.querySelector('label').textContent = label;
  const inp = d.querySelector('input'); inp.value = state.kopf[k];
  if (k === 'gegenstand') inp.placeholder = 'z. B. Umwandlung des Grundstücks .626 in den Grenzkataster';
  if (k === 'katastralgemeinde') inp.placeholder = 'z. B. 63243 Kirchenviertel';
  inp.oninput = () => { state.kopf[k] = inp.value.trim(); check(); };
  $('#kopf').append(d);
}

/* Tabellen */
function cellInput(obj, key, ph) {
  const td = document.createElement('td'), i = document.createElement('input');
  i.value = obj[key] || ''; if (ph) i.placeholder = ph;
  i.oninput = () => { obj[key] = i.value; check(); };
  td.append(i); return td;
}
function delCell(arr, obj, redraw) {
  const td = document.createElement('td'), b = document.createElement('button');
  td.className = 'x'; b.type = 'button'; b.textContent = '✕'; b.title = 'Entfernen';
  b.onclick = () => { arr.splice(arr.indexOf(obj), 1); redraw(); check(); };
  td.append(b); return td;
}
function drawBet() {
  const tb = $('#bet tbody'); tb.replaceChildren();
  for (const p of state.bet) {
    const tr = document.createElement('tr');
    const tdR = document.createElement('td'), sel = document.createElement('select');
    for (const r of ROLLEN) sel.append(new Option(r, r, false, r === p.rolle));
    sel.onchange = () => { p.rolle = sel.value; drawBet(); check(); };
    tdR.append(sel); tr.append(tdR);
    tr.append(cellInput(p, 'ez'), cellInput(p, 'gst'), cellInput(p, 'name', 'Vor- und Nachname'), cellInput(p, 'anschrift', 'Straße, PLZ Ort'));
    const tv = p.rolle === 'Vertreter' ? cellInput(p, 'vertritt', 'wen?') : document.createElement('td');
    tr.append(tv, delCell(state.bet, p, drawBet));
    tb.append(tr);
  }
}
function drawBeh() {
  const tb = $('#beh tbody'); tb.replaceChildren();
  for (const b of state.beh) {
    const tr = document.createElement('tr');
    tr.append(cellInput(b, 'planverfasser'), cellInput(b, 'geschaeftszahl', 'GFN …'), cellInput(b, 'anmerkung'));
    const td = document.createElement('td');
    if (b.file) {
      const chip = document.createElement('span'); chip.className = 'file-chip'; chip.textContent = b.file.name; chip.title = b.file.name; td.append(chip);
    } else {
      const pick = document.createElement('button'); pick.type = 'button'; pick.className = 'btn small ghost'; pick.textContent = 'PDF wählen';
      const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'application/pdf'; inp.hidden = true;
      pick.onclick = () => inp.click();
      inp.onchange = () => { if (inp.files[0]) { b.file = inp.files[0]; drawBeh(); check(); } };
      td.append(pick, inp);
    }
    tr.append(td, delCell(state.beh, b, drawBeh));
    tb.append(tr);
  }
}
function drawUnt() {
  const tb = $('#unt tbody'); tb.replaceChildren();
  for (const u of state.unt) {
    const tr = document.createElement('tr');
    tr.append(cellInput(u, 'titel'));
    const td = document.createElement('td'), chip = document.createElement('span');
    chip.className = 'file-chip'; chip.textContent = u.file.name; chip.title = u.file.name; td.append(chip);
    tr.append(td, delCell(state.unt, u, drawUnt));
    tb.append(tr);
  }
}
$('#add-bet').onclick = () => { state.bet.push({ rolle: 'Eigentümer', ez: '', gst: '', name: '', anschrift: '', vertritt: '' }); drawBet(); check(); $('#bet tbody tr:last-child td:nth-child(2) input').focus(); };
$('#paste-go').onclick = () => {
  state.bet = state.bet.filter(b => b.name.trim() || b.ez.trim() || b.gst.trim() || b.anschrift.trim());
  const lines = $('#paste').value.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  let n = 0;
  for (const l of lines) {
    const c = l.split(/\t|;/).map(x => x.trim());
    if (c.length < 3) continue;
    state.bet.push({ rolle: 'Eigentümer', ez: c[0], gst: c[1], name: c[2], anschrift: c.slice(3).join(', '), vertritt: '' }); n++;
  }
  $('#paste').value = ''; drawBet(); check();
  toast(n ? `${n} Person${n === 1 ? '' : 'en'} übernommen` : 'Keine Zeile erkannt (Spalten mit Tab oder Strichpunkt trennen)');
};

/* Grundbuchsabfrage: Eigentümer-CSV + Grundstücke-CSV, Zuordnung über KG und EZ */
function decode(buf) {
  let t;
  try { t = new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch { t = new TextDecoder('windows-1252').decode(buf); }
  return t.replace(/^﻿/, '');
}
function parseCsv(text) {
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ';') { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); if (row.some(x => x !== '')) rows.push(row); row = []; cur = ''; }
    else cur += c;
  }
  row.push(cur); if (row.some(x => x !== '')) rows.push(row);
  if (!rows.length) return { head: [], data: [], stand: '' };
  const last = rows[0].length - 1, m = rows[0][last].match(/#\s*([^#]+?)\s*#/);
  const head = rows[0].map(h => h.replace(/\s*#.*#\s*$/, '').trim().toUpperCase());
  return { head, stand: m ? m[1].replace('/', ', ') : '', data: rows.slice(1).map(r => Object.fromEntries(head.map((h, i) => [h, (r[i] || '').trim()]))) };
}
const gstSort = (a, b) => a.localeCompare(b, 'de', { numeric: true });
function importGrundbuch(owners, plots) {
  const key = (kg, ez) => `${kg}|${ez}`;
  const gstByEz = new Map(), gfn = new Map();
  for (const r of plots ? plots.data : []) {
    const k = key(r['KG-EZ'] || r['KG-NR'], r.EZ);
    if (!gstByEz.has(k)) gstByEz.set(k, []);
    if (r['GST-NR'] && !gstByEz.get(k).includes(r['GST-NR'])) gstByEz.get(k).push(r['GST-NR']);
    if (r.GFN) { if (!gfn.has(r.GFN)) gfn.set(r.GFN, []); if (!gfn.get(r.GFN).includes(r['GST-NR'])) gfn.get(r.GFN).push(r['GST-NR']); }
  }
  const people = owners.data.map(r => {
    const jur = /^ja$/i.test(r.JUR);
    let name = jur ? r.BEZ : [r.TITEL_VOR, r.VN, r.NN].filter(Boolean).join(' ');
    if (!jur && r.TITEL_NACH) name += ', ' + r.TITEL_NACH;
    const gst = (gstByEz.get(key(r['KG-EZ'] || r['KG-NR'], r.EZ)) || []).sort(gstSort).join(', ');
    return { rolle: 'Eigentümer', ez: r.EZ, gst, name: name.replace(/\s+/g, ' ').trim(), anschrift: (r.ADR || '').replace(/,\s*Österreich\s*$/i, '').trim(), vertritt: '', _sort: [+r.EZ || 0, +r.LNR || 0] };
  }).filter(p => p.name).sort((a, b) => a._sort[0] - b._sort[0] || a._sort[1] - b._sort[1]);
  people.forEach(p => delete p._sort);
  // Eigentümer aus der Abfrage ersetzen, Vertreter und andere bleiben
  state.bet = state.bet.filter(b => b.rolle !== 'Eigentümer' && b.name.trim()).concat(people);
  state.bet.sort((a, b) => (a.rolle === 'Eigentümer' ? 0 : 1) - (b.rolle === 'Eigentümer' ? 0 : 1));
  let neueGfn = 0;
  for (const [nr, gsts] of gfn) {
    if (state.beh.some(b => digits(b.geschaeftszahl) === digits(nr))) continue;
    state.beh.push({ planverfasser: '', geschaeftszahl: 'GFN ' + nr, anmerkung: 'Gst. ' + gsts.sort(gstSort).join(', '), file: null }); neueGfn++;
  }
  const kg = (owners.data[0] || {})['KG-NR'];
  if (kg && !state.kopf.katastralgemeinde) { state.kopf.katastralgemeinde = kg; $('#k-katastralgemeinde').value = kg; }
  drawBet(); drawBeh(); check();
  const ohneGst = people.filter(p => !p.gst).length;
  toast(`${people.length} Eigentümer übernommen${plots ? `, ${neueGfn} GFN` : ' (ohne Grundstücke-Datei keine Gst.-Nr.)'}${ohneGst && plots ? `, ${ohneGst} ohne Gst.-Nr.` : ''}${owners.stand ? ` · Abfrage vom ${owners.stand}` : ''}`);
}

/* Ablagen für Dateien */
function dropzone(el, multiple, onFiles) {
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'application/pdf'; inp.multiple = multiple; inp.hidden = true;
  el.after(inp);
  const take = list => { const fs = [...list].filter(isPdf); if (fs.length < list.length) toast('Nur PDF-Dateien. Word bitte vorher als PDF speichern.'); if (fs.length) onFiles(fs); };
  el.onclick = () => inp.click();
  inp.onchange = () => { take(inp.files); inp.value = ''; };
  el.ondragover = e => { e.preventDefault(); el.classList.add('over'); };
  el.ondragleave = () => el.classList.remove('over');
  el.ondrop = e => { e.preventDefault(); el.classList.remove('over'); take(e.dataTransfer.files); };
}
const digits = s => String(s || '').replace(/\D+/g, '');
dropzone($('#drop-beh'), true, fs => {
  for (const f of fs) {
    const row = state.beh.find(b => !b.file && digits(b.geschaeftszahl) && digits(b.geschaeftszahl) === digits(titleOf(f.name)));
    if (row) row.file = f;
    else state.beh.push({ planverfasser: '', geschaeftszahl: titleOf(f.name), anmerkung: '', file: f });
  }
  drawBeh(); check();
});
dropzone($('#drop-sk'), false, fs => {
  state.skizze = fs[0];
  $('#drop-sk').innerHTML = '';
  const chip = document.createElement('span'); chip.className = 'file-chip'; chip.textContent = '✓ ' + fs[0].name;
  const hint = document.createElement('span'); hint.textContent = '  · zum Ersetzen klicken';
  $('#drop-sk').append(chip, hint); check();
});
dropzone($('#drop-unt'), true, fs => {
  for (const f of fs) state.unt.push({ titel: titleOf(f.name), file: f });
  drawUnt(); check();
});
(() => {
  const el = $('#drop-gb');
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.csv,text/csv'; inp.multiple = true; inp.hidden = true; el.after(inp);
  const take = async list => {
    let owners = null, plots = null;
    for (const f of list) {
      const t = parseCsv(decode(await f.arrayBuffer()));
      if (t.head.includes('NN') && t.head.includes('EZ')) owners = t;
      else if (t.head.includes('GST-NR') && t.head.includes('EZ')) plots = t;
    }
    if (!owners) { toast(plots ? 'Bitte die Eigentümer-Datei mit dazulegen (beide Dateien gemeinsam).' : 'Keine Grundbuchsabfrage erkannt (CSV mit Spalten EZ, NN, VN …).'); return; }
    importGrundbuch(owners, plots);
  };
  el.onclick = () => inp.click();
  inp.onchange = () => { take([...inp.files]); inp.value = ''; };
  el.ondragover = e => { e.preventDefault(); el.classList.add('over'); };
  el.ondragleave = () => el.classList.remove('over');
  el.ondrop = e => { e.preventDefault(); el.classList.remove('over'); take([...e.dataTransfer.files]); };
})();
/* Protokoll der Kanzlei (Word-PDF) einlesen: Kopf und Zustimmungstabelle */
pdfjsLib.GlobalWorkerOptions.workerSrc = 'libs/pdf.worker.min.js';
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
(() => {
  const el = $('#drop-prot');
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'application/pdf'; inp.hidden = true; el.after(inp);
  const take = async f => {
    if (!isPdf(f)) { toast('Bitte das Protokoll als PDF.'); return; }
    try {
      const r = await readProtocol(f);
      if (!r.people.length && !r.kopf.gz) { toast('Im PDF wurde kein Protokoll erkannt (gescannt? Dann bitte das PDF aus Word speichern).'); return; }
      for (const [k, val] of Object.entries(r.kopf)) if (val) { state.kopf[k] = val; const i = $('#k-' + k); if (i) i.value = val; }
      if (r.people.length) {
        state.bet = state.bet.filter(b => b.rolle !== 'Eigentümer' && b.name.trim()).concat(r.people);
        state.bet.sort((a, b) => (a.rolle === 'Eigentümer' ? 0 : 1) - (b.rolle === 'Eigentümer' ? 0 : 1));
      }
      if (!state.unt.some(u => u.file === f)) { state.unt.push({ titel: 'Vorbereitetes Protokoll (Papier)', file: f }); drawUnt(); }
      drawBet(); check();
      el.innerHTML = ''; const chip = document.createElement('span'); chip.className = 'file-chip'; chip.textContent = '✓ ' + f.name;
      const hint = document.createElement('span'); hint.textContent = `  · ${r.people.length} Eigentümer, GZ ${r.kopf.gz || '?'} übernommen`; el.append(chip, hint);
      toast(`${r.people.length} Eigentümer aus dem Protokoll übernommen. Bitte kurz prüfen.`);
    } catch (e) { toast('Protokoll konnte nicht gelesen werden: ' + e.message); }
  };
  el.onclick = () => inp.click();
  inp.onchange = () => { if (inp.files[0]) take(inp.files[0]); inp.value = ''; };
  el.ondragover = e => { e.preventDefault(); el.classList.add('over'); };
  el.ondragleave = () => el.classList.remove('over');
  el.ondrop = e => { e.preventDefault(); el.classList.remove('over'); if (e.dataTransfer.files[0]) take(e.dataTransfer.files[0]); };
})();
window.addEventListener('dragover', e => e.preventDefault());
window.addEventListener('drop', e => e.preventDefault());

/* Prüfen und speichern */
function problems() {
  const p = [];
  if (!state.kopf.gz) p.push('Geschäftszahl fehlt');
  if (!state.bet.some(b => b.rolle === 'Eigentümer' && b.name.trim())) p.push('mindestens ein Eigentümer mit Namen');
  if (state.bet.some(b => !b.name.trim())) p.push('eine Person ohne Namen');
  if (state.bet.some(b => /@|\+?\d[\d /-]{7,}\d/.test(b.anschrift))) p.push('Anschrift sieht nach Telefon/E-Mail aus');
  return p;
}
function check() {
  const p = problems(), st = $('#status');
  const ohne = state.beh.filter(b => !b.file).length;
  const parts = [`${state.bet.length} Beteiligte`, `${state.beh.length} Behelfe${ohne ? ` (${ohne} ohne PDF)` : ''}`, state.skizze ? 'Skizze' : 'keine Skizze', `${state.unt.length} Unterlagen`];
  st.className = p.length ? 'pk-err' : 'muted';
  st.textContent = p.length ? 'Noch offen: ' + p.join(' · ') : parts.join(' · ');
  return !p.length;
}
function uniq(dir, name, used) {
  let n = fileName(name).replace(/(\.pdf)?$/i, '.pdf'), i = 2;
  while (used.has(dir + n)) n = fileName(name).replace(/(\.pdf)?$/i, '') + `_${i++}.pdf`;
  used.add(dir + n); return dir + n;
}
$('#save').onclick = async () => {
  if (!check()) { toast('Bitte zuerst ergänzen: ' + problems().join(', ')); return; }
  const btn = $('#save'); btn.disabled = true;
  try {
    const zip = new JSZip(), used = new Set();
    const k = state.kopf;
    const json = { ...k, datum: k.datum || undefined };
    for (const key of Object.keys(json)) if (json[key] === '' || json[key] === undefined) delete json[key];
    if (state.skizze) { json.skizze = 'skizze.pdf'; zip.file('skizze.pdf', state.skizze); }
    json.behelfe = state.beh.map(b => {
      const o = { planverfasser: b.planverfasser.trim(), geschaeftszahl: b.geschaeftszahl.trim(), anmerkung: b.anmerkung.trim() };
      if (b.file) { o.datei = uniq('behelfe/', b.geschaeftszahl || b.file.name, used); zip.file(o.datei, b.file); }
      return o;
    });
    json.unterlagen = state.unt.map(u => {
      const datei = uniq('unterlagen/', u.file.name, used); zip.file(datei, u.file);
      return { titel: u.titel.trim() || titleOf(u.file.name), datei };
    });
    json.beteiligte = state.bet.map(b => {
      const o = { rolle: b.rolle, name: b.name.trim(), anschrift: b.anschrift.trim() };
      if (b.ez.trim()) o.ez = b.ez.trim();
      if (b.gst.trim()) o.gst = b.gst.trim();
      if (b.rolle === 'Vertreter' && b.vertritt.trim()) o.vertritt = b.vertritt.trim();
      return o;
    });
    zip.file('verhandlung.json', JSON.stringify(json, null, 2));
    const blob = await zip.generateAsync({ type: 'blob' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `Verhandlungspaket_GZ${fileName(k.gz)}.zip`;
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast('Paket gespeichert. In den Projektordner legen und am Tablet importieren.');
  } catch (e) { toast('Fehler: ' + e.message); }
  btn.disabled = false;
};
state.bet.push({ rolle: 'Eigentümer', ez: '', gst: '', name: '', anschrift: '', vertritt: '' });
drawBet(); check();
