/* ADP Rinner – Digitale Grenzverhandlung (Prototyp zur Masterarbeit, Kapitel 6.5)
 * Offline-Web-App: GZ-Auswahl, Übersicht, Behelfe, Begehungsskizze mit Stift und Grenzzeichen,
 * Protokoll nach § 43 Abs. 6 VermG (Vorlage der Kanzlei), Sperre mit Prüfsumme,
 * Zustimmung per ID Austria (QES über externen Signaturdienst), Papier oder Stift (nur Information), Export.
 */
'use strict';

const APP_VERSION = '0.3.0';
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
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}
const ICONS = {
  uebersicht: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  eroeffnung: 'M9 11a4 4 0 100-8 4 4 0 000 8zM2 21v-1a6 6 0 0112 0v1M16 3.5a4 4 0 010 7.5M22 21v-1a6 6 0 00-4-5.6',
  behelfe: 'M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6',
  skizze: 'M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3zM9 3v15M15 6v15',
  beschreibung: 'M4 6h16M4 10h16M4 14h10M4 18h7',
  abschluss: 'M6 11h12v10H6zM8 11V8a4 4 0 018 0v3',
  zustimmung: 'M4 20h16M6 16l9-9 3 3-9 9H6z',
  export: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  folder: 'M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2z',
  info: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 11v6M12 7.5v.5',
  warn: 'M12 3l10 18H2zM12 10v5M12 18v.5',
  check: 'M5 12l5 5 9-10',
  clock: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 7v5l3 2',
  plus: 'M12 5v14M5 12h14',
  zoom: 'M11 18a7 7 0 100-14 7 7 0 000 14zM20 20l-4-4M11 8v6M8 11h6',
  upload: 'M12 16V5M7 10l5-5 5 5M5 20h14',
  user: 'M12 11a4 4 0 100-8 4 4 0 000 8zM4 21v-1a8 8 0 0116 0v1',
  run: 'M13 4a2 2 0 100 .1M9 21l3-6 3 3v3M7 12l3-4 4 1 3 3M10 8l-1 5',
  pdf: 'M7 3h7l5 5v13H7zM14 3v5h5M9 15h6',
  pen: 'M4 20l4-1 11-11-3-3L5 16z',
};
const put = (el, ...c) => el.append(...c.flat(Infinity).filter(x => x !== null && x !== undefined && x !== false));
const SVGNS = 'http://www.w3.org/2000/svg';
function icon(name) {
  const s = document.createElementNS(SVGNS, 'svg');
  s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS(SVGNS, 'path');
  p.setAttribute('d', ICONS[name]); p.setAttribute('fill', 'none'); p.setAttribute('stroke', 'currentColor');
  p.setAttribute('stroke-width', '2'); p.setAttribute('stroke-linecap', 'round'); p.setAttribute('stroke-linejoin', 'round');
  s.append(p); return s;
}
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const pad2 = n => String(n).padStart(2, '0');
const nowTime = () => { const d = new Date(); return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };
const timeOf = ts => { const d = new Date(ts); return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };
const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; };
const deDate = iso => { if (!iso) return ''; const [y, m, d] = iso.split('-'); return `${d}.${m}.${y}`; };
const deDateTime = ts => { const d = new Date(ts); return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()}, ${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };
const initials = name => String(name || '?').replace(/\(.*?\)/g, '').split(/\s+/).filter(w => /^[A-ZÄÖÜ]/.test(w) && !/^(Ing|Dipl|Dr|DI|Mag)\.?/.test(w)).slice(0, 2).map(w => w[0]).join('') || '?';

