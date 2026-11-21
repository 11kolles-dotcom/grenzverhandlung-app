/* ADP Rinner – Digitale Grenzverhandlung (Prototyp zur Masterarbeit, Kapitel 6.5)
 * Offline-Web-App: GZ-Auswahl, Übersicht, Behelfe, Begehungsskizze mit Stift und Grenzzeichen,
 * Protokoll nach § 43 Abs. 6 VermG (Vorlage der Kanzlei), Sperre mit Prüfsumme,
 * Zustimmung per ID Austria (QES über externen Signaturdienst), Papier oder Stift (nur Information), Export.
 */
'use strict';

const APP_VERSION = '0.9.12';
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
  folderopen: 'M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2z',
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
  camera: 'M4 8h3l2-3h6l2 3h3v11H4zM12 17a3.5 3.5 0 100-7 3.5 3.5 0 000 7z',
  map: 'M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3zM9 3v15M15 6v15',
  docs: 'M8 3h8l4 4v12H8zM16 3v4h4M4 7v14h12M11 11h6M11 15h6',
  trash: 'M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13',
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
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, Math.max(3400, String(msg).length * 65));
  t.onclick = () => { t.hidden = true; };
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
  unterfertigt: { label: 'vom Verhandlungsleiter unterfertigt', cls: 'good' },
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
  { k: 'eroeffnung', t: 'Eröffnung', s: 'Anwesende und GFN' },
  { k: 'skizze', t: 'Skizze', s: 'Freihand zeichnen' },
  { k: 'beschreibung', t: 'Grenzverlauf', s: 'Beschreibung' },
  { k: 'abschluss', t: 'Abschluss', s: 'Prüfen und sperren' },
  { k: 'zustimmung', t: 'Zustimmung', s: 'Unterschriften' },
  { k: 'export', t: 'Export', s: 'Protokoll für das BAIK' },
];

function newPerson(b = {}) {
  return {
    id: uid(), ez: b.ez || '', gst: b.gst || '', name: b.name || '', anschrift: b.anschrift || '',
    rolle: b.rolle && ROLLEN.includes(b.rolle) ? b.rolle : 'Eigentümer', vertritt: b.vertritt || '',
    einladung: /^\d{1,2}:\d{2}$/.test(b.einladung || '') ? b.einladung.padStart(5, '0') : '',
    anwesend: false, idnachweis: '', vollmacht: '', anmerkung: '', zustimmung: { art: 'offen', zeit: null },
    vertreten: false, abwesend: false, vertreter: { name: '', idnachweis: '', vollmacht: '' },
  };
}
/* Anwesend ist, wer selbst da ist oder (als Eigentümer) vertreten wird */
const isOwnerP = b => b.rolle === 'Eigentümer';
const present = b => b.anwesend || (isOwnerP(b) && b.vertreten);
/* Vertreter aus dem Paket beim vertretenen Eigentümer vormerken (Name vorausgefüllt), statt als eigene Karte */
function attachVertreter(list) {
  const ow = list.filter(isOwnerP);
  return list.filter(x => {
    if (x.rolle !== 'Vertreter' || !x.vertritt) return true;
    const key = x.vertritt.toLowerCase().trim();
    const hits = ow.filter(o => o.name.toLowerCase().includes(key));
    hits.forEach(o => { o.vertreter.name = o.vertreter.name || x.name; });
    return !hits.length;
  });
}
const BESCHREIBUNG_FEST = 'Der Verlauf der Grenzen wird von den erschienenen beteiligten Eigentümern oder deren bevollmächtigten Vertretern entsprechend der untenstehenden Skizze festgelegt und im Sinne von §845 ABGB und der Vermessungsverordnung i.d.g.F. gekennzeichnet.\nDie Grenze verläuft von Grenzpunkt zu Grenzpunkt geradlinig, sofern nichts anderes angegeben ist. Die zeichnerische Darstellung erfolgt unter Verwendung des im Anhang zur Vermessungsverordnung i.d.g.F. festgelegten Zeichenschlüssels.\n\nWenn der Verlauf von Grenzabschnitten mangels Einigung der Eigentümer nicht festgelegt werden konnte, ist dies untenstehend beschrieben.';
const BESCHREIBUNG_VORLAGE = BESCHREIBUNG_FEST + '\n\nAlte Grenzpunkte wurden aufgrund oben genannter GFN (VHW´s) überprüft bzw. rückgesetzt und einvernehmlich anerkannt.\n\nDie neuen Grenzpunkte wurden ebenfalls einvernehmlich festgelegt und in der Natur vermarkt.';
function newVerhandlung(src) {
  return {
    id: uid(),
    gz: String(src.gz),
    meta: {
      vermessungsamt: src.vermessungsamt || '', kg: src.katastralgemeinde || '', gemeinde: src.gemeinde || '', ort: src.ort || '',
      datum: src.datum || todayISO(), eroeffnung: '', schluss: '', leiter: src.verhandlungsleiter || 'DI Gerald Fuxjäger', kanzlei: src.kanzlei || '',
      gegenstand: src.gegenstand || '',
    },
    beteiligte: attachVertreter((src.beteiligte || []).map(newPerson)),
    behelfe: (src.behelfe || []).map(b => ({ id: uid(), planverfasser: b.planverfasser || '', gz: b.geschaeftszahl || '', anmerkung: b.anmerkung || '', vorgehalten: false, pdf: b.pdf, datei: b.datei || '' })),
    skizze: { pdf: src.skizzePdf || null, strokes: [], texts: [], symbols: [] },
    fotos: [],
    unterlagen: (src.unterlagen || []).filter(u => u.pdf).map(u => ({ id: uid(), titel: u.titel || titleFromFile(u.datei), datei: u.datei || '', pdf: u.pdf, lokal: false })),
    beschreibung: { text: BESCHREIBUNG_VORLAGE, strittig: '' },
    status: 'vorbereitet', version: 1, locked: null, signed: null,
    log: [{ zeit: Date.now(), text: 'Verhandlungspaket importiert' }],
    created: Date.now(), updated: Date.now(),
  };
}
function migrate(v) {
  v.skizze.symbols = v.skizze.symbols || [];
  delete v.vorab;
  v.unterlagen = v.unterlagen || [];
  v.beteiligte.forEach(b => {
    if (b.einladung === undefined) b.einladung = '';
    if (b.vertreten === undefined) b.vertreten = false;
    if (b.abwesend === undefined) b.abwesend = false;
    if (!b.vertreter) b.vertreter = { name: '', idnachweis: '', vollmacht: '' };
    // bis 0.9.8 war „Stift“ eine Zustimmungsart; jetzt ist es eine Zusatz-Information neben QES bzw. Papier
    if (b.zustimmung && b.zustimmung.art === 'stift') { b.stift = b.zustimmung.png ? { png: b.zustimmung.png, zeit: b.zustimmung.zeit } : null; b.zustimmung = { art: 'offen', zeit: null }; }
  });
  v.fotos = v.fotos || [];
  v.meta.gemeinde = v.meta.gemeinde || '';
  if (!(v.beschreibung.text || '').includes('Der Verlauf der Grenzen wird')) v.beschreibung.text = BESCHREIBUNG_FEST + '\n\n' + (v.beschreibung.text || '').split(/\n+/).map(x => x.trim()).filter(Boolean).join('\n\n');
  v.meta.gegenstand = v.meta.gegenstand || '';
  if (v.leiterSig === undefined) v.leiterSig = null;
  return v;
}

const app = { list: [], cur: null, view: 'start', editing: null, pending: null };
const isLocked = () => !!(app.cur && app.cur.locked);
/* Skizze, Grenzverlauf, Abschluss und Zustimmung erst nach der Eröffnung; Anwesenheit schon vorher */
const isOpened = (v = app.cur) => !!(v && (v.meta.eroeffnung || v.locked));
const GATED = ['skizze', 'beschreibung', 'abschluss', 'zustimmung'];
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
const titleFromFile = name => String(name || 'Dokument').split('/').pop().replace(/\.pdf$/i, '').replace(/[_]+/g, ' ').trim();
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
  for (const b of src.behelfe || []) b.pdf = b.datei ? await getPdf(b.datei) : null;
  if (src.skizze) src.skizzePdf = await getPdf(src.skizze);
  src.unterlagen = Array.isArray(src.unterlagen) ? src.unterlagen : [];
  for (const u of src.unterlagen) u.pdf = await getPdf(u.datei);
  const listed = new Set(src.unterlagen.map(u => u.datei));
  const extra = zip.file(/(^|\/)unterlagen\/[^/]+\.pdf$/i).filter(f => !listed.has(f.name.slice(base.length)) && !listed.has(f.name))
    .sort((a, b) => a.name.localeCompare(b.name, 'de'));
  for (const f of extra) src.unterlagen.push({ titel: titleFromFile(f.name), datei: f.name.slice(base.length), pdf: new Blob([await f.async('uint8array')], { type: 'application/pdf' }) });
  const v = newVerhandlung(src);
  try { const n = await einladungenLesen(v); if (n) v.log.push({ zeit: Date.now(), text: `Einladungszeiten aus der Einladung gelesen (${n} Person${n === 1 ? '' : 'en'})` }); } catch (e) { /* Auslesen ist optional */ }
  return v;
}

/* Einladungszeiten aus den Einladungs-PDFs der Unterlagen lesen.
   Je Seite (bzw. je Brief) wird die Uhrzeit gesucht („09:00 Uhr“, „9.30 Uhr“, „um 9 Uhr“) und den Eigentümern zugeordnet,
   deren Name auf der Seite steht; bevorzugt der Empfänger im Adressfeld (oberes Drittel). Vorhandene Zeiten bleiben. */
const nameTokens = n => String(n || '').replace(/\(.*?\)/g, ' ').toLowerCase().split(/[^a-zäöüß]+/i)
  .filter(t => t.length >= 3 && !/^(ing|mag|dipl|herr|herrn|frau|und|der|die|das|von|bsc|msc|mba|phd|prof)$/.test(t));
function zeitAusText(t) {
  t = t.replace(/\s+/g, ' ');
  const m = t.match(/(?:\bum\s+|,\s*|\b)([01]?\d|2[0-3])[:.]([0-5]\d)\s*(?:Uhr|h\b)/i) || t.match(/\bum\s+([01]?\d|2[0-3])\s*Uhr/i);
  return m ? `${m[1].padStart(2, '0')}:${m[2] || '00'}` : '';
}
async function einladungenLesen(v, { ueberschreiben = false } = {}) {
  const docs = v.unterlagen.filter(u => /ladung/i.test(`${u.titel} ${u.datei}`) && u.pdf);
  const ow = v.beteiligte.filter(b => b.rolle !== 'Anwesend (sonstige)' && (ueberschreiben || !b.einladung));
  if (!docs.length || !ow.length) return 0;
  const found = new Map();
  for (const u of docs) {
    const doc = await loadPdf(u.pdf);
    let allgemein = '';
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i), H = page.getViewport({ scale: 1 }).height;
      const items = (await page.getTextContent()).items.filter(x => x.str.trim());
      const text = items.map(x => x.str).join(' ');
      const zeit = zeitAusText(text); if (!zeit) continue;
      allgemein = allgemein || zeit;
      const low = text.toLowerCase();
      // Adressfeld: nach „An“ bis zur Zeile mit der Postleitzahl, sonst das obere Viertel der Seite
      const ai = items.findIndex(x => /^(an|herrn?|frau|familie)$/i.test(x.str.trim()) && x.transform[5] > H * 0.6);
      let addr = [];
      if (ai >= 0) for (const x of items.slice(ai + 1, ai + 8)) { addr.push(x); if (/^\d{4}\s/.test(x.str.trim())) break; }
      else addr = items.filter(x => x.transform[5] > H * 0.72);
      const top = addr.map(x => x.str).join(' ').toLowerCase();
      const has = (b, t) => { const k = nameTokens(b.name); return k.length && k.every(x => t.includes(x)); };
      let hits = ow.filter(b => has(b, top));
      if (!hits.length) hits = ow.filter(b => has(b, low));
      for (const b of hits) if (!found.has(b.id)) found.set(b.id, zeit);
    }
    // Eine gemeinsame Einladung ohne Namen: dieselbe Zeit für alle
    if (!found.size && allgemein && doc.numPages <= 2) ow.forEach(b => found.set(b.id, allgemein));
    doc.destroy();
  }
  for (const b of ow) if (found.has(b.id)) b.einladung = found.get(b.id);
  return found.size;
}

