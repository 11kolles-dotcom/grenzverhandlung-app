/* Digitale Grenzverhandlung – Prototyp (Masterarbeit, Kapitel 6.5)
 * Offline-Web-App: GZ-Auswahl, Behelfe, Begehungsskizze mit Stift, Protokoll nach § 43 Abs. 6 VermG,
 * Sperren mit Prüfsumme, Zustimmung per ID Austria (QES über externen Signaturdienst) oder Papier, Export.
 */
'use strict';

const APP_VERSION = '0.1.0';
const EGIZ_URL = 'https://pdf.egiz.gv.at/';
pdfjsLib.GlobalWorkerOptions.workerSrc = 'libs/pdf.worker.min.js';

/* ---------- Hilfsfunktionen ---------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'value') el.value = v;
    else if (k === 'checked') el.checked = !!v;
    else if (k === 'disabled') el.disabled = !!v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const pad2 = n => String(n).padStart(2, '0');
const nowTime = () => { const d = new Date(); return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };
const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; };
const deDate = iso => { if (!iso) return ''; const [y, m, d] = iso.split('-'); return `${d}.${m}.${y}`; };
const deDateTime = ts => { const d = new Date(ts); return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()}, ${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };

let toastTimer;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 3200);
}
function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
async function blobBytes(blob) { return new Uint8Array(await blob.arrayBuffer()); }
async function sha256Hex(bytes) {
  const buf = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}
const safeName = s => String(s || '').replace(/[^\w.-]+/g, '_');

/* ---------- Speicher (IndexedDB) ---------- */
const DB = {
  db: null,
  open() {
    if (this.db) return Promise.resolve(this.db);
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('grenzverhandlung', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('verhandlungen', { keyPath: 'id' });
      req.onsuccess = () => { this.db = req.result; resolve(this.db); };
      req.onerror = () => reject(req.error);
    });
  },
  async tx(mode, fn) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const t = db.transaction('verhandlungen', mode);
      const store = t.objectStore('verhandlungen');
      const res = fn(store);
      t.oncomplete = () => resolve(res && 'result' in res ? res.result : undefined);
      t.onerror = () => reject(t.error);
    });
  },
  all() { return this.tx('readonly', s => s.getAll()); },
  get(id) { return this.tx('readonly', s => s.get(id)); },
  put(v) { return this.tx('readwrite', s => s.put(v)); },
  del(id) { return this.tx('readwrite', s => s.delete(id)); },
};

/* ---------- Datenmodell ---------- */
const STATUS = {
  vorbereitet: { label: 'vorbereitet', cls: '' },
  laufend: { label: 'Verhandlung läuft', cls: 'warn' },
  gesperrt: { label: 'gesperrt, Zustimmung offen', cls: 'warn' },
  abgeschlossen: { label: 'alle Zustimmungen erfasst', cls: 'good' },
};
const ZUST = {
  offen: { label: 'offen', cls: '' },
  qes: { label: 'QES mit ID Austria', cls: 'good' },
  papier: { label: 'Unterschrift auf Papier', cls: 'good' },
  verweigert: { label: 'Zustimmung verweigert', cls: 'crit' },
};
const ROLLEN = ['Eigentümer', 'Vertreter', 'Anwesend (sonstige)'];
const IDNACHWEIS = [['', '–'], ['P', 'P – persönlich bekannt'], ['A', 'A – allgemein bekannt'], ['L', 'L – amtl. Lichtbildausweis']];
const VOLLMACHT = [['', '–'], ['V.i.A.', 'V.i.A. – Vollmacht im Akt'], ['V.p.P.', 'V.p.P. – per Post'], ['V.p.E.', 'V.p.E. – per E-Mail']];

function newVerhandlung(src) {
  return {
    id: uid(),
    gz: src.gz,
    meta: {
      vermessungsamt: src.vermessungsamt || '', kg: src.katastralgemeinde || '', ort: src.ort || '',
      datum: src.datum || todayISO(), eroeffnung: '', schluss: '', leiter: src.verhandlungsleiter || '', kanzlei: src.kanzlei || '',
    },
    beteiligte: (src.beteiligte || []).map(b => ({
      id: uid(), ez: b.ez || '', gst: b.gst || '', name: b.name || '', anschrift: b.anschrift || '',
      rolle: b.rolle && ROLLEN.includes(b.rolle) ? b.rolle : 'Eigentümer', vertritt: b.vertritt || '',
      anwesend: false, idnachweis: '', vollmacht: '', anmerkung: '', zustimmung: { art: 'offen', zeit: null },
    })),
    behelfe: (src.behelfe || []).map(b => ({ id: uid(), planverfasser: b.planverfasser || '', gz: b.geschaeftszahl || '', anmerkung: b.anmerkung || '', vorgehalten: false, pdf: b.pdf, datei: b.datei || '' })),
    skizze: { pdf: src.skizzePdf || null, strokes: [], texts: [] },
    beschreibung: { text: '', strittig: '' },
    status: 'vorbereitet', version: 1, locked: null, signed: null,
    log: [{ zeit: Date.now(), text: 'Verhandlungspaket importiert' }],
    created: Date.now(), updated: Date.now(),
  };
}

const app = { list: [], cur: null, view: 'start' };
const isLocked = () => !!(app.cur && app.cur.locked);

let saveTimer;
function touch(immediate) {
  if (!app.cur) return;
  app.cur.updated = Date.now();
  clearTimeout(saveTimer);
  const v = app.cur;
  const run = () => DB.put(v).catch(e => toast('Speichern fehlgeschlagen: ' + e.message));
  if (immediate) return run();
  saveTimer = setTimeout(run, 400);
}
function logEvent(text) { app.cur.log.push({ zeit: Date.now(), text }); }

/* ---------- Import ---------- */
async function importZip(file) {
  const zip = await JSZip.loadAsync(file);
  const jf = zip.file('verhandlung.json') || zip.file(/(^|\/)verhandlung\.json$/i)[0];
  if (!jf) throw new Error('Im ZIP fehlt die Datei verhandlung.json.');
  const base = jf.name.includes('/') ? jf.name.slice(0, jf.name.lastIndexOf('/') + 1) : '';
  const src = JSON.parse(await jf.async('string'));
  if (!src.gz) throw new Error('In verhandlung.json fehlt die Geschäftszahl (gz).');
  const getPdf = async path => {
    const f = zip.file(base + path) || zip.file(path);
    if (!f) throw new Error(`Datei ${path} fehlt im ZIP.`);
    return new Blob([await f.async('uint8array')], { type: 'application/pdf' });
  };
  for (const b of src.behelfe || []) b.pdf = await getPdf(b.datei);
  if (src.skizze) src.skizzePdf = await getPdf(src.skizze);
  return newVerhandlung(src);
}

