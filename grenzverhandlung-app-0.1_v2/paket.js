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
    const td = document.createElement('td'), chip = document.createElement('span');
    chip.className = 'file-chip'; chip.textContent = b.file.name; chip.title = b.file.name; td.append(chip);
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
dropzone($('#drop-beh'), true, fs => {
  for (const f of fs) state.beh.push({ planverfasser: '', geschaeftszahl: titleOf(f.name), anmerkung: '', file: f });
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
  const parts = [`${state.bet.length} Beteiligte`, `${state.beh.length} Behelfe`, state.skizze ? 'Skizze' : 'keine Skizze', `${state.unt.length} Unterlagen`];
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
      const datei = uniq('behelfe/', b.geschaeftszahl || b.file.name, used); zip.file(datei, b.file);
      return { planverfasser: b.planverfasser.trim(), geschaeftszahl: b.geschaeftszahl.trim(), anmerkung: b.anmerkung.trim(), datei };
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