/* ---------- Demo (Plan der Kanzlei, Personen fiktiv) ---------- */
function demoSource() {
  return {
    gz: '19389', vermessungsamt: 'Graz', katastralgemeinde: '63243 Kirchenviertel', gemeinde: 'Gratkorn',
    ort: 'Gratkorn, Kapellenweg', datum: todayISO(), verhandlungsleiter: 'DI Gerald Fuxjäger',
    kanzlei: 'ADP Rinner ZT GmbH, Münzgrabenstraße 4/1, 8010 Graz',
    gegenstand: 'Umwandlung des Grundstücks .626 in den Grenzkataster',
    skizze: 'skizze.pdf',
    unterlagen: [
      { titel: 'Einladung zur Grenzverhandlung', datei: 'unterlagen/Einladung_GZ19389.pdf' },
      { titel: 'Angebot', datei: 'unterlagen/Angebot_GZ19389.pdf' },
    ],
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
    einladung: await fetchBlob('demo/Einladung_GZ19389.pdf', 'application/pdf'),
    angebot: await fetchBlob('demo/Angebot_GZ19389.pdf', 'application/pdf'),
  };
}
/* Je Geschäftszahl darf nur eine Verhandlung auf dem Gerät sein */
const gzKey = gz => String(gz || '').replace(/\s+/g, '').toLowerCase();
async function findGz(gz) { return (await DB.all()).find(x => gzKey(x.gz) === gzKey(gz)) || null; }
async function createDemo() {
  const da = await findGz(demoSource().gz);
  if (da) { da.schonDa = true; return da; }
  const f = await demoFiles();
  const src = demoSource();
  src.skizzePdf = f.skizze; src.behelfe[0].pdf = f.gfn; src.unterlagen[0].pdf = f.einladung; src.unterlagen[1].pdf = f.angebot;
  const v = newVerhandlung(src);
  await einladungenLesen(v).catch(() => 0);
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
  zip.file('unterlagen/Einladung_GZ19389.pdf', await f.einladung.arrayBuffer());
  zip.file('unterlagen/Angebot_GZ19389.pdf', await f.angebot.arrayBuffer());
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
const dashOf = w => [Math.max(2.5, w * 4), Math.max(2, w * 3)];
function paintInk(ctx, ink, pageNo, k) {
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const s of ink.strokes.filter(s => s.page === pageNo)) {
    ctx.strokeStyle = s.color; ctx.fillStyle = s.color; ctx.lineWidth = s.width * k;
    ctx.setLineDash(s.dash ? dashOf(s.width).map(x => x * k) : []);
    if (s.points.length === 1) { ctx.beginPath(); ctx.arc(s.points[0][0] * k, s.points[0][1] * k, s.width * k / 2, 0, Math.PI * 2); ctx.fill(); continue; }
    ctx.beginPath(); ctx.moveTo(s.points[0][0] * k, s.points[0][1] * k);
    for (let i = 1; i < s.points.length; i++) ctx.lineTo(s.points[i][0] * k, s.points[i][1] * k);
    ctx.stroke();
  }
  ctx.setLineDash([]);
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

/* Foto-Standort in der Skizze: Kreis mit Nummer, Kegel in Blickrichtung (Seiten-Einheiten, y nach unten) */
const FOTO_FARBE = '#e8710a';
function fotoMarkGeom(m, zoom = 1) {
  const r = 10 / Math.sqrt(Math.max(1, zoom)), L = r * 5, a = 0.45;
  const cone = m.dir === null || m.dir === undefined ? null
    : [[m.x, m.y], [m.x + L * Math.cos(m.dir - a), m.y + L * Math.sin(m.dir - a)], [m.x + L * Math.cos(m.dir + a), m.y + L * Math.sin(m.dir + a)]];
  return { r, cone };
}
function paintFotoMark(ctx, m, k, zoom) {
  const { r, cone } = fotoMarkGeom(m, zoom);
  ctx.save();
  if (cone) {
    ctx.beginPath(); ctx.moveTo(cone[0][0] * k, cone[0][1] * k); ctx.lineTo(cone[1][0] * k, cone[1][1] * k); ctx.lineTo(cone[2][0] * k, cone[2][1] * k); ctx.closePath();
    ctx.fillStyle = 'rgba(232,113,10,.28)'; ctx.fill(); ctx.strokeStyle = FOTO_FARBE; ctx.lineWidth = Math.max(1, r * 0.18 * k); ctx.stroke();
  }
  ctx.beginPath(); ctx.arc(m.x * k, m.y * k, r * k, 0, Math.PI * 2);
  ctx.fillStyle = m.aktiv ? FOTO_FARBE : '#fff'; ctx.fill(); ctx.strokeStyle = FOTO_FARBE; ctx.lineWidth = Math.max(1.5, r * 0.25 * k); ctx.stroke();
  ctx.fillStyle = m.aktiv ? '#fff' : FOTO_FARBE; ctx.font = `bold ${r * 1.15 * k}px Helvetica, Arial, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(String(m.nr), m.x * k, m.y * k + r * 0.06 * k);
  ctx.restore();
}
const fotoMarks = v => () => v.fotos.map((f, i) => f.pos ? { ...f.pos, nr: i + 1 } : null).filter(Boolean);

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
    h('span', {}, 'Änderungen sind nur über eine neue Version möglich (Schritt „Abschluss“).'));
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
    case 'eroeffnung': return !!v.meta.eroeffnung && v.beteiligte.some(present) && v.behelfe.some(b => b.vorgehalten);
    case 'skizze': return inkCount(v.skizze) > 0;
    case 'beschreibung': return !!v.beschreibung.gesehen && !!(v.beschreibung.text || '').trim();
    case 'abschluss': return !!v.locked;
    case 'zustimmung': return v.status === 'abgeschlossen' || v.status === 'unterfertigt';
    case 'export': return v.log.some(e => /exportiert/.test(e.text));
    default: return false;
  }
}
function progress(v) {
  const ks = ['eroeffnung', 'skizze', 'beschreibung', 'abschluss', 'zustimmung'];
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
  const dc = $('#docs-count'); dc.textContent = v.unterlagen.length || ''; dc.hidden = !v.unterlagen.length;
  const fc = $('#fotos-count'); fc.textContent = v.fotos.length || ''; fc.hidden = !v.fotos.length;

  const pr = progress(v);
  const nav = $('#stepper');
  nav.replaceChildren(); put(nav, 
    h('div', { class: 'progress' },
      h('div', { class: 'progress-label' }, h('span', {}, 'Fortschritt'), h('span', {}, `${pr.done} von ${pr.total}`)),
      h('div', { class: 'bar' }, h('span', { style: `width:${Math.round(pr.done / pr.total * 100)}%` }))),
    STEPS.map(st => { const done = stepDone(st.k), gated = GATED.includes(st.k) && !isOpened(); return h('button', {
      type: 'button', class: 'step' + (st.k === app.view ? ' on' : '') + (done ? ' done' : gated ? ' gated' : ' open'),
      title: gated ? 'Erst nach der Eröffnung' : done ? 'erledigt' : 'noch offen',
      'aria-current': st.k === app.view ? 'step' : null, onclick: () => setView(st.k),
    }, h('span', { class: 'ico' }, icon(st.k)), h('span', { class: 'tick', 'aria-hidden': 'true' }, done ? '✓' : gated ? '' : '!'),
      h('span', { class: 'txt' }, h('b', {}, st.t), h('small', {}, st.s))); }));
  // Hochformat: Ablauf scrollt quer, aktiven Schritt sichtbar machen
  const on = nav.querySelector('.step.on');
  if (on && nav.scrollWidth > nav.clientWidth) nav.scrollLeft += on.getBoundingClientRect().left - nav.getBoundingClientRect().left - 12;
  const i = STEPS.findIndex(x => x.k === app.view);
  const back = $('#btn-back'), next = $('#btn-next');
  back.hidden = i <= 0; next.hidden = i >= STEPS.length - 1;
  if (i > 0) back.textContent = 'Zurück';
  if (i < STEPS.length - 1) next.textContent = `Weiter: ${STEPS[i + 1].t}`;
  next.disabled = app.view === 'eroeffnung' && !isOpened();
  $('#actionbar-hint').textContent = i >= 0 ? `Schritt ${i + 1} von ${STEPS.length}` : '';
}

const VIEWS = {};
function setView(view) {
  app.view = view;
  if (view !== 'start') armBack();
  const main = $('#main');
  main.replaceChildren();
  renderChrome();
  const page = h('div', { class: 'page' });
  main.append(page);
  if (GATED.includes(view) && app.cur && !isOpened()) gatePage(page, view);
  else VIEWS[view](page);
  main.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}
function gatePage(page, view) {
  const st = STEPS.find(x => x.k === view);
  put(page, pageHead(st ? st.t : 'Noch nicht eröffnet'),
    h('div', { class: 'card stack gate' },
      notice('brand', 'clock', h('strong', {}, 'Die Verhandlung ist noch nicht eröffnet.'),
        h('span', {}, 'Skizze, Grenzverlauf und Abschluss sind erst nach der Eröffnung möglich. Anwesend, Vertreten oder Abwesend kann schon vorher gewählt werden.')),
      h('div', {}, h('button', { class: 'btn primary', type: 'button', onclick: () => setView('eroeffnung') }, 'Zur Eröffnung'))));
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
          h('h1', {}, 'Wähle ein Projekt'),
          h('p', { class: 'muted' }, 'Projekt nach Geschäftszahl antippen. Alle Unterlagen liegen am Gerät, die Verhandlung läuft auch ohne Netz.'))),
      list,
      h('div', { class: 'foot' },
        h('button', { class: 'btn primary', type: 'button', onclick: () => $('#file-zip').click() }, icon('upload'), 'Verhandlungspaket importieren'),
        h('button', { class: 'btn', type: 'button', onclick: e => busy(e.currentTarget, async () => { const v = await createDemo(); toast(v.schonDa ? `Demo GZ ${v.gz} ist schon vorhanden und wurde geöffnet` : 'Demo-Verhandlung angelegt'); delete v.schonDa; openGz(v.id); }) }, icon('plus'), 'Demo anlegen'))),
    h('details', {},
      h('summary', {}, 'Wie kommt eine Verhandlung aufs Gerät?'),
      h('div', { class: 'card stack' },
        h('p', {}, 'Die Kanzlei stellt je Geschäftszahl ein ZIP-Paket zusammen: Kopfdaten, Beteiligte, GFN, Begehungsskizze und Unterlagen wie Angebot und Ladung. Das geht im Büro am PC mit der Seite „Paket erstellen“. Telefonnummern und E-Mail-Adressen gehören nicht hinein.'),
        h('div', { class: 'row' }, h('a', { class: 'btn', href: '../buero/' }, icon('folder'), 'Paket erstellen (Büro)'), h('button', { class: 'btn', type: 'button', onclick: e => busy(e.currentTarget, async () => download(await demoZipBlob(), 'Beispielpaket_19389.zip')) }, 'Beispielpaket herunterladen')))),
    h('p', { class: 'start-note' }, `Prototyp ${APP_VERSION} zur Masterarbeit „E-Geo-Government in der österreichischen Katastervermessung“, TU Graz. Daten bleiben ausschließlich auf diesem Gerät.`))));
  app.list = (await DB.all()).map(migrate);
  // anstehende Verhandlungen zuerst (nach Datum), erledigte ans Ende
  const fertig = v => v.status === 'unterfertigt' || v.status === 'abgeschlossen';
  app.list.sort((a, b) => (fertig(a) - fertig(b)) || String(a.meta.datum || '').localeCompare(String(b.meta.datum || '')) || b.updated - a.updated);
  if (!app.list.length) {
    list.replaceWith(h('div', { class: 'empty' }, 'Noch keine Verhandlung am Gerät. Importiere ein Verhandlungspaket oder lege die Demo-Verhandlung an.'));
    return;
  }
  const heute = new Date().toISOString().slice(0, 10);
  for (const v of app.list) {
    const s = STATUS[v.status], pr = progress(v), d = v.meta.datum ? new Date(v.meta.datum + 'T12:00') : null;
    list.append(h('div', { class: 'gz-row' + (v.meta.datum === heute ? ' heute' : '') }, h('button', { class: 'gz-item', type: 'button', onclick: () => openGz(v.id) },
      h('span', { class: 'gz-datum' }, d ? [h('b', {}, String(d.getDate())), h('small', {}, d.toLocaleDateString('de-AT', { month: 'short' }).replace('.', ''))] : h('small', {}, 'ohne Datum')),
      h('span', { class: 'gz-txt' }, h('span', { class: 'gz' }, `GZ ${v.gz}`, v.meta.datum === heute ? h('span', { class: 'heute-tag' }, 'heute') : null),
        h('span', { class: 'meta' }, [v.meta.kg && `KG ${v.meta.kg}`, (v.meta.ort || '').split(',')[0], `${owners(v).length} Eigentümer`].filter(Boolean).join(' · ')),
        h('span', { class: 'gz-schritte', title: `${pr.done} von ${pr.total} Schritten erledigt` }, Array.from({ length: pr.total }, (_, i) => h('i', { class: i < pr.done ? 'on' : '' })))),
      h('span', { class: 'pill ' + s.cls }, s.label)),
      h('button', { class: 'icon-btn gz-del', type: 'button', title: 'Verhandlung löschen', 'aria-label': `Verhandlung GZ ${v.gz} löschen`, onclick: () => askDelete(v) }, icon('trash'))));
  }
};
/* Löschen mit Sicherheitsabfrage: GZ muss eingetippt werden */
function askDelete(v) {
  const exported = v.log.some(e => /export/i.test(e.text));
  const inp = h('input', { type: 'text', inputmode: 'numeric', autocomplete: 'off', placeholder: v.gz, 'aria-label': 'Geschäftszahl zur Bestätigung' });
  const ok = h('button', { class: 'btn danger', type: 'button', disabled: true }, icon('trash'), 'Endgültig löschen');
  const close = () => dlg.remove();
  inp.addEventListener('input', () => { ok.disabled = inp.value.trim() !== String(v.gz).trim(); });
  inp.addEventListener('keydown', e => { if (e.key === 'Enter' && !ok.disabled) ok.click(); if (e.key === 'Escape') close(); });
  ok.addEventListener('click', async () => {
    ok.disabled = true;
    try { await DB.del(v.id); close(); toast(`Verhandlung GZ ${v.gz} gelöscht`); setView('start'); } catch (err) { toast(err.message); ok.disabled = false; }
  });
  const dlg = h('div', { class: 'confirm-dlg', role: 'alertdialog', 'aria-modal': 'true', 'aria-label': 'Verhandlung löschen' },
    h('div', { class: 'docs-backdrop', onclick: close }),
    h('div', { class: 'confirm-box' },
      h('h2', {}, `GZ ${v.gz} löschen?`),
      h('p', {}, 'Die Verhandlung wird mit Skizze, Unterschriften, Fotos und Unterlagen von diesem Gerät gelöscht. Das lässt sich nicht rückgängig machen.'),
      v.status === 'vorbereitet' || exported ? null : notice('', 'warn', h('span', {}, h('strong', {}, 'Noch nicht exportiert. '), 'Alles, was vor Ort erfasst wurde, geht verloren.')),
      h('label', { class: 'lbl' }, `Zur Bestätigung die Geschäftszahl ${v.gz} eintippen`), inp,
      h('div', { class: 'row', style: 'justify-content:flex-end' }, h('button', { class: 'btn ghost', type: 'button', onclick: close }, 'Abbrechen'), ok)));
  document.body.append(dlg);
  inp.focus();
}
async function openGz(id) {
  app.cur = migrate(await DB.get(id));
  app.editing = null; app.pending = null;
  setView(app.cur.locked ? (app.cur.status === 'unterfertigt' ? 'export' : 'zustimmung') : 'eroeffnung');
}

/* ---------- 1 Eröffnung und Beteiligte ---------- */
/* Foto der Vollmacht: setzt „V.i.A.“ und kommt beim Sperren als Beilage ans Protokoll */
function vollmachtFoto(holder, label, re, L) {
  const inp = h('input', { type: 'file', accept: 'image/*', capture: 'environment', hidden: true, onchange: async e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    holder.vollmachtFoto = await shrinkPhoto(f, 2000); holder.vollmacht = 'V.i.A.';
    logEvent(`Vollmacht fotografiert (${label})`); re();
  } });
  if (holder.vollmachtFoto) {
    const u = URL.createObjectURL(holder.vollmachtFoto);
    return h('span', { class: 'row vm-foto', style: 'gap:8px' },
      h('button', { class: 'vm-thumb', type: 'button', 'aria-label': 'Vollmacht groß ansehen', onclick: () => lightbox(u) }, h('img', { src: u, alt: 'Foto der Vollmacht' })),
      h('span', { class: 'muted', style: 'font-size:.85rem' }, 'Vollmacht als Beilage'),
      L ? null : h('button', { class: 'btn small ghost', type: 'button', onclick: () => { if (!confirm('Foto der Vollmacht entfernen?')) return; holder.vollmachtFoto = null; logEvent(`Foto der Vollmacht entfernt (${label})`); re(); } }, 'Entfernen'));
  }
  return L ? null : h('span', {}, h('button', { class: 'btn small', type: 'button', title: 'Wird beim Sperren als Beilage ans Protokoll angehängt', onclick: () => inp.click() }, icon('camera'), 'Vollmacht fotografieren'), inp);
}
function personCard(b) {
  const v = app.cur, L = isLocked();
  let card;
  const re = () => { touch(); const n = personCard(b); card.replaceWith(n); card = n; };
  const isOwner = b.rolle === 'Eigentümer';
  const z = ZUST[b.zustimmung.art];
  const editing = app.editing === b.id;
  const setAnw = val => {
    b.anwesend = val === 'da'; b.vertreten = val === 'vertreten'; b.abwesend = val === 'abwesend';
    if (b.vertreten && !b.vertreter.name) app.focusVertreter = b.id;
    logEvent(`${b.name || 'Person'} ${b.anwesend ? 'anwesend' : b.vertreten ? 'vertreten' : b.abwesend ? 'abwesend' : 'Anwesenheit offen'}`); re();
  };
  const vName = h('input', { type: 'text', value: b.vertreter.name, disabled: L, placeholder: 'Vor- und Nachname', 'aria-label': `Vertreter für ${b.name}`,
    oninput: e => { b.vertreter.name = e.target.value; touch(); }, onchange: () => logEvent(`${b.name}: vertreten durch ${b.vertreter.name}`) });
  if (app.focusVertreter === b.id) { app.focusVertreter = null; requestAnimationFrame(() => vName.focus()); }
  const stCls = present(b) ? 'ok' : (isOwner ? b.abwesend : !b.anwesend && b.rolle !== 'Eigentümer') ? 'off' : 'open';
  card = h('div', { class: 'card person st-' + stCls + (present(b) ? '' : ' absent') },
    h('div', { class: 'who' },
      h('div', { style: 'min-width:0;flex:1' },
        h('div', { class: 'name-row' }, h('span', { class: 'stmark ' + stCls, title: { ok: 'erfasst', off: 'abwesend', open: 'noch offen' }[stCls] }, { ok: '✓', off: '–', open: '!' }[stCls]), h('span', { class: 'name' }, b.name || 'ohne Namen'),
          b.einladung ? h('span', { class: 'pill invite', title: 'Uhrzeit laut Einladung' }, icon('clock'), `eingeladen ${b.einladung} Uhr`) : null),
        h('div', { class: 'sub' }, [b.rolle === 'Vertreter' && b.vertritt ? `Vertreter für ${b.vertritt}` : b.rolle,
          isOwner && b.vertreten && b.vertreter.name ? `vertreten durch ${b.vertreter.name}` : null,
          b.ez && `EZ ${b.ez}`, b.gst && `Gst. ${b.gst}`].filter(Boolean).join(' · ')),
        h('div', { class: 'sub' }, b.anschrift)),
      isOwner && b.zustimmung.art !== 'offen' ? h('span', { class: 'pill ' + z.cls }, z.label) : null),
    h('div', { class: 'controls' },
      isOwner
        ? seg([['da', 'Anwesend', 'Eigentümer ist selbst da'], ['vertreten', 'Vertreten', 'Eigentümer wird vertreten'], ['abwesend', 'Abwesend', 'Eigentümer ist nicht da und nicht vertreten']],
          b.anwesend ? 'da' : b.vertreten ? 'vertreten' : b.abwesend ? 'abwesend' : '', setAnw, L, 'Anwesenheit')
        : sw('anwesend', b.anwesend, val => { b.anwesend = val; logEvent(`${b.name || 'Person'} ${val ? 'anwesend' : 'nicht anwesend'}`); re(); }, L),
      isOwner && (b.vertreten || b.abwesend) ? null : h('span', { class: 'row', style: 'gap:6px' }, h('span', { class: 'lbl' }, 'Identität'),
        seg(IDNACHWEIS, b.idnachweis, val => { b.idnachweis = val; re(); }, L || !b.anwesend, 'Identitätsnachweis')),
      b.rolle === 'Vertreter' ? h('span', { class: 'row', style: 'gap:6px' }, h('span', { class: 'lbl' }, 'Vollmacht'),
        seg(VOLLMACHT, b.vollmacht, val => { b.vollmacht = val; re(); }, L, 'Vollmacht'), vollmachtFoto(b, `${b.name}${b.vertritt ? ` für ${b.vertritt}` : ''}`, re, L)) : null,
      h('span', { style: 'flex:1' }),
      h('button', { class: 'btn small ghost', type: 'button', disabled: L, 'aria-expanded': String(editing), onclick: () => { app.editing = editing ? null : b.id; re(); } }, icon('pen'), editing ? 'Fertig' : 'Bearbeiten')),
    isOwner && b.vertreten ? h('div', { class: 'vertreter' },
      h('div', { class: 'field' }, h('label', {}, 'Vertreten durch'), vName),
      h('div', { class: 'row', style: 'gap:6px' }, h('span', { class: 'lbl' }, 'Identität'),
        seg(IDNACHWEIS, b.vertreter.idnachweis, val => { b.vertreter.idnachweis = val; re(); }, L, 'Identitätsnachweis des Vertreters')),
      h('div', { class: 'row', style: 'gap:6px' }, h('span', { class: 'lbl' }, 'Vollmacht'),
        seg(VOLLMACHT, b.vertreter.vollmacht, val => { b.vertreter.vollmacht = val; re(); }, L, 'Art der Vollmacht')),
      vollmachtFoto(b.vertreter, `${b.name}, vertreten durch ${b.vertreter.name || '…'}`, re, L)) : null,
    editing ? h('div', { class: 'stack' },
      h('div', { class: 'edit' },
        field('Name', b.name, val => { b.name = val; touch(); }),
        field('Anschrift', b.anschrift, val => { b.anschrift = val; touch(); }),
        field('EZ', b.ez, val => { b.ez = val; touch(); }),
        field('Gst.Nr.', b.gst, val => { b.gst = val; touch(); }),
        field('Eingeladen um', b.einladung || '', val => { b.einladung = val; touch(); }, { type: 'time' }),
        isOwner && !b.lokal ? null : h('div', { class: 'field' }, h('label', {}, 'Rolle'),
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
      h('div', {}, h('h2', {}, 'Vorgehaltene GFN'), h('p', { class: 'muted' }, 'Anhaken, was den Eigentümern gezeigt wurde. Steht so im Protokoll.')),
      h('span', { class: 'pill ' + (n ? 'good' : '') }, `${n} von ${v.behelfe.length} vorgehalten`)),
    !L && !isOpened() ? h('p', { class: 'muted', style: 'margin:0 0 8px;font-size:.88rem' }, 'Abhaken erst nach der Eröffnung. Ansehen geht schon vorher.') : null,
    v.behelfe.length ? h('ul', { class: 'gfn-list' }, v.behelfe.map(b => h('li', {},
      h('label', { class: 'check' },
        h('input', { type: 'checkbox', checked: b.vorgehalten, disabled: L || !isOpened(), onchange: e => {
          b.vorgehalten = e.target.checked; logEvent(`Behelf ${b.gz} ${b.vorgehalten ? 'vorgehalten' : 'nicht vorgehalten'}`); touch(); rerender();
        } }),
        h('span', {}, h('strong', { class: 'mono' }, b.gz || 'ohne GZ'), h('span', { class: 'muted' }, ` · ${b.planverfasser || 'Planverfasser unbekannt'}${b.anmerkung ? ' · ' + b.anmerkung : ''}`))),
      b.pdf ? h('button', { class: 'btn small', type: 'button', onclick: () => Viewer.open({ blob: b.pdf, title: `Behelf ${b.gz} · ${b.planverfasser}` }) }, icon('zoom'), 'Ansehen')
        : h('span', { class: 'muted', style: 'font-size:.85rem' }, 'ohne PDF'))))
      : h('p', { class: 'muted' }, 'Keine Behelfe im Verhandlungspaket.'),
    L ? null : h('div', { style: 'margin-top:10px' },
      h('button', { class: 'btn small ghost', type: 'button', onclick: e => e.currentTarget.nextElementSibling.click() }, icon('plus'), 'GFN-Plan ergänzen (PDF)'),
      h('input', { type: 'file', accept: 'application/pdf', hidden: true, onchange: e => {
        const f = e.target.files[0]; if (!f) return;
        v.behelfe.push({ id: uid(), planverfasser: '', gz: f.name.replace(/\.pdf$/i, ''), anmerkung: 'vor Ort ergänzt', vorgehalten: isOpened(), pdf: f });
        logEvent(`Behelf ${f.name} ergänzt`); touch(true); rerender();
      } })));
}
/* Eröffnungstext wie im Protokoll (Seite 1): steht auch in der Eröffnungskarte */
function eroeffnungsText(v) {
  const ortKurz = (v.meta.ort || '').split(',')[0].trim();
  return [`Die Verhandlung über den Grenzverlauf wird am ${deDate(v.meta.datum) || '……………'} um ${v.meta.eroeffnung || '. . . . . . . .'} Uhr in ${ortKurz || '…'} eröffnet. Der Verhandlungsleiter überzeugt sich von der Persönlichkeit der anwesenden Personen und prüft die Vertretungsbefugnis.`,
    'Der Verhandlungsleiter legt den Gegenstand der Grenzverhandlung dar, der die Festlegung der Grenzen der in der Beschreibung des Grenzverlaufs näher bezeichneten Grundstücke betrifft und hält folgende Behelfe vor:'];
}
VIEWS.eroeffnung = page => {
  const v = app.cur, L = isLocked();
  const m = v.meta;
  const anw = v.beteiligte.filter(present).length;
  const open = () => {
    m.eroeffnung = nowTime();
    if (v.status === 'vorbereitet') v.status = 'laufend';
    logEvent(`Verhandlung eröffnet um ${m.eroeffnung} Uhr`); touch(true); rerender();
  };
  const timeInput = h('input', { id: 'f-eroeffnung', type: 'time', value: m.eroeffnung, disabled: L, oninput: e => { m.eroeffnung = e.target.value; touch(); } });
  put(page,
    lockedBanner(),
    h('div', { class: 'card opener' },
      h('div', { class: 'opener-info' },
        h('span', { class: 'eyebrow' }, 'Grenzverhandlung'),
        h('div', { class: 'gzbig' }, `GZ ${v.gz}`),
        m.gegenstand ? h('p', { style: 'font-weight:600' }, m.gegenstand) : null,
        h('p', { class: 'muted' }, [m.kg && `KG ${m.kg}`, m.ort, deDate(m.datum), m.leiter].filter(Boolean).join(' · '))),
      h('div', { class: 'opener-action' },
        m.eroeffnung
          ? h('div', { class: 'opened' }, icon('check'), h('div', {}, h('strong', {}, `Eröffnet um ${m.eroeffnung} Uhr`), h('span', { class: 'muted' }, `${anw} von ${v.beteiligte.length} anwesend`)))
          : h('button', { class: 'btn primary big', type: 'button', disabled: L, onclick: open }, icon('clock'), 'Verhandlung eröffnen')),
      eroeffnungKarte(v)),
    h('details', { class: 'card flat kopf' },
      h('summary', {}, 'Kopfdaten ändern'),
      h('div', { class: 'form-grid', style: 'margin-top:14px' },
        field('Vermessungsamt', m.vermessungsamt, val => { m.vermessungsamt = val; touch(); }, { disabled: L }),
        field('Katastralgemeinde', m.kg, val => { m.kg = val; touch(); }, { disabled: L }),
        field('Ort der Verhandlung', m.ort, val => { m.ort = val; touch(); }, { disabled: L }),
        field('Datum', m.datum, val => { m.datum = val; touch(); }, { type: 'date', disabled: L }),
        h('div', { class: 'field' }, h('label', { for: 'f-eroeffnung' }, 'Eröffnung (Uhrzeit)'), timeInput),
        field('Verhandlungsleiter', m.leiter, val => { m.leiter = val; touch(); }, { disabled: L }))),
    behelfeVorhalten(),
    h('div', { class: 'page-head' },
      h('div', {}, h('h2', {}, 'Anwesende'),
        h('p', { class: 'lead' }, (isOpened() ? '' : 'Geht schon vor der Eröffnung. ') + 'Bei jedem Eigentümer „Anwesend“, „Vertreten“ oder „Abwesend“ antippen und die Identität wählen: P persönlich bekannt, A allgemein bekannt, L Lichtbildausweis.')),
      h('button', { class: 'btn', type: 'button', disabled: L, onclick: () => {
        const b = newPerson({ rolle: 'Anwesend (sonstige)' }); b.anwesend = true; b.lokal = true; v.beteiligte.push(b); app.editing = b.id; touch(); rerender();
      } }, icon('plus'), 'Person')),
    einladungFehlt(),
    h('div', { class: 'grid2' }, v.beteiligte.map(personCard)));
};

function eroeffnungKarte(v) {
  const [a, b] = eroeffnungsText(v), gfn = v.behelfe.filter(x => x.vorgehalten);
  return h('div', { class: 'opener-text' },
    h('p', {}, a),
    h('p', {}, b),
    h('p', { class: 'muted' }, gfn.length ? gfn.map(x => `${x.gz}${x.planverfasser ? ` (${x.planverfasser})` : ''}`).join(' · ') : 'Behelfe unten anhaken, sobald sie vorgehalten wurden.'));
}
/* Personen ohne Einladungszeit: eine Zeit für alle setzen (z. B. wenn das Paket keine Zeiten enthielt) */
function einladungFehlt() {
  const v = app.cur, ohne = v.beteiligte.filter(b => !b.einladung && b.rolle !== 'Anwesend (sonstige)');
  if (isLocked() || !ohne.length) return null;
  const t = h('input', { type: 'time', 'aria-label': 'Uhrzeit laut Einladung', style: 'width:130px' });
  return h('div', { class: 'card flat row invite-all' },
    icon('clock'), h('span', {}, `${ohne.length === v.beteiligte.length ? 'Keine Einladungszeiten im Paket.' : `${ohne.length} ohne Einladungszeit.`} Uhrzeit laut Einladung:`), t,
    h('button', { class: 'btn small', type: 'button', onclick: () => {
      if (!t.value) { toast('Bitte zuerst eine Uhrzeit wählen.'); return; }
      ohne.forEach(b => { b.einladung = t.value; }); touch(); rerender(); toast(`Einladung ${t.value} Uhr bei ${ohne.length} Person${ohne.length === 1 ? '' : 'en'} eingetragen`);
    } }, 'Für alle ohne Zeit setzen'),
    v.unterlagen.some(u => /ladung/i.test(`${u.titel} ${u.datei}`)) ? h('button', { class: 'btn small ghost', type: 'button', onclick: async e => {
      e.currentTarget.disabled = true;
      const n = await einladungenLesen(v).catch(() => 0);
      if (n) { logEvent(`Einladungszeiten aus der Einladung gelesen (${n})`); touch(true); rerender(); toast(`${n} Einladungszeit${n === 1 ? '' : 'en'} aus der Einladung übernommen`); }
      else { toast('In der Einladung wurde keine passende Uhrzeit gefunden (gescannt oder Namen anders geschrieben?).'); e.target.disabled = false; }
    } }, icon('pdf'), 'Aus der Einladung lesen') : null,
    h('span', { class: 'muted', style: 'font-size:.85rem' }, 'Einzelne Zeiten unter „Bearbeiten“.'));
}

/* ---------- Unterlagen (Angebot, Einladungen …) ---------- */
function openDocs() {
  const v = app.cur; if (!v) return;
  closeDocs();
  const listEl = h('div', { class: 'docs-list' });
  const fill = () => {
    listEl.replaceChildren();
    if (!v.unterlagen.length) put(listEl, h('p', { class: 'muted', style: 'padding:8px 4px' }, 'Keine Unterlagen im Verhandlungspaket. Die Kanzlei legt sie im Ordner „unterlagen“ des Pakets ab.'));
    for (const u of v.unterlagen) {
      put(listEl, h('div', { class: 'doc-row' },
        h('button', { class: 'doc-open', type: 'button', onclick: () => Viewer.open({ blob: u.pdf, title: u.titel }) },
          h('span', { class: 'doc-ico' }, icon('pdf')),
          h('span', { class: 'doc-txt' }, h('b', {}, u.titel), h('small', { class: 'muted' }, u.lokal ? 'vor Ort ergänzt' : (u.datei || 'aus dem Verhandlungspaket')))),
        u.lokal ? h('button', { class: 'icon-btn', type: 'button', title: 'Entfernen', 'aria-label': `${u.titel} entfernen`, onclick: () => {
          v.unterlagen = v.unterlagen.filter(x => x !== u); logEvent(`Unterlage ${u.titel} entfernt`); touch(true); fill();
        } }, icon('trash')) : null));
    }
  };
  const add = h('input', { type: 'file', accept: 'application/pdf', multiple: true, hidden: true, onchange: e => {
    for (const f of e.target.files) { v.unterlagen.push({ id: uid(), titel: titleFromFile(f.name), datei: f.name, pdf: f, lokal: true }); logEvent(`Unterlage ${f.name} ergänzt`); }
    touch(true); fill(); e.target.value = '';
  } });
  fill();
  const sheet = h('div', { class: 'docs-sheet', id: 'docs', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Unterlagen' },
    h('div', { class: 'docs-backdrop', onclick: closeDocs }),
    h('div', { class: 'docs-panel' },
      h('div', { class: 'docs-head' },
        h('div', {}, h('h2', {}, 'Unterlagen'), h('p', { class: 'muted' }, `GZ ${v.gz} · nur zum Ansehen, nicht Teil des Protokolls`)),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Schließen', onclick: closeDocs }, '✕')),
      h('h3', { class: 'docs-sec' }, `Zu dieser GZ`),
      listEl,
      h('div', { class: 'docs-foot' },
        h('button', { class: 'btn small ghost', type: 'button', onclick: () => add.click() }, icon('plus'), 'PDF vom Gerät hinzufügen'), add),
      h('h3', { class: 'docs-sec' }, 'Allgemein'),
      h('details', { class: 'docs-folder' },
        h('summary', { class: 'doc-open' }, h('span', { class: 'doc-ico' }, icon('folder')),
          h('span', { class: 'doc-txt' }, h('b', {}, 'Rechtsgrundlagen'), h('small', { class: 'muted' }, 'VermG, VermV 2016, StROG 2010, Forstgesetz 1975 · RIS, geltende Fassung, braucht Internet'))),
        h('div', { class: 'docs-links' },
          RECHT.map(([t, sub, url]) => h('a', { class: 'doc-open', href: url, target: '_blank', rel: 'noopener' },
            h('span', { class: 'doc-ico' }, icon('docs')), h('span', { class: 'doc-txt' }, h('b', {}, t), h('small', { class: 'muted' }, sub)))))),
      h('div', { class: 'docs-links' },
        h('span', { class: 'lbl' }, 'Kataster und Karten (brauchen Internet)'),
        KARTEN.map(([t, sub, url]) => h('a', { class: 'doc-open', href: url, target: '_blank', rel: 'noopener' },
          h('span', { class: 'doc-ico' }, icon('map')), h('span', { class: 'doc-txt' }, h('b', {}, t), h('small', { class: 'muted' }, sub)))))));
  document.body.append(sheet);
  sheet.querySelector('.docs-panel button').focus();
}
function closeDocs() { const d = $('#docs'); if (d) d.remove(); }
const RIS = (abfrage, nr) => `https://www.ris.bka.gv.at/GeltendeFassung.wxe?Abfrage=${abfrage}&Gesetzesnummer=${nr}`;
const RECHT = [
  ['Vermessungsgesetz (VermG)', 'u. a. § 43 Abs. 6 Zustimmung zum Grenzverlauf', RIS('Bundesnormen', '10011400')],
  ['Vermessungsverordnung 2016 (VermV)', 'u. a. § 13 Inhalt des Protokolls', RIS('Bundesnormen', '20009675')],
  ['Stmk. Raumordnungsgesetz 2010 (StROG)', 'Landesrecht Steiermark', RIS('LrStmk', '20000069')],
  ['Forstgesetz 1975', 'Bundesrecht', RIS('Bundesnormen', '10010371')],
];
const KARTEN = [
  ['Kataster BEV', 'kataster.bev.gv.at · aktueller Kataster mit Orthofoto', 'https://kataster.bev.gv.at/#/center/13.35,47.77/zoom/7.2/ortho/1/vermv/0.6'],
  ['GIS Steiermark', 'gis.stmk.gv.at · Basiskarten, Kataster', 'https://gis.stmk.gv.at/wgportal/atlasmobile/map/Basiskarten/Kataster'],
];

/* ---------- Fotos (nicht Teil des Protokolls) ---------- */
async function shrinkPhoto(file, max = 2400) {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    return await new Promise(r => c.toBlob(b => r(b || file), 'image/jpeg', 0.85));
  } catch { return file; }
}
function openFotos() {
  const v = app.cur; if (!v) return;
  closeDocs();
  const urls = [];
  const grid = h('div', { class: 'foto-grid' });
  const fill = () => {
    urls.splice(0).forEach(u => URL.revokeObjectURL(u));
    grid.replaceChildren();
    if (!v.fotos.length) put(grid, h('p', { class: 'muted', style: 'grid-column:1/-1;padding:8px 4px' }, 'Noch keine Fotos. Fotos gehen beim Export ins Büro mit, sind aber nicht Teil des Protokolls.'));
    v.fotos.forEach((f, i) => {
      const u = URL.createObjectURL(f.blob); urls.push(u);
      put(grid, h('figure', { class: 'foto' },
        h('button', { class: 'foto-img', type: 'button', 'aria-label': `Foto ${i + 1} groß ansehen`, onclick: () => lightbox(u) }, h('img', { src: u, alt: f.notiz || `Foto ${i + 1}` })),
        h('figcaption', {},
          h('span', { class: 'muted foto-nr' }, `Foto ${i + 1} · ${timeOf(f.zeit)} Uhr`),
          v.skizze.pdf ? h('button', { class: 'btn small foto-act' + (f.pos ? ' verortet' : ''), type: 'button', title: 'Standort und Blickrichtung in der Skizze festlegen (nur für den Fotoplan, nicht im Protokoll)', onclick: () => verorten(f) },
            icon('map'), f.pos ? `Verortet: Blatt ${f.pos.page}${f.pos.dir === null ? ', ohne Richtung' : ''}` : 'In Skizze verorten') : null,
          h('input', { type: 'text', value: f.notiz || '', placeholder: 'Notiz, z. B. Grenzstein GP 12', 'aria-label': `Notiz zu Foto ${i + 1}`, oninput: e => { f.notiz = e.target.value; touch(); } }),
          h('button', { class: 'btn small ghost foto-act foto-del', type: 'button', 'aria-label': `Foto ${i + 1} löschen`, onclick: () => {
            if (!confirm(`Foto ${i + 1} löschen?`)) return;
            v.fotos.splice(i, 1); logEvent(`Foto ${i + 1} gelöscht`); touch(true); fill();
          } }, icon('trash'), 'Löschen'))));
    });
  };
  const takePhotos = async e => {
    const files = [...e.target.files]; e.target.value = '';
    for (const file of files) { v.fotos.push({ id: uid(), blob: await shrinkPhoto(file), zeit: Date.now(), notiz: '' }); }
    if (files.length) { logEvent(`${files.length} Foto${files.length === 1 ? '' : 's'} aufgenommen`); touch(true); fill(); grid.lastElementChild?.scrollIntoView({ block: 'nearest' }); }
  };
  const cam = h('input', { type: 'file', accept: 'image/*', capture: 'environment', hidden: true, onchange: takePhotos });
  const gal = h('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true, onchange: takePhotos });
  fill();
  const close = () => { urls.forEach(u => URL.revokeObjectURL(u)); closeDocs(); };
  const sheet = h('div', { class: 'docs-sheet', id: 'docs', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Fotos' },
    h('div', { class: 'docs-backdrop', onclick: close }),
    h('div', { class: 'docs-panel wide' },
      h('div', { class: 'docs-head' },
        h('div', {}, h('h2', {}, 'Fotos'), h('p', { class: 'muted' }, `GZ ${v.gz} · gehen mit dem Export ins Büro, nicht ins Protokoll`)),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Schließen', onclick: close }, '✕')),
      h('div', { class: 'row' },
        h('button', { class: 'btn primary big', type: 'button', onclick: () => cam.click() }, icon('camera'), 'Foto aufnehmen'), cam,
        h('button', { class: 'btn small ghost', type: 'button', onclick: () => gal.click() }, 'Aus Galerie'), gal,
        h('span', { style: 'flex:1' }),
        h('button', { class: 'btn small', type: 'button', disabled: !v.fotos.some(f => f.pos), title: 'Skizze mit Standorten und Blickrichtungen, dahinter die Fotos. Geht mit dem Export ins Büro.', onclick: async e => {
          const bt = e.currentTarget; bt.disabled = true;
          try { const pdf = await buildFotoplan(v); close(); Viewer.open({ blob: new Blob([pdf], { type: 'application/pdf' }), title: `Fotoplan · GZ ${v.gz}`, onClose: () => openFotos() }); }
          catch (err) { toast('Fotoplan fehlgeschlagen: ' + err.message); bt.disabled = false; }
        } }, icon('pdf'), 'Fotoplan ansehen')),
      h('p', { class: 'muted', style: 'margin:0;font-size:.85rem' }, 'Verortete Fotos erscheinen mit Nummer und Blickrichtung im Fotoplan (Export), nicht im Protokoll.'),
      grid));
  document.body.append(sheet);
}
function lightbox(url) {
  const lb = h('div', { class: 'lightbox', role: 'dialog', 'aria-label': 'Foto', onclick: () => lb.remove() },
    h('img', { src: url, alt: '' }), h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Schließen' }, '✕'));
  document.body.append(lb);
}

/* ---------- 3 Begehungsskizze ---------- */
function openSketch() {
  const v = app.cur;
  Viewer.open({ blob: v.skizze.pdf, title: `Begehungsskizze · GZ ${v.gz}`, ink: v.skizze, editable: !isLocked(), onChange: () => touch(), onClose: () => rerender() });
}
/* Foto in der Skizze verorten (geht auch nach dem Sperren: der Fotoplan ist nicht Teil des Protokolls) */
function verorten(f) {
  const v = app.cur, nr = v.fotos.indexOf(f) + 1;
  closeDocs();
  Viewer.open({ blob: v.skizze.pdf, title: `Foto ${nr} in der Skizze verorten`, ink: v.skizze, editable: false, place: { nr, onSet: pos => { f.pos = pos; touch(); } },
    startPage: f.pos ? f.pos.page : 1, fotoMarks: fotoMarks(v), onClose: () => { if (f.pos) logEvent(`Foto ${nr} in der Skizze verortet`); touch(true); openFotos(); } });
}
VIEWS.skizze = page => {
  const v = app.cur, L = isLocked();
  const up = h('input', { type: 'file', accept: 'application/pdf', hidden: true, onchange: async e => {
    const f = e.target.files[0]; if (!f) return;
    v.skizze = { pdf: f, strokes: [], texts: [], symbols: [], rev: (v.skizze.rev || 0) + 1 };
    v.fotos.forEach(x => { delete x.pos; });
    logEvent(`Begehungsskizze ersetzt (${f.name})`); touch(true); rerender();
  } });
  if (!v.skizze.pdf) {
    put(page, pageHead('Begehungsskizze'), h('div', { class: 'card stack' }, h('p', {}, 'Im Verhandlungspaket ist keine Begehungsskizze.'),
      h('div', {}, h('button', { class: 'btn primary', type: 'button', onclick: () => up.click() }, 'Skizze laden (PDF)'), up)));
    return;
  }
  const img = h('img', { alt: 'Begehungsskizze mit Ergänzungen' });
  thumbnail(sketchKey(v), v.skizze.pdf, 1400, v.skizze).then(u => { img.src = u; }).catch(() => {});
  const n = v.skizze.strokes.length;
  put(page,
    lockedBanner(),
    pageHead('Begehungsskizze', L ? 'Die Skizze ist gesperrt.' : 'Plan antippen und direkt darauf zeichnen. Rot für Neues, Schwarz für Bestand.'),
    h('button', { class: 'sketch-preview', type: 'button', 'aria-label': L ? 'Skizze ansehen' : 'Skizze zum Zeichnen öffnen', onclick: openSketch }, img,
      h('span', { class: 'sketch-cta' }, icon('pen'), L ? 'Ansehen' : 'Tippen zum Zeichnen')),
    h('div', { class: 'row', style: 'justify-content:space-between' },
      h('span', { class: 'muted' }, n ? `${n} Ergänzung${n === 1 ? '' : 'en'} eingezeichnet` : 'Noch nichts eingezeichnet'),
      L ? null : h('span', {}, h('button', { class: 'btn small ghost', type: 'button', onclick: () => up.click() }, 'Andere Skizze laden'), up)));
};

/* ---------- 4 Grenzverlauf ---------- */
const TB = [
  'Die Grenze verläuft entlang der Mauerflucht (Außenkante).',
  'Die Grenze verläuft in Zaunmitte.',
  'Die Grenze verläuft entlang der Gartenmauer, Mauer gehört zu Gst. …',
];
VIEWS.beschreibung = page => {
  const v = app.cur, L = isLocked();
  if (!v.beschreibung.gesehen) { v.beschreibung.gesehen = true; touch(); }
  const grow = el => { el.style.height = 'auto'; el.style.height = (el.scrollHeight + 4) + 'px'; };
  const ta = h('textarea', { id: 'f-beschr', disabled: L, style: 'min-height:200px;overflow:hidden', placeholder: 'z. B. Die Grenze zwischen .626 und .627 verläuft von GP 4321 bis GP 4325 in Zaunmitte.', oninput: e => { v.beschreibung.text = e.target.value; grow(e.target); touch(); } });
  ta.value = v.beschreibung.text;
  requestAnimationFrame(() => grow(ta));
  const ta2 = h('textarea', { id: 'f-strittig', disabled: L, style: 'min-height:90px', placeholder: 'leer lassen, wenn alle Abschnitte einvernehmlich festgelegt wurden', oninput: e => { v.beschreibung.strittig = e.target.value; touch(); } });
  ta2.value = v.beschreibung.strittig;
  put(page, 
    lockedBanner(),
    pageHead('Beschreibung des Grenzverlaufs', 'Der Text steht genau so im Protokoll (Seite 2). Eine Leerzeile beginnt einen neuen Absatz. Strittige Abschnitte unten eintragen.'),
    h('div', { class: 'card stack' },
      h('div', { class: 'field' }, h('label', { for: 'f-beschr' }, 'Beschreibung des Grenzverlaufs'), ta),
      L ? null : h('div', {}, h('button', { class: 'btn small ghost', type: 'button', onclick: () => { v.beschreibung.text = BESCHREIBUNG_VORLAGE; ta.value = v.beschreibung.text; grow(ta); touch(); toast('Text der Vorlage wiederhergestellt'); } }, 'Text der Vorlage wiederherstellen')),
      h('div', { class: 'stack', style: 'gap:8px' }, h('span', { class: 'lbl' }, 'Textbausteine antippen zum Einfügen'),
        h('div', { class: 'row' }, TB.map(t => h('button', { class: 'btn small', type: 'button', disabled: L, title: t, onclick: () => {
          if ((v.beschreibung.text || '').includes(t)) { toast('Dieser Textbaustein steht schon in der Beschreibung.'); return; }
          v.beschreibung.text = (v.beschreibung.text ? v.beschreibung.text.trimEnd() + '\n' : '') + t; ta.value = v.beschreibung.text; grow(ta); touch();
        } }, icon('plus'), t.length > 44 ? t.slice(0, 42) + '…' : t))))),
    h('div', { class: 'card stack' },
      h('div', { class: 'field' }, h('label', { for: 'f-strittig' }, 'Nicht einvernehmlich festgelegte Grenzabschnitte'), ta2),
      notice('info', 'info', h('span', {}, 'Strittige Abschnitte werden im Protokoll gesondert angeführt. Die übrigen Grenzen können trotzdem festgelegt werden.'))));
};

/* ---------- 5 Prüfen und sperren ---------- */
function pflichtpruefung(v) {
  const anw = v.beteiligte.filter(b => b.anwesend), vtr = owners(v).filter(b => b.vertreten && !b.anwesend);
  return [
    ['Kopfdaten vollständig (Vermessungsamt, KG, Ort, Datum)', !!(v.meta.vermessungsamt && v.meta.kg && v.meta.ort && v.meta.datum), 'eroeffnung'],
    ['Eröffnungszeit erfasst', !!v.meta.eroeffnung, 'eroeffnung'],
    ['Verhandlungsleiter eingetragen', !!v.meta.leiter, 'eroeffnung'],
    ['Mindestens eine anwesende oder vertretene Person', anw.length > 0 || vtr.length > 0, 'eroeffnung'],
    ['Bei allen Eigentümern Anwesend, Vertreten oder Abwesend gewählt', owners(v).every(b => b.anwesend || b.vertreten || b.abwesend), 'eroeffnung'],
    ['Name, Identität und Vollmacht bei allen Vertretern', vtr.every(b => b.vertreter.name.trim() && b.vertreter.idnachweis && b.vertreter.vollmacht), 'eroeffnung'],
    ['Identitätsnachweis bei allen Anwesenden', anw.length > 0 && anw.every(b => b.idnachweis), 'eroeffnung'],
    ['Vollmacht bei allen anwesenden Vertretern', anw.filter(b => b.rolle === 'Vertreter').every(b => b.vollmacht), 'eroeffnung'],
    ['Eigentümer im Verzeichnis', owners(v).length > 0, 'eroeffnung'],
    ['Mindestens ein Behelf vorgehalten', v.behelfe.some(b => b.vorgehalten), 'eroeffnung'],
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
  put(page, pageHead('Abschluss', 'Schlusszeit erfassen und Protokoll sperren. Danach unterschreiben alle denselben Inhalt.'));
  if (L) {
    put(page, h('div', { class: 'card stack' },
      notice('good', 'check', h('strong', {}, `Version ${v.version} gesperrt am ${deDateTime(v.locked.zeit)}`),
        h('span', {}, 'Jede Änderung am Inhalt würde die Prüfsumme ändern.')),
      h('div', {}, h('span', { class: 'lbl' }, 'Prüfsumme SHA-256 des gesperrten Protokolls'), h('p', { class: 'hash' }, v.locked.hash)),
      h('div', { class: 'row' },
        h('button', { class: 'btn', type: 'button', onclick: () => Viewer.open({ blob: v.locked.pdf, title: `Protokoll Version ${v.version} (gesperrt)` }) }, icon('pdf'), 'Gesperrtes Protokoll ansehen'),
        confirmButton('Neue Version anlegen', 'Bisherige Signaturen am Gesamtprotokoll verfallen. Entsperren?', false, async () => {
          v.version += 1; v.locked = null; v.signed = null; v.leiterSig = null; v.status = 'laufend';
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
          h('button', { class: 'btn', type: 'button', onclick: () => { v.meta.schluss = nowTime(); logEvent(`Verhandlung geschlossen um ${v.meta.schluss} Uhr`); touch(true); rerender(); } }, 'Jetzt'))),
      h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: sigSeite(v), onchange: e => { v.meta.sigSeite = e.target.checked; touch(); } }),
        h('span', {}, h('strong', {}, 'Signaturseite für ID Austria anfügen'), h('span', { class: 'muted' }, ' · ein nummeriertes Feld je Eigentümer und für den Verhandlungsleiter')))),
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
        v.signed = null; v.leiterSig = null;
        updateStatus();
        logEvent(`Protokoll Version ${v.version} gesperrt, SHA-256 ${hash.slice(0, 16)}…`);
        await touch(true);
        toast('Protokoll gesperrt');
        setView('zustimmung');
      })));
};

/* ---------- Signaturprüfung (offline) ----------
   Liest jede Signatur im PDF (PAdES/CMS): Unterzeichner aus dem Zertifikat, Zeitpunkt, ob der signierte Inhalt
   unverändert ist (Hash über /ByteRange = messageDigest) und ob die Signatur mathematisch zum Zertifikat passt.
   Nicht geprüft wird, ob das Zertifikat vertrauenswürdig und nicht widerrufen ist: das braucht eine Online-Prüfung
   (z. B. RTR-Signaturprüfung) und passiert im Büro. */
const OID = {
  sha256: '2.16.840.1.101.3.4.2.1', sha384: '2.16.840.1.101.3.4.2.2', sha512: '2.16.840.1.101.3.4.2.3',
  rsa: '1.2.840.113549.1.1.1', rsaSha256: '1.2.840.113549.1.1.11', rsaSha384: '1.2.840.113549.1.1.12', rsaSha512: '1.2.840.113549.1.1.13',
  ecPub: '1.2.840.10045.2.1', ecdsaSha256: '1.2.840.10045.4.3.2', ecdsaSha384: '1.2.840.10045.4.3.3', ecdsaSha512: '1.2.840.10045.4.3.4',
  p256: '1.2.840.10045.3.1.7', p384: '1.3.132.0.34', p521: '1.3.132.0.35',
  cn: '2.5.4.3', sn: '2.5.4.4', gn: '2.5.4.42', o: '2.5.4.10',
  messageDigest: '1.2.840.113549.1.9.4', signingTime: '1.2.840.113549.1.9.5',
};
function derRead(b, p = 0) {
  const tag = b[p]; let len = b[p + 1], hl = 2;
  if (len & 0x80) { const n = len & 0x7f; len = 0; for (let i = 0; i < n; i++) len = len * 256 + b[p + 2 + i]; hl = 2 + n; }
  const node = { tag, start: p, hs: p + hl, end: p + hl + len, b };
  if (tag & 0x20) { node.kids = []; let q = node.hs; while (q < node.end) { const k = derRead(b, q); node.kids.push(k); q = k.end; } }
  return node;
}
const derBytes = n => n.b.subarray(n.start, n.end);
const derVal = n => n.b.subarray(n.hs, n.end);
function derOid(n) {
  const v = derVal(n), out = [Math.floor(v[0] / 40), v[0] % 40]; let x = 0;
  for (let i = 1; i < v.length; i++) { x = x * 128 + (v[i] & 0x7f); if (!(v[i] & 0x80)) { out.push(x); x = 0; } }
  return out.join('.');
}
const derStr = n => new TextDecoder(n.tag === 0x1e ? 'utf-16be' : 'utf-8').decode(derVal(n));
function derTime(n) {
  const s = new TextDecoder().decode(derVal(n));
  const m = n.tag === 0x17 ? s.match(/^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?/) : s.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?/);
  if (!m) return null;
  const yr = n.tag === 0x17 ? (+m[1] < 50 ? 2000 + +m[1] : 1900 + +m[1]) : +m[1];
  return Date.UTC(yr, +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
}
function nameAttrs(name) {
  const out = {};
  for (const rdn of name.kids || []) for (const atv of rdn.kids || []) out[derOid(atv.kids[0])] = derStr(atv.kids[1]);
  return out;
}
function ecdsaRaw(sigDer, size) {
  const s = derRead(sigDer), out = new Uint8Array(size * 2);
  s.kids.forEach((k, i) => { let v = derVal(k); while (v.length > size && v[0] === 0) v = v.subarray(1); out.set(v, i * size + size - v.length); });
  return out;
}
const hashName = oid => ({ [OID.sha256]: 'SHA-256', [OID.sha384]: 'SHA-384', [OID.sha512]: 'SHA-512' })[oid];
const bytesEq = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

async function pruefeSignaturen(bytes) {
  const txt = new TextDecoder('latin1').decode(bytes), res = [];
  const re = /\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/g; let m;
  while ((m = re.exec(txt))) {
    const [a, b, c, d] = m.slice(1).map(Number);
    const r = { bis: c + d, ganzeDatei: c + d === bytes.length && a === 0, name: '', zeit: null, inhaltOk: false, signaturOk: null, fehler: '' };
    try {
      const hex = txt.slice(a + b, c).replace(/[<>\s]/g, '');
      const cms = new Uint8Array(hex.length / 2); for (let i = 0; i < cms.length; i++) cms[i] = parseInt(hex.substr(i * 2, 2), 16);
      const ci = derRead(cms), sd = ci.kids[1].kids[0];
      const certsNode = sd.kids.find(k => k.tag === 0xa0), si = sd.kids[sd.kids.length - 1].kids[0];
      const sid = si.kids[1], digestAlg = derOid(si.kids[2].kids[0]);
      let i = 3, attrs = null; if (si.kids[i].tag === 0xa0) attrs = si.kids[i++];
      const sigAlg = derOid(si.kids[i].kids[0]), sigVal = derVal(si.kids[i + 1]);
      // Zertifikat des Unterzeichners (über die Seriennummer)
      const certs = (certsNode ? certsNode.kids : []).filter(k => k.tag === 0x30);
      const serialOf = c => { const t = c.kids[0], o = t.kids[0].tag === 0xa0 ? 1 : 0; return derVal(t.kids[o]); };
      const sidSerial = sid.tag === 0x30 ? derVal(sid.kids[1]) : null;
      const cert = certs.find(c => sidSerial && bytesEq(serialOf(c), sidSerial)) || certs[0];
      if (cert) {
        const t = cert.kids[0], o = t.kids[0].tag === 0xa0 ? 1 : 0, subj = nameAttrs(t.kids[o + 4]);
        r.name = subj[OID.cn] || [subj[OID.gn], subj[OID.sn]].filter(Boolean).join(' ');
        r.aussteller = nameAttrs(t.kids[o + 2])[OID.cn] || '';
        r.gueltigBis = derTime(t.kids[o + 3].kids[1]);
        r.spki = derBytes(t.kids[o + 5]);
      }
      // Zeitpunkt: signingTime oder /M im Signaturwörterbuch
      let md = null;
      for (const at of attrs ? attrs.kids : []) {
        const oid = derOid(at.kids[0]);
        if (oid === OID.messageDigest) md = derVal(at.kids[1].kids[0]);
        if (oid === OID.signingTime) r.zeit = derTime(at.kids[1].kids[0]);
      }
      if (!r.zeit) {
        const win = txt.slice(Math.max(0, m.index - 1500), Math.min(txt.length, m.index + 300));
        const mm = win.match(/\/M\s*\(D:(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})([Z+-])?(\d{2})?'?(\d{2})?/);
        if (mm) r.zeit = Date.UTC(+mm[1], +mm[2] - 1, +mm[3], +mm[4], +mm[5], +mm[6]) - (mm[7] === '+' ? 1 : mm[7] === '-' ? -1 : 0) * ((+mm[8] || 0) * 60 + (+mm[9] || 0)) * 60e3;
      }
      // Inhalt unverändert: Hash über die signierten Bereiche
      const data = new Uint8Array(b + d); data.set(bytes.subarray(a, a + b)); data.set(bytes.subarray(c, c + d), b);
      const hn = hashName(digestAlg);
      if (!hn) throw new Error('Hash-Verfahren nicht unterstützt');
      const h = new Uint8Array(await crypto.subtle.digest(hn, data));
      r.inhaltOk = md ? bytesEq(h, md) : false;
      // Signatur mathematisch prüfen (über die signierten Attribute)
      if (attrs && r.spki) {
        const signed = derBytes(attrs).slice(); signed[0] = 0x31;
        const spki = derRead(r.spki), keyAlg = derOid(spki.kids[0].kids[0]);
        if (keyAlg === OID.ecPub) {
          const curve = { [OID.p256]: ['P-256', 32], [OID.p384]: ['P-384', 48], [OID.p521]: ['P-521', 66] }[derOid(spki.kids[0].kids[1])];
          const hs = { [OID.ecdsaSha256]: 'SHA-256', [OID.ecdsaSha384]: 'SHA-384', [OID.ecdsaSha512]: 'SHA-512' }[sigAlg] || hn;
          const key = await crypto.subtle.importKey('spki', r.spki, { name: 'ECDSA', namedCurve: curve[0] }, false, ['verify']);
          r.signaturOk = await crypto.subtle.verify({ name: 'ECDSA', hash: hs }, key, ecdsaRaw(sigVal, curve[1]), signed);
        } else if (keyAlg === OID.rsa && sigAlg !== '1.2.840.113549.1.1.10') {
          const hs = { [OID.rsaSha256]: 'SHA-256', [OID.rsaSha384]: 'SHA-384', [OID.rsaSha512]: 'SHA-512' }[sigAlg] || hn;
          const key = await crypto.subtle.importKey('spki', r.spki, { name: 'RSASSA-PKCS1-v1_5', hash: hs }, false, ['verify']);
          r.signaturOk = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, sigVal, signed);
        }
      }
      delete r.spki;
    } catch (e) { r.fehler = 'Signatur nicht lesbar: ' + e.message; }
    res.push(r);
  }
  return res;
}
/* Passt der Name im Zertifikat zum Namen in der App? (Titel und Reihenfolge egal) */
const namePasst = (zert, name) => { const a = nameTokens(zert), k = nameTokens(name); return a.length && k.length && k.every(t => a.includes(t)); };
const sigUrteil = s => s.fehler ? 'nicht lesbar' : !s.inhaltOk ? 'Inhalt verändert' : s.signaturOk === false ? 'Signatur ungültig' : s.signaturOk === null ? 'Inhalt unverändert (Signatur nicht prüfbar)' : 'gültig, Inhalt unverändert';

/* ---------- 6 Zustimmung ---------- */
/* Nummer des Signaturfelds (QR-Platzhalter) auf der Signaturseite: Eigentümer 1…n, Verhandlungsleiter n+1 */
const sigNr = (v, b) => b ? owners(v).indexOf(b) + 1 : owners(v).length + 1;
const sigSeite = v => v.meta.sigSeite !== false;
function currentPdf() { const v = app.cur; return v.signed ? v.signed.pdf : v.locked.pdf; }
function pdfFileName(v, suffix) { return `Protokoll_${safeName(v.gz)}_V${v.version}_${suffix}.pdf`; }
const personById = id => app.cur.beteiligte.find(x => x.id === id);
const hasStift = v => owners(v).some(b => b.stift && b.stift.png);
function updateStatus() {
  const v = app.cur;
  if (!v.locked) return;
  const ow = owners(v);
  v.status = v.leiterSig ? 'unterfertigt' : ow.length && ow.every(b => b.zustimmung.art !== 'offen') ? 'abgeschlossen' : 'gesperrt';
}
function countSignatures(bytes) {
  const s = new TextDecoder('latin1').decode(bytes);
  return (s.match(/\/ByteRange\s*\[/g) || []).length;
}
/* Fotos von Papier-Unterschriften: Vor der ersten QES werden sie als Beilage „Unterschriften auf Papier“ an das
   gesperrte Protokoll angehängt (neue Prüfsumme, im Verlauf vermerkt). Danach bleibt das PDF unverändert und die
   Fotos gehen als nachgereichte Unterschriften in eigenen Dateien mit dem Export ins Büro. */
const papierOffen = v => owners(v).filter(b => b.zustimmung.art === 'papier' && b.zustimmung.foto && !b.zustimmung.fotoImPdf);
async function papierInsPdf(v) {
  const neu = papierOffen(v);
  if (v.signed || !v.locked || !neu.length) return false;
  const doc = await PDFLib.PDFDocument.load(await blobBytes(v.locked.pdf));
  const F = await doc.embedFont(PDFLib.StandardFonts.Helvetica);
  for (const b of neu) await fotoBeilage(doc, F, b.zustimmung.foto, `Beilage zum Protokoll, Projekt ${v.gz}: Unterschriften auf Papier – ${b.name}${b.ez ? `, EZ ${b.ez}` : ''} (Foto vom ${deDateTime(b.zustimmung.fotoZeit || Date.now())})`);
  const bytes = await doc.save();
  const hash = await sha256Hex(bytes);
  v.locked = { ...v.locked, pdf: new Blob([bytes], { type: 'application/pdf' }), hash, beilagen: (v.locked.beilagen || 0) + neu.length };
  neu.forEach(b => { b.zustimmung.fotoImPdf = true; });
  logEvent(`Fotos der Papier-Unterschriften (${neu.map(b => b.name).join(', ')}) als Beilage angefügt, neue SHA-256 ${hash.slice(0, 16)}…`);
  await touch(true);
  return true;
}
async function papierFoto(b, file) {
  b.zustimmung.foto = await shrinkPhoto(file, 2400); b.zustimmung.fotoZeit = Date.now(); b.zustimmung.fotoImPdf = false;
  logEvent(`${b.name}: Foto der Unterschrift auf Papier${app.cur.signed ? ' (nachgereicht, eigene Datei im Export)' : ''}`);
  await touch(true); rerender();
}
async function startQes(pending) {
  try { await papierInsPdf(app.cur); } catch (e) { toast('Fotos der Papier-Unterschriften konnten nicht angefügt werden: ' + e.message); return; }
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
  const b = pd.leiter ? null : personById(pd.bid);
  const prev = await blobBytes(currentPdf());
  const sigs = countSignatures(bytes), prevSigs = countSignatures(prev);
  if (sigs <= prevSigs) throw new Error('Im PDF ist keine neue Signatur. Bitte das signierte PDF aus dem Signaturdienst wählen.');
  const pr = await pruefeSignaturen(bytes), neu = pr[pr.length - 1];
  if (!neu || neu.fehler || !neu.ganzeDatei || !neu.inhaltOk || neu.signaturOk === false)
    throw new Error(`Die neue Signatur ist nicht in Ordnung (${neu ? (neu.fehler || (!neu.ganzeDatei ? 'deckt nicht das ganze Dokument ab' : sigUrteil(neu))) : 'nicht gefunden'}). Bitte nochmals signieren.`);
  const erwartet = pd.leiter ? v.meta.leiter : (b.vertreten && !b.anwesend && b.vertreter.name ? b.vertreter.name : b.name);
  const sigInfo = { name: neu.name, zeit: neu.zeit, urteil: sigUrteil(neu), passt: namePasst(neu.name, erwartet), erwartet };
  // PAdES hängt Signaturen inkrementell an: das bisherige PDF bleibt Byte für Byte am Anfang erhalten.
  let unchanged = bytes.length > prev.length;
  for (let i = 0; unchanged && i < prev.length; i++) if (bytes[i] !== prev[i]) unchanged = false;
  v.signed = { pdf: new Blob([bytes], { type: 'application/pdf' }), zeit: Date.now(), sigCount: sigs, inkrementell: unchanged,
    pruefung: pr.map(x => ({ name: x.name, zeit: x.zeit, urteil: sigUrteil(x), aussteller: x.aussteller || '' })) };
  if (pd.leiter) v.leiterSig = { art: 'qes', zeit: Date.now(), sig: sigInfo }; else b.zustimmung = { art: 'qes', zeit: Date.now(), sig: sigInfo };
  if (!sigInfo.passt) logEvent(`Achtung: signiert hat „${neu.name}“, erwartet war „${erwartet}“`);
  logEvent(`${pd.leiter ? `Verhandlungsleiter ${v.meta.leiter}` : b.name}: QES übernommen (${sigs} Signatur(en) im PDF, ${unchanged ? 'Inhalt unverändert angehängt' : 'Datei neu geschrieben, Inhalt bitte prüfen'})`);
  app.pending = null;
  updateStatus();
  await touch(true);
  toast(!sigInfo.passt ? `Signatur übernommen, aber signiert hat „${neu.name}“ statt „${erwartet}“. Bitte prüfen.`
    : unchanged ? `Signatur von ${neu.name} geprüft: gültig, Inhalt unverändert` : 'Signatur übernommen. Achtung: Datei wurde neu geschrieben.');
  rerender();
}
function qesPanel() {
  const v = app.cur, pd = app.pending;
  if (!pd) return null;
  const b = pd.leiter ? { name: `${v.meta.leiter || 'Verhandlungsleiter'} (Verhandlungsleiter)` } : personById(pd.bid);
  if (!b) return null;
  return h('div', { class: 'card panel stack', id: 'qes-panel' },
    h('div', { class: 'card-head', style: 'margin:0' }, h('h2', {}, `Signatur von ${b.name}`), h('span', { class: 'pill brand' }, 'läuft')),
    h('ol', { class: 'steps-visual' },
      h('li', {}, h('strong', {}, 'PDF ist gespeichert'), h('span', { class: 'muted' }, 'Liegt in den Downloads des Tablets.'),
        h('button', { class: 'btn small', type: 'button', onclick: () => download(currentPdf(), pdfFileName(v, 'zur_Signatur')) }, 'Nochmals speichern')),
      h('li', {}, h('strong', {}, 'Signieren mit ID Austria'), h('span', { class: 'muted' }, sigSeite(v)
          ? `Im Signaturdienst das PDF wählen, als Position „QR-Platzhalter“ und die Nummer ${sigNr(v, pd.leiter ? null : personById(pd.bid))} eingeben. Die Person bestätigt am eigenen Smartphone.`
          : 'Im Signaturdienst das PDF wählen. Die Person bestätigt am eigenen Smartphone.'),
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
        h('p', { class: 'quer-tipp' }, 'Tipp: Gerät quer halten, dann ist mehr Platz zum Unterschreiben.'),
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
  b.stift = { png, zeit: Date.now() };
  thumbCache.delete('sig-' + b.id);
  logEvent(`${b.name}: Unterschrift mit dem Stift (nur Information)`);
  updateStatus(); await touch(true); rerender();
}
async function protocolWithSignatures(v) {
  return new Blob([await buildProtocol(v, { unterschriften: true })], { type: 'application/pdf' });
}

VIEWS.zustimmung = page => {
  const v = app.cur;
  put(page, pageHead('Zustimmung', 'Jeder Eigentümer stimmt dem gesperrten Protokoll zu. Zum Schluss unterfertigt der Verhandlungsleiter.'));
  if (!v.locked) {
    put(page, notice('', 'warn', h('strong', {}, 'Das Protokoll ist noch nicht gesperrt.'),
      h('span', {}, 'Zustimmen können die Eigentümer erst nach dem Sperren, damit alle denselben Inhalt unterschreiben.'),
      h('div', {}, h('button', { class: 'btn small', type: 'button', onclick: () => setView('abschluss') }, 'Zum Abschluss'))));
    return;
  }
  const ow = owners(v);
  const done = ow.filter(b => b.zustimmung.art !== 'offen').length;
  put(page,
    h('div', { class: 'card stack' },
      h('div', { class: 'card-head', style: 'margin:0' }, h('h2', {}, `${done} von ${ow.length} Eigentümern`),
        h('span', { class: 'pill ' + (done === ow.length ? 'good' : 'warn') }, done === ow.length ? 'vollständig' : 'offen')),
      h('div', { class: 'bar' }, h('span', { style: `width:${ow.length ? Math.round(done / ow.length * 100) : 0}%` })),
      h('p', { class: 'muted' }, 'Rechtsgültig zustimmen: mit ID Austria oder auf Papier. Die Stift-Unterschrift geht zusätzlich und kommt nur als Information in eine eigene Fassung des Protokolls.')),
    qesPanel(),
    h('div', { class: 'stack' }, ow.map(b => {
      const z = ZUST[b.zustimmung.art];
      const mark = async art => { b.zustimmung = { art, zeit: Date.now() }; logEvent(`${b.name}: ${ZUST[art].label}`); updateStatus(); await touch(true); rerender(); };
      let sigImg = null;
      if (b.stift && b.stift.png) {
        sigImg = h('span', { class: 'stift-info' }, h('img', { class: 'sig-thumb', alt: `Stift-Unterschrift ${b.name}` }),
          h('span', { class: 'muted' }, `Stift-Unterschrift ${timeOf(b.stift.zeit)} Uhr · nur Information`),
          v.leiterSig ? null : h('button', { class: 'btn small ghost', type: 'button', onclick: async () => { b.stift = null; logEvent(`${b.name}: Stift-Unterschrift entfernt`); await touch(true); rerender(); } }, 'Entfernen'));
        sigImg.firstChild.src = URL.createObjectURL(b.stift.png);
      }
      const zOk = b.zustimmung.art !== 'offen';
      return h('div', { class: 'card owner ' + (zOk ? 'st-ok' : 'st-open') },
        h('div', { class: 'who', style: 'display:flex;gap:14px;align-items:center;min-width:0' },
          h('div', { class: 'stack', style: 'gap:2px;min-width:0' },
            h('strong', {}, h('span', { class: 'stmark ' + (zOk ? 'ok' : 'open') }, zOk ? '✓' : '!'), b.name || 'ohne Namen'),
            h('span', { class: 'muted' }, `EZ ${b.ez || '–'} · Gst. ${b.gst || '–'} · ${b.anwesend ? 'anwesend' : b.vertreten ? `vertreten durch ${b.vertreter.name || '…'}` : 'nicht anwesend'}`),
            h('span', {}, h('span', { class: 'pill ' + z.cls }, z.label), b.zustimmung.zeit ? h('span', { class: 'muted' }, '  ' + timeOf(b.zustimmung.zeit) + ' Uhr') : null),
            sigZeile(b.zustimmung.sig),
            sigImg,
            b.zustimmung.art === 'papier' ? papierFotoZeile(b) : null,
            b.stift && !zOk ? h('span', { class: 'stift-hinweis' }, 'Rechtsgültig fehlt noch: ID Austria oder Unterschrift auf Papier.') : null)),
        h('div', { class: 'actions' },
          v.leiterSig ? null : b.zustimmung.art === 'offen' ? [
            h('button', { class: 'btn primary', type: 'button', disabled: !!app.pending, onclick: () => startQes({ bid: b.id }) }, 'ID Austria'),
            h('button', { class: 'btn', type: 'button', onclick: () => mark('papier') }, 'Auf Papier'),
            b.stift ? null : h('button', { class: 'btn', type: 'button', onclick: () => stiftUnterschrift(b) }, icon('pen'), 'Mit Stift (Info)'),
            h('button', { class: 'btn ghost small', type: 'button', onclick: () => mark('verweigert') }, 'verweigert'),
          ] : [
            b.stift || b.zustimmung.art === 'verweigert' ? null : h('button', { class: 'btn small', type: 'button', onclick: () => stiftUnterschrift(b) }, icon('pen'), 'Zusätzlich mit Stift'),
            h('button', { class: 'btn small ghost', type: 'button', onclick: () => mark('offen') }, 'Zurücksetzen')]));
    })),
    leiterCard(),
    h('div', { class: 'row' },
      h('button', { class: 'btn', type: 'button', onclick: () => download(currentPdf(), pdfFileName(v, 'zum_Ausdrucken')) }, icon('pdf'), 'Protokoll zum Ausdrucken speichern'),
      hasStift(v) ? h('button', { class: 'btn', type: 'button', onclick: async e => { const bt = e.currentTarget; bt.disabled = true; try { Viewer.open({ blob: await protocolWithSignatures(v), title: 'Protokoll mit Stift-Unterschriften (Information)' }); } catch (err) { toast(err.message); } bt.disabled = false; } }, icon('pdf'), 'Protokoll mit Stift-Unterschriften ansehen') : null));
};

function papierFotoZeile(b) {
  const v = app.cur, z = b.zustimmung;
  const inp = h('input', { type: 'file', accept: 'image/*', capture: 'environment', hidden: true, onchange: e => { const f = e.target.files[0]; e.target.value = ''; if (f) papierFoto(b, f); } });
  if (!z.foto) return h('span', { class: 'row', style: 'gap:8px;margin-top:4px' },
    h('button', { class: 'btn small', type: 'button', onclick: () => inp.click() }, icon('camera'), 'Unterschrift fotografieren'), inp,
    h('span', { class: 'muted', style: 'font-size:.82rem' }, v.signed ? 'geht als nachgereichte Unterschrift in eigener Datei ins Büro' : 'kommt vor der ersten ID-Austria-Signatur als Beilage ins Protokoll'));
  const u = URL.createObjectURL(z.foto);
  return h('span', { class: 'row vm-foto', style: 'gap:8px;margin-top:4px' },
    h('button', { class: 'vm-thumb', type: 'button', 'aria-label': 'Foto der Unterschrift groß ansehen', onclick: () => lightbox(u) }, h('img', { src: u, alt: `Unterschrift ${b.name} auf Papier` })),
    h('span', { class: 'muted', style: 'font-size:.85rem' }, z.fotoImPdf ? 'im Protokoll als Beilage „Unterschriften auf Papier“' : v.signed ? 'nachgereicht: eigene Datei im Export' : 'wird vor der ersten QES bzw. beim Export ans Protokoll angehängt'),
    z.fotoImPdf ? null : h('button', { class: 'btn small ghost', type: 'button', onclick: async () => { if (!confirm('Foto entfernen?')) return; z.foto = null; logEvent(`${b.name}: Foto der Papier-Unterschrift entfernt`); await touch(true); rerender(); } }, 'Entfernen'));
}
function sigZeile(sig) {
  if (!sig) return null;
  return h('span', { class: 'sig-check' + (sig.passt ? '' : ' warn') }, sig.passt ? icon('check') : '! ',
    `signiert von ${sig.name || 'unbekannt'} · ${sig.urteil}${sig.passt ? '' : ` · Name passt nicht zu „${sig.erwartet}“`}`);
}
/* Verhandlungsleiter unterfertigt als Letzter: seine QES umfasst das Protokoll samt allen Signaturen davor */
function leiterCard() {
  const v = app.cur, ow = owners(v);
  const offen = ow.filter(b => b.zustimmung.art === 'offen').length, sig = v.leiterSig;
  const set = async art => { v.leiterSig = art ? { art, zeit: Date.now() } : null; logEvent(art ? `Verhandlungsleiter ${v.meta.leiter}: ${art === 'qes' ? 'QES' : 'Unterschrift auf Papier'}` : 'Unterfertigung des Verhandlungsleiters zurückgesetzt'); updateStatus(); await touch(true); rerender(); };
  return h('div', { class: 'card owner leiter ' + (sig ? 'st-ok' : 'st-open') },
    h('div', { class: 'stack', style: 'gap:2px;min-width:0' },
      h('span', { class: 'eyebrow' }, 'Zum Schluss'),
      h('strong', {}, `Verhandlungsleiter: ${v.meta.leiter || '…'}`),
      sig ? h('span', {}, h('span', { class: 'pill good' }, sig.art === 'qes' ? 'QES mit ID Austria' : 'Unterschrift auf Papier'), h('span', { class: 'muted' }, '  ' + timeOf(sig.zeit) + ' Uhr'), sigZeile(sig.sig))
        : h('span', { class: 'muted' }, offen ? `Erst wenn alle Eigentümer erfasst sind (noch ${offen} offen).` : 'Signiert als Letzter. Die Signatur umfasst das Protokoll mit allen Signaturen davor.')),
    h('div', { class: 'actions' },
      sig ? (sig.art === 'papier' ? h('button', { class: 'btn small ghost', type: 'button', onclick: () => set(null) }, 'Zurücksetzen') : null) : [
        h('button', { class: 'btn primary', type: 'button', disabled: !!app.pending || offen > 0, onclick: () => startQes({ leiter: true }) }, 'ID Austria'),
        h('button', { class: 'btn', type: 'button', disabled: offen > 0, onclick: () => set('papier') }, 'Auf Papier'),
      ]));
}

/* ---------- 7 Export ---------- */
function exportJson(v) {
  return {
    app: 'Digitale Grenzverhandlung', version: APP_VERSION, gz: v.gz, meta: v.meta, protokollVersion: v.version,
    gesperrt: v.locked ? { zeit: new Date(v.locked.zeit).toISOString(), sha256: v.locked.hash } : null,
    verhandlungsleiter: v.leiterSig ? { name: v.meta.leiter, art: v.leiterSig.art, zeit: new Date(v.leiterSig.zeit).toISOString() } : null,
    signaturen: v.signed && v.signed.pruefung ? v.signed.pruefung.map(x => ({ ...x, zeit: x.zeit ? new Date(x.zeit).toISOString() : null })) : [],
    beteiligte: v.beteiligte.map(({ id, vollmachtFoto, ...b }) => ({ ...b, vollmachtFoto: !!vollmachtFoto,
      vertreter: b.vertreter ? { ...b.vertreter, vollmachtFoto: !!b.vertreter.vollmachtFoto } : b.vertreter,
      zustimmung: { art: b.zustimmung.art, zeit: b.zustimmung.zeit ? new Date(b.zustimmung.zeit).toISOString() : null, stiftUnterschrift: !!(b.stift && b.stift.png),
        fotoPapier: b.zustimmung.foto ? (b.zustimmung.fotoImPdf ? 'Beilage im Protokoll' : nachName(v, b)) : null } })),
    behelfe: v.behelfe.map(b => ({ planverfasser: b.planverfasser, geschaeftszahl: b.gz, anmerkung: b.anmerkung, vorgehalten: b.vorgehalten })),
    beschreibung: v.beschreibung,
    fotos: v.fotos.map((f, i) => ({ datei: fotoName(v, f, i), zeit: new Date(f.zeit).toISOString(), notiz: f.notiz || '' })),
    skizze: { striche: v.skizze.strokes.length, texte: v.skizze.texts.length, grenzzeichen: v.skizze.symbols.map(s => s.code) },
    verlauf: v.log.map(e => ({ zeit: new Date(e.zeit).toISOString(), text: e.text })),
  };
}
const fotoName = (v, f, i) => `fotos/GZ${safeName(v.gz)}_Foto_${pad2(i + 1)}_${timeOf(f.zeit).replace(':', '')}.jpg`;
const nachName = (v, b) => `Unterschriften_nachgereicht/GZ${safeName(v.gz)}_${safeName(b.name)}${b.ez ? `_EZ${safeName(b.ez)}` : ''}.jpg`;
async function exportZip(v) {
  await papierInsPdf(v);
  const zip = new JSZip();
  for (const b of papierOffen(v)) zip.file(nachName(v, b), b.zustimmung.foto);
  zip.file(pdfFileName(v, v.signed ? 'signiert' : 'gesperrt'), await currentPdf().arrayBuffer());
  if (hasStift(v)) zip.file(pdfFileName(v, 'mit_Stift-Unterschriften_Information'), await (await protocolWithSignatures(v)).arrayBuffer());
  zip.file(`Verhandlung_${safeName(v.gz)}_V${v.version}.json`, JSON.stringify(exportJson(v), null, 2));
  v.fotos.forEach((f, i) => zip.file(fotoName(v, f, i), f.blob));
  if (v.skizze.pdf && v.fotos.some(f => f.pos)) zip.file(`fotos/Fotoplan_GZ${safeName(v.gz)}.pdf`, await buildFotoplan(v));
  if (v.fotos.length) zip.file('fotos/Fotos.txt', v.fotos.map((f, i) => `${fotoName(v, f, i).slice(6)}\t${deDateTime(f.zeit)}\t${f.notiz || ''}`).join('\r\n'));
  for (const u of v.unterlagen.filter(x => x.lokal)) zip.file(`vor_Ort_ergaenzt/${safeName(u.titel)}.pdf`, await u.pdf.arrayBuffer());
  return zip.generateAsync({ type: 'blob' });
}
VIEWS.export = page => {
  const v = app.cur, ow = owners(v);
  const cnt = art => ow.filter(b => b.zustimmung.art === art).length, nStift = ow.filter(b => b.stift && b.stift.png).length;
  put(page, pageHead('Export für Beurkundung und BAIK-Archiv', 'In der Kanzlei werden Papier-Zustimmungen eingescannt, die Beurkundungssignatur angebracht und das Protokoll ins Archiv geladen.'));
  if (!v.locked) {
    put(page, notice('', 'warn', h('strong', {}, 'Noch nichts zu exportieren.'), h('span', {}, 'Das Protokoll ist noch nicht gesperrt.'),
      h('div', {}, h('button', { class: 'btn small', type: 'button', onclick: () => setView('abschluss') }, 'Zum Abschluss'))));
  } else {
    put(page, h('div', { class: 'card stack' },
      h('table', { class: 'kv' }, h('tbody', {},
        h('tr', {}, h('th', {}, 'Protokoll'), h('td', {}, `Version ${v.version}, gesperrt ${deDateTime(v.locked.zeit)}`)),
        h('tr', {}, h('th', {}, 'SHA-256'), h('td', { class: 'hash' }, v.locked.hash)),
        h('tr', {}, h('th', {}, 'Zustimmungen'), h('td', {}, `${cnt('qes')} QES · ${cnt('papier')} Papier · ${cnt('verweigert')} verweigert · ${cnt('offen')} offen${nStift ? ` · zusätzlich ${nStift} mit Stift (Information)` : ''}`)),
        h('tr', {}, h('th', {}, 'Verhandlungsleiter'), h('td', {}, v.leiterSig ? `${v.leiterSig.art === 'qes' ? 'QES' : 'Papier'}, ${deDateTime(v.leiterSig.zeit)}` : 'offen')),
        h('tr', {}, h('th', {}, 'Signaturen im PDF'), h('td', {}, v.signed ? String(v.signed.sigCount) : '0')))),
      v.signed && v.signed.pruefung ? h('div', { class: 'stack', style: 'gap:6px' }, h('strong', {}, 'Signaturen im Protokoll (in der App geprüft)'),
        h('ol', { class: 'sig-list' }, v.signed.pruefung.map(x => h('li', {}, h('b', {}, x.name || 'unbekannt'), ` · ${x.zeit ? deDateTime(x.zeit) : 'ohne Zeit'} · ${x.urteil}${x.aussteller ? ` · Zertifikat: ${x.aussteller}` : ''}`))),
        h('p', { class: 'muted', style: 'margin:0;font-size:.85rem' }, 'Geprüft: Unterzeichner, Zeitpunkt, unveränderter Inhalt und die Signatur selbst. Ob das Zertifikat vertrauenswürdig und nicht widerrufen ist, im Büro mit der ',
          h('a', { href: 'https://www.signaturpruefung.gv.at/', target: '_blank', rel: 'noopener' }, 'RTR-Signaturprüfung'), ' kontrollieren.')) : null,
      cnt('offen') ? notice('', 'warn', h('span', {}, `${cnt('offen')} Zustimmung(en) sind noch offen.`)) : notice('good', 'check', h('span', {}, 'Alle Eigentümer sind erfasst.')),
      v.leiterSig ? notice('good', 'check', h('span', {}, `Verhandlungsleiter: ${v.leiterSig.art === 'qes' ? 'QES mit ID Austria' : 'Unterschrift auf Papier'} um ${timeOf(v.leiterSig.zeit)} Uhr.`))
        : notice('', 'warn', h('span', {}, 'Der Verhandlungsleiter hat noch nicht unterfertigt (Schritt „Zustimmung“, ganz unten).')),
      h('div', { class: 'row' },
        h('button', { class: 'btn primary big', type: 'button', onclick: async e => { const b = e.currentTarget; b.disabled = true; try { download(await exportZip(v), `Grenzverhandlung_${safeName(v.gz)}_V${v.version}.zip`); logEvent('Paket für die Kanzlei exportiert'); touch(true); } catch (err) { toast(err.message); } b.disabled = false; } }, icon('export'), 'Alles für die Kanzlei (ZIP)'),
        h('button', { class: 'btn', type: 'button', onclick: async () => { await papierInsPdf(v).catch(err => toast(err.message)); download(currentPdf(), pdfFileName(v, v.signed ? 'signiert' : 'gesperrt')); } }, icon('pdf'), v.signed ? 'Signiertes Protokoll' : 'Gesperrtes Protokoll'),
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
/* Ergänzungen vor Ort auf eine kopierte Seite der Begehungsskizze zeichnen (Protokoll-Beilage und Fotoplan) */
function drawSketchInk(p, v, idx, FB) {
  const { LineCapStyle } = PDFLib;
  const mb = p.getMediaBox();
  const ph = mb.height;
  const toPdf = (x, yy) => ({ x: mb.x + x, y: mb.y + ph - yy });
  for (const s of v.skizze.strokes.filter(s => s.page === idx + 1)) {
    const c = hexRgb(s.color);
    if (s.points.length === 1) { const p0 = toPdf(...s.points[0]); p.drawCircle({ x: p0.x, y: p0.y, size: s.width / 2, color: c }); continue; }
    const d = s.points.map(([x, yy], i) => `${i ? 'L' : 'M'}${x.toFixed(2)} ${yy.toFixed(2)}`).join(' ');
    p.drawSvgPath(d, { x: mb.x, y: mb.y + ph, borderColor: c, borderWidth: s.width, borderLineCap: LineCapStyle.Round, borderDashArray: s.dash ? dashOf(s.width) : undefined });
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
}
/* Fotoplan: Skizze mit Standort und Blickrichtung der verorteten Fotos, dahinter die Fotos. Nicht Teil des Protokolls. */
async function buildFotoplan(v) {
  const { PDFDocument, StandardFonts, rgb } = PDFLib;
  const doc = await PDFDocument.create();
  doc.setTitle(`Fotoplan ${v.gz}`); doc.setProducer(`Digitale Grenzverhandlung ${APP_VERSION} (Prototyp)`);
  const F = await doc.embedFont(StandardFonts.Helvetica), FB = await doc.embedFont(StandardFonts.HelveticaBold);
  const orange = hexRgb(FOTO_FARBE), white = rgb(1, 1, 1);
  const placed = v.fotos.map((f, i) => ({ f, nr: i + 1 })).filter(x => x.f.pos);
  if (!v.skizze.pdf || !placed.length) throw new Error('Noch kein Foto in der Skizze verortet.');
  const src = await PDFDocument.load(await blobBytes(v.skizze.pdf), { ignoreEncryption: true });
  const copied = await doc.copyPages(src, src.getPageIndices());
  copied.forEach((p, idx) => {
    doc.addPage(p);
    drawSketchInk(p, v, idx, FB);
    const mb = p.getMediaBox(), ph = mb.height, toPdf = (x, y) => ({ x: mb.x + x, y: mb.y + ph - y });
    for (const { f, nr } of placed.filter(x => x.f.pos.page === idx + 1)) {
      const m = { ...f.pos, nr }, { r, cone } = fotoMarkGeom(m);
      if (cone) p.drawSvgPath(`M${cone[0][0]} ${cone[0][1]} L${cone[1][0]} ${cone[1][1]} L${cone[2][0]} ${cone[2][1]} Z`, { x: mb.x, y: mb.y + ph, color: orange, opacity: 0.3, borderColor: orange, borderWidth: r * 0.18 });
      const c = toPdf(m.x, m.y), t = String(nr), sz = r * 1.15;
      p.drawCircle({ x: c.x, y: c.y, size: r, color: white, borderColor: orange, borderWidth: r * 0.25 });
      p.drawText(t, { x: c.x - FB.widthOfTextAtSize(t, sz) / 2, y: c.y - sz * 0.36, size: sz, font: FB, color: orange });
    }
    const label = ansi(`Fotoplan zu Projekt ${v.gz}: Standorte und Blickrichtungen der Fotos (nicht Teil des Protokolls)${copied.length > 1 ? ` · Blatt ${idx + 1} von ${copied.length}` : ''}`);
    p.drawRectangle({ x: mb.x + 8, y: mb.y + 6, width: F.widthOfTextAtSize(label, 8) + 8, height: 13, color: white, opacity: 0.85 });
    p.drawText(label, { x: mb.x + 12, y: mb.y + 9.5, size: 8, font: F, color: orange });
  });
  for (const { f, nr } of placed) {
    const richtung = f.pos.dir === null || f.pos.dir === undefined ? 'ohne Blickrichtung' : `Blickrichtung ${['Ost', 'Südost', 'Süd', 'Südwest', 'West', 'Nordwest', 'Nord', 'Nordost'][((Math.round(f.pos.dir / (Math.PI / 4)) % 8) + 8) % 8]} (bezogen auf das Blatt)`;
    await fotoBeilage(doc, F, f.blob, `Fotoplan ${v.gz} · Foto ${nr} · ${deDateTime(f.zeit)} · Blatt ${f.pos.page}, ${richtung}${f.notiz ? ` · ${f.notiz}` : ''}`);
  }
  return doc.save();
}
/* QR-Code als PNG (für die Signaturplatzhalter) */
function qrPng(text) {
  const q = qrcode(0, 'M'); q.addData(text); q.make();
  const n = q.getModuleCount(), cell = 8, pad = 4, size = (n + 2 * pad) * cell;
  const c = document.createElement('canvas'); c.width = c.height = size;
  const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, size, size); ctx.fillStyle = '#000';
  for (let r = 0; r < n; r++) for (let k = 0; k < n; k++) if (q.isDark(r, k)) ctx.fillRect((k + pad) * cell, (r + pad) * cell, cell, cell);
  const b64 = c.toDataURL('image/png').split(',')[1];
  return Uint8Array.from(atob(b64), ch => ch.charCodeAt(0));
}
/* Foto als eigene A4-Seite (Beilage) anhängen; JPEG oder PNG */
async function fotoBeilage(doc, F, blob, label) {
  const bytes = await blobBytes(blob);
  let img;
  if (bytes[0] === 0xff && bytes[1] === 0xd8) img = await doc.embedJpg(bytes);
  else if (bytes[0] === 0x89 && bytes[1] === 0x50) img = await doc.embedPng(bytes);
  else return false;
  const W = 595.28, H = 841.89, M = 36, top = 40;
  const page = doc.addPage([W, H]);
  const lines = wrapText(ansi(label), F, 9, W - 2 * M);
  lines.forEach((ln, i) => page.drawText(ln, { x: M, y: H - M - 9 - i * 12, size: 9, font: F, color: PDFLib.rgb(0.25, 0.25, 0.25) }));
  const aw = W - 2 * M, ah = H - 2 * M - top - lines.length * 12;
  const k = Math.min(aw / img.width, ah / img.height);
  const w = img.width * k, hh = img.height * k;
  page.drawImage(img, { x: (W - w) / 2, y: M + (ah - hh) / 2, width: w, height: hh });
  return true;
}
function wrapText(text, font, size, maxW) {
  const out = []; let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const t = line ? line + ' ' + word : word;
    if (font.widthOfTextAtSize(t, size) <= maxW || !line) line = t; else { out.push(line); line = word; }
  }
  if (line) out.push(line);
  return out;
}
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
  para(eroeffnungsText(v)[0]);
  y -= 10;
  heading('Gegenstand der Verhandlung');
  para(eroeffnungsText(v)[1], { justify: true, gap: 10 });
  const vb = v.behelfe.filter(b => b.vorgehalten).map(b => [b.planverfasser, b.gz, b.anmerkung]);
  while (vb.length < 5) vb.push(['', '', '']); // Leerzeilen wie in der Vorlage, soweit Platz ist
  table([{ t: 'Planverfasser', w: 0.377 }, { t: 'Geschäftszahl', w: 0.181 }, { t: 'Anmerkung', w: 0.442 }], vb,
    { size: 9, minRow: 23, x0: M + 7, x1: W - M + 2, headSize: 8.5, filler: true });

  /* Seite 2 */
  newPage();
  y = H - 157;
  centered('Beschreibung des Grenzverlaufs', 12, FB, 0.6);
  // Text aus dem Feld: Leerzeile = neuer Absatz, einfacher Umbruch = neue Zeile im Absatz.
  // Strittige Abschnitte folgen auf den Satz „… untenstehend beschrieben.“ (wie in der Vorlage), sonst am Ende.
  const strittig = () => { if ((v.beschreibung.strittig || '').trim()) { para('Nicht festgelegte Grenzabschnitte:', { font: FB, gap: 2 }); para(v.beschreibung.strittig, { gap: 12 }); } };
  let strittigDone = false;
  for (const block of (v.beschreibung.text || '').split(/\n\s*\n/).map(x => x.trim()).filter(Boolean)) {
    const lines = block.split('\n').map(x => x.trim()).filter(Boolean);
    lines.forEach((ln, i) => para(ln, { justify: true, gap: i === lines.length - 1 ? 12 : 0 }));
    if (!strittigDone && /untenstehend beschrieben/.test(block)) { strittig(); strittigDone = true; }
  }
  if (!strittigDone) strittig();
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
  if (opts.unterschriften) for (const b of ow) if (b.stift && b.stift.png) imgs.set(b.id, await doc.embedPng(await blobBytes(b.stift.png)));
  const cellSig = b => {
    if (!opts.unterschriften) return '';
    const z = b.zustimmung.art;
    if (imgs.has(b.id)) return { text: '', img: imgs.get(b.id) };
    return { qes: 'QES (ID Austria)', papier: 'Unterschrift auf Papier', verweigert: 'verweigert', offen: '' }[z] || '';
  };
  // Vertreter und Vollmacht beim vertretenen Eigentümer vermerken (die Tabelle der Anwesenden entfällt laut Vorlage)
  const vtext = x => `vertreten durch ${x.name}${x.idnachweis ? ` (ID: ${x.idnachweis})` : ''}${x.vollmacht ? `, ${x.vollmacht}` : ''}${x.vollmachtFoto ? ' (Beilage)' : ''}`;
  const vertreterVon = b => [b.vertreten && !b.anwesend && b.vertreter.name.trim() ? vtext(b.vertreter) : '',
    ...v.beteiligte.filter(x => x.rolle === 'Vertreter' && x.anwesend && x.vertritt && b.name.toLowerCase().includes(x.vertritt.toLowerCase())).map(vtext)].filter(Boolean).join('; ');
  const rows = ow.map(b => [b.ez, b.gst.split(/,\s*/).join('\n'), `${b.name}\n${b.anschrift.split(/,\s*/).join('\n')}`, cellSig(b),
    [b.anwesend && b.idnachweis && `ID: ${b.idnachweis}`, present(b) ? '' : 'nicht anwesend', vertreterVon(b), opts.unterschriften && imgs.has(b.id) ? `Stift, nur Information${{ qes: '; rechtsgültig: QES (ID Austria)', papier: '; rechtsgültig: auf Papier', verweigert: '; Zustimmung verweigert' }[b.zustimmung.art] || '; rechtsgültige Zustimmung offen'}` : '', b.anmerkung].filter(Boolean).join(', ')]);
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
  /* Signaturseite: je Eigentümer und für den Verhandlungsleiter ein Feld mit QR-Platzhalter (PDF-AS: „PDF-AS-POS;id=n“).
     Der Signaturdienst setzt den Signaturblock (80 x 29 mm) genau an diese Stelle. */
  if (sigSeite(v) && opts.sigSeite !== false) {
    newPage();
    centered('Qualifizierte elektronische Signaturen', 12, FB, 0.6);
    para('Die Eigentümer oder ihre Vertreter und der Verhandlungsleiter können anstelle der eigenhändigen Unterschrift mit ID Austria qualifiziert elektronisch signieren (§ 4 Abs. 1 SVG). Jede Person signiert im Feld mit ihrer Nummer; der Verhandlungsleiter zuletzt. Leer gebliebene Felder bedeuten: Zustimmung auf Papier oder keine Zustimmung.', { size: 8.5, justify: true, gap: 10 });
    const fw = 200, fh = 72, rowH = 92, felder = [...ow.map((b, i) => [i + 1, b.name, [b.ez && `EZ ${b.ez}`, b.gst && `Gst. ${b.gst}`].filter(Boolean).join(', '), b.vertreten && !b.anwesend && b.vertreter.name ? `vertreten durch ${b.vertreter.name}` : '']),
      [ow.length + 1, v.meta.leiter || 'Verhandlungsleiter', 'Verhandlungsleiter', '']];
    for (const [nr, name, zeile2, zeile3] of felder) {
      ensure(rowH);
      const top = y, x2 = W - M - fw;
      page.drawRectangle({ x: M, y: top - rowH + 6, width: W - 2 * M, height: rowH - 6, borderColor: rgb(0.6, 0.6, 0.6), borderWidth: 0.5 });
      page.drawText(`${nr}`, { x: M + 8, y: top - 24, size: 16, font: FB, color: black });
      let ty = top - 16;
      for (const [t, f, sz] of [[name, FB, 9.5], [zeile2, F, 8.5], [zeile3, F, 8.5]]) {
        if (!t) continue;
        for (const ln of wrap(t, f, sz, x2 - M - 50)) { page.drawText(ln, { x: M + 36, y: ty - sz, size: sz, font: f, color: black }); ty -= sz * 1.3; }
      }
      const qr = await doc.embedPng(qrPng(`PDF-AS-POS;id=${nr}`));
      page.drawImage(qr, { x: x2 - 6, y: top - 10 - fh, width: fw, height: fh, opacity: 0.4 });
      y = top - rowH;
    }
    para('Die Felder mit dem QR-Code sind Platzhalter für den Signaturdienst (pdf.egiz.gv.at, Position „QR-Platzhalter“, Nummer laut Feld).', { size: 7, color: grey, gap: 0 });
  }
  const protoPages = pages.length;

  /* Beilage: Skizze mit Ergänzungen */
  if (v.skizze.pdf) {
    const src = await PDFDocument.load(await blobBytes(v.skizze.pdf), { ignoreEncryption: true });
    const copied = await doc.copyPages(src, src.getPageIndices());
    copied.forEach((p, idx) => {
      doc.addPage(p); pages.push(p);
      drawSketchInk(p, v, idx, FB);
      const mb = p.getMediaBox();
      const label = ansi(`Beilage zum Protokoll, Projekt ${v.gz}: Begehungsskizze mit Ergänzungen vor Ort${copied.length > 1 ? ` (Blatt ${idx + 1} von ${copied.length})` : ''}`);
      p.drawRectangle({ x: mb.x + 8, y: mb.y + 6, width: F.widthOfTextAtSize(label, 8) + 8, height: 13, color: rgb(1, 1, 1), opacity: 0.85 });
      p.drawText(label, { x: mb.x + 12, y: mb.y + 9.5, size: 8, font: F, color: grey });
    });
  }

  /* Beilagen: Fotos der Vollmachten (vor dem Sperren aufgenommen) */
  for (const b of v.beteiligte) {
    if (b.vertreten && !b.anwesend && b.vertreter.vollmachtFoto) await fotoBeilage(doc, F, b.vertreter.vollmachtFoto, `Beilage zum Protokoll, Projekt ${v.gz}: Vollmacht für ${b.name}, vertreten durch ${b.vertreter.name}`);
    else if (b.rolle === 'Vertreter' && b.anwesend && b.vollmachtFoto) await fotoBeilage(doc, F, b.vollmachtFoto, `Beilage zum Protokoll, Projekt ${v.gz}: Vollmacht von ${b.name}${b.vertritt ? ` für ${b.vertritt}` : ''}`);
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

/* ---------- PDF-Ansicht mit Freihand-Zeichnen ----------
 * Stift (oder Maus) zeichnet immer. Ohne Stift zeichnet ein Finger, zwei Finger verschieben und zoomen.
 * Sobald einmal ein Stift benutzt wurde, verschiebt der Finger nur noch (Handballen wird ignoriert). */
let penSeen = false;
try { penSeen = localStorage.getItem('gv-pen') === '1'; } catch (_) {}
const Viewer = {
  st: null,
  pref: { tool: 'pen', color: '#d0021b', weight: 'fein', dash: false },
  async open(opts) {
    const st = this.st = { ...opts, doc: null, page: 1, pages: 1, zoom: 1, tx: 0, ty: 0, fit: 1, pw: 0, ph: 0, rs: 0, tool: Viewer.pref.tool, color: Viewer.pref.color, weight: Viewer.pref.weight, dash: Viewer.pref.dash, pointers: new Map(), drawing: null, gesture: null, undo: [], redo: [], renderTask: null };
    $('#viewer').hidden = false;
    document.body.style.overflow = 'hidden';
    $('#v-title').textContent = opts.title;
    $('#v-tools').hidden = !opts.editable;
    st.hits = []; st.hit = -1; st.textCache = new Map();
    $('#v-search').hidden = true; $('#v-searchbtn').setAttribute('aria-expanded', 'false'); $('#v-shits').textContent = ''; $('#v-sprev').disabled = $('#v-snext').disabled = true;
    $('#v-searchbtn').hidden = !!opts.place;
    this.syncTools();
    if (opts.place) this.hint('Standort antippen und in Blickrichtung ziehen · zwei Finger zoomen'); else this.hint(opts.editable ? (penSeen ? 'Stift zeichnet · Finger verschiebt und zoomt' : 'Mit Stift oder Finger zeichnen · zwei Finger verschieben und zoomen') : 'Zwei Finger zoomen · ein Finger verschiebt');
    try {
      st.doc = await loadPdf(opts.blob);
      st.pages = st.doc.numPages;
      $('#v-pagenav').hidden = st.pages < 2;
      await this.showPage(Math.min(opts.startPage || 1, st.pages));
    } catch (e) { toast('PDF konnte nicht geöffnet werden: ' + e.message); this.close(); }
  },
  hint(text) {
    const el = $('#v-hint'); el.textContent = text; el.hidden = false;
    clearTimeout(this.ht); this.ht = setTimeout(() => { el.hidden = true; }, 3500);
  },
  close() {
    const st = this.st; if (!st) return;
    if (st.doc) st.doc.destroy();
    this.st = null;
    $('#viewer').hidden = true;
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
    st.zoom = 1; st.rs = 0; st.detail = null; $('#v-detail').hidden = true;
    st.tx = (stage.width - st.pw * st.fit) / 2; st.ty = (stage.height - st.ph * st.fit) / 2;
    $('#v-pageinfo').textContent = `${st.page} / ${st.pages}`;
    this.applyTransform();
    await this.render();
  },
  applyTransform() {
    const st = this.st;
    $('#v-sheet').style.transform = `translate(${st.tx}px, ${st.ty}px) scale(${st.zoom})`;
    $('#v-zoomlabel').textContent = Math.round(st.zoom * 100) + ' %';
    if (st.detail) this.scheduleRender(); // Detailausschnitt folgt dem Verschieben
  },
  scheduleRender() { clearTimeout(this.rt); this.rt = setTimeout(() => this.render(), 180); },
  async render() {
    const st = this.st; if (!st || !st.pdfPage) return;
    const dpr = window.devicePixelRatio || 1;
    let rs = st.fit * st.zoom * dpr;
    const want = rs, maxPx = 14e6;
    if (st.pw * rs * st.ph * rs > maxPx) rs = Math.sqrt(maxPx / (st.pw * st.ph));
    if (!(Math.abs(rs - st.rs) / Math.max(rs, 0.01) < 0.05 && $('#v-pdf').width)) await this.renderBase(rs);
    if (this.st !== st) return;
    // Große Pläne: die ganze Seite ist auf ca. 14 MP begrenzt. Darüber hinaus wird nur der sichtbare Ausschnitt scharf nachgerendert.
    if (want > rs * 1.05) await this.renderDetail(want); else { st.detail = null; $('#v-detail').hidden = true; }
    if (this.st === st) this.drawInk();
  },
  async renderBase(rs) {
    const st = this.st;
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
  },
  async renderDetail(rd) {
    const st = this.st, stage = $('#v-stage').getBoundingClientRect();
    const W = st.pw * st.fit, H = st.ph * st.fit, vw = stage.width / st.zoom, vh = stage.height / st.zoom;
    // sichtbarer Bereich in Blatt-Pixeln, mit Rand zum Verschieben
    const x0 = Math.max(0, -st.tx / st.zoom - vw * 0.25), y0 = Math.max(0, -st.ty / st.zoom - vh * 0.25);
    const x1 = Math.min(W, -st.tx / st.zoom + vw * 1.25), y1 = Math.min(H, -st.ty / st.zoom + vh * 1.25);
    if (x1 <= x0 || y1 <= y0) return;
    const d = st.detail;
    if (d && d.rd === rd && x0 >= d.x0 && y0 >= d.y0 && x1 <= d.x1 && y1 <= d.y1 && -st.tx / st.zoom >= d.x0 && -st.ty / st.zoom >= d.y0
      && (-st.tx + stage.width) / st.zoom <= d.x1 && (-st.ty + stage.height) / st.zoom <= d.y1) return; // Ausschnitt reicht noch
    const k = rd / st.fit, ox = Math.round(x0 * k), oy = Math.round(y0 * k);
    const off = document.createElement('canvas');
    off.width = Math.ceil((x1 - x0) * k); off.height = Math.ceil((y1 - y0) * k);
    const ctx = off.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, off.width, off.height);
    if (st.detailTask) { try { st.detailTask.cancel(); } catch (_) {} }
    st.detailTask = st.pdfPage.render({ canvasContext: ctx, viewport: st.pdfPage.getViewport({ scale: rd }), transform: [1, 0, 0, 1, -ox, -oy] });
    try { await st.detailTask.promise; } catch (e) { if (e && e.name === 'RenderingCancelledException') return; throw e; }
    if (this.st !== st) return;
    st.detail = { pdf: off, rd, k: rd, ox, oy, x0, y0, x1, y1 };
    const c = $('#v-detail'); c.width = off.width; c.height = off.height;
    Object.assign(c.style, { left: ox / k + 'px', top: oy / k + 'px', width: off.width / k + 'px', height: off.height / k + 'px' });
    c.hidden = false;
  },
  /* Zeichenflächen: ganze Seite und (bei starkem Zoom) der scharfe Ausschnitt */
  inkTargets() {
    const st = this.st, ink = $('#v-ink'), t = [{ ctx: ink.getContext('2d'), k: ink.width / st.pw, ox: 0, oy: 0 }];
    if (st.detail) t.push({ ctx: $('#v-detail').getContext('2d'), k: st.detail.k, ox: st.detail.ox, oy: st.detail.oy });
    return t;
  },
  drawInk() {
    const st = this.st; if (!st) return;
    const ink = $('#v-ink'), ctx = ink.getContext('2d');
    ctx.clearRect(0, 0, ink.width, ink.height);
    if (st.ink) paintInk(ctx, st.ink, st.page, ink.width / st.pw);
    this.paintExtras(ctx, ink.width / st.pw);
    if (st.detail) {
      const dc = $('#v-detail').getContext('2d'), d = st.detail;
      dc.setTransform(1, 0, 0, 1, 0, 0); dc.drawImage(d.pdf, 0, 0);
      dc.setTransform(1, 0, 0, 1, -d.ox, -d.oy);
      if (st.ink) paintInk(dc, st.ink, st.page, d.k);
      this.paintExtras(dc, d.k);
    }
  },
  /* Suchtreffer und Foto-Standorte (nur Anzeige, nicht Teil der Skizze im Protokoll) */
  paintExtras(ctx, k) {
    const st = this.st;
    (st.hits || []).forEach((m, i) => {
      if (m.page !== st.page) return;
      ctx.fillStyle = i === st.hit ? 'rgba(255,140,0,.45)' : 'rgba(255,220,0,.4)';
      ctx.fillRect(m.x * k, m.y * k, m.w * k, m.h * k);
      if (i === st.hit) { ctx.strokeStyle = '#e8710a'; ctx.lineWidth = Math.max(1, 1.2 * k); ctx.strokeRect(m.x * k, m.y * k, m.w * k, m.h * k); }
    });
    let marks = st.fotoMarks ? st.fotoMarks() : [];
    if (st.place) marks = marks.map(m => m.nr === st.place.nr ? { ...m, aktiv: true } : m);
    if (st.placing) marks = marks.filter(m => m.nr !== st.place.nr).concat({ ...st.placing.mark, aktiv: true });
    for (const m of marks) if (m.page === st.page) paintFotoMark(ctx, m, k, st.zoom);
  },
  toPage(e) {
    const st = this.st, r = $('#v-stage').getBoundingClientRect();
    return [((e.clientX - r.left - st.tx) / st.zoom) / st.fit, ((e.clientY - r.top - st.ty) / st.zoom) / st.fit];
  },
  zoomAt(factor, cx, cy) {
    const st = this.st;
    const nz = Math.min(40, Math.max(0.5, st.zoom * factor));
    const f = nz / st.zoom;
    st.tx = cx - (cx - st.tx) * f; st.ty = cy - (cy - st.ty) * f; st.zoom = nz;
    this.applyTransform(); this.scheduleRender();
  },
  zoomCenter(factor) { const r = $('#v-stage').getBoundingClientRect(); this.zoomAt(factor, r.width / 2, r.height / 2); },
  state() { const st = this.st; return JSON.stringify({ strokes: st.ink.strokes, texts: st.ink.texts, symbols: st.ink.symbols }); },
  restore(json) { const st = this.st, prev = JSON.parse(json); st.ink.strokes = prev.strokes; st.ink.texts = prev.texts; st.ink.symbols = prev.symbols || []; },
  snapshot() { const st = this.st; st.undo.push(this.state()); if (st.undo.length > 80) st.undo.shift(); st.redo = []; this.syncHist(); },
  syncHist() { const st = this.st; $('#v-undo').disabled = !st.undo.length; $('#v-redo').disabled = !st.redo.length; },
  changed() { this.st.onChange && this.st.onChange(); },
  /* Strichstärke passt sich dem Zoom an: gezoomt wird feiner gezeichnet */
  lineWidth() { const b = this.st.weight === 'dick' ? 3.6 : 1.5; return Math.round(Math.min(b, Math.max(b / 4, b / this.st.zoom)) * 100) / 100; },
  /* Linienenden auf der Seite, an denen eine neue Linie einrastet */
  snap(p) {
    const st = this.st, tol = 14 / st.zoom / st.fit;
    let best = null, bd = tol;
    for (const s of st.ink.strokes) {
      if (s.page !== st.page || !s.points.length) continue;
      for (const q of [s.points[0], s.points[s.points.length - 1]]) { const d = Math.hypot(q[0] - p[0], q[1] - p[1]); if (d < bd) { bd = d; best = q; } }
    }
    return best ? [best[0], best[1], true] : [p[0], p[1], false];
  },
  drawPreview() {
    const st = this.st, s = st.drawing.s, end = st.drawing.end; if (!end) return;
    this.drawInk();
    for (const { ctx, k, ox, oy } of this.inkTargets()) {
    ctx.save(); ctx.setTransform(1, 0, 0, 1, -ox, -oy); ctx.lineCap = 'round'; ctx.strokeStyle = s.color; ctx.lineWidth = s.width * k;
    ctx.setLineDash(s.dash ? dashOf(s.width).map(x => x * k) : []);
    ctx.beginPath(); ctx.moveTo(s.points[0][0] * k, s.points[0][1] * k); ctx.lineTo(end[0] * k, end[1] * k); ctx.stroke();
    ctx.setLineDash([]); ctx.lineWidth = Math.max(1.5, 2 * (window.devicePixelRatio || 1)); ctx.strokeStyle = s.color;
    for (const q of [s.points[0], end]) if (q[2]) { ctx.beginPath(); ctx.arc(q[0] * k, q[1] * k, 9 * (window.devicePixelRatio || 1), 0, Math.PI * 2); ctx.stroke(); }
    ctx.restore();
    }
  },
  startDraw(e) {
    const st = this.st, p = this.toPage(e);
    this.snapshot();
    st.drawing = { id: e.pointerId, t0: performance.now(), touch: e.pointerType === 'touch' };
    if (st.tool === 'erase') { st.drawing.erase = true; this.eraseAt(p); }
    else {
      const q = st.tool === 'line' ? this.snap(p) : p;
      st.drawing.s = { page: st.page, color: st.color, width: this.lineWidth(), points: [[Math.round(q[0] * 100) / 100, Math.round(q[1] * 100) / 100]] };
      if (st.dash) st.drawing.s.dash = true;
      if (st.tool === 'line') { st.drawing.line = true; st.drawing.s.points[0][2] = q[2]; }
    }
  },
  cancelDraw() {
    const st = this.st; if (!st.drawing) return;
    const prev = st.undo.pop();
    if (prev) this.restore(prev);
    this.syncHist();
    st.drawing = null; this.drawInk();
  },
  down(e) {
    const st = this.st; if (!st) return;
    try { $('#v-stage').setPointerCapture(e.pointerId); } catch (_) {}
    if (e.pointerType === 'pen' && !penSeen) { penSeen = true; try { localStorage.setItem('gv-pen', '1'); } catch (_) {} }
    if (st.place) {
      // Foto verorten: ein Finger/Stift setzt den Standort, Ziehen gibt die Blickrichtung; zwei Finger zoomen
      st.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); st.gesture = null;
      if (st.pointers.size === 1) { const p = this.toPage(e); st.placing = { id: e.pointerId, mark: { page: st.page, x: p[0], y: p[1], dir: null, nr: st.place.nr } }; }
      else st.placing = null;
      this.drawInk(); return;
    }
    if (e.pointerType === 'pen' || (e.pointerType === 'mouse' && e.button === 0)) {
      if (st.editable && !st.drawing) this.startDraw(e);
      else if (!st.editable) { st.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); }
      return;
    }
    if (e.pointerType !== 'touch') return;
    if (st.drawing && !st.drawing.touch) return; // Handballen beim Schreiben mit dem Stift
    st.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    st.gesture = null;
    if (st.pointers.size === 1 && st.editable && !penSeen) { this.startDraw(e); return; }
    if (st.pointers.size === 2 && st.drawing && st.drawing.touch) {
      // zweiter Finger: es wird gezoomt, nicht gezeichnet
      const short = performance.now() - st.drawing.t0 < 300 || (st.drawing.s && st.drawing.s.points.length < 6);
      if (short || st.drawing.erase) this.cancelDraw(); else this.finishDraw();
    }
  },
  move(e) {
    const st = this.st; if (!st) return;
    if (st.place && st.placing && st.placing.id === e.pointerId && st.pointers.size === 1) {
      const p = this.toPage(e), m = st.placing.mark;
      if (Math.hypot(p[0] - m.x, p[1] - m.y) * st.fit * st.zoom > 14) m.dir = Math.round(Math.atan2(p[1] - m.y, p[0] - m.x) * 1000) / 1000;
      this.drawInk(); return;
    }
    if (st.drawing && st.drawing.id === e.pointerId) {
      if (st.pointers.size > 1) return;
      const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
      if (st.drawing.erase) { for (const ev of evs) this.eraseAt(this.toPage(ev)); return; }
      if (st.drawing.line) { st.drawing.end = this.snap(this.toPage(e)); st.drawing.moved = true; this.drawPreview(); return; }
      const s = st.drawing.s, T = this.inkTargets();
      for (const ev of evs) {
        const p = this.toPage(ev), last = s.points[s.points.length - 1];
        if (Math.hypot(p[0] - last[0], p[1] - last[1]) < 0.4 / st.zoom) continue;
        for (const { ctx, k, ox, oy } of T) {
          ctx.setTransform(1, 0, 0, 1, -ox, -oy);
          ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = s.color; ctx.lineWidth = s.width * k;
          ctx.setLineDash(s.dash ? dashOf(s.width).map(x => x * k) : []); ctx.lineDashOffset = -(s.len || 0) * k;
          ctx.beginPath(); ctx.moveTo(last[0] * k, last[1] * k); ctx.lineTo(p[0] * k, p[1] * k); ctx.stroke();
        }
        s.len = (s.len || 0) + Math.hypot(p[0] - last[0], p[1] - last[1]);
        s.points.push([Math.round(p[0] * 100) / 100, Math.round(p[1] * 100) / 100]);
      }
      return;
    }
    if (!st.pointers.has(e.pointerId)) return;
    const r = $('#v-stage').getBoundingClientRect();
    const prev = st.pointers.get(e.pointerId);
    st.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (st.pointers.size === 1 && !st.drawing) {
      st.tx += e.clientX - prev.x; st.ty += e.clientY - prev.y; this.applyTransform();
    } else if (st.pointers.size === 2) {
      const [a, b] = Array.from(st.pointers.values());
      const dist = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2 - r.left, my = (a.y + b.y) / 2 - r.top;
      if (st.gesture) { st.tx += mx - st.gesture.mx; st.ty += my - st.gesture.my; this.zoomAt(dist / st.gesture.dist, mx, my); }
      st.gesture = { dist, mx, my };
    }
  },
  finishDraw() {
    const st = this.st, d = st.drawing;
    if (d.line) {
      const a = d.s.points[0], b = d.end;
      if (!b || Math.hypot(b[0] - a[0], b[1] - a[1]) < 1) { this.cancelDraw(); return; }
      d.s.points = [[a[0], a[1]], [Math.round(b[0] * 100) / 100, Math.round(b[1] * 100) / 100]];
    }
    if (d.s) { delete d.s.len; st.ink.strokes.push(d.s); }
    st.drawing = null; this.drawInk(); this.changed();
  },
  up(e) {
    const st = this.st; if (!st) return;
    if (st.place && st.placing && st.placing.id === e.pointerId) {
      const m = st.placing.mark; st.placing = null; st.pointers.delete(e.pointerId);
      st.place.onSet({ page: m.page, x: Math.round(m.x * 10) / 10, y: Math.round(m.y * 10) / 10, dir: m.dir });
      this.hint(m.dir === null ? 'Standort gesetzt. Für die Blickrichtung nochmals antippen und ziehen.' : 'Standort und Blickrichtung gespeichert · „Fertig“ schließt');
      this.drawInk(); return;
    }
    if (st.drawing && st.drawing.id === e.pointerId) this.finishDraw();
    st.pointers.delete(e.pointerId); st.gesture = null;
  },
  eraseAt(p) {
    const st = this.st, tol = 8 / st.zoom / st.fit;
    const dSeg = (a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], l = dx * dx + dy * dy; const t = l ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l)) : 0; return Math.hypot(a[0] + t * dx - p[0], a[1] + t * dy - p[1]); };
    const near = pts => pts.length === 1 ? Math.hypot(pts[0][0] - p[0], pts[0][1] - p[1]) < tol : pts.some((q, i) => i > 0 && dSeg(pts[i - 1], q) < tol);
    const before = st.ink.strokes.length + st.ink.texts.length + st.ink.symbols.length;
    st.ink.strokes = st.ink.strokes.filter(s => s.page !== st.page || !near(s.points));
    st.ink.symbols = st.ink.symbols.filter(s => s.page !== st.page || Math.hypot(s.x - p[0], s.y - p[1]) > s.r + tol);
    st.ink.texts = st.ink.texts.filter(t => t.page !== st.page || !(p[0] > t.x - tol && p[0] < t.x + t.text.length * t.size * 0.6 + tol && p[1] > t.y - t.size - tol && p[1] < t.y + tol));
    if (st.ink.strokes.length + st.ink.texts.length + st.ink.symbols.length !== before) { this.drawInk(); this.changed(); }
  },
  undoLast() {
    const st = this.st; if (!st || !st.undo.length) return;
    st.redo.push(this.state()); this.restore(st.undo.pop());
    this.syncHist(); this.drawInk(); this.changed();
  },
  redoLast() {
    const st = this.st; if (!st || !st.redo.length) return;
    st.undo.push(this.state()); this.restore(st.redo.pop());
    this.syncHist(); this.drawInk(); this.changed();
  },
  async pageText(n) {
    const st = this.st;
    if (st.textCache.has(n)) return st.textCache.get(n);
    const pg = await st.doc.getPage(n), vp = pg.getViewport({ scale: 1 }), tc = await pg.getTextContent();
    const items = tc.items.filter(it => it.str).map(it => {
      const t = pdfjsLib.Util.transform(vp.transform, it.transform), fh = Math.hypot(t[2], t[3]) || 10;
      return { str: it.str, x: t[4], y: t[5] - fh, w: it.width * vp.scale, h: fh * 1.2 };
    });
    st.textCache.set(n, items);
    return items;
  },
  async search(q) {
    const st = this.st; if (!st || !st.doc) return;
    const norm = x => x.toLowerCase().replace(/\s+/g, ' ');
    q = norm(q.trim());
    st.hits = []; st.hit = -1;
    if (q) for (let n = 1; n <= st.pages; n++) {
      for (const it of await this.pageText(n)) {
        const t = norm(it.str); let i = t.indexOf(q);
        while (i >= 0) { const cw = it.w / Math.max(1, t.length); st.hits.push({ page: n, x: it.x + cw * i, y: it.y, w: Math.max(4, cw * q.length), h: it.h }); i = t.indexOf(q, i + q.length); }
      }
      if (this.st !== st) return;
    }
    const total = st.hits.length;
    $('#v-sprev').disabled = $('#v-snext').disabled = total < 2;
    if (!q) { $('#v-shits').textContent = ''; this.drawInk(); return; }
    if (!total) {
      const any = [...st.textCache.values()].some(a => a.length);
      $('#v-shits').textContent = any ? 'kein Treffer' : 'kein Text im PDF (gescannt?)'; this.drawInk(); return;
    }
    await this.gotoHit(0);
  },
  async gotoHit(i) {
    const st = this.st, n = st.hits.length; if (!n) return;
    st.hit = (i + n) % n;
    const m = st.hits[st.hit];
    $('#v-shits').textContent = `${st.hit + 1} von ${n}`;
    if (m.page !== st.page) await this.showPage(m.page);
    const r = $('#v-stage').getBoundingClientRect();
    st.zoom = Math.max(st.zoom, Math.min(4, 2.2 / st.fit));
    st.tx = r.width / 2 - (m.x + m.w / 2) * st.fit * st.zoom; st.ty = r.height / 2 - (m.y + m.h / 2) * st.fit * st.zoom;
    this.applyTransform(); this.drawInk(); this.scheduleRender();
  },
  syncTools() {
    const st = this.st;
    $$('#v-tools [data-tool]').forEach(b => { b.classList.toggle('on', b.dataset.tool === st.tool); b.setAttribute('aria-pressed', String(b.dataset.tool === st.tool)); });
    $$('#v-tools [data-color]').forEach(b => { b.classList.toggle('on', b.dataset.color === st.color); b.setAttribute('aria-pressed', String(b.dataset.color === st.color)); });
    $$('#v-tools [data-width]').forEach(b => { b.classList.toggle('on', b.dataset.width === st.weight); b.setAttribute('aria-pressed', String(b.dataset.width === st.weight)); });
    $('#v-dash').classList.toggle('on', st.dash); $('#v-dash').setAttribute('aria-pressed', String(st.dash));
    $('#v-tools').style.setProperty('--cur', st.color);
    Viewer.pref = { tool: st.tool, color: st.color, weight: st.weight, dash: st.dash };
    this.syncHist();
    $('#v-stage').style.cursor = st.editable || st.place ? 'crosshair' : 'grab';
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
  $$('#v-tools [data-tool]').forEach(b => b.onclick = () => { Viewer.st.tool = b.dataset.tool; Viewer.syncTools(); });
  $$('#v-tools [data-color]').forEach(b => b.onclick = () => { Viewer.st.color = b.dataset.color; if (Viewer.st.tool === 'erase') Viewer.st.tool = 'pen'; Viewer.syncTools(); });
  $$('#v-tools [data-width]').forEach(b => b.onclick = () => { Viewer.st.weight = b.dataset.width; if (Viewer.st.tool === 'erase') Viewer.st.tool = 'pen'; Viewer.syncTools(); });
  $('#v-dash').onclick = () => { Viewer.st.dash = !Viewer.st.dash; if (Viewer.st.tool === 'erase') Viewer.st.tool = 'pen'; Viewer.syncTools(); };
  $('#v-redo').onclick = () => Viewer.redoLast();
  $('#v-searchbtn').onclick = () => { const f = $('#v-search'), show = f.hidden; f.hidden = !show; $('#v-searchbtn').setAttribute('aria-expanded', String(show)); if (show) $('#v-q').focus(); else { Viewer.st.hits = []; $('#v-shits').textContent = ''; Viewer.drawInk(); } };
  $('#v-search').onsubmit = e => { e.preventDefault(); $('#v-q').blur(); Viewer.search($('#v-q').value); };
  $('#v-sprev').onclick = () => Viewer.gotoHit(Viewer.st.hit - 1);
  $('#v-snext').onclick = () => Viewer.gotoHit(Viewer.st.hit + 1);
  window.addEventListener('resize', () => { if (Viewer.st) Viewer.showPage(Viewer.st.page); });
  document.addEventListener('keydown', e => {
    if (!Viewer.st) return;
    if (e.key === 'Escape') { if (!$('#v-search').hidden && document.activeElement === $('#v-q')) { $('#v-searchbtn').click(); return; } Viewer.close(); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') { e.preventDefault(); if ($('#v-search').hidden) $('#v-searchbtn').click(); else $('#v-q').focus(); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? Viewer.redoLast() : Viewer.undoLast(); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); Viewer.redoLast(); }
  });
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
  $('#btn-home').onclick = () => { if (Viewer.st) Viewer.close(); closeDocs(); app.cur = null; setView('start'); };
  $('#btn-docs').onclick = openDocs;
  $('#btn-fotos').onclick = openFotos;
  document.addEventListener('keydown', e => { if (e.key !== 'Escape' || Viewer.st) return; const lb = document.querySelector('.lightbox'); if (lb) lb.remove(); else if ($('#docs')) closeDocs(); });
  $('#btn-back').onclick = () => { const i = STEPS.findIndex(x => x.k === app.view); if (i > 0) setView(STEPS[i - 1].k); };
  $('#btn-next').onclick = () => { const i = STEPS.findIndex(x => x.k === app.view); if (i < STEPS.length - 1) setView(STEPS[i + 1].k); };
  $('#file-zip').onchange = async e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    try {
      const v = await importZip(f), da = await findGz(v.gz);
      if (da) { toast(`GZ ${da.gz} ist schon auf diesem Gerät, es wurde nichts überschrieben. Zum neu Laden die bestehende Verhandlung zuerst löschen.`); openGz(da.id); return; }
      await DB.put(v); toast(`Verhandlung ${v.gz} importiert`); openGz(v.id);
    }
    catch (err) { toast('Import fehlgeschlagen: ' + err.message); }
  };
  $('#file-signed').onchange = async e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    try { await acceptSignedPdf(f); } catch (err) { toast(err.message); }
  };
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    // Neue Version: sobald der neue Service Worker übernimmt, einmal neu laden (Daten liegen in IndexedDB)
    const hadController = !!navigator.serviceWorker.controller; let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController && !reloaded) { reloaded = true; location.reload(); } });
    navigator.serviceWorker.register('sw.js').then(r => r.update()).catch(() => {});
  }
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  initBack();
  setView('start');
}
/* Zurück-Taste bzw. Zurück-Geste (Android): schließt zuerst Fenster und Ansichten, geht dann einen Schritt zurück.
   Erst auf der Startseite verlässt ein weiteres Zurück die App. */
const armBack = () => { try { if (!history.state || !history.state.gv) history.pushState({ gv: 1 }, ''); } catch (_) {} };
function initBack() {
  const arm = armBack;
  history.replaceState({ gv: 0 }, '');
  arm();
  window.addEventListener('popstate', () => {
    const q = sel => document.querySelector(sel);
    let handled = true;
    if (q('.lightbox')) q('.lightbox').remove();
    else if (q('.sigpad')) [...q('.sigpad').querySelectorAll('button')].find(b => b.textContent.trim() === 'Abbrechen')?.click();
    else if (q('.confirm-dlg')) q('.confirm-dlg').remove();
    else if (Viewer.st) Viewer.close();
    else if ($('#docs')) closeDocs();
    else if (app.view !== 'start' && app.cur) {
      const i = STEPS.findIndex(x => x.k === app.view);
      if (i > 0) setView(STEPS[i - 1].k); else { app.cur = null; setView('start'); }
    } else handled = false;
    if (handled) arm();
  });
  document.addEventListener('click', arm, true);
}
init();