/* ---------- Demo-Daten (fiktiv) ---------- */
async function demoPdfs() {
  const { PDFDocument, StandardFonts, rgb, degrees } = PDFLib;
  // Behelf 1: alter Teilungsplan (gelbliches Papier, Handschrift-Anmutung)
  async function oldPlan(title, gz, year, seed) {
    const doc = await PDFDocument.create();
    const page = doc.addPage([842, 595]);
    const f = await doc.embedFont(StandardFonts.TimesRoman);
    const fi = await doc.embedFont(StandardFonts.TimesRomanItalic);
    page.drawRectangle({ x: 0, y: 0, width: 842, height: 595, color: rgb(0.95, 0.91, 0.80) });
    page.drawRectangle({ x: 20, y: 20, width: 802, height: 555, borderColor: rgb(0.35, 0.3, 0.25), borderWidth: 1.2 });
    page.drawText(title, { x: 40, y: 545, size: 20, font: fi, color: rgb(0.25, 0.2, 0.15) });
    page.drawText(`GZ ${gz}   Maßstab 1:1000   ${year}`, { x: 40, y: 522, size: 12, font: f, color: rgb(0.3, 0.25, 0.2) });
    const ink = rgb(0.2, 0.15, 0.35);
    const P = [[120, 110], [380, 95], [610, 120], [720, 300], [640, 470], [400, 455], [150, 430], [130, 270], [390, 280], [600, 300]];
    const lines = [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 0], [1, 8], [8, 5], [8, 9], [9, 2], [9, 4], [7, 8]];
    for (const [a, b] of lines) page.drawLine({ start: { x: P[a][0], y: P[a][1] }, end: { x: P[b][0], y: P[b][1] }, thickness: 1.1, color: ink });
    P.forEach(([x, y], i) => {
      page.drawCircle({ x, y, size: 3, borderColor: ink, borderWidth: 1 });
      page.drawText(String(seed + i * 3), { x: x + 6, y: y + 5, size: 9, font: fi, color: ink });
    });
    const parcels = [['259/66', 250, 190], ['.391', 500, 190], ['.392', 270, 370], ['262/40', 520, 380]];
    for (const [t, x, y] of parcels) page.drawText(t, { x, y, size: 16, font: fi, color: ink });
    page.drawText('Mappenblatt 4729-55/3', { x: 600, y: 40, size: 10, font: f, color: rgb(0.3, 0.25, 0.2) });
    for (let i = 0; i < 26; i++) page.drawLine({ start: { x: 30 + i * 31, y: 60 }, end: { x: 30 + i * 31 + 15, y: 64 }, thickness: 0.3, color: rgb(0.6, 0.55, 0.45) });
    page.drawText('beglaubigt', { x: 700, y: 520, size: 14, font: fi, color: rgb(0.55, 0.15, 0.15), rotate: degrees(12) });
    return new Blob([await doc.save()], { type: 'application/pdf' });
  }
  async function skizze() {
    const doc = await PDFDocument.create();
    const page = doc.addPage([842, 595]);
    const f = await doc.embedFont(StandardFonts.Helvetica);
    const fb = await doc.embedFont(StandardFonts.HelveticaBold);
    const g = rgb(0.45, 0.45, 0.45), k = rgb(0.05, 0.05, 0.05), red = rgb(0.8, 0.05, 0.1);
    page.drawText('Begehungsskizze – Projekt 24017-001', { x: 30, y: 560, size: 14, font: fb, color: k });
    page.drawText('KG 63107 Algersdorf   Grenzverlauf lt. DKM, Stand 11/2026   (fiktive Demo-Daten)', { x: 30, y: 542, size: 9, font: f, color: g });
    const P = { a: [120, 120], b: [390, 100], c: [620, 125], d: [730, 300], e: [650, 470], f: [400, 450], gg: [150, 430], h: [130, 270], m: [395, 285], n: [610, 305] };
    const L = [['a', 'b'], ['b', 'c'], ['c', 'd'], ['d', 'e'], ['e', 'f'], ['f', 'gg'], ['gg', 'h'], ['h', 'a'], ['b', 'm'], ['m', 'f'], ['m', 'n'], ['n', 'c'], ['n', 'e'], ['h', 'm']];
    for (const [s, e] of L) page.drawLine({ start: { x: P[s][0], y: P[s][1] }, end: { x: P[e][0], y: P[e][1] }, thickness: 1.4, color: k });
    const nums = { a: 2541, b: 2542, c: 2543, d: 2544, e: 2545, f: 2546, gg: 2547, h: 2548, m: 2549, n: 2550 };
    for (const [key, [x, y]] of Object.entries(P)) {
      page.drawCircle({ x, y, size: 3.2, color: red });
      page.drawText(String(nums[key]), { x: x + 6, y: y + 6, size: 9, font: f, color: red });
    }
    const parcels = [['259/66', 240, 190], ['.391', 500, 195], ['.392', 255, 365], ['262/40', 515, 380]];
    for (const [t, x, y] of parcels) page.drawText(t, { x, y, size: 15, font: fb, color: k });
    page.drawLine({ start: { x: 780, y: 470 }, end: { x: 780, y: 520 }, thickness: 1.5, color: k });
    page.drawText('N', { x: 775, y: 525, size: 12, font: fb, color: k });
    page.drawText('Legende: rote Punkte = Grenzpunkte lt. Kataster, Ergänzungen vor Ort mit Stift', { x: 30, y: 30, size: 9, font: f, color: g });
    return new Blob([await doc.save()], { type: 'application/pdf' });
  }
  return {
    b1: await oldPlan('Teilungsplan', '3127/1968', '1968', 1201),
    b2: await oldPlan('Grenzwiederherstellung', '412/1987', '1987', 1802),
    skizze: await skizze(),
  };
}
function demoSource(pdfs) {
  return {
    gz: '24017-001', vermessungsamt: 'Graz', katastralgemeinde: '63107 Algersdorf', ort: 'Graz, Algersdorfer Straße (Demo)',
    datum: todayISO(), verhandlungsleiter: 'Ing. Max Muster', kanzlei: 'Vermessungskanzlei (Demo)',
    behelfe: [
      { planverfasser: 'Dipl.-Ing. H. Beispiel', geschaeftszahl: '3127/1968', anmerkung: 'Teilungsplan', datei: 'behelfe/3127-1968.pdf', pdf: pdfs.b1 },
      { planverfasser: 'Vermessungsamt Graz', geschaeftszahl: '412/1987', anmerkung: 'Grenzwiederherstellung', datei: 'behelfe/412-1987.pdf', pdf: pdfs.b2 },
    ],
    skizze: 'skizze.pdf', skizzePdf: pdfs.skizze,
    beteiligte: [
      { ez: '67', gst: '259/66', name: 'Anna Berger', anschrift: 'Hauptplatz 3, 8010 Graz', rolle: 'Eigentümer' },
      { ez: '660', gst: '.391, .392', name: 'Peter Lechner', anschrift: 'Lindenweg 4, 8073 Feldkirchen', rolle: 'Eigentümer' },
      { ez: '660', gst: '.391, .392', name: 'Maria Lechner', anschrift: 'Lindenweg 4, 8073 Feldkirchen', rolle: 'Eigentümer' },
      { ez: '903', gst: '262/40', name: 'Beispiel Projekt GmbH (FN 000000x)', anschrift: 'Musterplatz 1, 8010 Graz', rolle: 'Eigentümer' },
      { ez: '', gst: '', name: 'Thomas Huber', anschrift: 'Musterplatz 1, 8010 Graz', rolle: 'Vertreter', vertritt: 'Beispiel Projekt GmbH' },
    ],
  };
}
async function createDemo() {
  const pdfs = await demoPdfs();
  const v = newVerhandlung(demoSource(pdfs));
  v.log[0].text = 'Demo-Verhandlung angelegt (fiktive Daten)';
  await DB.put(v);
  return v;
}
async function demoZipBlob() {
  const pdfs = await demoPdfs();
  const src = demoSource(pdfs);
  const zip = new JSZip();
  const json = { ...src };
  delete json.skizzePdf;
  json.behelfe = src.behelfe.map(({ pdf, ...rest }) => rest);
  zip.file('verhandlung.json', JSON.stringify(json, null, 2));
  zip.file('behelfe/3127-1968.pdf', await pdfs.b1.arrayBuffer());
  zip.file('behelfe/412-1987.pdf', await pdfs.b2.arrayBuffer());
  zip.file('skizze.pdf', await pdfs.skizze.arrayBuffer());
  return zip.generateAsync({ type: 'blob' });
}

/* ---------- PDF-Hilfen (Anzeige) ---------- */
async function loadPdf(blob) { return pdfjsLib.getDocument({ data: await blobBytes(blob) }).promise; }
const thumbCache = new Map();
async function thumbnail(key, blob, width = 192) {
  if (thumbCache.has(key)) return thumbCache.get(key);
  const doc = await loadPdf(blob);
  const page = await doc.getPage(1);
  const vp1 = page.getViewport({ scale: 1 });
  const vp = page.getViewport({ scale: width / vp1.width });
  const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height;
  await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
  const url = c.toDataURL('image/jpeg', 0.8);
  thumbCache.set(key, url); doc.destroy();
  return url;
}

/* ---------- Ansichten ---------- */
const VIEWS = {};
function setView(view) {
  app.view = view;
  const main = $('#main');
  main.replaceChildren();
  const inGz = view !== 'start' && app.cur;
  $('#sidenav').hidden = !inGz;
  $('#topbar-gz').textContent = inGz ? `GZ ${app.cur.gz}` : 'Übersicht';
  const st = $('#topbar-status');
  if (inGz) { const s = STATUS[app.cur.status]; st.hidden = false; st.textContent = s.label; } else st.hidden = true;
  $$('#sidenav button').forEach(b => {
    b.classList.toggle('on', b.dataset.view === view);
    b.classList.toggle('done', inGz && stepDone(b.dataset.view));
  });
  VIEWS[view](main);
  main.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}
function stepDone(view) {
  const v = app.cur; if (!v) return false;
  switch (view) {
    case 'eroeffnung': return !!v.meta.eroeffnung && v.beteiligte.some(b => b.anwesend);
    case 'behelfe': return v.behelfe.length > 0 && v.behelfe.every(b => b.vorgehalten);
    case 'skizze': return v.skizze.strokes.length + v.skizze.texts.length > 0;
    case 'beschreibung': return !!(v.beschreibung.text || '').trim();
    case 'abschluss': return !!v.locked;
    case 'zustimmung': return v.status === 'abgeschlossen';
    case 'export': return false;
  }
}
function lockedBanner() {
  if (!isLocked()) return null;
  return h('div', { class: 'notice info locked-banner' },
    h('span', {}, `Das Protokoll ist gesperrt (Version ${app.cur.version}). Änderungen sind nur über eine neue Version möglich.`),
    h('button', { class: 'btn', type: 'button', onclick: () => setView('abschluss') }, 'Zur Sperre'));
}
function nextBtn(view, label) {
  return h('div', { class: 'row' }, h('button', { class: 'btn primary', type: 'button', onclick: () => setView(view) }, label));
}

/* Start: Auswahl der Geschäftszahl */
VIEWS.start = async main => {
  const list = h('div', { class: 'gz-list' });
  main.append(h('div', { class: 'stack' },
    h('div', { class: 'section-head' },
      h('div', { class: 'stack', style: 'gap:6px' }, h('h1', {}, 'Verhandlungen auf diesem Gerät'),
        h('p', { class: 'lead' }, 'Wähle die Geschäftszahl der heutigen Grenzverhandlung. Alle Unterlagen liegen am Gerät, die Verhandlung läuft ohne Netz.')),
      h('div', { class: 'row' },
        h('button', { class: 'btn primary', type: 'button', onclick: () => $('#file-zip').click() }, 'Verhandlungspaket importieren'),
        h('button', { class: 'btn', type: 'button', onclick: async e => { e.target.disabled = true; try { const v = await createDemo(); toast('Demo-Verhandlung angelegt'); openGz(v.id); } catch (err) { toast(err.message); e.target.disabled = false; } } }, 'Demo-Verhandlung anlegen'))),
    list,
    h('details', { class: 'card' },
      h('summary', {}, h('strong', {}, 'Wie kommt eine Verhandlung aufs Gerät?')),
      h('div', { class: 'stack', style: 'margin-top:12px' },
        h('p', {}, 'Die Kanzlei erstellt je Geschäftszahl ein ZIP-Archiv mit der Datei verhandlung.json (Stammdaten, Behelfe, Beteiligte), den Behelfen als PDF und der Begehungsskizze als PDF. Telefonnummern und E-Mail-Adressen gehören nicht hinein.'),
        h('div', {}, h('button', { class: 'btn', type: 'button', onclick: async () => download(await demoZipBlob(), 'Beispielpaket_24017-001.zip') }, 'Beispielpaket herunterladen'))))));
  app.list = (await DB.all()).sort((a, b) => b.updated - a.updated);
  if (!app.list.length) list.replaceWith(h('div', { class: 'empty' }, 'Noch keine Verhandlung am Gerät. Importiere ein Verhandlungspaket oder lege die Demo-Verhandlung an.'));
  for (const v of app.list) {
    const s = STATUS[v.status];
    const owners = v.beteiligte.filter(b => b.rolle === 'Eigentümer');
    list.append(h('button', { class: 'card gz-card', type: 'button', onclick: () => openGz(v.id) },
      h('span', { class: 'gz' }, v.gz),
      h('span', {}, `${v.meta.kg || 'KG ?'} · VA ${v.meta.vermessungsamt || '?'}`),
      h('span', { class: 'muted' }, `${deDate(v.meta.datum)} · ${owners.length} Eigentümer · ${v.behelfe.length} Behelfe`),
      h('span', {}, h('span', { class: 'pill ' + s.cls }, s.label))));
  }
};
async function openGz(id) {
  app.cur = await DB.get(id);
  setView(app.cur.locked ? (app.cur.status === 'abgeschlossen' ? 'export' : 'zustimmung') : 'eroeffnung');
}