let toastTimer;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 3400);
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
async function fetchBlob(url, type) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} konnte nicht geladen werden (${r.status}).`);
  return new Blob([await r.arrayBuffer()], { type });
}

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
      const res = fn(t.objectStore('verhandlungen'));
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
  laufend: { label: 'Verhandlung läuft', cls: 'brand' },
  gesperrt: { label: 'gesperrt, Zustimmung offen', cls: 'warn' },
  abgeschlossen: { label: 'alle Zustimmungen erfasst', cls: 'good' },
};
const ZUST = {
  offen: { label: 'Zustimmung offen', cls: '' },
  qes: { label: 'QES mit ID Austria', cls: 'good' },
  papier: { label: 'Unterschrift auf Papier', cls: 'good' },
  stift: { label: 'Stift-Unterschrift (nur Information)', cls: 'warn' },
  verweigert: { label: 'Zustimmung verweigert', cls: 'crit' },
};
const ROLLEN = ['Eigentümer', 'Vertreter', 'Anwesend (sonstige)'];
const IDNACHWEIS = [['P', 'P', 'persönlich bekannt'], ['A', 'A', 'allgemein bekannt'], ['L', 'L', 'amtlicher Lichtbildausweis']];
const VOLLMACHT = [['V.i.A.', 'im Akt', 'Vollmacht im Akt'], ['V.p.P.', 'Post', 'Vollmacht per Post erhalten'], ['V.p.E.', 'E-Mail', 'Vollmacht per E-Mail erhalten']];
const SYMBOLE = { GS: 'Grenzstein', MM: 'Marke Metall', MK: 'Marke Kunststoff', ER: 'Rohr (Eisen)', NG: 'Vermessungsnagel', HN: 'Hiltinagel', ME: 'Mauerecke', HE: 'Hausecke', ZS: 'Zaunsäule' };

const STEPS = [
  { k: 'uebersicht', t: 'Übersicht', s: 'Geschäftsfall auf einen Blick' },
  { k: 'eroeffnung', t: 'Eröffnung', s: 'Kopfdaten und Beteiligte' },
  { k: 'behelfe', t: 'Behelfe', s: 'GFN-Pläne vorhalten' },
  { k: 'skizze', t: 'Begehungsskizze', s: 'Zeichnen mit dem Stift' },
  { k: 'beschreibung', t: 'Grenzverlauf', s: 'Beschreibung, strittige Abschnitte' },
  { k: 'abschluss', t: 'Prüfen und sperren', s: 'Pflichtfelder, Prüfsumme' },
  { k: 'zustimmung', t: 'Zustimmung', s: 'ID Austria, Papier, vorzeitig' },
  { k: 'export', t: 'Export', s: 'Protokoll für das BAIK' },
];

function newPerson(b = {}) {
  return {
    id: uid(), ez: b.ez || '', gst: b.gst || '', name: b.name || '', anschrift: b.anschrift || '',
    rolle: b.rolle && ROLLEN.includes(b.rolle) ? b.rolle : 'Eigentümer', vertritt: b.vertritt || '',
    anwesend: false, idnachweis: '', vollmacht: '', anmerkung: '', zustimmung: { art: 'offen', zeit: null },
  };
}
function newVerhandlung(src) {
  return {
    id: uid(),
    gz: String(src.gz),
    meta: {
      vermessungsamt: src.vermessungsamt || '', kg: src.katastralgemeinde || '', gemeinde: src.gemeinde || '', ort: src.ort || '',
      datum: src.datum || todayISO(), eroeffnung: '', schluss: '', leiter: src.verhandlungsleiter || '', kanzlei: src.kanzlei || '',
      gegenstand: src.gegenstand || '',
    },
    beteiligte: (src.beteiligte || []).map(newPerson),
    behelfe: (src.behelfe || []).map(b => ({ id: uid(), planverfasser: b.planverfasser || '', gz: b.geschaeftszahl || '', anmerkung: b.anmerkung || '', vorgehalten: false, pdf: b.pdf, datei: b.datei || '' })),
    skizze: { pdf: src.skizzePdf || null, strokes: [], texts: [], symbols: [] },
    beschreibung: { text: 'Alte Grenzpunkte wurden aufgrund oben genannter GFN (VHW´s) überprüft bzw. rückgesetzt und einvernehmlich anerkannt.\nDie neuen Grenzpunkte wurden ebenfalls einvernehmlich festgelegt und in der Natur vermarkt.', strittig: '' },
    status: 'vorbereitet', version: 1, locked: null, signed: null,
    log: [{ zeit: Date.now(), text: 'Verhandlungspaket importiert' }],
    created: Date.now(), updated: Date.now(),
  };
}
function migrate(v) {
  v.skizze.symbols = v.skizze.symbols || [];
  delete v.vorab;
  v.meta.gemeinde = v.meta.gemeinde || '';
  v.meta.gegenstand = v.meta.gegenstand || '';
  return v;
}

const app = { list: [], cur: null, view: 'start', editing: null, pending: null };
const isLocked = () => !!(app.cur && app.cur.locked);
const owners = v => v.beteiligte.filter(b => b.rolle === 'Eigentümer');

let saveTimer;
function touch(immediate) {
  if (!app.cur) return;
  app.cur.updated = Date.now();
  clearTimeout(saveTimer);
  const v = app.cur;
  renderChrome();
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

/* ---------- Demo (Plan der Kanzlei, Personen fiktiv) ---------- */
function demoSource() {
  return {
    gz: '19389', vermessungsamt: 'Graz', katastralgemeinde: '63243 Kirchenviertel', gemeinde: 'Gratkorn',
    ort: 'Gratkorn, Kapellenweg', datum: todayISO(), verhandlungsleiter: 'DI Max Muster',
    kanzlei: 'ADP Rinner ZT GmbH, Münzgrabenstraße 4/1, 8010 Graz',
    gegenstand: 'Umwandlung des Grundstücks .626 in den Grenzkataster',
    skizze: 'skizze.pdf',
    behelfe: [
      { planverfasser: 'Archiv (Planverfasser lt. Plankopf)', geschaeftszahl: 'GFN 1958', anmerkung: 'Plan aus 1958, Grundlage für die Wiederherstellung', datei: 'behelfe/GFN_1958.pdf' },
    ],
    beteiligte: [
      { ez: '1012', gst: '.626', name: 'Johann Steiner', anschrift: 'Kapellenweg 7, 8101 Gratkorn', rolle: 'Eigentümer' },
      { ez: '1012', gst: '.626', name: 'Maria Steiner', anschrift: 'Kapellenweg 7, 8101 Gratkorn', rolle: 'Eigentümer' },
      { ez: '988', gst: '.627', name: 'Elisabeth Pichler', anschrift: 'Kapellenweg 9, 8101 Gratkorn', rolle: 'Eigentümer' },
      { ez: '540', gst: '784/5', name: 'Franz Hofer', anschrift: 'Dorfstraße 12, 8101 Gratkorn', rolle: 'Eigentümer' },
      { ez: '536', gst: '783/15', name: 'Christine Weber', anschrift: 'Kapellenweg 3, 8101 Gratkorn', rolle: 'Eigentümer' },
      { ez: '975', gst: '.625', name: 'Karl Wolf', anschrift: 'Kapellenweg 5, 8101 Gratkorn', rolle: 'Eigentümer' },
      { ez: '50000', gst: '823', name: 'Marktgemeinde Gratkorn (öffentliches Gut)', anschrift: 'Gemeindeamt, 8101 Gratkorn', rolle: 'Eigentümer' },
      { name: 'Ing. Peter Lang', anschrift: 'Gemeindeamt, 8101 Gratkorn', rolle: 'Vertreter', vertritt: 'Marktgemeinde Gratkorn' },
    ],
  };
}
async function demoFiles() {
  return {
    skizze: await fetchBlob('demo/Begehungsplan1.pdf', 'application/pdf'),
    gfn: await fetchBlob('demo/GFN_1958.pdf', 'application/pdf'),
  };
}
async function createDemo() {
  const f = await demoFiles();
  const src = demoSource();
  src.skizzePdf = f.skizze; src.behelfe[0].pdf = f.gfn;
  const v = newVerhandlung(src);
  v.log[0].text = 'Demo-Verhandlung angelegt (Plan der Kanzlei, Personen fiktiv)';
  await DB.put(v);
  return v;
}
async function demoZipBlob() {
  const f = await demoFiles();
  const zip = new JSZip();
  zip.file('verhandlung.json', JSON.stringify(demoSource(), null, 2));
  zip.file('skizze.pdf', await f.skizze.arrayBuffer());
  zip.file('behelfe/GFN_1958.pdf', await f.gfn.arrayBuffer());
  return zip.generateAsync({ type: 'blob' });
}

/* ---------- Vorschaubilder ---------- */
async function loadPdf(blob) { return pdfjsLib.getDocument({ data: await blobBytes(blob) }).promise; }
const thumbCache = new Map();
async function thumbnail(key, blob, width = 320, ink = null) {
  if (thumbCache.has(key)) return thumbCache.get(key);
  const doc = await loadPdf(blob);
  const page = await doc.getPage(1);
  const vp1 = page.getViewport({ scale: 1 });
  const k = width / vp1.width;
  const vp = page.getViewport({ scale: k });
  const c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
  const ctx = c.getContext('2d');
  await page.render({ canvasContext: ctx, viewport: vp }).promise;
  if (ink) paintInk(ctx, ink, 1, k);
  const url = c.toDataURL('image/jpeg', 0.82);
  thumbCache.set(key, url); doc.destroy();
  return url;
}
const inkCount = s => s.strokes.length + s.texts.length + s.symbols.length;
const sketchKey = v => `s-${v.id}-${v.skizze.strokes.length}-${v.skizze.texts.length}-${v.skizze.symbols.length}-${v.skizze.rev || 0}`;

/* Zeichnet Striche, Texte und Grenzzeichen (Koordinaten in PDF-Punkten, Ursprung links oben) */
function paintInk(ctx, ink, pageNo, k) {
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const s of ink.strokes.filter(s => s.page === pageNo)) {
    ctx.strokeStyle = s.color; ctx.fillStyle = s.color; ctx.lineWidth = s.width * k;
    if (s.points.length === 1) { ctx.beginPath(); ctx.arc(s.points[0][0] * k, s.points[0][1] * k, s.width * k / 2, 0, Math.PI * 2); ctx.fill(); continue; }
    ctx.beginPath(); ctx.moveTo(s.points[0][0] * k, s.points[0][1] * k);
    for (let i = 1; i < s.points.length; i++) ctx.lineTo(s.points[i][0] * k, s.points[i][1] * k);
    ctx.stroke();
  }
  for (const t of ink.texts.filter(t => t.page === pageNo)) {
    ctx.fillStyle = t.color; ctx.font = `bold ${t.size * k}px Helvetica, Arial, sans-serif`;
    ctx.fillText(t.text, t.x * k, t.y * k);
  }
  for (const s of (ink.symbols || []).filter(s => s.page === pageNo)) {
    const r = s.r * k, x = s.x * k, y = s.y * k;
    ctx.strokeStyle = s.color; ctx.fillStyle = s.color; ctx.lineWidth = Math.max(1, r * 0.28);
    ctx.beginPath();
    if (s.code === 'GS') ctx.rect(x - r, y - r, 2 * r, 2 * r); else ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, r * 0.3, 0, Math.PI * 2); ctx.fill();
    ctx.font = `bold ${r * 1.5}px Helvetica, Arial, sans-serif`;
    ctx.fillText(s.code, x + r * 1.35, y + r * 0.5);
  }
}

/* ---------- Bausteine ---------- */
function sw(label, checked, onchange, disabled) {
  return h('label', { class: 'switch' },
    h('input', { type: 'checkbox', checked, disabled, onchange: e => onchange(e.target.checked) }),
    h('span', { class: 'track' }), label);
}
function seg(options, cur, onpick, disabled, aria) {
  return h('div', { class: 'seg', role: 'group', 'aria-label': aria },
    options.map(([val, label, title]) => h('button', {
      type: 'button', class: val === cur ? 'on' : null, title, disabled, 'aria-pressed': String(val === cur),
      onclick: () => onpick(val === cur ? '' : val),
    }, label)));
}
function notice(kind, iconName, ...content) {
  return h('div', { class: 'notice ' + kind }, icon(iconName), h('div', {}, ...content));
}
function pageHead(title, lead, ...right) {
  return h('div', { class: 'page-head' },
    h('div', {}, h('h1', {}, title), lead ? h('p', { class: 'lead' }, lead) : null),
    right.length ? h('div', { class: 'row' }, ...right) : null);
}
function lockedBanner() {
  if (!isLocked()) return null;
  return notice('info', 'abschluss', h('strong', {}, `Protokoll Version ${app.cur.version} ist gesperrt.`),
    h('span', {}, 'Änderungen sind nur über eine neue Version möglich (Schritt „Prüfen und sperren“).'));
}
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
function field(label, value, oninput, { type = 'text', disabled = false, id, placeholder } = {}) {
  id = id || 'f-' + uid();
  return h('div', { class: 'field' }, h('label', { for: id }, label),
    h('input', { id, type, value, disabled, placeholder, oninput: e => oninput(e.target.value) }));
}

/* ---------- Rahmen: Kopfzeile, Ablauf, Aktionsleiste ---------- */
function stepDone(k, v = app.cur) {
  if (!v) return false;
  switch (k) {
    case 'eroeffnung': return !!v.meta.eroeffnung && v.beteiligte.some(b => b.anwesend);
    case 'behelfe': return v.behelfe.length > 0 && v.behelfe.every(b => b.vorgehalten);
    case 'skizze': return inkCount(v.skizze) > 0;
    case 'beschreibung': return !!(v.beschreibung.text || '').trim();
    case 'abschluss': return !!v.locked;
    case 'zustimmung': return v.status === 'abgeschlossen';
    default: return false;
  }
}
function progress(v) {
  const ks = ['eroeffnung', 'behelfe', 'skizze', 'beschreibung', 'abschluss', 'zustimmung'];
  return { done: ks.filter(k => stepDone(k, v)).length, total: ks.length };
}
function renderChrome() {
  const v = app.cur, inGz = app.view !== 'start' && v;
  document.body.classList.toggle('is-start', !inGz);
  $('#actionbar').hidden = !inGz;
  if (!inGz) return;
  $('#topbar-gz').textContent = `GZ ${v.gz}`;
  $('#topbar-sub').textContent = [v.meta.kg && `KG ${v.meta.kg}`, deDate(v.meta.datum)].filter(Boolean).join(' · ');
  const s = STATUS[v.status], pill = $('#topbar-status');
  pill.className = 'pill ' + s.cls; pill.textContent = s.label;

  const pr = progress(v);
  const nav = $('#stepper');
  nav.replaceChildren(); put(nav, 
    h('div', { class: 'progress' },
      h('div', { class: 'progress-label' }, h('span', {}, 'Fortschritt'), h('span', {}, `${pr.done} von ${pr.total}`)),
      h('div', { class: 'bar' }, h('span', { style: `width:${Math.round(pr.done / pr.total * 100)}%` }))),
    STEPS.map(st => h('button', {
      type: 'button', class: 'step' + (st.k === app.view ? ' on' : '') + (stepDone(st.k) ? ' done' : ''),
      'aria-current': st.k === app.view ? 'step' : null, onclick: () => setView(st.k),
    }, h('span', { class: 'ico' }, icon(st.k)), h('span', { class: 'tick' }, '✓'),
      h('span', { class: 'txt' }, h('b', {}, st.t), h('small', {}, st.s)))));
  const i = STEPS.findIndex(x => x.k === app.view);
  const back = $('#btn-back'), next = $('#btn-next');
  back.hidden = i <= 0; next.hidden = i >= STEPS.length - 1;
  if (i > 0) back.textContent = 'Zurück';
  if (i < STEPS.length - 1) next.textContent = `Weiter: ${STEPS[i + 1].t}`;
  $('#actionbar-hint').textContent = i >= 0 ? `Schritt ${i + 1} von ${STEPS.length}` : '';
}

const VIEWS = {};
function setView(view) {
  app.view = view;
  const main = $('#main');
  main.replaceChildren();
  renderChrome();
  const page = h('div', { class: 'page' });
  main.append(page);
  VIEWS[view](page);
  main.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}
function rerender() { const y = window.scrollY; setView(app.view); window.scrollTo(0, y); }

/* ---------- Start ---------- */
VIEWS.start = async page => {
  const main = $('#main');
  main.replaceChildren();
  const list = h('div', { class: 'list' });
  const busy = async (btn, fn) => { btn.disabled = true; try { await fn(); } catch (err) { toast(err.message); } btn.disabled = false; };
  main.append(h('div', { class: 'start' }, h('div', { class: 'start-inner' },
    h('div', { class: 'start-card' },
      h('div', { class: 'head' },
        h('img', { src: 'assets/logo.png', alt: 'Vermessung ADP Rinner', width: 309, height: 92 }),
        h('div', {}, h('span', { class: 'eyebrow' }, 'Digitale Grenzverhandlung'),
          h('h1', {}, 'Welche Verhandlung führst du heute?'),
          h('p', { class: 'muted' }, 'Geschäftszahl wählen. Alle Unterlagen liegen am Gerät, die Verhandlung läuft auch ohne Netz.'))),
      list,
      h('div', { class: 'foot' },
        h('button', { class: 'btn primary', type: 'button', onclick: () => $('#file-zip').click() }, icon('upload'), 'Verhandlungspaket importieren'),
        h('button', { class: 'btn', type: 'button', onclick: e => busy(e.currentTarget, async () => { const v = await createDemo(); toast('Demo-Verhandlung angelegt'); openGz(v.id); }) }, icon('plus'), 'Demo-Verhandlung anlegen'))),
    h('details', {},
      h('summary', {}, 'Wie kommt eine Verhandlung aufs Gerät?'),
      h('div', { class: 'card stack' },
        h('p', {}, 'Die Kanzlei stellt je Geschäftszahl ein ZIP-Paket zusammen: verhandlung.json mit Kopfdaten, Beteiligten und Behelfen, dazu die Behelfe und die Begehungsskizze als PDF. Telefonnummern und E-Mail-Adressen gehören nicht hinein.'),
        h('div', {}, h('button', { class: 'btn', type: 'button', onclick: e => busy(e.currentTarget, async () => download(await demoZipBlob(), 'Beispielpaket_19389.zip')) }, 'Beispielpaket herunterladen')))),
    h('p', { class: 'start-note' }, `Prototyp ${APP_VERSION} zur Masterarbeit „E-Geo-Government in der österreichischen Katastervermessung“, TU Graz. Daten bleiben ausschließlich auf diesem Gerät.`))));
  app.list = (await DB.all()).map(migrate).sort((a, b) => b.updated - a.updated);
  if (!app.list.length) {
    list.replaceWith(h('div', { class: 'empty' }, 'Noch keine Verhandlung am Gerät. Importiere ein Verhandlungspaket oder lege die Demo-Verhandlung an.'));
    return;
  }
  for (const v of app.list) {
    const s = STATUS[v.status], pr = progress(v);
    list.append(h('button', { class: 'gz-item', type: 'button', onclick: () => openGz(v.id) },
      h('span', { class: 'gz-badge' }, icon('folder')),
      h('span', {}, h('span', { class: 'gz' }, `GZ ${v.gz}`), h('br'),
        h('span', { class: 'meta' }, `${v.meta.kg || 'KG ?'}${v.meta.gemeinde ? ' · ' + v.meta.gemeinde : ''} · ${deDate(v.meta.datum)} · ${owners(v).length} Eigentümer · ${pr.done}/${pr.total} Schritte`)),
      h('span', { class: 'pill ' + s.cls }, s.label)));
  }
};
async function openGz(id) {
  app.cur = migrate(await DB.get(id));
  app.editing = null; app.pending = null;
  setView('uebersicht');
}

/* ---------- Übersicht ---------- */
VIEWS.uebersicht = page => {
  const v = app.cur, s = STATUS[v.status], ow = owners(v);
  const anw = v.beteiligte.filter(b => b.anwesend).length;
  const zu = ow.filter(b => b.zustimmung.art !== 'offen').length;
  const nextStep = STEPS.slice(1).find(st => !stepDone(st.k)) || STEPS[STEPS.length - 1];
  const img = h('img', { alt: 'Vorschau der Begehungsskizze' });
  if (v.skizze.pdf) thumbnail(sketchKey(v), v.skizze.pdf, 720, v.skizze).then(u => { img.src = u; }).catch(() => {});
  const start = !v.meta.eroeffnung
    ? h('button', { class: 'btn primary big', type: 'button', onclick: () => {
      v.meta.eroeffnung = nowTime(); if (v.status === 'vorbereitet') v.status = 'laufend';
      logEvent(`Verhandlung eröffnet um ${v.meta.eroeffnung} Uhr`); touch(true); setView('eroeffnung');
    } }, icon('clock'), 'Verhandlung jetzt eröffnen')
    : h('button', { class: 'btn primary big', type: 'button', onclick: () => setView(nextStep.k) }, `Weiter: ${nextStep.t}`);
  const tile = (k, label, num, total, sub) => h('button', { type: 'button', class: 'card tile' + (total && num >= total ? ' ok' : ''), onclick: () => setView(k) },
    h('span', { class: 'top' }, h('span', {}, label), icon(k)),
    h('span', { class: 'num' }, String(num), total !== null ? h('small', {}, ` / ${total}`) : null),
    h('span', { class: 'muted' }, sub));
  put(page, 
    h('div', { class: 'card hero' },
      h('div', { class: 'info' },
        h('span', { class: 'eyebrow' }, 'Grenzverhandlung'),
        h('div', { class: 'row' }, h('span', { class: 'gzbig' }, `GZ ${v.gz}`), h('span', { class: 'pill ' + s.cls }, s.label)),
        v.meta.gegenstand ? h('p', { style: 'font-weight:600' }, v.meta.gegenstand) : null,
        h('dl', {},
          h('dt', {}, 'Katastralgemeinde'), h('dd', {}, v.meta.kg || '–'),
          v.meta.gemeinde ? [h('dt', {}, 'Gemeinde'), h('dd', {}, v.meta.gemeinde)] : null,
          h('dt', {}, 'Vermessungsamt'), h('dd', {}, v.meta.vermessungsamt || '–'),
          h('dt', {}, 'Ort'), h('dd', {}, v.meta.ort || '–'),
          h('dt', {}, 'Datum'), h('dd', {}, deDate(v.meta.datum) + (v.meta.eroeffnung ? `, eröffnet ${v.meta.eroeffnung} Uhr` : '')),
          h('dt', {}, 'Verhandlungsleiter'), h('dd', {}, v.meta.leiter || '–')),
        h('div', { class: 'row' }, start)),
      h('div', { class: 'preview', role: 'button', tabindex: '0', 'aria-label': 'Begehungsskizze öffnen', onclick: () => setView('skizze') },
        v.skizze.pdf ? img : h('span', { class: 'muted' }, 'keine Skizze im Paket'),
        h('span', { class: 'cap pill' }, 'Begehungsskizze'))),
    h('div', { class: 'grid4' },
      tile('eroeffnung', 'Anwesend', anw, v.beteiligte.length, 'Personen im Verzeichnis'),
      tile('behelfe', 'Behelfe vorgehalten', v.behelfe.filter(b => b.vorgehalten).length, v.behelfe.length, 'GFN-Pläne'),
      tile('skizze', 'Ergänzungen in der Skizze', inkCount(v.skizze), null, `${v.skizze.symbols.length} Grenzzeichen, ${v.skizze.texts.length} Texte`),
      tile('zustimmung', 'Zustimmungen', zu, ow.length, 'Eigentümer')),
    h('div', { class: 'card' },
      h('div', { class: 'card-head' }, h('h2', {}, 'Verlauf'), h('span', { class: 'muted' }, `${v.log.length} Einträge`)),
      h('ol', { class: 'timeline' }, v.log.slice().reverse().slice(0, 6).map(e =>
        h('li', {}, h('time', {}, new Date(e.zeit).toDateString() === new Date().toDateString() ? timeOf(e.zeit) : deDate(new Date(e.zeit).toISOString().slice(0, 10))), h('span', {}, e.text))))));
};

/* ---------- 1 Eröffnung und Beteiligte ---------- */
function personCard(b) {
  const v = app.cur, L = isLocked();
  let card;
  const re = () => { touch(); const n = personCard(b); card.replaceWith(n); card = n; };
  const isOwner = b.rolle === 'Eigentümer';
  const z = ZUST[b.zustimmung.art];
  const editing = app.editing === b.id;
  card = h('div', { class: 'card person' + (b.anwesend ? '' : ' absent') },
    h('div', { class: 'who' },
      h('span', { class: 'avatar' + (isOwner ? '' : ' rep'), 'aria-hidden': 'true' }, initials(b.name)),
      h('div', { style: 'min-width:0;flex:1' },
        h('div', { class: 'name' }, b.name || 'ohne Namen'),
        h('div', { class: 'sub' }, [b.rolle === 'Vertreter' && b.vertritt ? `Vertreter für ${b.vertritt}` : b.rolle,
          b.ez && `EZ ${b.ez}`, b.gst && `Gst. ${b.gst}`].filter(Boolean).join(' · ')),
        h('div', { class: 'sub' }, b.anschrift)),
      isOwner && b.zustimmung.art !== 'offen' ? h('span', { class: 'pill ' + z.cls }, z.label) : null),
    h('div', { class: 'controls' },
      sw('anwesend', b.anwesend, val => { b.anwesend = val; logEvent(`${b.name || 'Person'} ${val ? 'anwesend' : 'nicht anwesend'}`); re(); }, L),
      h('span', { class: 'row', style: 'gap:6px' }, h('span', { class: 'lbl' }, 'Identität'),
        seg(IDNACHWEIS, b.idnachweis, val => { b.idnachweis = val; re(); }, L || !b.anwesend, 'Identitätsnachweis')),
      b.rolle === 'Vertreter' ? h('span', { class: 'row', style: 'gap:6px' }, h('span', { class: 'lbl' }, 'Vollmacht'),
        seg(VOLLMACHT, b.vollmacht, val => { b.vollmacht = val; re(); }, L, 'Vollmacht')) : null,
      h('span', { style: 'flex:1' }),
      h('button', { class: 'btn small ghost', type: 'button', disabled: L, 'aria-expanded': String(editing), onclick: () => { app.editing = editing ? null : b.id; re(); } }, icon('pen'), editing ? 'Fertig' : 'Bearbeiten')),
    editing ? h('div', { class: 'stack' },
      h('div', { class: 'edit' },
        field('Name', b.name, val => { b.name = val; touch(); }),
        field('Anschrift', b.anschrift, val => { b.anschrift = val; touch(); }),
        field('EZ', b.ez, val => { b.ez = val; touch(); }),
        field('Gst.Nr.', b.gst, val => { b.gst = val; touch(); }),
        h('div', { class: 'field' }, h('label', {}, 'Rolle'),
          h('select', { onchange: e => { b.rolle = e.target.value; re(); } }, ROLLEN.map(r => h('option', { value: r, selected: r === b.rolle ? 'selected' : null }, r)))),
        b.rolle === 'Vertreter'
          ? field('vertritt', b.vertritt, val => { b.vertritt = val; touch(); })
          : field('Anmerkung', b.anmerkung, val => { b.anmerkung = val; touch(); })),
      h('div', { class: 'row' },
        h('button', { class: 'btn primary small', type: 'button', onclick: () => { app.editing = null; re(); } }, 'Übernehmen'),
        confirmButton('Person entfernen', 'Wirklich entfernen?', false, async () => {
          v.beteiligte = v.beteiligte.filter(x => x !== b); app.editing = null; touch(); rerender();
        }, 'danger small'))) : null);
  return card;
}
/* GFN-Behelfe bei der Eröffnung abhaken; angehakte stehen namentlich im Protokoll (Seite 1) */
function behelfeVorhalten() {
  const v = app.cur, L = isLocked();
  const n = v.behelfe.filter(b => b.vorgehalten).length;
  return h('div', { class: 'card' },
    h('div', { class: 'card-head' },
      h('div', {}, h('h2', {}, 'Behelfe vorhalten (GFN)'), h('p', { class: 'muted' }, 'Angehakte Behelfe stehen mit Planverfasser und Geschäftszahl im Protokoll.')),
      h('span', { class: 'pill ' + (n ? 'good' : '') }, `${n} von ${v.behelfe.length} vorgehalten`)),
    v.behelfe.length ? h('ul', { class: 'gfn-list' }, v.behelfe.map(b => h('li', {},
      h('label', { class: 'check' },
        h('input', { type: 'checkbox', checked: b.vorgehalten, disabled: L, onchange: e => {
          b.vorgehalten = e.target.checked; logEvent(`Behelf ${b.gz} ${b.vorgehalten ? 'vorgehalten' : 'nicht vorgehalten'}`); touch(); rerender();
        } }),
        h('span', {}, h('strong', { class: 'mono' }, b.gz || 'ohne GZ'), h('span', { class: 'muted' }, ` · ${b.planverfasser || 'Planverfasser unbekannt'}${b.anmerkung ? ' · ' + b.anmerkung : ''}`))),
      h('button', { class: 'btn small', type: 'button', onclick: () => Viewer.open({ blob: b.pdf, title: `Behelf ${b.gz} · ${b.planverfasser}` }) }, icon('zoom'), 'Ansehen'))))
      : h('p', { class: 'muted' }, 'Keine Behelfe im Verhandlungspaket. Im Schritt „Behelfe“ lässt sich ein PDF ergänzen.'));
}
VIEWS.eroeffnung = page => {
  const v = app.cur, L = isLocked();
  const m = v.meta;
  const timeInput = h('input', { id: 'f-eroeffnung', type: 'time', value: m.eroeffnung, disabled: L, oninput: e => { m.eroeffnung = e.target.value; touch(); } });
  const ow = owners(v);
  put(page, 
    lockedBanner(),
    pageHead('Eröffnung und Beteiligte', 'Kopfdaten prüfen, Verhandlung eröffnen, Anwesenheit und Identität der Personen festhalten. Das ergibt Seite 1 des Protokolls.'),
    h('div', { class: 'card' },
      h('div', { class: 'card-head' }, h('h2', {}, 'Kopfdaten'), h('span', { class: 'muted' }, 'aus dem Verhandlungspaket')),
      h('div', { class: 'form-grid' },
        field('Geschäftszahl', v.gz, () => {}, { disabled: true }),
        field('Vermessungsamt', m.vermessungsamt, val => { m.vermessungsamt = val; touch(); }, { disabled: L }),
        field('Katastralgemeinde', m.kg, val => { m.kg = val; touch(); }, { disabled: L }),
        field('Ort der Verhandlung', m.ort, val => { m.ort = val; touch(); }, { disabled: L }),
        field('Datum', m.datum, val => { m.datum = val; touch(); }, { type: 'date', disabled: L }),
        h('div', { class: 'field' }, h('label', { for: 'f-eroeffnung' }, 'Eröffnung (Uhrzeit)'),
          h('div', { class: 'inline-time' }, timeInput,
            h('button', { class: 'btn', type: 'button', disabled: L, onclick: () => {
              m.eroeffnung = nowTime(); timeInput.value = m.eroeffnung;
              if (v.status === 'vorbereitet') { v.status = 'laufend'; logEvent(`Verhandlung eröffnet um ${m.eroeffnung} Uhr`); }
              touch(true);
            } }, 'Jetzt'))),
        field('Verhandlungsleiter', m.leiter, val => { m.leiter = val; touch(); }, { disabled: L }))),
    behelfeVorhalten(),
    h('div', { class: 'page-head' },
      h('div', {}, h('h2', {}, 'Eigentümer, Vertreter und anwesende Personen'),
        h('p', { class: 'lead' }, `${v.beteiligte.filter(b => b.anwesend).length} von ${v.beteiligte.length} anwesend · ${ow.length} Eigentümer. Identität: P persönlich bekannt, A allgemein bekannt, L Lichtbildausweis.`)),
      h('button', { class: 'btn', type: 'button', disabled: L, onclick: () => {
        const b = newPerson({ rolle: 'Anwesend (sonstige)' }); b.anwesend = true; v.beteiligte.push(b); app.editing = b.id; touch(); rerender();
      } }, icon('plus'), 'Person hinzufügen')),
    h('div', { class: 'grid2' }, v.beteiligte.map(personCard)));
};

/* ---------- 2 Behelfe ---------- */
VIEWS.behelfe = page => {
  const v = app.cur, L = isLocked();
  const addInput = h('input', { type: 'file', accept: 'application/pdf', hidden: true, onchange: async e => {
    const f = e.target.files[0]; if (!f) return;
    v.behelfe.push({ id: uid(), planverfasser: '', gz: f.name.replace(/\.pdf$/i, ''), anmerkung: 'vor Ort ergänzt', vorgehalten: false, pdf: f });
    logEvent(`Behelf ${f.name} ergänzt`); touch(true); rerender();
  } });
  const cards = v.behelfe.map(b => {
    const img = h('img', { alt: '' });
    thumbnail('b-' + b.id, b.pdf, 480).then(u => { img.src = u; }).catch(() => {});
    const open = () => Viewer.open({ blob: b.pdf, title: `Behelf ${b.gz} · ${b.planverfasser}` });
    return h('div', { class: 'card doc-card' },
      h('div', { class: 'thumbwrap', role: 'button', tabindex: '0', 'aria-label': `Behelf ${b.gz} öffnen`, onclick: open, onkeydown: e => { if (e.key === 'Enter') open(); } },
        img, h('span', { class: 'open btn small dark' }, icon('zoom'), 'Öffnen')),
      h('div', { class: 'body' },
        h('span', { class: 'gfn' }, b.gz || 'ohne Geschäftszahl'),
        h('span', {}, b.planverfasser || 'Planverfasser unbekannt'),
        h('span', { class: 'muted' }, b.anmerkung),
        sw('den Eigentümern vorgehalten', b.vorgehalten, val => { b.vorgehalten = val; if (val) logEvent(`Behelf ${b.gz} vorgehalten`); touch(); rerender(); }, L)));
  });
  put(page, 
    lockedBanner(),
    pageHead('Behelfe', 'Pläne zu den Geschäftsfallnummern (GFN), die den Eigentümern vorgehalten werden. Antippen öffnet den Plan, zwei Finger zoomen.'),
    h('div', { class: 'grid3' }, cards,
      L ? null : h('button', { class: 'card doc-card add', type: 'button', onclick: () => addInput.click() }, icon('plus'), 'Behelf hinzufügen (PDF)')),
    addInput);
};

/* ---------- 3 Begehungsskizze ---------- */
function openSketch() {
  const v = app.cur;
  Viewer.open({ blob: v.skizze.pdf, title: `Begehungsskizze · GZ ${v.gz}`, ink: v.skizze, editable: !isLocked(), onChange: () => touch(), onClose: () => rerender() });
}
VIEWS.skizze = page => {
  const v = app.cur, L = isLocked();
  const up = h('input', { type: 'file', accept: 'application/pdf', hidden: true, onchange: async e => {
    const f = e.target.files[0]; if (!f) return;
    v.skizze = { pdf: f, strokes: [], texts: [], symbols: [], rev: (v.skizze.rev || 0) + 1 };
    logEvent(`Begehungsskizze ersetzt (${f.name})`); touch(true); rerender();
  } });
  if (!v.skizze.pdf) {
    put(page, pageHead('Begehungsskizze'), h('div', { class: 'card stack' }, h('p', {}, 'Im Verhandlungspaket ist keine Begehungsskizze.'),
      h('div', {}, h('button', { class: 'btn primary', type: 'button', onclick: () => up.click() }, 'Skizze laden (PDF)'), up)));
    return;
  }
  const img = h('img', { alt: 'Vorschau der Begehungsskizze mit Ergänzungen' });
  thumbnail(sketchKey(v), v.skizze.pdf, 1100, v.skizze).then(u => { img.src = u; }).catch(() => {});
  put(page, 
    lockedBanner(),
    pageHead('Begehungsskizze', 'Direkt auf dem Plan zeichnen, Grenzzeichen setzen und beschriften. Die Ergänzungen kommen als Beilage ins Protokoll.',
      h('button', { class: 'btn primary big', type: 'button', onclick: openSketch }, icon('pen'), L ? 'Skizze ansehen' : 'Skizze öffnen und zeichnen')),
    h('div', { class: 'sketch-preview', role: 'button', tabindex: '0', 'aria-label': 'Skizze öffnen', onclick: openSketch }, img),
    h('div', { class: 'grid2' },
      h('div', { class: 'card stack' },
        h('h2', {}, 'Erfasst'),
        h('table', { class: 'kv' }, h('tbody', {},
          h('tr', {}, h('th', {}, 'Striche'), h('td', {}, String(v.skizze.strokes.length))),
          h('tr', {}, h('th', {}, 'Grenzzeichen'), h('td', {}, v.skizze.symbols.length ? Object.entries(v.skizze.symbols.reduce((a, s) => (a[s.code] = (a[s.code] || 0) + 1, a), {})).map(([c, n]) => `${n}× ${c}`).join(', ') : '0')),
          h('tr', {}, h('th', {}, 'Texte'), h('td', {}, String(v.skizze.texts.length))))),
        L ? null : h('div', {}, h('button', { class: 'btn small', type: 'button', onclick: () => up.click() }, 'Andere Skizze laden'), up)),
      h('div', { class: 'card stack' },
        h('h2', {}, 'So geht’s'),
        h('ul', { class: 'stack', style: 'gap:6px;margin:0;padding-left:18px' },
          h('li', {}, 'Stift zeichnet, Finger verschiebt und zoomt. Die Hand darf aufliegen.'),
          h('li', {}, 'Grenzzeichen: Werkzeug wählen, Art wählen (z. B. MM), auf den Punkt tippen.'),
          h('li', {}, 'Rot für Neues, Schwarz für Bestand. Rückgängig nimmt den letzten Schritt zurück.')),
        h('div', { class: 'legend' }, Object.entries(SYMBOLE).map(([c, t]) => h('span', {}, `${c} ${t}`))))));
};

/* ---------- 4 Grenzverlauf ---------- */
const TB = [
  'Alte Grenzpunkte wurden aufgrund oben genannter GFN (VHW´s) überprüft bzw. rückgesetzt und einvernehmlich anerkannt.',
  'Die neuen Grenzpunkte wurden ebenfalls einvernehmlich festgelegt und in der Natur vermarkt.',
  'Die Grenze verläuft entlang der Mauerflucht (Außenkante).',
  'Die Grenze verläuft in Zaunmitte.',
  'Die Grenze verläuft entlang der Gartenmauer, Mauer gehört zu Gst. …',
];
VIEWS.beschreibung = page => {
  const v = app.cur, L = isLocked();
  const ta = h('textarea', { id: 'f-beschr', disabled: L, placeholder: 'z. B. Die Grenze zwischen .626 und .627 verläuft von GP 4321 bis GP 4325 in Zaunmitte.', oninput: e => { v.beschreibung.text = e.target.value; touch(); } });
  ta.value = v.beschreibung.text;
  const ta2 = h('textarea', { id: 'f-strittig', disabled: L, style: 'min-height:90px', placeholder: 'leer lassen, wenn alle Abschnitte einvernehmlich festgelegt wurden', oninput: e => { v.beschreibung.strittig = e.target.value; touch(); } });
  ta2.value = v.beschreibung.strittig;
  put(page, 
    lockedBanner(),
    pageHead('Beschreibung des Grenzverlaufs', 'Der feste Text der Vorlage (Festlegung nach § 845 ABGB, Zeichenschlüssel der VermV) steht automatisch im Protokoll. Hier kommt dazu, was diese Verhandlung betrifft. Das ergibt Seite 2.'),
    h('div', { class: 'card stack' },
      h('div', { class: 'field' }, h('label', { for: 'f-beschr' }, 'Ergänzende Beschreibung'), ta),
      h('div', { class: 'stack', style: 'gap:8px' }, h('span', { class: 'lbl' }, 'Textbausteine antippen zum Einfügen'),
        h('div', { class: 'row' }, TB.map(t => h('button', { class: 'btn small', type: 'button', disabled: L, title: t, onclick: () => {
          if ((v.beschreibung.text || '').includes(t)) { toast('Dieser Textbaustein steht schon in der Beschreibung.'); return; }
          v.beschreibung.text = (v.beschreibung.text ? v.beschreibung.text.trimEnd() + '\n' : '') + t; ta.value = v.beschreibung.text; touch();
        } }, icon('plus'), t.length > 44 ? t.slice(0, 42) + '…' : t))))),
    h('div', { class: 'card stack' },
      h('div', { class: 'field' }, h('label', { for: 'f-strittig' }, 'Nicht einvernehmlich festgelegte Grenzabschnitte'), ta2),
      notice('info', 'info', h('span', {}, 'Strittige Abschnitte werden im Protokoll gesondert angeführt. Die übrigen Grenzen können trotzdem festgelegt werden.'))));
};

/* ---------- 5 Prüfen und sperren ---------- */
function pflichtpruefung(v) {
  const anw = v.beteiligte.filter(b => b.anwesend);
  return [
    ['Kopfdaten vollständig (Vermessungsamt, KG, Ort, Datum)', !!(v.meta.vermessungsamt && v.meta.kg && v.meta.ort && v.meta.datum), 'eroeffnung'],
    ['Eröffnungszeit erfasst', !!v.meta.eroeffnung, 'eroeffnung'],
    ['Verhandlungsleiter eingetragen', !!v.meta.leiter, 'eroeffnung'],
    ['Mindestens eine anwesende Person', anw.length > 0, 'eroeffnung'],
    ['Identitätsnachweis bei allen Anwesenden', anw.length > 0 && anw.every(b => b.idnachweis), 'eroeffnung'],
    ['Vollmacht bei allen anwesenden Vertretern', anw.filter(b => b.rolle === 'Vertreter').every(b => b.vollmacht), 'eroeffnung'],
    ['Eigentümer im Verzeichnis', owners(v).length > 0, 'eroeffnung'],
    ['Mindestens ein Behelf vorgehalten', v.behelfe.some(b => b.vorgehalten), 'behelfe'],
    ['Begehungsskizze vorhanden', !!v.skizze.pdf, 'skizze'],
    ['Beschreibung des Grenzverlaufs ausgefüllt', !!(v.beschreibung.text || '').trim(), 'beschreibung'],
    ['Schluss der Verhandlung (Uhrzeit) erfasst', !!v.meta.schluss, 'abschluss'],
  ];
}
async function previewProtocol(btn, opts) {
  btn.disabled = true;
  try { const pdf = await buildProtocol(app.cur, opts); Viewer.open({ blob: new Blob([pdf], { type: 'application/pdf' }), title: 'Vorschau Protokoll (nicht gesperrt)' }); }
  catch (err) { toast('Vorschau fehlgeschlagen: ' + err.message); }
  btn.disabled = false;
}
VIEWS.abschluss = page => {
  const v = app.cur, L = isLocked();
  put(page, pageHead('Prüfen und sperren', 'Vor dem Signieren wird das Protokoll gesperrt. Alle Eigentümer zeichnen dann denselben, unveränderlichen Inhalt.'));
  if (L) {
    put(page, h('div', { class: 'card stack' },
      notice('good', 'check', h('strong', {}, `Version ${v.version} gesperrt am ${deDateTime(v.locked.zeit)}`),
        h('span', {}, 'Jede Änderung am Inhalt würde die Prüfsumme ändern.')),
      h('div', {}, h('span', { class: 'lbl' }, 'Prüfsumme SHA-256 des gesperrten Protokolls'), h('p', { class: 'hash' }, v.locked.hash)),
      h('div', { class: 'row' },
        h('button', { class: 'btn', type: 'button', onclick: () => Viewer.open({ blob: v.locked.pdf, title: `Protokoll Version ${v.version} (gesperrt)` }) }, icon('pdf'), 'Gesperrtes Protokoll ansehen'),
        confirmButton('Neue Version anlegen', 'Bisherige Signaturen am Gesamtprotokoll verfallen. Entsperren?', false, async () => {
          v.version += 1; v.locked = null; v.signed = null; v.status = 'laufend';
          v.beteiligte.forEach(b => { b.zustimmung = { art: 'offen', zeit: null }; });
          logEvent(`Neue Version ${v.version} angelegt, Signaturen am Gesamtprotokoll zurückgesetzt`);
          await touch(true); rerender();
        }, 'danger'))));
    return;
  }
  const checks = pflichtpruefung(v);
  const ok = checks.filter(c => c[1]).length, allOk = ok === checks.length;
  const schluss = h('input', { id: 'f-schluss', type: 'time', value: v.meta.schluss, oninput: e => { v.meta.schluss = e.target.value; touch(); } });
  put(page, 
    h('div', { class: 'card stack' },
      h('div', { class: 'field', style: 'max-width:340px' }, h('label', { for: 'f-schluss' }, 'Schluss der Verhandlung (Uhrzeit)'),
        h('div', { class: 'inline-time' }, schluss,
          h('button', { class: 'btn', type: 'button', onclick: () => { v.meta.schluss = nowTime(); logEvent(`Verhandlung geschlossen um ${v.meta.schluss} Uhr`); touch(true); rerender(); } }, 'Jetzt')))),
    h('div', { class: 'card' },
      h('div', { class: 'card-head' }, h('h2', {}, 'Pflichtangaben nach § 13 VermV 2016'),
        h('span', { class: 'pill ' + (allOk ? 'good' : 'warn') }, `${ok} von ${checks.length} erfüllt`)),
      h('ul', { class: 'checklist' }, checks.map(([t, good, k]) => h('li', { class: good ? 'ok' : 'bad' },
        h('span', { class: 'mark' }, good ? '✓' : '!'), h('span', {}, t),
        !good && k !== 'abschluss' ? h('button', { class: 'btn small', type: 'button', onclick: () => setView(k) }, 'Beheben') : null)))),
    h('div', { class: 'row' },
      h('button', { class: 'btn', type: 'button', onclick: e => previewProtocol(e.currentTarget) }, icon('pdf'), 'Vorschau des Protokolls'),
      confirmButton(allOk ? 'Abschließen und sperren' : 'Erst alle Pflichtangaben erfüllen', 'Jetzt sperren? Danach ist der Inhalt fix.', !allOk, async () => {
        const bytes = await buildProtocol(v);
        const hash = await sha256Hex(bytes);
        v.locked = { pdf: new Blob([bytes], { type: 'application/pdf' }), hash, zeit: Date.now() };
        v.signed = null;
        updateStatus();
        logEvent(`Protokoll Version ${v.version} gesperrt, SHA-256 ${hash.slice(0, 16)}…`);
        await touch(true);
        toast('Protokoll gesperrt');
        setView('zustimmung');
      })));
};

/* ---------- 6 Zustimmung ---------- */
function currentPdf() { const v = app.cur; return v.signed ? v.signed.pdf : v.locked.pdf; }
function pdfFileName(v, suffix) { return `Protokoll_${safeName(v.gz)}_V${v.version}_${suffix}.pdf`; }
const personById = id => app.cur.beteiligte.find(x => x.id === id);
const hasStift = v => owners(v).some(b => b.zustimmung.art === 'stift' && b.zustimmung.png);
function updateStatus() {
  const v = app.cur;
  if (!v.locked) return;
  const ow = owners(v);
  v.status = ow.length && ow.every(b => b.zustimmung.art !== 'offen') ? 'abgeschlossen' : 'gesperrt';
}
function countSignatures(bytes) {
  const s = new TextDecoder('latin1').decode(bytes);
  return (s.match(/\/ByteRange\s*\[/g) || []).length;
}
function startQes(pending) {
  app.pending = pending;
  download(currentPdf(), pdfFileName(app.cur, 'zur_Signatur'));
  rerender();
  setTimeout(() => $('#qes-panel')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60);
}
async function acceptSignedPdf(file) {
  const v = app.cur, pd = app.pending;
  if (!pd) return;
  const bytes = await blobBytes(file);
  if (new TextDecoder('latin1').decode(bytes.slice(0, 5)) !== '%PDF-') throw new Error('Die Datei ist kein PDF.');
  const b = personById(pd.bid);
  const prev = await blobBytes(currentPdf());
  const sigs = countSignatures(bytes), prevSigs = countSignatures(prev);
  if (sigs <= prevSigs) throw new Error('Im PDF ist keine neue Signatur. Bitte das signierte PDF aus dem Signaturdienst wählen.');
  // PAdES hängt Signaturen inkrementell an: das bisherige PDF bleibt Byte für Byte am Anfang erhalten.
  let unchanged = bytes.length > prev.length;
  for (let i = 0; unchanged && i < prev.length; i++) if (bytes[i] !== prev[i]) unchanged = false;
  v.signed = { pdf: new Blob([bytes], { type: 'application/pdf' }), zeit: Date.now(), sigCount: sigs, inkrementell: unchanged };
  b.zustimmung = { art: 'qes', zeit: Date.now() };
  logEvent(`${b.name}: QES übernommen (${sigs} Signatur(en) im PDF, ${unchanged ? 'Inhalt unverändert angehängt' : 'Datei neu geschrieben, Inhalt bitte prüfen'})`);
  app.pending = null;
  updateStatus();
  await touch(true);
  toast(unchanged ? 'Signatur übernommen, gesperrter Inhalt unverändert' : 'Signatur übernommen. Achtung: Datei wurde neu geschrieben.');
  rerender();
}
function qesPanel() {
  const v = app.cur, pd = app.pending;
  if (!pd) return null;
  const b = personById(pd.bid);
  if (!b) return null;
  return h('div', { class: 'card panel stack', id: 'qes-panel' },
    h('div', { class: 'card-head', style: 'margin:0' }, h('h2', {}, `Signatur von ${b.name}`), h('span', { class: 'pill brand' }, 'läuft')),
    h('ol', { class: 'steps-visual' },
      h('li', {}, h('strong', {}, 'PDF ist gespeichert'), h('span', { class: 'muted' }, 'Liegt in den Downloads des Tablets.'),
        h('button', { class: 'btn small', type: 'button', onclick: () => download(currentPdf(), pdfFileName(v, 'zur_Signatur')) }, 'Nochmals speichern')),
      h('li', {}, h('strong', {}, 'Signieren mit ID Austria'), h('span', { class: 'muted' }, 'Im Signaturdienst das PDF wählen. Die Person bestätigt am eigenen Smartphone.'),
        h('a', { class: 'btn small', href: EGIZ_URL, target: '_blank', rel: 'noopener' }, 'Signaturdienst öffnen')),
      h('li', {}, h('strong', {}, 'Signiertes PDF zurückholen'), h('span', { class: 'muted' }, 'Die App prüft, ob der Inhalt unverändert ist.'),
        h('button', { class: 'btn small primary', type: 'button', onclick: () => $('#file-signed').click() }, 'Signiertes PDF wählen'))),
    h('div', {}, h('button', { class: 'btn ghost small', type: 'button', onclick: () => { app.pending = null; rerender(); } }, 'Abbrechen')));
}

/* Unterschriftenfeld für den Stift (nur Information, keine Schriftform iSd § 886 ABGB) */
function signaturePad(b) {
  return new Promise(resolve => {
    const cv = h('canvas', { class: 'sigpad-canvas', 'aria-label': 'Unterschriftenfeld' });
    let strokes = [], cur = null, penSeen = false;
    const ctx = () => cv.getContext('2d');
    const size = () => {
      const r = cv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
      cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr); redraw();
    };
    const redraw = () => {
      const c = ctx(), k = cv.width;
      c.clearRect(0, 0, cv.width, cv.height);
      c.strokeStyle = '#0b2a6b'; c.lineCap = 'round'; c.lineJoin = 'round';
      for (const s of strokes) {
        c.lineWidth = Math.max(2, k * 0.0035);
        c.beginPath(); s.forEach(([x, y], i) => i ? c.lineTo(x * k, y * k) : c.moveTo(x * k, y * k));
        if (s.length === 1) c.lineTo(s[0][0] * k + 0.5, s[0][1] * k);
        c.stroke();
      }
      ok.disabled = !strokes.length;
    };
    const pt = e => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.width]; };
    cv.addEventListener('pointerdown', e => {
      if (e.pointerType === 'pen') penSeen = true;
      if (e.pointerType === 'touch' && penSeen) return; // Handballen ignorieren
      e.preventDefault(); cv.setPointerCapture(e.pointerId); cur = { id: e.pointerId, pts: [pt(e)] }; strokes.push(cur.pts); redraw();
    });
    cv.addEventListener('pointermove', e => {
      if (!cur || cur.id !== e.pointerId) return; e.preventDefault();
      for (const ev of e.getCoalescedEvents ? e.getCoalescedEvents() : [e]) cur.pts.push(pt(ev));
      redraw();
    });
    const end = e => { if (cur && cur.id === e.pointerId) cur = null; };
    cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
    const close = val => { overlay.remove(); window.removeEventListener('resize', size); document.body.style.overflow = ''; resolve(val); };
    const ok = h('button', { class: 'btn primary big', type: 'button', disabled: true, onclick: () => {
      // Zuschneiden auf die Unterschrift, transparent, dunkelblau
      const xs = strokes.flat().map(p => p[0]), ys = strokes.flat().map(p => p[1]);
      const pad = 0.02, W = 900;
      const x0 = Math.max(0, Math.min(...xs) - pad), x1 = Math.min(1, Math.max(...xs) + pad);
      const y0 = Math.max(0, Math.min(...ys) - pad), y1 = Math.max(...ys) + pad;
      const sc = W / Math.max(0.05, x1 - x0);
      const out = document.createElement('canvas'); out.width = W; out.height = Math.max(40, Math.round((y1 - y0) * sc));
      const c = out.getContext('2d'); c.strokeStyle = '#0b2a6b'; c.lineCap = 'round'; c.lineJoin = 'round'; c.lineWidth = Math.max(3, W * 0.006);
      for (const s of strokes) { c.beginPath(); s.forEach(([x, y], i) => i ? c.lineTo((x - x0) * sc, (y - y0) * sc) : c.moveTo((x - x0) * sc, (y - y0) * sc)); if (s.length === 1) c.lineTo((s[0][0] - x0) * sc + 1, (s[0][1] - y0) * sc); c.stroke(); }
      out.toBlob(blob => close(blob), 'image/png');
    } }, 'Unterschrift übernehmen');
    const overlay = h('div', { class: 'sigpad', role: 'dialog', 'aria-modal': 'true', 'aria-label': `Unterschrift ${b.name}` },
      h('div', { class: 'sigpad-box' },
        h('div', { class: 'sigpad-head' },
          h('div', {}, h('span', { class: 'eyebrow' }, 'Unterschrift mit dem Stift'), h('h2', {}, b.name)),
          h('button', { class: 'btn ghost', type: 'button', onclick: () => close(null) }, 'Abbrechen')),
        h('p', { class: 'muted' }, 'Hiermit stimme ich dem festgelegten und beschriebenen Grenzverlauf zu. Die Stift-Unterschrift wird ins Protokoll übernommen; sie dient nur der Information und ersetzt die qualifizierte Signatur (ID Austria) bzw. die Unterschrift auf Papier nicht.'),
        h('div', { class: 'sigpad-area' }, cv, h('span', { class: 'sigpad-line' }), h('span', { class: 'sigpad-x' }, '✕')),
        h('div', { class: 'row', style: 'justify-content:space-between' },
          h('button', { class: 'btn', type: 'button', onclick: () => { strokes = []; redraw(); } }, 'Löschen'),
          ok)));
    document.body.append(overlay); document.body.style.overflow = 'hidden';
    window.addEventListener('resize', size);
    requestAnimationFrame(size);
  });
}
async function stiftUnterschrift(b) {
  const png = await signaturePad(b);
  if (!png) return;
  b.zustimmung = { art: 'stift', zeit: Date.now(), png };
  thumbCache.delete('sig-' + b.id);
  logEvent(`${b.name}: Unterschrift mit dem Stift (nur Information)`);
  updateStatus(); await touch(true); rerender();
}
async function protocolWithSignatures(v) {
  return new Blob([await buildProtocol(v, { unterschriften: true })], { type: 'application/pdf' });
}

VIEWS.zustimmung = page => {
  const v = app.cur;
  put(page, pageHead('Zustimmung der Eigentümer', 'Jeder Eigentümer stimmt dem gesperrten Protokoll zu: mit qualifizierter elektronischer Signatur (ID Austria), eigenhändig auf Papier oder mit dem Stift am Tablet (nur Information).'));
  if (!v.locked) {
    put(page, notice('', 'warn', h('strong', {}, 'Das Protokoll ist noch nicht gesperrt.'),
      h('span', {}, 'Zustimmen können die Eigentümer erst nach dem Sperren, damit alle denselben Inhalt unterschreiben.'),
      h('div', {}, h('button', { class: 'btn small', type: 'button', onclick: () => setView('abschluss') }, 'Zu Prüfen und sperren'))));
    return;
  }
  const ow = owners(v);
  const done = ow.filter(b => b.zustimmung.art !== 'offen').length;
  put(page,
    h('div', { class: 'card stack' },
      h('div', { class: 'card-head', style: 'margin:0' }, h('h2', {}, 'Ablauf je Eigentümer mit ID Austria'),
        h('span', { class: 'pill ' + (done === ow.length ? 'good' : 'warn') }, `${done} von ${ow.length} erfasst`)),
      h('div', { class: 'bar' }, h('span', { style: `width:${ow.length ? Math.round(done / ow.length * 100) : 0}%` })),
      h('ol', { class: 'steps-visual' },
        h('li', {}, h('strong', {}, '„ID Austria“ antippen'), h('span', { class: 'muted' }, 'Das aktuelle Protokoll wird am Tablet gespeichert.')),
        h('li', {}, h('strong', {}, 'Im Signaturdienst signieren'), h('span', { class: 'muted' }, 'pdf.egiz.gv.at, Bestätigung am Smartphone der Person.')),
        h('li', {}, h('strong', {}, 'Signiertes PDF übernehmen'), h('span', { class: 'muted' }, 'Die nächste Person signiert dieses PDF weiter.'))),
      notice('info', 'info', h('span', {}, 'Die Unterschrift mit dem Stift wird in die Spalte „Unterschrift“ des Protokolls übernommen. Rechtlich gilt sie nur als Information (§ 886 ABGB, § 4 Abs. 1 SVG, Auskunft BEV).'))),
    qesPanel(),
    h('div', { class: 'stack' }, ow.map(b => {
      const z = ZUST[b.zustimmung.art];
      const mark = async art => { b.zustimmung = { art, zeit: Date.now() }; logEvent(`${b.name}: ${ZUST[art].label}`); updateStatus(); await touch(true); rerender(); };
      let sigImg = null;
      if (b.zustimmung.art === 'stift' && b.zustimmung.png) {
        sigImg = h('img', { class: 'sig-thumb', alt: `Unterschrift ${b.name}` });
        sigImg.src = URL.createObjectURL(b.zustimmung.png);
      }
      return h('div', { class: 'card owner' },
        h('div', { class: 'who', style: 'display:flex;gap:14px;align-items:center;min-width:0' },
          h('span', { class: 'avatar' }, initials(b.name)),
          h('div', { class: 'stack', style: 'gap:2px;min-width:0' },
            h('strong', {}, b.name || 'ohne Namen'),
            h('span', { class: 'muted' }, `EZ ${b.ez || '–'} · Gst. ${b.gst || '–'} · ${b.anwesend ? 'anwesend' : 'nicht anwesend'}`),
            h('span', {}, h('span', { class: 'pill ' + z.cls }, z.label), b.zustimmung.zeit ? h('span', { class: 'muted' }, '  ' + timeOf(b.zustimmung.zeit) + ' Uhr') : null),
            sigImg)),
        h('div', { class: 'actions' },
          b.zustimmung.art === 'offen' ? [
            h('button', { class: 'btn primary', type: 'button', disabled: !!app.pending, onclick: () => startQes({ bid: b.id }) }, 'ID Austria'),
            h('button', { class: 'btn', type: 'button', onclick: () => stiftUnterschrift(b) }, icon('pen'), 'Mit Stift'),
            h('button', { class: 'btn', type: 'button', onclick: () => mark('papier') }, 'Auf Papier'),
            h('button', { class: 'btn danger', type: 'button', onclick: () => mark('verweigert') }, 'Verweigert'),
          ] : h('button', { class: 'btn small ghost', type: 'button', onclick: () => mark('offen') }, 'Zurücksetzen')));
    })),
    h('div', { class: 'row' },
      h('button', { class: 'btn', type: 'button', onclick: () => download(currentPdf(), pdfFileName(v, 'zum_Ausdrucken')) }, icon('pdf'), 'Protokoll zum Ausdrucken speichern'),
      hasStift(v) ? h('button', { class: 'btn', type: 'button', onclick: async e => { const bt = e.currentTarget; bt.disabled = true; try { Viewer.open({ blob: await protocolWithSignatures(v), title: 'Protokoll mit Stift-Unterschriften (Information)' }); } catch (err) { toast(err.message); } bt.disabled = false; } }, icon('pdf'), 'Protokoll mit Stift-Unterschriften ansehen') : null));
};

/* ---------- 7 Export ---------- */
function exportJson(v) {
  return {
    app: 'Digitale Grenzverhandlung', version: APP_VERSION, gz: v.gz, meta: v.meta, protokollVersion: v.version,
    gesperrt: v.locked ? { zeit: new Date(v.locked.zeit).toISOString(), sha256: v.locked.hash } : null,
    beteiligte: v.beteiligte.map(({ id, ...b }) => ({ ...b, zustimmung: { art: b.zustimmung.art, zeit: b.zustimmung.zeit ? new Date(b.zustimmung.zeit).toISOString() : null, stiftUnterschrift: !!b.zustimmung.png } })),
    behelfe: v.behelfe.map(b => ({ planverfasser: b.planverfasser, geschaeftszahl: b.gz, anmerkung: b.anmerkung, vorgehalten: b.vorgehalten })),
    beschreibung: v.beschreibung,
    skizze: { striche: v.skizze.strokes.length, texte: v.skizze.texts.length, grenzzeichen: v.skizze.symbols.map(s => s.code) },
    verlauf: v.log.map(e => ({ zeit: new Date(e.zeit).toISOString(), text: e.text })),
  };
}
async function exportZip(v) {
  const zip = new JSZip();
  zip.file(pdfFileName(v, v.signed ? 'signiert' : 'gesperrt'), await currentPdf().arrayBuffer());
  if (hasStift(v)) zip.file(pdfFileName(v, 'mit_Stift-Unterschriften_Information'), await (await protocolWithSignatures(v)).arrayBuffer());
  zip.file(`Verhandlung_${safeName(v.gz)}_V${v.version}.json`, JSON.stringify(exportJson(v), null, 2));
  return zip.generateAsync({ type: 'blob' });
}
VIEWS.export = page => {
  const v = app.cur, ow = owners(v);
  const cnt = art => ow.filter(b => b.zustimmung.art === art).length;
  put(page, pageHead('Export für Beurkundung und BAIK-Archiv', 'In der Kanzlei werden Papier-Zustimmungen eingescannt, die Beurkundungssignatur angebracht und das Protokoll ins Archiv geladen.'));
  if (!v.locked) {
    put(page, notice('', 'warn', h('strong', {}, 'Noch nichts zu exportieren.'), h('span', {}, 'Das Protokoll ist noch nicht gesperrt.'),
      h('div', {}, h('button', { class: 'btn small', type: 'button', onclick: () => setView('abschluss') }, 'Zu Prüfen und sperren'))));
  } else {
    put(page, h('div', { class: 'card stack' },
      h('table', { class: 'kv' }, h('tbody', {},
        h('tr', {}, h('th', {}, 'Protokoll'), h('td', {}, `Version ${v.version}, gesperrt ${deDateTime(v.locked.zeit)}`)),
        h('tr', {}, h('th', {}, 'SHA-256'), h('td', { class: 'hash' }, v.locked.hash)),
        h('tr', {}, h('th', {}, 'Zustimmungen'), h('td', {}, `${cnt('qes')} QES · ${cnt('papier')} Papier · ${cnt('stift')} Stift (Information) · ${cnt('verweigert')} verweigert · ${cnt('offen')} offen`)),
        h('tr', {}, h('th', {}, 'Signaturen im PDF'), h('td', {}, v.signed ? String(v.signed.sigCount) : '0')))),
      cnt('offen') ? notice('', 'warn', h('span', {}, `${cnt('offen')} Zustimmung(en) sind noch offen.`)) : notice('good', 'check', h('span', {}, 'Alle Eigentümer sind erfasst.')),
      cnt('stift') ? notice('info', 'info', h('span', {}, `${cnt('stift')} Zustimmung(en) nur mit dem Stift: Für die Schriftform braucht es zusätzlich eine QES oder eine Unterschrift auf Papier.`)) : null,
      h('div', { class: 'row' },
        h('button', { class: 'btn primary big', type: 'button', onclick: async e => { const b = e.currentTarget; b.disabled = true; try { download(await exportZip(v), `Grenzverhandlung_${safeName(v.gz)}_V${v.version}.zip`); } catch (err) { toast(err.message); } b.disabled = false; } }, icon('export'), 'Alles für die Kanzlei (ZIP)'),
        h('button', { class: 'btn', type: 'button', onclick: () => download(currentPdf(), pdfFileName(v, v.signed ? 'signiert' : 'gesperrt')) }, icon('pdf'), v.signed ? 'Signiertes Protokoll' : 'Gesperrtes Protokoll'),
        hasStift(v) ? h('button', { class: 'btn', type: 'button', onclick: async e => { const b = e.currentTarget; b.disabled = true; try { download(await protocolWithSignatures(v), pdfFileName(v, 'mit_Stift-Unterschriften_Information')); } catch (err) { toast(err.message); } b.disabled = false; } }, icon('pen'), 'Protokoll mit Stift-Unterschriften') : null,
        h('button', { class: 'btn', type: 'button', onclick: () => download(new Blob([JSON.stringify(exportJson(v), null, 2)], { type: 'application/json' }), `Verhandlung_${safeName(v.gz)}_V${v.version}.json`) }, 'Verhandlungsdaten (JSON)'))));
  }
  put(page,
    h('div', { class: 'card' },
      h('div', { class: 'card-head' }, h('h2', {}, 'Verlauf')),
      h('ol', { class: 'timeline' }, v.log.slice().reverse().map(e => h('li', {}, h('time', {}, timeOf(e.zeit)), h('span', {}, e.text))))),
    h('div', { class: 'card stack' },
      h('h2', {}, 'Vom Gerät entfernen'),
      h('p', { class: 'muted' }, 'Nach dem Export und der Ablage in der Kanzlei die personenbezogenen Daten vom Tablet löschen.'),
      h('div', {}, confirmButton('Verhandlung löschen', 'Endgültig vom Gerät löschen?', false, async () => { await DB.del(v.id); app.cur = null; toast('Verhandlung gelöscht'); setView('start'); }, 'danger'))));
};
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


let logoBytes = null;
async function getLogoBytes() {
  if (logoBytes) return logoBytes;
  try { logoBytes = await blobBytes(await fetchBlob('assets/logo.png', 'image/png')); } catch (_) { logoBytes = null; }
  return logoBytes;
}

/* Protokoll nach der Vorlage der Kanzlei (3 Seiten A4, Skizze als Beilage).
 * opts.unterschriften: Stift-Unterschriften in die Spalte „Unterschrift“ übernehmen (nur Information). */
async function buildProtocol(v, opts = {}) {
  const { PDFDocument, StandardFonts, rgb, LineCapStyle } = PDFLib;
  const doc = await PDFDocument.create();
  doc.setTitle(`Protokoll Grenzverhandlung ${v.gz}`);
  doc.setSubject('Protokoll über die Festlegung des Grenzverlaufs gemäß § 43 Abs. 6 VermG und § 52 Z 5 VermG');
  doc.setProducer(`Digitale Grenzverhandlung ${APP_VERSION} (Prototyp)`);
  doc.setCreator('ADP Rinner – Digitale Grenzverhandlung');
  const F = await doc.embedFont(StandardFonts.Helvetica);
  const FB = await doc.embedFont(StandardFonts.HelveticaBold);
  const lb = await getLogoBytes();
  const logo = lb ? await doc.embedPng(lb) : null;
  const W = 595.28, H = 841.89, M = 70, BODY_TOP = H - 160, BOTTOM = 60;
  const black = rgb(0, 0, 0), grey = rgb(0.35, 0.35, 0.35), lineC = rgb(0, 0, 0);
  let page, y;
  const pages = [];
  const newPage = () => { page = doc.addPage([W, H]); pages.push(page); y = BODY_TOP; };
  const wrapPara = (para, font, size, maxW) => {
    const out = [];
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const test = line ? line + ' ' + word : word;
      if (font.widthOfTextAtSize(test, size) <= maxW) line = test;
      else {
        if (line) out.push(line);
        line = word;
        while (font.widthOfTextAtSize(line, size) > maxW) { let i = line.length - 1; while (i > 1 && font.widthOfTextAtSize(line.slice(0, i), size) > maxW) i--; out.push(line.slice(0, i)); line = line.slice(i); }
      }
    }
    out.push(line);
    return out;
  };
  const wrap = (text, font, size, maxW) => ansi(text).split('\n').flatMap(p => p.trim() ? wrapPara(p, font, size, maxW) : ['']);
  const ensure = need => { if (y - need < BOTTOM) newPage(); };
  /* Absatz, wahlweise im Blocksatz wie in der Vorlage */
  const para = (text, { size = 10, font = F, x = M, maxW = W - 2 * M, gap = 6, color = black, lh = 1.3, justify = false } = {}) => {
    for (const p of ansi(text).split('\n')) {
      const lines = p.trim() ? wrapPara(p, font, size, maxW) : [''];
      lines.forEach((ln, i) => {
        ensure(size * lh);
        const words = ln.split(' ');
        if (justify && i < lines.length - 1 && words.length > 1) {
          const wsum = words.reduce((a, w) => a + font.widthOfTextAtSize(w, size), 0);
          const sp = (maxW - wsum) / (words.length - 1);
          let xx = x;
          for (const w of words) { page.drawText(w, { x: xx, y: y - size, size, font, color }); xx += font.widthOfTextAtSize(w, size) + sp; }
        } else page.drawText(ln, { x, y: y - size, size, font, color });
        y -= size * lh;
      });
    }
    y -= gap;
  };
  const centered = (text, size, font, gapAfter = 0.35) => {
    for (const ln of wrap(text, font, size, W - 2 * M - 40)) {
      ensure(size * 1.25);
      page.drawText(ln, { x: (W - font.widthOfTextAtSize(ln, size)) / 2, y: y - size, size, font, color: black });
      y -= size * 1.2;
    }
    y -= size * gapAfter;
  };
  const heading = text => { y -= 14; centered(text, 12, FB, 0.6); };
  /* Tabelle; eine Zelle ist Text oder { text, img } (Bild der Stift-Unterschrift) */
  const table = (cols, rows, { size = 9, minRow = 0, x0 = M, x1 = W - M, headH = 0, headSize = 8.5, gapHead = 0, filler = false } = {}) => {
    const total = x1 - x0, widths = cols.map(c => c.w * total);
    const drawRow = (cells, font, mh, fs, center) => {
      const lines = cells.map((c, i) => wrap(typeof c === 'object' && c ? c.text || '' : c || '', font, fs, widths[i] - 8));
      const hgt = Math.max(mh, Math.max(...lines.map(l => l.length)) * fs * 1.25 + 8);
      if (cells.every(c => !c) && pages.length > 0 && y - hgt < BOTTOM && filler) return; // Leerzeile passt nicht mehr
      ensure(hgt);
      let x = x0;
      cells.forEach((c, i) => {
        lines[i].forEach((ln, k) => {
          const tx = center ? x + (widths[i] - font.widthOfTextAtSize(ln, fs)) / 2 : x + 4;
          page.drawText(ln, { x: tx, y: y - 4 - fs - k * fs * 1.25, size: fs, font, color: black });
        });
        if (c && typeof c === 'object' && c.img) {
          const used = lines[i].filter(Boolean).length * fs * 1.25;
          const boxW = widths[i] - 8, boxH = hgt - 8 - used;
          const s = Math.min(boxW / c.img.width, boxH / c.img.height);
          page.drawImage(c.img, { x: x + 4 + (boxW - c.img.width * s) / 2, y: y - hgt + 4, width: c.img.width * s, height: c.img.height * s });
        }
        x += widths[i];
      });
      page.drawRectangle({ x: x0, y: y - hgt, width: total, height: hgt, borderColor: lineC, borderWidth: 0.6 });
      x = x0; for (let i = 0; i < widths.length - 1; i++) { x += widths[i]; page.drawLine({ start: { x, y }, end: { x, y: y - hgt }, thickness: 0.6, color: lineC }); }
      y -= hgt;
    };
    drawRow(cols.map(c => c.t), FB, headH, headSize, true);
    y -= gapHead;
    rows.forEach(r => drawRow(r, F, minRow, size, false));
  };
  const ortKurz = (v.meta.ort || '').split(',')[0].trim();

  /* Seite 1 */
  newPage();
  y = H - 157;
  centered('Protokoll über die Festlegung des Grenzverlaufs', 16, F, 0.1);
  centered('gemäß § 43 Abs. 6 VermG', 9, FB, 0);
  centered('und § 52 Z 5 VermG', 9, FB, 0);
  y -= 10;
  heading('Verzeichnis der Eigentümer, allfälliger Vertreter und anwesender Personen');
  para(`Die Verhandlung über den Grenzverlauf wird am ${deDate(v.meta.datum) || '……………'} um ${v.meta.eroeffnung || '. . . . . . . .'} Uhr in ${ortKurz || '…'} eröffnet. Der Verhandlungsleiter überzeugt sich von der Persönlichkeit der anwesenden Personen und prüft die Vertretungsbefugnis.`);
  y -= 10;
  heading('Gegenstand der Verhandlung');
  para('Der Verhandlungsleiter legt den Gegenstand der Grenzverhandlung dar, der die Festlegung der Grenzen der in der Beschreibung des Grenzverlaufs näher bezeichneten Grundstücke betrifft und hält folgende Behelfe vor:', { justify: true, gap: 10 });
  const vb = v.behelfe.filter(b => b.vorgehalten).map(b => [b.planverfasser, b.gz, b.anmerkung]);
  while (vb.length < 5) vb.push(['', '', '']); // Leerzeilen wie in der Vorlage, soweit Platz ist
  table([{ t: 'Planverfasser', w: 0.377 }, { t: 'Geschäftszahl', w: 0.181 }, { t: 'Anmerkung', w: 0.442 }], vb,
    { size: 9, minRow: 23, x0: M + 7, x1: W - M + 2, headSize: 8.5, filler: true });

  /* Seite 2 */
  newPage();
  y = H - 157;
  centered('Beschreibung des Grenzverlaufs', 12, FB, 0.6);
  para('Der Verlauf der Grenzen wird von den erschienenen beteiligten Eigentümern oder deren bevollmächtigten Vertretern entsprechend der untenstehenden Skizze festgelegt und im Sinne von §845 ABGB und der Vermessungsverordnung i.d.g.F. gekennzeichnet.', { justify: true, gap: 0 });
  para('Die Grenze verläuft von Grenzpunkt zu Grenzpunkt geradlinig, sofern nichts anderes angegeben ist. Die zeichnerische Darstellung erfolgt unter Verwendung des im Anhang zur Vermessungsverordnung i.d.g.F. festgelegten Zeichenschlüssels.', { justify: true, gap: 12 });
  para('Wenn der Verlauf von Grenzabschnitten mangels Einigung der Eigentümer nicht festgelegt werden konnte, ist dies untenstehend beschrieben.', { justify: true, gap: 12 });
  if ((v.beschreibung.strittig || '').trim()) {
    para('Nicht festgelegte Grenzabschnitte:', { font: FB, gap: 2 });
    para(v.beschreibung.strittig, { gap: 12 });
  }
  for (const p of (v.beschreibung.text || '').split(/\n+/).map(s => s.trim()).filter(Boolean)) para(p, { justify: true, gap: 12 });
  y -= 8;
  centered('Skizze', 12, FB, 0.2);
  centered('siehe Beilage', 10, F);

  /* Seite 3 */
  newPage();
  y = H - 157;
  centered('Zustimmungserklärung', 12, FB, 0.6);
  para('Die im nachstehenden Verzeichnis unterfertigten Eigentümer stimmen dem in der Natur einvernehmlich festgelegten und oben beschriebenen Grenzverlauf zu.', { justify: true, gap: 0 });
  para('Weiters bestätigen die Eigentümer gem. § 43 Abs. 6 VermG und § 52 Z 5 VermG, dass der Grenzverlauf seit der letzten Vermessung unverändert geblieben ist, bzw. kein anderer Grenzverlauf bekannt ist.', { justify: true, gap: 16 });
  const ow = owners(v);
  const imgs = new Map();
  if (opts.unterschriften) for (const b of ow) if (b.zustimmung.art === 'stift' && b.zustimmung.png) imgs.set(b.id, await doc.embedPng(await blobBytes(b.zustimmung.png)));
  const cellSig = b => {
    if (!opts.unterschriften) return '';
    const z = b.zustimmung.art;
    if (z === 'stift' && imgs.has(b.id)) return { text: '', img: imgs.get(b.id) };
    return { qes: 'QES (ID Austria)', papier: 'Unterschrift auf Papier', verweigert: 'verweigert', offen: '' }[z] || '';
  };
  // Vertreter und Vollmacht beim vertretenen Eigentümer vermerken (die Tabelle der Anwesenden entfällt laut Vorlage)
  const vertreterVon = b => v.beteiligte.filter(x => x.rolle === 'Vertreter' && x.anwesend && x.vertritt && b.name.toLowerCase().includes(x.vertritt.toLowerCase()))
    .map(x => `vertreten durch ${x.name}${x.idnachweis ? ` (ID: ${x.idnachweis})` : ''}${x.vollmacht ? `, ${x.vollmacht}` : ''}`).join('; ');
  const rows = ow.map(b => [b.ez, b.gst.split(/,\s*/).join('\n'), `${b.name}\n${b.anschrift.split(/,\s*/).join('\n')}`, cellSig(b),
    [b.idnachweis && `ID: ${b.idnachweis}`, b.anwesend ? '' : 'nicht anwesend', vertreterVon(b), opts.unterschriften && b.zustimmung.art === 'stift' ? 'Stift, nur Information' : '', b.anmerkung].filter(Boolean).join(', ')]);
  if (!rows.length) rows.push(['', '', '', '', '']);
  table([{ t: 'EZ', w: 0.095 }, { t: 'Gst.Nr.', w: 0.152 }, { t: 'Name und Anschrift\ndes Eigentümers', w: 0.303 }, { t: 'Unterschrift', w: 0.284 }, { t: 'Anmerkung', w: 0.166 }],
    rows, { size: 8.5, minRow: 46, headH: 36, headSize: 8.5, gapHead: 3, x0: M + 5, x1: W - M + 8 });
  y -= 2;
  para('* ID = Identitätsnachweis:     P … persönlich bekannt,     A … allgemein bekannt,     L … amtlicher Lichtbildausweis', { size: 7, x: M + 11, gap: 0, lh: 1.25 });
  para('V.i.A. = Vollmacht im Akt; V.p.P. = Vollmacht per Post erhalten; V.p.E.= Vollmacht per Email erhalten', { size: 7, x: M + 32, gap: 14, lh: 1.25 });
  if (opts.unterschriften && imgs.size) para('Unterschriften mit dem Stift am Tablet dienen nur der Information. Die Schriftform (§ 43 Abs. 6 VermG, § 886 ABGB) erfüllen nur die qualifizierte elektronische Signatur oder die eigenhändige Unterschrift auf Papier.', { size: 7.5, color: grey, gap: 10 });
  para(`Die Verhandlung über den Verlauf der Grenze wird um ${v.meta.schluss || '. . . . . . . . . . .'} Uhr geschlossen.`);
  y -= Math.max(24, Math.min(70, y - BOTTOM - 40)); ensure(40);
  page.drawText(ansi(`${ortKurz || '. . . . . . .'}, am ${deDate(v.meta.datum) || '. . . . . . . . . . .'}`), { x: M, y: y - 10, size: 10, font: F });
  page.drawText('(Ort)', { x: M, y: y - 21, size: 7.5, font: F });
  page.drawText('(Datum)', { x: M + 100, y: y - 21, size: 7.5, font: F });
  page.drawText('Der Verhandlungsleiter', { x: W - M - 110, y: y - 10, size: 8.5, font: F });
  page.drawText(ansi(v.meta.leiter || ''), { x: W - M - 110, y: y - 22, size: 8.5, font: F });
  y -= 30;
  const protoPages = pages.length;

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
        for (let i = 1; i < s.points.length; i++) p.drawLine({ start: toPdf(...s.points[i - 1]), end: toPdf(...s.points[i]), thickness: s.width, color: c, lineCap: LineCapStyle.Round });
      }
      for (const t of v.skizze.texts.filter(t => t.page === idx + 1)) {
        const pos = toPdf(t.x, t.y);
        p.drawText(ansi(t.text), { x: pos.x, y: pos.y, size: t.size, font: FB, color: hexRgb(t.color) });
      }
      for (const s of v.skizze.symbols.filter(s => s.page === idx + 1)) {
        const c = hexRgb(s.color), pos = toPdf(s.x, s.y), r = s.r, bw = Math.max(0.4, r * 0.28);
        if (s.code === 'GS') p.drawRectangle({ x: pos.x - r, y: pos.y - r, width: 2 * r, height: 2 * r, borderColor: c, borderWidth: bw });
        else p.drawCircle({ x: pos.x, y: pos.y, size: r, borderColor: c, borderWidth: bw });
        p.drawCircle({ x: pos.x, y: pos.y, size: r * 0.3, color: c });
        const lp = toPdf(s.x + r * 1.35, s.y + r * 0.5);
        p.drawText(s.code, { x: lp.x, y: lp.y, size: r * 1.5, font: FB, color: c });
      }
      const label = ansi(`Beilage zum Protokoll, Projekt ${v.gz}: Begehungsskizze mit Ergänzungen vor Ort${copied.length > 1 ? ` (Blatt ${idx + 1} von ${copied.length})` : ''}`);
      p.drawRectangle({ x: mb.x + 8, y: mb.y + 6, width: F.widthOfTextAtSize(label, 8) + 8, height: 13, color: rgb(1, 1, 1), opacity: 0.85 });
      p.drawText(label, { x: mb.x + 12, y: mb.y + 9.5, size: 8, font: F, color: grey });
    });
  }

  /* Briefkopf wie in der Vorlage: Logo, Kanzleizeile, Tabelle Vermessungsamt / KG / Seite / Projekt */
  pages.slice(0, protoPages).forEach((p, i) => {
    if (logo) { const lw = 104, lh = lw * logo.height / logo.width; p.drawImage(logo, { x: 81, y: H - 40 - lh, width: lw, height: lh }); }
    p.drawText('8010 Graz, Münzgrabenstraße 4,  Tel. 0316 82 35 70', { x: 81, y: H - 79, size: 5.8, font: F, color: black });
    const xs = [47, 160, 387, 443, 584], top = H - 85.5, rh = 24.5;
    p.drawRectangle({ x: xs[0], y: top - 2 * rh, width: xs[4] - xs[0], height: 2 * rh, borderColor: lineC, borderWidth: 0.6 });
    p.drawLine({ start: { x: xs[0], y: top - rh }, end: { x: xs[4], y: top - rh }, thickness: 0.6, color: lineC });
    for (const x of xs.slice(1, 4)) p.drawLine({ start: { x, y: top }, end: { x, y: top - 2 * rh }, thickness: 0.6, color: lineC });
    const cell = (t, col, row) => p.drawText(ansi(t), { x: xs[col] + 3, y: top - row * rh - 13, size: 10, font: F, color: black });
    cell('Vermessungsamt:', 0, 0); cell(v.meta.vermessungsamt, 1, 0); cell('Seite:', 2, 0); cell(`${i + 1}  von ${protoPages}`, 3, 0);
    cell('Katastralgemeinde:', 0, 1); cell(v.meta.kg, 1, 1); cell('Projekt:', 2, 1); cell(v.gz, 3, 1);
    p.drawText(ansi(`Protokoll Version ${v.version} · Digitale Grenzverhandlung ${APP_VERSION}${opts.unterschriften ? ' · Ausfertigung mit Stift-Unterschriften (Information)' : ''}`), { x: M, y: 26, size: 6.5, font: F, color: grey });
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
    const hint = $('#v-hint');
    hint.textContent = opts.editable ? 'Stift zeichnet · Finger verschiebt und zoomt' : 'Zwei Finger zoomen · ein Finger verschiebt';
    hint.hidden = false; clearTimeout(this.ht); this.ht = setTimeout(() => { hint.hidden = true; }, 3500);
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
    if (st.onClose) st.onClose();
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
    paintInk(ctx, st.ink, st.page, ink.width / st.pw);
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
  snapshot() { const st = this.st; st.undo.push(JSON.stringify({ strokes: st.ink.strokes, texts: st.ink.texts, symbols: st.ink.symbols })); if (st.undo.length > 60) st.undo.shift(); },
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
      else if (st.tool === 'symbol') { this.snapshot(); st.ink.symbols.push({ page: st.page, x: Math.round(p[0] * 100) / 100, y: Math.round(p[1] * 100) / 100, code: $('#v-symbol').value, color: st.color, r: Math.max(1.5, 6 / st.zoom) }); this.drawInk(); this.changed(); }
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
    const before = st.ink.strokes.length + st.ink.texts.length + st.ink.symbols.length;
    st.ink.symbols = st.ink.symbols.filter(s => s.page !== st.page || Math.hypot(s.x - p[0], s.y - p[1]) > s.r + tol);
    st.ink.strokes = st.ink.strokes.filter(s => s.page !== st.page || !near(s.points));
    st.ink.texts = st.ink.texts.filter(t => t.page !== st.page || !(p[0] > t.x - tol && p[0] < t.x + t.text.length * t.size * 0.6 + tol && p[1] > t.y - t.size - tol && p[1] < t.y + tol));
    if (st.ink.strokes.length + st.ink.texts.length + st.ink.symbols.length !== before) { this.drawInk(); this.changed(); }
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
    st.ink.strokes = prev.strokes; st.ink.texts = prev.texts; st.ink.symbols = prev.symbols || [];
    this.drawInk(); this.changed();
  },
  syncTools() {
    const st = this.st;
    $$('#v-tools [data-tool]').forEach(b => b.classList.toggle('on', b.dataset.tool === st.tool));
    $$('#v-tools [data-color]').forEach(b => b.classList.toggle('on', b.dataset.color === st.color));
    $$('#v-tools [data-width]').forEach(b => b.classList.toggle('on', Number(b.dataset.width) === st.width));
    $('#v-symbol').hidden = st.tool !== 'symbol';
    $('#v-stage').style.cursor = st.editable && st.tool !== 'hand' ? 'crosshair' : 'grab';
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
  const upd = () => {
    const n = $('#net'); n.classList.toggle('off', !navigator.onLine);
    $('.net-label', n).textContent = navigator.onLine ? 'online' : 'offline';
    n.title = navigator.onLine ? 'online' : 'offline – alle Unterlagen sind am Gerät';
  };
  window.addEventListener('online', upd); window.addEventListener('offline', upd); upd();
}
function init() {
  initViewer(); initNet();
  $('#btn-home').onclick = () => { if (Viewer.st) Viewer.close(); app.cur = null; setView('start'); };
  $('#btn-back').onclick = () => { const i = STEPS.findIndex(x => x.k === app.view); if (i > 0) setView(STEPS[i - 1].k); };
  $('#btn-next').onclick = () => { const i = STEPS.findIndex(x => x.k === app.view); if (i < STEPS.length - 1) setView(STEPS[i + 1].k); };
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