/* 1 Eröffnung und Beteiligte */
VIEWS.eroeffnung = main => {
  const v = app.cur, L = isLocked();
  const field = (label, key, type = 'text') => h('div', { class: 'field' },
    h('label', { for: 'f-' + key }, label),
    h('input', { id: 'f-' + key, type, value: v.meta[key], disabled: L, oninput: e => { v.meta[key] = e.target.value; touch(); } }));
  const timeField = (label, key) => h('div', { class: 'field' },
    h('label', { for: 'f-' + key }, label),
    h('div', { class: 'inline-time' },
      h('input', { id: 'f-' + key, type: 'time', value: v.meta[key], disabled: L, oninput: e => { v.meta[key] = e.target.value; touch(); } }),
      h('button', { class: 'btn', type: 'button', disabled: L, onclick: () => { v.meta[key] = nowTime(); $('#f-' + key).value = v.meta[key]; if (key === 'eroeffnung' && v.status === 'vorbereitet') { v.status = 'laufend'; logEvent('Verhandlung eröffnet'); } touch(); setView('eroeffnung'); } }, 'Jetzt')));

  const opts = (list, val) => list.map(([k, t]) => h('option', { value: k, selected: k === val ? 'selected' : null }, t));
  const tbody = h('tbody');
  const row = b => h('tr', {},
    h('td', {}, h('input', { type: 'checkbox', checked: b.anwesend, disabled: L, 'aria-label': 'anwesend', onchange: e => { b.anwesend = e.target.checked; touch(); } })),
    h('td', {}, h('select', { disabled: L, 'aria-label': 'Rolle', onchange: e => { b.rolle = e.target.value; touch(); } }, ROLLEN.map(r => h('option', { value: r, selected: r === b.rolle ? 'selected' : null }, r)))),
    h('td', {}, h('input', { type: 'text', class: 'w-s', value: b.ez, disabled: L, 'aria-label': 'EZ', oninput: e => { b.ez = e.target.value; touch(); } })),
    h('td', {}, h('input', { type: 'text', class: 'w-s', value: b.gst, disabled: L, 'aria-label': 'Gst.Nr.', oninput: e => { b.gst = e.target.value; touch(); } })),
    h('td', {}, h('input', { type: 'text', class: 'w-l', value: b.name, disabled: L, 'aria-label': 'Name', oninput: e => { b.name = e.target.value; touch(); } })),
    h('td', {}, h('input', { type: 'text', class: 'w-l', value: b.anschrift, disabled: L, 'aria-label': 'Anschrift', oninput: e => { b.anschrift = e.target.value; touch(); } })),
    h('td', {}, h('select', { disabled: L, 'aria-label': 'Identitätsnachweis', onchange: e => { b.idnachweis = e.target.value; touch(); } }, opts(IDNACHWEIS, b.idnachweis))),
    h('td', {}, h('select', { disabled: L, 'aria-label': 'Vollmacht', onchange: e => { b.vollmacht = e.target.value; touch(); } }, opts(VOLLMACHT, b.vollmacht))),
    h('td', {}, h('input', { type: 'text', value: b.vertritt || b.anmerkung, disabled: L, 'aria-label': 'Anmerkung', placeholder: b.rolle === 'Vertreter' ? 'vertritt …' : '', oninput: e => { if (b.rolle === 'Vertreter') b.vertritt = e.target.value; else b.anmerkung = e.target.value; touch(); } })),
    h('td', {}, h('button', { class: 'btn icon', type: 'button', disabled: L, 'aria-label': 'Zeile entfernen', onclick: () => { v.beteiligte = v.beteiligte.filter(x => x !== b); touch(); setView('eroeffnung'); } }, '×')));
  v.beteiligte.forEach(b => tbody.append(row(b)));

  main.append(h('div', { class: 'stack' },
    lockedBanner(),
    h('div', { class: 'section-head' }, h('h1', {}, 'Eröffnung und Beteiligte'), h('span', { class: 'muted' }, 'Protokoll Seite 1 und 3')),
    h('div', { class: 'card stack' },
      h('div', { class: 'form-grid' },
        field('Geschäftszahl', 'gz-ro'), field('Vermessungsamt', 'vermessungsamt'), field('Katastralgemeinde', 'kg'),
        field('Ort der Verhandlung', 'ort'), field('Datum', 'datum', 'date'), timeField('Eröffnung (Uhrzeit)', 'eroeffnung'),
        field('Verhandlungsleiter', 'leiter'))),
    h('div', { class: 'section-head' },
      h('div', {}, h('h2', {}, 'Eigentümer, Vertreter und anwesende Personen'),
        h('p', { class: 'muted' }, 'Anwesenheit abhaken und Identitätsnachweis wählen. Vertreter brauchen eine Vollmacht.')),
      h('button', { class: 'btn', type: 'button', disabled: L, onclick: () => { v.beteiligte.push({ id: uid(), ez: '', gst: '', name: '', anschrift: '', rolle: 'Anwesend (sonstige)', vertritt: '', anwesend: true, idnachweis: '', vollmacht: '', anmerkung: '', zustimmung: { art: 'offen', zeit: null } }); touch(); setView('eroeffnung'); } }, 'Person hinzufügen')),
    h('div', { class: 'table-wrap bt' }, h('table', {},
      h('thead', {}, h('tr', {}, ['Anw.', 'Rolle', 'EZ', 'Gst.Nr.', 'Name', 'Anschrift', 'ID', 'Vollmacht', 'Anmerkung / vertritt', ''].map(t => h('th', {}, t)))),
      tbody)),
    nextBtn('behelfe', 'Weiter zu den Behelfen')));
  const gzInput = $('#f-gz-ro'); gzInput.value = v.gz; gzInput.disabled = true;
};

/* 2 Behelfe */
VIEWS.behelfe = main => {
  const v = app.cur, L = isLocked();
  const list = h('div', { class: 'behelf-list' });
  v.behelfe.forEach((b, i) => {
    const img = h('img', { class: 'thumb', alt: '' });
    thumbnail('b-' + b.id, b.pdf).then(u => { img.src = u; }).catch(() => {});
    list.append(h('div', { class: 'card behelf' },
      h('div', { class: 'behelf-main' }, img,
        h('div', { class: 'stack', style: 'gap:2px;min-width:0' },
          h('span', { class: 'gfn' }, b.gz || 'ohne Geschäftszahl'),
          h('span', {}, b.planverfasser), h('span', { class: 'muted' }, b.anmerkung),
          h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: b.vorgehalten, disabled: L, onchange: e => { b.vorgehalten = e.target.checked; touch(); } }), 'den Eigentümern vorgehalten'))),
      h('button', { class: 'btn primary', type: 'button', onclick: () => Viewer.open({ blob: b.pdf, title: `Behelf ${b.gz} · ${b.planverfasser}` }) }, 'Öffnen')));
  });
  const addInput = h('input', { type: 'file', accept: 'application/pdf', hidden: true, onchange: async e => {
    const f = e.target.files[0]; if (!f) return;
    v.behelfe.push({ id: uid(), planverfasser: '', gz: f.name.replace(/\.pdf$/i, ''), anmerkung: 'vor Ort ergänzt', vorgehalten: false, pdf: f });
    logEvent(`Behelf ${f.name} ergänzt`); touch(true); setView('behelfe');
  } });
  main.append(h('div', { class: 'stack' },
    lockedBanner(),
    h('div', { class: 'section-head' },
      h('div', {}, h('h1', {}, 'Behelfe für die Wiederherstellung'), h('p', { class: 'muted' }, 'Pläne zu den Geschäftsfallnummern (GFN). Zum Zoomen zwei Finger spreizen.')),
      h('button', { class: 'btn', type: 'button', disabled: L, onclick: () => addInput.click() }, 'Behelf hinzufügen (PDF)'), addInput),
    v.behelfe.length ? list : h('div', { class: 'empty' }, 'Keine Behelfe im Verhandlungspaket.'),
    nextBtn('skizze', 'Weiter zur Begehungsskizze')));
};

/* 3 Skizze */
VIEWS.skizze = main => {
  const v = app.cur, L = isLocked();
  const img = h('img', { class: 'thumb', alt: 'Vorschau der Begehungsskizze', style: 'width:100%;height:auto;max-width:520px' });
  if (v.skizze.pdf) thumbnail('s-' + v.id + '-' + v.skizze.strokes.length + '-' + v.skizze.texts.length, v.skizze.pdf, 520).then(u => { img.src = u; }).catch(() => {});
  const up = h('input', { type: 'file', accept: 'application/pdf', hidden: true, onchange: async e => { const f = e.target.files[0]; if (!f) return; v.skizze.pdf = f; v.skizze.strokes = []; v.skizze.texts = []; touch(true); setView('skizze'); } });
  main.append(h('div', { class: 'stack' },
    lockedBanner(),
    h('div', { class: 'section-head' },
      h('div', {}, h('h1', {}, 'Begehungsskizze'), h('p', { class: 'muted' }, 'Mit dem Stift zeichnen und schreiben, mit dem Finger verschieben und zoomen. Die Ergänzungen kommen als Beilage ins Protokoll.'))),
    v.skizze.pdf ? h('div', { class: 'card stack' }, img,
      h('p', {}, `${v.skizze.strokes.length} Striche, ${v.skizze.texts.length} Texte erfasst.`),
      h('div', { class: 'row' },
        h('button', { class: 'btn primary', type: 'button', onclick: () => Viewer.open({ blob: v.skizze.pdf, title: 'Begehungsskizze', ink: v.skizze, editable: !L, onChange: () => touch() }) }, L ? 'Skizze ansehen' : 'Skizze öffnen und zeichnen'),
        h('button', { class: 'btn', type: 'button', disabled: L, onclick: () => up.click() }, 'Andere Skizze laden'), up))
      : h('div', { class: 'empty stack' }, 'Im Paket ist keine Begehungsskizze.', h('div', {}, h('button', { class: 'btn', type: 'button', onclick: () => up.click() }, 'Skizze laden (PDF)'), up)),
    nextBtn('beschreibung', 'Weiter zur Grenzbeschreibung')));
};

/* 4 Grenzbeschreibung */
const TB = [
  'Alte Grenzpunkte wurden aufgrund oben genannter GFN (VHW) überprüft bzw. rückgesetzt und einvernehmlich anerkannt.',
  'Die neuen Grenzpunkte wurden einvernehmlich festgelegt und in der Natur vermarkt.',
  'Die Grenze verläuft entlang der Mauerflucht (Außenkante).',
  'Die Grenze verläuft in Zaunmitte.',
];
VIEWS.beschreibung = main => {
  const v = app.cur, L = isLocked();
  const ta = h('textarea', { id: 'f-beschr', disabled: L, oninput: e => { v.beschreibung.text = e.target.value; touch(); } });
  ta.value = v.beschreibung.text;
  const ta2 = h('textarea', { id: 'f-strittig', disabled: L, placeholder: 'leer lassen, wenn alle Abschnitte einvernehmlich festgelegt wurden', oninput: e => { v.beschreibung.strittig = e.target.value; touch(); } });
  ta2.value = v.beschreibung.strittig;
  main.append(h('div', { class: 'stack' },
    lockedBanner(),
    h('div', { class: 'section-head' }, h('h1', {}, 'Beschreibung des Grenzverlaufs'), h('span', { class: 'muted' }, 'Protokoll Seite 2')),
    h('p', { class: 'lead' }, 'Der feste Text der Vorlage (Festlegung nach § 845 ABGB, Zeichenschlüssel der VermV) steht automatisch im Protokoll. Hier kommt dazu, was diese Verhandlung betrifft.'),
    h('div', { class: 'card stack' },
      h('div', { class: 'field' }, h('label', { for: 'f-beschr' }, 'Ergänzende Beschreibung'), ta),
      h('div', { class: 'row' }, h('span', { class: 'lbl' }, 'Textbausteine:'),
        TB.map(t => h('button', { class: 'btn', type: 'button', disabled: L, onclick: () => { v.beschreibung.text = (v.beschreibung.text ? v.beschreibung.text.trimEnd() + '\n' : '') + t; ta.value = v.beschreibung.text; touch(); } }, t.length > 42 ? t.slice(0, 40) + '…' : t)))),
    h('div', { class: 'card stack' },
      h('div', { class: 'field' }, h('label', { for: 'f-strittig' }, 'Nicht einvernehmlich festgelegte Grenzabschnitte'), ta2)),
    nextBtn('abschluss', 'Weiter zu Prüfen und sperren')));
};

/* 5 Prüfen und sperren */
function pflichtpruefung(v) {
  const anw = v.beteiligte.filter(b => b.anwesend);
  const owners = v.beteiligte.filter(b => b.rolle === 'Eigentümer');
  const checks = [
    ['Kopfdaten vollständig (Vermessungsamt, KG, Ort, Datum)', !!(v.meta.vermessungsamt && v.meta.kg && v.meta.ort && v.meta.datum)],
    ['Eröffnungszeit erfasst', !!v.meta.eroeffnung],
    ['Verhandlungsleiter eingetragen', !!v.meta.leiter],
    ['Mindestens eine anwesende Person', anw.length > 0],
    ['Identitätsnachweis bei allen Anwesenden', anw.length > 0 && anw.every(b => b.idnachweis)],
    ['Vollmacht bei allen anwesenden Vertretern', anw.filter(b => b.rolle === 'Vertreter').every(b => b.vollmacht)],
    ['Eigentümer im Verzeichnis', owners.length > 0],
    ['Mindestens ein Behelf vorgehalten', v.behelfe.some(b => b.vorgehalten)],
    ['Begehungsskizze vorhanden', !!v.skizze.pdf],
    ['Beschreibung des Grenzverlaufs ausgefüllt', !!(v.beschreibung.text || '').trim()],
    ['Schluss der Verhandlung (Uhrzeit) erfasst', !!v.meta.schluss],
  ];
  return checks;
}
VIEWS.abschluss = main => {
  const v = app.cur, L = isLocked();
  const checks = pflichtpruefung(v);
  const allOk = checks.every(c => c[1]);
  const stack = h('div', { class: 'stack' });
  main.append(stack);
  stack.append(h('div', { class: 'section-head' }, h('h1', {}, 'Prüfen und sperren')),
    h('p', { class: 'lead' }, 'Vor dem Signieren wird das Protokoll gesperrt. Alle Eigentümer zeichnen dann denselben, unveränderlichen Inhalt. Die Schlusszeit steht im Protokoll und wird deshalb vor dem Sperren erfasst.'));
  if (!L) {
    stack.append(h('div', { class: 'card stack' },
      h('div', { class: 'field', style: 'max-width:320px' }, h('label', { for: 'f-schluss' }, 'Schluss der Verhandlung (Uhrzeit)'),
        h('div', { class: 'inline-time' },
          h('input', { id: 'f-schluss', type: 'time', value: v.meta.schluss, oninput: e => { v.meta.schluss = e.target.value; touch(); setView('abschluss'); } }),
          h('button', { class: 'btn', type: 'button', onclick: () => { v.meta.schluss = nowTime(); touch(); setView('abschluss'); } }, 'Jetzt'))),
      h('h2', {}, 'Pflichtfelder nach § 13 VermV 2016'),
      h('ul', { class: 'checklist' }, checks.map(([t, ok]) => h('li', { class: ok ? 'ok' : 'bad' }, h('span', { class: 'mark' }, ok ? '✓' : '!'), h('span', {}, t)))),
      h('div', { class: 'row' },
        h('button', { class: 'btn', type: 'button', onclick: async e => { e.target.disabled = true; try { const pdf = await buildProtocol(v); Viewer.open({ blob: new Blob([pdf], { type: 'application/pdf' }), title: 'Vorschau Protokoll (nicht gesperrt)' }); } catch (err) { toast('Vorschau fehlgeschlagen: ' + err.message); } e.target.disabled = false; } }, 'Vorschau des Protokolls'),
        confirmButton(allOk ? 'Abschließen und sperren' : 'Erst alle Pflichtfelder ausfüllen', 'Jetzt sperren? Danach sind keine Änderungen mehr möglich.', !allOk, async () => {
          const bytes = await buildProtocol(v);
          const hash = await sha256Hex(bytes);
          v.locked = { pdf: new Blob([bytes], { type: 'application/pdf' }), hash, zeit: Date.now() };
          v.signed = null;
          v.status = 'gesperrt';
          logEvent(`Protokoll Version ${v.version} gesperrt, SHA-256 ${hash.slice(0, 16)}…`);
          await touch(true);
          toast('Protokoll gesperrt');
          setView('zustimmung');
        }))));
  } else {
    stack.append(h('div', { class: 'card stack' },
      h('div', { class: 'notice good' }, `Version ${v.version} gesperrt am ${deDateTime(v.locked.zeit)}.`),
      h('div', {}, h('span', { class: 'lbl' }, 'Prüfsumme SHA-256 des gesperrten Protokolls'), h('p', { class: 'hash' }, v.locked.hash)),
      h('div', { class: 'row' },
        h('button', { class: 'btn', type: 'button', onclick: () => Viewer.open({ blob: v.locked.pdf, title: `Protokoll Version ${v.version} (gesperrt)` }) }, 'Gesperrtes Protokoll ansehen'),
        confirmButton('Neue Version anlegen', 'Alle bisherigen Signaturen verfallen. Wirklich entsperren?', false, async () => {
          v.version += 1; v.locked = null; v.signed = null; v.status = 'laufend';
          v.beteiligte.forEach(b => { b.zustimmung = { art: 'offen', zeit: null }; });
          logEvent(`Neue Version ${v.version} angelegt, Signaturen zurückgesetzt`);
          await touch(true); setView('abschluss');
        }, 'danger'))));
  }
};
function confirmButton(label, question, disabled, action, cls = 'primary') {
  const wrap = h('span', { class: 'row' });
  const btn = h('button', { class: 'btn ' + cls, type: 'button', disabled, onclick: () => {
    wrap.replaceChildren(h('span', { style: 'font-weight:600' }, question),
      h('button', { class: 'btn ' + cls, type: 'button', onclick: async e => { e.target.disabled = true; try { await action(); } catch (err) { toast(err.message); e.target.disabled = false; } } }, 'Ja'),
      h('button', { class: 'btn', type: 'button', onclick: () => wrap.replaceChildren(btn) }, 'Abbrechen'));
  } }, label);
  wrap.append(btn);
  return wrap;
}

/* 6 Zustimmung */
let pendingSignFor = null;
VIEWS.zustimmung = main => {
  const v = app.cur;
  const stack = h('div', { class: 'stack' });
  main.append(stack);
  stack.append(h('div', { class: 'section-head' }, h('h1', {}, 'Zustimmung der Eigentümer'), h('span', { class: 'muted' }, 'Protokoll Seite 3')));
  if (!v.locked) {
    stack.append(h('div', { class: 'notice' }, 'Das Protokoll ist noch nicht gesperrt. Erst nach dem Sperren können die Eigentümer zustimmen.'), nextBtn('abschluss', 'Zu Prüfen und sperren'));
    return;
  }
  stack.append(h('div', { class: 'notice info stack', style: 'gap:8px' },
    h('strong', {}, 'So signiert ein Eigentümer mit ID Austria'),
    h('ol', { class: 'steps' },
      h('li', {}, 'Bei der Person auf „Mit ID Austria signieren“ tippen. Das aktuelle Protokoll wird am Tablet gespeichert.'),
      h('li', {}, 'Im Signaturdienst (pdf.egiz.gv.at) das gespeicherte PDF wählen und signieren. Die Person bestätigt mit ihrer ID Austria am eigenen Smartphone.'),
      h('li', {}, 'Das signierte PDF herunterladen und hier mit „Signiertes PDF übernehmen“ zurückholen. Für die nächste Person geht es mit diesem PDF weiter.')),
    h('p', { class: 'muted' }, 'Die Unterschrift mit dem Stift ersetzt die qualifizierte Signatur nicht (§ 886 ABGB, § 4 Abs. 1 SVG). Ohne ID Austria wird die ausgedruckte Zustimmungserklärung händisch unterschrieben.')));

  const owners = v.beteiligte.filter(b => b.rolle === 'Eigentümer');
  const done = owners.filter(b => b.zustimmung.art !== 'offen').length;
  stack.append(h('p', {}, h('strong', {}, `${done} von ${owners.length} Eigentümern erfasst`),
    v.signed ? h('span', { class: 'muted' }, ` · aktuelles PDF enthält ${v.signed.sigCount || 'mindestens eine'} Signatur(en)`) : null));

  for (const b of owners) {
    const z = ZUST[b.zustimmung.art];
    const mark = async art => { b.zustimmung = { art, zeit: Date.now() }; logEvent(`${b.name}: ${ZUST[art].label}`); updateStatus(); await touch(true); setView('zustimmung'); };
    stack.append(h('div', { class: 'card owner' },
      h('div', { class: 'who stack', style: 'gap:4px' },
        h('strong', {}, b.name || 'ohne Namen'),
        h('span', { class: 'muted' }, `EZ ${b.ez || '–'} · Gst.Nr. ${b.gst || '–'} · ${b.anwesend ? 'anwesend' : 'nicht anwesend'}`),
        h('span', {}, h('span', { class: 'pill ' + z.cls }, z.label), b.zustimmung.zeit ? h('span', { class: 'muted' }, '  ' + deDateTime(b.zustimmung.zeit)) : null)),
      h('div', { class: 'actions' },
        b.zustimmung.art === 'offen' ? [
          h('button', { class: 'btn primary', type: 'button', onclick: () => startQes(b) }, 'Mit ID Austria signieren'),
          h('button', { class: 'btn', type: 'button', onclick: () => mark('papier') }, 'Unterschrift auf Papier'),
          h('button', { class: 'btn danger', type: 'button', onclick: () => mark('verweigert') }, 'Verweigert'),
        ] : h('button', { class: 'btn', type: 'button', onclick: () => mark('offen') }, 'Zurücksetzen'))));
  }
  if (pendingSignFor) {
    const b = v.beteiligte.find(x => x.id === pendingSignFor);
    if (b) stack.append(h('div', { class: 'card stack', id: 'qes-panel' },
      h('h2', {}, `Signatur von ${b.name}`),
      h('div', { class: 'row' },
        h('button', { class: 'btn', type: 'button', onclick: () => download(currentPdf(), pdfFileName(v, 'zur_Signatur')) }, '1. Protokoll erneut speichern'),
        h('a', { class: 'btn', href: EGIZ_URL, target: '_blank', rel: 'noopener' }, '2. Signaturdienst öffnen'),
        h('button', { class: 'btn primary', type: 'button', onclick: () => $('#file-signed').click() }, '3. Signiertes PDF übernehmen'),
        h('button', { class: 'btn', type: 'button', onclick: () => { pendingSignFor = null; setView('zustimmung'); } }, 'Abbrechen'))));
  }
  stack.append(h('div', { class: 'row' },
    h('button', { class: 'btn', type: 'button', onclick: () => download(currentPdf(), pdfFileName(v, 'Zustimmungserklaerung_Papier')) }, 'Protokoll zum Ausdrucken speichern'),
    nextBtn('export', 'Weiter zum Export')));
};
function currentPdf() { const v = app.cur; return v.signed ? v.signed.pdf : v.locked.pdf; }
function pdfFileName(v, suffix) { return `Protokoll_${safeName(v.gz)}_V${v.version}_${suffix}.pdf`; }
function startQes(b) {
  pendingSignFor = b.id;
  download(currentPdf(), pdfFileName(app.cur, 'zur_Signatur'));
  setView('zustimmung');
  setTimeout(() => $('#qes-panel')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
}
function countSignatures(bytes) {
  const s = new TextDecoder('latin1').decode(bytes);
  return (s.match(/\/ByteRange\s*\[/g) || []).length;
}
async function acceptSignedPdf(file) {
  const v = app.cur;
  const b = v.beteiligte.find(x => x.id === pendingSignFor);
  if (!b) return;
  const bytes = await blobBytes(file);
  if (new TextDecoder('latin1').decode(bytes.slice(0, 5)) !== '%PDF-') throw new Error('Die Datei ist kein PDF.');
  const sigs = countSignatures(bytes);
  const prev = await blobBytes(currentPdf());
  const prevSigs = countSignatures(prev);
  if (sigs <= prevSigs) throw new Error('Im PDF ist keine neue Signatur enthalten. Bitte das signierte PDF aus dem Signaturdienst wählen.');
  // PAdES hängt Signaturen als inkrementelle Aktualisierung an: das bisherige PDF bleibt unverändert am Anfang.
  let unchanged = bytes.length > prev.length;
  for (let i = 0; unchanged && i < prev.length; i++) if (bytes[i] !== prev[i]) unchanged = false;
  v.signed = { pdf: new Blob([bytes], { type: 'application/pdf' }), zeit: Date.now(), sigCount: sigs, inkrementell: unchanged };
  b.zustimmung = { art: 'qes', zeit: Date.now() };
  logEvent(`${b.name}: QES übernommen (${sigs} Signatur(en) im PDF, ${unchanged ? 'Inhalt unverändert angehängt' : 'Datei neu geschrieben, Inhalt bitte prüfen'})`);
  pendingSignFor = null;
  updateStatus();
  await touch(true);
  toast(unchanged ? 'Signatur übernommen, gesperrter Inhalt unverändert' : 'Signatur übernommen. Achtung: Datei wurde neu geschrieben.');
  setView('zustimmung');
}
function updateStatus() {
  const v = app.cur;
  const owners = v.beteiligte.filter(b => b.rolle === 'Eigentümer');
  v.status = owners.length && owners.every(b => b.zustimmung.art !== 'offen') ? 'abgeschlossen' : 'gesperrt';
}

/* 7 Export */
VIEWS.export = main => {
  const v = app.cur;
  const owners = v.beteiligte.filter(b => b.rolle === 'Eigentümer');
  const cnt = art => owners.filter(b => b.zustimmung.art === art).length;
  main.append(h('div', { class: 'stack' },
    h('div', { class: 'section-head' }, h('h1', {}, 'Export für Beurkundung und BAIK-Archiv')),
    !v.locked ? h('div', { class: 'notice' }, 'Noch nichts zu exportieren: Das Protokoll ist nicht gesperrt.') : h('div', { class: 'card stack' },
      h('div', { class: 'table-wrap' }, h('table', {}, h('tbody', {},
        h('tr', {}, h('th', {}, 'Version'), h('td', {}, String(v.version))),
        h('tr', {}, h('th', {}, 'Gesperrt'), h('td', {}, deDateTime(v.locked.zeit))),
        h('tr', {}, h('th', {}, 'SHA-256'), h('td', { class: 'hash' }, v.locked.hash)),
        h('tr', {}, h('th', {}, 'Zustimmungen'), h('td', {}, `${cnt('qes')} QES · ${cnt('papier')} Papier · ${cnt('verweigert')} verweigert · ${cnt('offen')} offen`)),
        h('tr', {}, h('th', {}, 'Signaturen im PDF'), h('td', {}, v.signed ? String(v.signed.sigCount) : '0'))))),
      cnt('offen') ? h('div', { class: 'notice' }, `${cnt('offen')} Zustimmung(en) sind noch offen.`) : null,
      cnt('papier') ? h('div', { class: 'notice info' }, 'Papier-Zustimmungen werden in der Kanzlei eingescannt und dem Protokoll beigefügt, bevor die Beurkundungssignatur angebracht wird.') : null,
      h('div', { class: 'row' },
        h('button', { class: 'btn primary', type: 'button', onclick: () => download(currentPdf(), pdfFileName(v, v.signed ? 'signiert' : 'gesperrt')) }, v.signed ? 'Signiertes Protokoll speichern' : 'Gesperrtes Protokoll speichern'),
        h('button', { class: 'btn', type: 'button', onclick: () => download(new Blob([JSON.stringify(exportJson(v), null, 2)], { type: 'application/json' }), `Verhandlung_${safeName(v.gz)}_V${v.version}.json`) }, 'Verhandlungsdaten (JSON)'))),
    h('div', { class: 'card stack' },
      h('h2', {}, 'Verlauf'),
      h('div', { class: 'table-wrap' }, h('table', {}, h('tbody', {}, v.log.slice().reverse().map(e => h('tr', {}, h('td', { class: 'mono', style: 'white-space:nowrap' }, deDateTime(e.zeit)), h('td', {}, e.text))))))),
    h('div', { class: 'card stack' },
      h('h2', {}, 'Vom Gerät entfernen'),
      h('p', { class: 'muted' }, 'Nach dem Export und der Ablage in der Kanzlei sollten die personenbezogenen Daten vom Tablet gelöscht werden.'),
      h('div', {}, confirmButton('Verhandlung löschen', 'Endgültig vom Gerät löschen?', false, async () => { await DB.del(v.id); app.cur = null; toast('Verhandlung gelöscht'); setView('start'); }, 'danger')))));
};
function exportJson(v) {
  return {
    app: 'Digitale Grenzverhandlung', version: APP_VERSION, gz: v.gz, meta: v.meta, protokollVersion: v.version,
    gesperrt: v.locked ? { zeit: new Date(v.locked.zeit).toISOString(), sha256: v.locked.hash } : null,
    beteiligte: v.beteiligte.map(({ id, ...b }) => ({ ...b, zustimmung: { ...b.zustimmung, zeit: b.zustimmung.zeit ? new Date(b.zustimmung.zeit).toISOString() : null } })),
    behelfe: v.behelfe.map(b => ({ planverfasser: b.planverfasser, geschaeftszahl: b.gz, anmerkung: b.anmerkung, vorgehalten: b.vorgehalten })),
    beschreibung: v.beschreibung,
    skizze: { striche: v.skizze.strokes.length, texte: v.skizze.texts.length },
    verlauf: v.log.map(e => ({ zeit: new Date(e.zeit).toISOString(), text: e.text })),
  };
}

/* ---------- Protokoll-PDF (pdf-lib) ---------- */
const WIN_ANSI_EXTRA = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';
function ansi(s) {
  return String(s ?? '').replace(/\r/g, '').split('').map(ch => {
    const c = ch.charCodeAt(0);
    if (ch === '\n' || (c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff) || WIN_ANSI_EXTRA.includes(ch)) return ch;
    if (ch === '\t') return ' ';
    if (ch === '≈') return '~';
    return '?';
  }).join('');
}
function hexRgb(hex) { const n = parseInt(hex.slice(1), 16); return PDFLib.rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255); }

async function buildProtocol(v) {
  const { PDFDocument, StandardFonts, rgb, LineCapStyle } = PDFLib;
  const doc = await PDFDocument.create();
  doc.setTitle(`Protokoll Grenzverhandlung ${v.gz}`);
  doc.setSubject('Protokoll über die Festlegung des Grenzverlaufs gemäß § 43 Abs. 6 VermG und § 52 Z 5 VermG');
  doc.setProducer(`Digitale Grenzverhandlung ${APP_VERSION} (Prototyp)`);
  doc.setCreator('Digitale Grenzverhandlung');
  const F = await doc.embedFont(StandardFonts.Helvetica);
  const FB = await doc.embedFont(StandardFonts.HelveticaBold);
  const W = 595.28, H = 841.89, M = 56, BODY_TOP = H - 110, BOTTOM = 70;
  const black = rgb(0, 0, 0), grey = rgb(0.35, 0.35, 0.35), lineC = rgb(0.6, 0.6, 0.6);
  let page, y;
  const pages = [];
  const newPage = () => { page = doc.addPage([W, H]); pages.push(page); y = BODY_TOP; };
  const wrap = (text, font, size, maxW) => {
    const out = [];
    for (const para of ansi(text).split('\n')) {
      if (!para.trim()) { out.push(''); continue; }
      let line = '';
      for (const word of para.split(/\s+/)) {
        const test = line ? line + ' ' + word : word;
        if (font.widthOfTextAtSize(test, size) <= maxW) line = test;
        else { if (line) out.push(line); line = word; while (font.widthOfTextAtSize(line, size) > maxW) { let i = line.length - 1; while (i > 1 && font.widthOfTextAtSize(line.slice(0, i), size) > maxW) i--; out.push(line.slice(0, i)); line = line.slice(i); } }
      }
      out.push(line);
    }
    return out;
  };
  const ensure = need => { if (y - need < BOTTOM) newPage(); };
  const para = (text, { size = 10, font = F, x = M, maxW = W - 2 * M, gap = 6, color = black, lh = 1.35 } = {}) => {
    for (const ln of wrap(text, font, size, maxW)) { ensure(size * lh); page.drawText(ln, { x, y: y - size, size, font, color }); y -= size * lh; }
    y -= gap;
  };
  const centered = (text, size, font) => { ensure(size * 1.5); const t = ansi(text); page.drawText(t, { x: (W - font.widthOfTextAtSize(t, size)) / 2, y: y - size, size, font, color: black }); y -= size * 1.5; };
  const heading = text => { y -= 8; centered(text, 12, FB); y -= 4; };
  const table = (cols, rows, { size = 9, minRow = 0 } = {}) => {
    const total = W - 2 * M, widths = cols.map(c => c.w * total);
    const drawRow = (cells, font, fill, mh = 0) => {
      const lines = cells.map((c, i) => wrap(c, font, size, widths[i] - 8));
      const hgt = Math.max(mh, Math.max(...lines.map(l => l.length)) * size * 1.3 + 8);
      ensure(hgt);
      let x = M;
      if (fill) page.drawRectangle({ x: M, y: y - hgt, width: total, height: hgt, color: fill });
      lines.forEach((ls, i) => { ls.forEach((ln, k) => page.drawText(ln, { x: x + 4, y: y - 4 - size - k * size * 1.3, size, font, color: black })); x += widths[i]; });
      page.drawRectangle({ x: M, y: y - hgt, width: total, height: hgt, borderColor: lineC, borderWidth: 0.6 });
      x = M; for (let i = 0; i < widths.length - 1; i++) { x += widths[i]; page.drawLine({ start: { x, y }, end: { x, y: y - hgt }, thickness: 0.6, color: lineC }); }
      y -= hgt;
    };
    drawRow(cols.map(c => c.t), FB, rgb(0.92, 0.92, 0.92));
    rows.forEach(r => drawRow(r, F, null, minRow));
    y -= 10;
  };

  /* Seite 1 */
  newPage();
  centered('Protokoll über die Festlegung des Grenzverlaufs', 15, FB);
  centered('gemäß § 43 Abs. 6 VermG und § 52 Z 5 VermG', 10, F);
  heading('Verzeichnis der Eigentümer, allfälliger Vertreter und anwesender Personen');
  const anw = v.beteiligte.filter(b => b.anwesend);
  table([{ t: 'Name und Anschrift', w: 0.42 }, { t: 'Rolle', w: 0.22 }, { t: 'ID*', w: 0.1 }, { t: 'Vollmacht', w: 0.12 }, { t: 'EZ / Gst.Nr.', w: 0.14 }],
    anw.length ? anw.map(b => [`${b.name}\n${b.anschrift}`, b.rolle === 'Vertreter' && b.vertritt ? `Vertreter für ${b.vertritt}` : b.rolle, b.idnachweis || '', b.vollmacht || '', [b.ez, b.gst].filter(Boolean).join(' / ')]) : [['keine anwesenden Personen erfasst', '', '', '', '']]);
  para(`Die Verhandlung über den Grenzverlauf wird am ${deDate(v.meta.datum)} um ${v.meta.eroeffnung || '…'} Uhr in ${v.meta.ort || '…'} eröffnet. Der Verhandlungsleiter überzeugt sich von der Persönlichkeit der anwesenden Personen und prüft die Vertretungsbefugnis.`);
  heading('Gegenstand der Verhandlung');
  para('Der Verhandlungsleiter legt den Gegenstand der Grenzverhandlung dar, der die Festlegung der Grenzen der in der Beschreibung des Grenzverlaufs näher bezeichneten Grundstücke betrifft, und hält folgende Behelfe vor:');
  const vb = v.behelfe.filter(b => b.vorgehalten);
  table([{ t: 'Planverfasser', w: 0.4 }, { t: 'Geschäftszahl', w: 0.25 }, { t: 'Anmerkung', w: 0.35 }],
    vb.length ? vb.map(b => [b.planverfasser, b.gz, b.anmerkung]) : [['keine Behelfe vorgehalten', '', '']]);

  /* Seite 2 */
  newPage();
  heading('Beschreibung des Grenzverlaufs');
  para('Der Verlauf der Grenzen wird von den erschienenen beteiligten Eigentümern oder deren bevollmächtigten Vertretern entsprechend der beiliegenden Skizze festgelegt und im Sinne von § 845 ABGB und der Vermessungsverordnung i.d.g.F. gekennzeichnet. Die Grenze verläuft von Grenzpunkt zu Grenzpunkt geradlinig, sofern nichts anderes angegeben ist. Die zeichnerische Darstellung erfolgt unter Verwendung des im Anhang zur Vermessungsverordnung i.d.g.F. festgelegten Zeichenschlüssels.');
  if ((v.beschreibung.text || '').trim()) para(v.beschreibung.text);
  y -= 4;
  para('Nicht einvernehmlich festgelegte Grenzabschnitte:', { font: FB });
  para((v.beschreibung.strittig || '').trim() || 'keine');
  y -= 6;
  centered('Skizze', 12, FB);
  centered('siehe Beilage', 10, F);

  /* Seite 3 */
  newPage();
  heading('Zustimmungserklärung');
  para('Die im nachstehenden Verzeichnis angeführten Eigentümer stimmen dem in der Natur einvernehmlich festgelegten und oben beschriebenen Grenzverlauf zu. Weiters bestätigen die Eigentümer gem. § 43 Abs. 6 VermG und § 52 Z 5 VermG, dass der Grenzverlauf seit der letzten Vermessung unverändert geblieben ist bzw. kein anderer Grenzverlauf bekannt ist.');
  para('Die Zustimmung erfolgt durch qualifizierte elektronische Signatur (ID Austria) des jeweiligen Eigentümers an diesem Dokument oder durch eigenhändige Unterschrift auf einer ausgedruckten Ausfertigung.', { size: 9, color: grey });
  const owners = v.beteiligte.filter(b => b.rolle === 'Eigentümer');
  table([{ t: 'EZ', w: 0.08 }, { t: 'Gst.Nr.', w: 0.14 }, { t: 'Name und Anschrift des Eigentümers', w: 0.34 }, { t: 'Signaturfeld', w: 0.28 }, { t: 'Anmerkung', w: 0.16 }],
    owners.map((b, i) => [b.ez, b.gst, `${b.name}\n${b.anschrift}`, `Signatur Nr. ${i + 1}`, [b.idnachweis && `ID: ${b.idnachweis}`, b.anwesend ? '' : 'nicht anwesend', b.anmerkung].filter(Boolean).join(', ')]), { minRow: 52 });
  para('* ID = Identitätsnachweis: P … persönlich bekannt, A … allgemein bekannt, L … amtlicher Lichtbildausweis. V.i.A. = Vollmacht im Akt; V.p.P. = Vollmacht per Post erhalten; V.p.E. = Vollmacht per E-Mail erhalten.', { size: 8, color: grey });
  y -= 6;
  para(`Die Verhandlung über den Verlauf der Grenze wird um ${v.meta.schluss || '…'} Uhr geschlossen.`);
  y -= 16; ensure(40);
  page.drawText(ansi(`${v.meta.ort || ''}, am ${deDate(v.meta.datum)}`), { x: M, y: y - 10, size: 10, font: F });
  page.drawText('Der Verhandlungsleiter', { x: W - M - 170, y: y - 10, size: 10, font: F });
  page.drawText(ansi(v.meta.leiter || ''), { x: W - M - 170, y: y - 24, size: 10, font: FB });
  y -= 40;

  /* Beilage: Skizze mit Ergänzungen */
  if (v.skizze.pdf) {
    const src = await PDFDocument.load(await blobBytes(v.skizze.pdf), { ignoreEncryption: true });
    const copied = await doc.copyPages(src, src.getPageIndices());
    copied.forEach((p, idx) => {
      doc.addPage(p); pages.push(p);
      const mb = p.getMediaBox();
      const ph = mb.height;
      const toPdf = (x, yy) => ({ x: mb.x + x, y: mb.y + ph - yy });
      for (const s of v.skizze.strokes.filter(s => s.page === idx + 1)) {
        const c = hexRgb(s.color);
        if (s.points.length === 1) { const p0 = toPdf(...s.points[0]); p.drawCircle({ x: p0.x, y: p0.y, size: s.width / 2, color: c }); continue; }
        for (let i = 1; i < s.points.length; i++) {
          p.drawLine({ start: toPdf(...s.points[i - 1]), end: toPdf(...s.points[i]), thickness: s.width, color: c, lineCap: LineCapStyle.Round });
        }
      }
      for (const t of v.skizze.texts.filter(t => t.page === idx + 1)) {
        const pos = toPdf(t.x, t.y);
        p.drawText(ansi(t.text), { x: pos.x, y: pos.y, size: t.size, font: FB, color: hexRgb(t.color) });
      }
      const label = 'Beilage zum Protokoll: Begehungsskizze mit Ergänzungen vor Ort';
      p.drawRectangle({ x: mb.x + 8, y: mb.y + 6, width: F.widthOfTextAtSize(label, 8) + 8, height: 13, color: rgb(1, 1, 1), opacity: 0.85 });
      p.drawText(label, { x: mb.x + 12, y: mb.y + 9.5, size: 8, font: F, color: grey });
    });
  }

  /* Kopf- und Fußzeilen */
  const n = pages.length;
  pages.forEach((p, i) => {
    const { width: pw, height: phh } = p.getSize();
    const mb = p.getMediaBox();
    const isA4 = Math.abs(pw - W) < 1;
    if (isA4) {
      const top = mb.y + phh - 40;
      p.drawText(ansi(`Vermessungsamt: ${v.meta.vermessungsamt}`), { x: M, y: top, size: 9, font: F, color: black });
      p.drawText(ansi(`Katastralgemeinde: ${v.meta.kg}`), { x: M, y: top - 13, size: 9, font: F, color: black });
      p.drawText(`Seite: ${i + 1} von ${n}`, { x: W - M - 120, y: top, size: 9, font: F, color: black });
      p.drawText(ansi(`Projekt: ${v.gz}`), { x: W - M - 120, y: top - 13, size: 9, font: F, color: black });
      p.drawLine({ start: { x: M, y: top - 22 }, end: { x: W - M, y: top - 22 }, thickness: 0.6, color: lineC });
      p.drawText(ansi(`Protokoll Version ${v.version} · erstellt ${deDateTime(Date.now())} · ${v.meta.kanzlei || ''}`), { x: M, y: 30, size: 7.5, font: F, color: grey });
    } else {
      p.drawText(ansi(`Projekt ${v.gz} · Seite ${i + 1} von ${n}`), { x: mb.x + mb.width - 150, y: mb.y + 9.5, size: 8, font: F, color: grey });
    }
  });
  return doc.save();
}

/* ---------- PDF-Viewer mit Stift ---------- */
const Viewer = {
  st: null,
  async open(opts) {
    const st = this.st = { ...opts, doc: null, page: 1, pages: 1, zoom: 1, tx: 0, ty: 0, fit: 1, pw: 0, ph: 0, rs: 0, tool: 'pen', color: '#d0021b', width: 1.6, finger: false, pointers: new Map(), drawing: null, undo: [], renderTask: null };
    $('#viewer').hidden = false;
    document.body.style.overflow = 'hidden';
    $('#v-title').textContent = opts.title;
    $('#v-tools').hidden = !opts.editable;
    $('#v-finger').checked = false;
    this.syncTools();
    try {
      st.doc = await loadPdf(opts.blob);
      st.pages = st.doc.numPages;
      await this.showPage(1);
    } catch (e) { toast('PDF konnte nicht geöffnet werden: ' + e.message); this.close(); }
  },
  close() {
    const st = this.st; if (!st) return;
    if (st.doc) st.doc.destroy();
    this.st = null;
    $('#viewer').hidden = true; $('#v-textbox').hidden = true;
    document.body.style.overflow = '';
    if (st.editable && app.view === 'skizze') setView('skizze');
  },
  async showPage(n) {
    const st = this.st;
    st.page = Math.min(Math.max(1, n), st.pages);
    const page = await st.doc.getPage(st.page);
    st.pdfPage = page;
    const vp = page.getViewport({ scale: 1 });
    st.pw = vp.width; st.ph = vp.height;
    const stage = $('#v-stage').getBoundingClientRect();
    st.fit = Math.min((stage.width - 24) / st.pw, (stage.height - 24) / st.ph);
    const sheet = $('#v-sheet');
    sheet.style.width = st.pw * st.fit + 'px'; sheet.style.height = st.ph * st.fit + 'px';
    for (const c of [$('#v-pdf'), $('#v-ink')]) { c.style.width = st.pw * st.fit + 'px'; c.style.height = st.ph * st.fit + 'px'; }
    st.zoom = 1; st.rs = 0;
    st.tx = (stage.width - st.pw * st.fit) / 2; st.ty = (stage.height - st.ph * st.fit) / 2;
    $('#v-pageinfo').textContent = `${st.page} / ${st.pages}`;
    this.applyTransform();
    await this.render();
  },
  applyTransform() {
    const st = this.st;
    $('#v-sheet').style.transform = `translate(${st.tx}px, ${st.ty}px) scale(${st.zoom})`;
    $('#v-zoomlabel').textContent = Math.round(st.zoom * 100) + ' %';
  },
  scheduleRender() { clearTimeout(this.rt); this.rt = setTimeout(() => this.render(), 180); },
  async render() {
    const st = this.st; if (!st || !st.pdfPage) return;
    const dpr = window.devicePixelRatio || 1;
    let rs = st.fit * st.zoom * dpr;
    const maxPx = 14e6;
    if (st.pw * rs * st.ph * rs > maxPx) rs = Math.sqrt(maxPx / (st.pw * st.ph));
    if (Math.abs(rs - st.rs) / Math.max(rs, 0.01) < 0.05 && $('#v-pdf').width) return;
    st.rs = rs;
    const vp = st.pdfPage.getViewport({ scale: rs });
    const off = document.createElement('canvas');
    off.width = Math.floor(vp.width); off.height = Math.floor(vp.height);
    if (st.renderTask) { try { st.renderTask.cancel(); } catch (_) {} }
    st.renderTask = st.pdfPage.render({ canvasContext: off.getContext('2d'), viewport: vp });
    try { await st.renderTask.promise; } catch (e) { if (e && e.name === 'RenderingCancelledException') return; throw e; }
    if (this.st !== st) return;
    const c = $('#v-pdf'); c.width = off.width; c.height = off.height; c.getContext('2d').drawImage(off, 0, 0);
    const ink = $('#v-ink'); ink.width = off.width; ink.height = off.height;
    this.drawInk();
  },
  drawInk() {
    const st = this.st; if (!st) return;
    const ink = $('#v-ink'), ctx = ink.getContext('2d');
    ctx.clearRect(0, 0, ink.width, ink.height);
    if (!st.ink) return;
    const k = ink.width / st.pw;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const s of st.ink.strokes.filter(s => s.page === st.page)) this.strokePath(ctx, s, k);
    for (const t of st.ink.texts.filter(t => t.page === st.page)) {
      ctx.fillStyle = t.color; ctx.font = `bold ${t.size * k}px Helvetica, Arial, sans-serif`;
      ctx.fillText(t.text, t.x * k, t.y * k);
    }
  },
  strokePath(ctx, s, k) {
    ctx.strokeStyle = s.color; ctx.fillStyle = s.color; ctx.lineWidth = s.width * k;
    if (s.points.length === 1) { ctx.beginPath(); ctx.arc(s.points[0][0] * k, s.points[0][1] * k, s.width * k / 2, 0, Math.PI * 2); ctx.fill(); return; }
    ctx.beginPath(); ctx.moveTo(s.points[0][0] * k, s.points[0][1] * k);
    for (let i = 1; i < s.points.length; i++) ctx.lineTo(s.points[i][0] * k, s.points[i][1] * k);
    ctx.stroke();
  },
  toPage(e) {
    const st = this.st, r = $('#v-stage').getBoundingClientRect();
    return [((e.clientX - r.left - st.tx) / st.zoom) / st.fit, ((e.clientY - r.top - st.ty) / st.zoom) / st.fit];
  },
  zoomAt(factor, cx, cy) {
    const st = this.st;
    const nz = Math.min(12, Math.max(0.5, st.zoom * factor));
    const f = nz / st.zoom;
    st.tx = cx - (cx - st.tx) * f; st.ty = cy - (cy - st.ty) * f; st.zoom = nz;
    this.applyTransform(); this.scheduleRender();
  },
  zoomCenter(factor) { const r = $('#v-stage').getBoundingClientRect(); this.zoomAt(factor, r.width / 2, r.height / 2); },
  snapshot() { const st = this.st; st.undo.push(JSON.stringify({ strokes: st.ink.strokes, texts: st.ink.texts })); if (st.undo.length > 60) st.undo.shift(); },
  changed() { this.st.onChange && this.st.onChange(); },
  canDraw(e) {
    const st = this.st;
    if (!st.editable || st.tool === 'hand') return false;
    return e.pointerType === 'pen' || e.pointerType === 'mouse' || (e.pointerType === 'touch' && st.finger);
  },
  down(e) {
    const st = this.st; if (!st) return;
    const stage = $('#v-stage');
    stage.setPointerCapture(e.pointerId);
    if (this.canDraw(e) && !st.pointers.size) {
      const p = this.toPage(e);
      if (st.tool === 'pen') { this.snapshot(); st.drawing = { id: e.pointerId, s: { page: st.page, color: st.color, width: st.width, points: [p] } }; }
      else if (st.tool === 'erase') { this.snapshot(); st.drawing = { id: e.pointerId, erase: true }; this.eraseAt(p); }
      else if (st.tool === 'text') { st.textPos = p; $('#v-textbox').hidden = false; $('#v-textinput').value = ''; $('#v-textinput').focus(); }
      return;
    }
    if (e.pointerType === 'touch' && st.drawing) return; // Handballen beim Schreiben ignorieren
    st.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    st.gesture = null;
  },
  move(e) {
    const st = this.st; if (!st) return;
    if (st.drawing && st.drawing.id === e.pointerId) {
      const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
      if (st.drawing.erase) { for (const ev of evs) this.eraseAt(this.toPage(ev)); return; }
      const s = st.drawing.s, ctx = $('#v-ink').getContext('2d'), k = $('#v-ink').width / st.pw;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = s.color; ctx.lineWidth = s.width * k;
      for (const ev of evs) {
        const p = this.toPage(ev), last = s.points[s.points.length - 1];
        if (Math.hypot(p[0] - last[0], p[1] - last[1]) < 0.4 / st.zoom) continue;
        ctx.beginPath(); ctx.moveTo(last[0] * k, last[1] * k); ctx.lineTo(p[0] * k, p[1] * k); ctx.stroke();
        s.points.push([Math.round(p[0] * 100) / 100, Math.round(p[1] * 100) / 100]);
      }
      return;
    }
    if (!st.pointers.has(e.pointerId)) return;
    const r = $('#v-stage').getBoundingClientRect();
    const prev = st.pointers.get(e.pointerId);
    st.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (st.pointers.size === 1) {
      st.tx += e.clientX - prev.x; st.ty += e.clientY - prev.y; this.applyTransform();
    } else if (st.pointers.size === 2) {
      const [a, b] = Array.from(st.pointers.values());
      const dist = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2 - r.left, my = (a.y + b.y) / 2 - r.top;
      if (st.gesture) {
        st.tx += mx - st.gesture.mx; st.ty += my - st.gesture.my;
        this.zoomAt(dist / st.gesture.dist, mx, my);
      }
      st.gesture = { dist, mx, my };
    }
  },
  up(e) {
    const st = this.st; if (!st) return;
    if (st.drawing && st.drawing.id === e.pointerId) {
      if (!st.drawing.erase) { st.ink.strokes.push(st.drawing.s); }
      st.drawing = null; this.drawInk(); this.changed(); return;
    }
    st.pointers.delete(e.pointerId); st.gesture = null;
  },
  eraseAt(p) {
    const st = this.st, tol = 6 / st.zoom;
    const near = pts => pts.some(q => Math.hypot(q[0] - p[0], q[1] - p[1]) < tol);
    const before = st.ink.strokes.length + st.ink.texts.length;
    st.ink.strokes = st.ink.strokes.filter(s => s.page !== st.page || !near(s.points));
    st.ink.texts = st.ink.texts.filter(t => t.page !== st.page || !(p[0] > t.x - tol && p[0] < t.x + t.text.length * t.size * 0.6 + tol && p[1] > t.y - t.size - tol && p[1] < t.y + tol));
    if (st.ink.strokes.length + st.ink.texts.length !== before) { this.drawInk(); this.changed(); }
  },
  addText() {
    const st = this.st, txt = $('#v-textinput').value.trim();
    $('#v-textbox').hidden = true;
    if (!txt || !st.textPos) return;
    this.snapshot();
    st.ink.texts.push({ page: st.page, x: st.textPos[0], y: st.textPos[1], text: txt, color: st.color, size: Math.max(6, 11 / st.zoom) });
    this.drawInk(); this.changed();
  },
  undoLast() {
    const st = this.st; if (!st || !st.undo.length) return;
    const prev = JSON.parse(st.undo.pop());
    st.ink.strokes = prev.strokes; st.ink.texts = prev.texts;
    this.drawInk(); this.changed();
  },
  syncTools() {
    const st = this.st;
    $$('#v-tools [data-tool]').forEach(b => b.classList.toggle('on', b.dataset.tool === st.tool));
    $$('#v-tools [data-color]').forEach(b => b.classList.toggle('on', b.dataset.color === st.color));
    $$('#v-tools [data-width]').forEach(b => b.classList.toggle('on', Number(b.dataset.width) === st.width));
  },
};
function initViewer() {
  const stage = $('#v-stage');
  stage.addEventListener('pointerdown', e => { e.preventDefault(); Viewer.down(e); });
  stage.addEventListener('pointermove', e => { e.preventDefault(); Viewer.move(e); });
  stage.addEventListener('pointerup', e => Viewer.up(e));
  stage.addEventListener('pointercancel', e => Viewer.up(e));
  stage.addEventListener('wheel', e => { e.preventDefault(); const r = stage.getBoundingClientRect(); Viewer.zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX - r.left, e.clientY - r.top); }, { passive: false });
  $('#v-close').onclick = () => Viewer.close();
  $('#v-zoomin').onclick = () => Viewer.zoomCenter(1.4);
  $('#v-zoomout').onclick = () => Viewer.zoomCenter(1 / 1.4);
  $('#v-fit').onclick = () => Viewer.showPage(Viewer.st.page);
  $('#v-prev').onclick = () => Viewer.showPage(Viewer.st.page - 1);
  $('#v-next').onclick = () => Viewer.showPage(Viewer.st.page + 1);
  $('#v-undo').onclick = () => Viewer.undoLast();
  $('#v-finger').onchange = e => { Viewer.st.finger = e.target.checked; };
  $$('#v-tools [data-tool]').forEach(b => b.onclick = () => { Viewer.st.tool = b.dataset.tool; Viewer.syncTools(); });
  $$('#v-tools [data-color]').forEach(b => b.onclick = () => { Viewer.st.color = b.dataset.color; Viewer.syncTools(); });
  $$('#v-tools [data-width]').forEach(b => b.onclick = () => { Viewer.st.width = Number(b.dataset.width); Viewer.syncTools(); });
  $('#v-textok').onclick = () => Viewer.addText();
  $('#v-textcancel').onclick = () => { $('#v-textbox').hidden = true; };
  $('#v-textinput').addEventListener('keydown', e => { if (e.key === 'Enter') Viewer.addText(); if (e.key === 'Escape') $('#v-textbox').hidden = true; });
  window.addEventListener('resize', () => { if (Viewer.st) Viewer.showPage(Viewer.st.page); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && Viewer.st && $('#v-textbox').hidden) Viewer.close(); });
}

/* ---------- Start ---------- */
function initNet() {
  const upd = () => { const n = $('#net'); n.classList.toggle('off', !navigator.onLine); n.title = navigator.onLine ? 'online' : 'offline – alle Unterlagen sind am Gerät'; };
  window.addEventListener('online', upd); window.addEventListener('offline', upd); upd();
}
function init() {
  initViewer(); initNet();
  $('#btn-home').onclick = () => { if (Viewer.st) Viewer.close(); app.cur = null; setView('start'); };
  $$('#sidenav button').forEach(b => b.onclick = () => setView(b.dataset.view));
  $('#file-zip').onchange = async e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    try { const v = await importZip(f); await DB.put(v); toast(`Verhandlung ${v.gz} importiert`); openGz(v.id); }
    catch (err) { toast('Import fehlgeschlagen: ' + err.message); }
  };
  $('#file-signed').onchange = async e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    try { await acceptSignedPdf(f); } catch (err) { toast(err.message); }
  };
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  setView('start');
}
init();
