/*
 * app.js
 * Oberfläche: Ansicht "Liedplan erstellen" (Stellen wählen, Lieder per Drag-and-drop oder Klick zuordnen)
 * und Ansicht "Liederliste" (Tabelle mit Filter, Sortierung und PDF).
 */
import {
	loadAll,
	DataError
} from './data.js';
import {
	STELLEN,
	loadPlan,
	savePlan,
	resetPlan,
	songOf,
	unplayableNotes,
	buildExportModel,
	parseStrophen,
	invalidStrophen,
} from './plan.js';
import * as S from './search.js';
import {
	exportPdf,
	exportPng,
	exportListPdf
} from './export.js';
const PAGE = 25; // Einträge pro Ergebnisliste, danach "Weitere anzeigen"
const MODE_KEY = 'orgelplaner.mode';
const SORT_LABEL = {
	nr: 'Nummer',
	titel: 'Titel (A bis Z)',
	kategorie: 'Kategorie'
};
const app = {
	dir: null,
	cfg: null,
	plan: null,
	mode: 'plan',
	target: null, // Stelle, für die gerade ein Lied gewählt wird
	sel: null, // aufgeklapptes Lied (Schlüssel) in der Auswahl
	dragKey: null,
	browser: {
		q: '',
		cat: '',
		all: false,
		sort: 'auto',
		limits: {}
	},
	list: {
		q: '',
		cat: '',
		sort: 'nr',
		desc: false
	},
};
const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({
	'&': '&amp;',
	'<': '&lt;',
	'>': '&gt;',
	'"': '&quot;',
	"'": '&#39;'
} [c]));
const idOf = (name) => S.foldText(name).replace(/\s+/g, '-');
const nrText = (song) => S.formatNumber(song.nr);
const catText = (song) => song.kategorien.join(' · ');
const activeStellen = () => STELLEN.filter((n) => app.plan.stellen[n].aktiv);
/* ================= Start ================= */
async function init() {
	try {
		const {
			directory,
			config,
			warnings
		} = await loadAll();
		app.dir = directory;
		app.cfg = config;
		const {
			plan,
			notices
		} = loadPlan(directory);
		app.plan = plan;
		showNotices([...warnings, ...notices]);
		setupUi();
		renderAll();
		let mode = 'plan';
		try {
			mode = sessionStorage.getItem(MODE_KEY) === 'list' ? 'list' : 'plan';
		} catch (err) {
			/* ignorieren */
		}
		$('#loading').hidden = true;
		$('#app').hidden = false;
		setMode(mode);
	} catch (err) {
		$('#loading').hidden = true;
		const box = $('#fatal');
		const msg = err instanceof DataError ? err.message : `Unerwarteter Fehler: ${err.message}`;
		box.innerHTML = `<h2>Die Anwendung konnte nicht gestartet werden</h2><p>${esc(msg)}</p>`;
		box.hidden = false;
		console.error(err);
	}
}

function showNotices(list) {
	const box = $('#data-notices');
	box.innerHTML = list.length ? `<details class="card warn"><summary>Hinweise zu den Daten (${list.length})</summary><ul>${list
        .map((w) => `<li>${esc(w)}</li>`)
        .join('')}</ul></details>` : '';
}

function fillCategories(select, all, current) {
	const cats = S.listCategories(app.dir, all);
	select.innerHTML = `<option value="">Alle Kategorien</option>` + cats.map((c) => `<option value="${esc(c.key)}">${esc(c.name)} (${c.count})</option>`).join('');
	const keep = cats.some((c) => c.key === current) ? current : '';
	select.value = keep;
	return keep;
}

function syncInputs() {
	$('#plan-titel').value = app.plan.titel;
	$('#hinweise').value = app.plan.hinweise;
	$('#export-alle').checked = app.plan.exportAlle;
	$('#chooser').innerHTML = STELLEN.map(
		(n) => `<label class="choice"><input type="checkbox" data-action="toggle" data-stelle="${esc(n)}"${
        app.plan.stellen[n].aktiv ? ' checked' : ''
      }><span>${esc(n)}</span></label>`).join('');
}

function setupUi() {
	syncInputs();
	fillCategories($('#b-cat'), false, '');
	fillCategories($('#l-cat'), false, '');
	$('#plan-titel').addEventListener('input', (e) => {
		app.plan.titel = e.target.value;
		savePlan(app.plan);
	});
	$('#hinweise').addEventListener('input', (e) => {
		app.plan.hinweise = e.target.value;
		savePlan(app.plan);
	});
	$('#export-alle').addEventListener('change', (e) => {
		app.plan.exportAlle = e.target.checked;
		savePlan(app.plan);
	});
	$('#export-pdf').addEventListener('click', () => doExport('pdf'));
	$('#export-png').addEventListener('click', () => doExport('png'));
	$('#reset-plan').addEventListener('click', doReset);
	// Auswahl-Bereich (Plan-Ansicht)
	const b = app.browser;
	$('#b-q').addEventListener('input', (e) => {
		b.q = e.target.value;
		b.limits = {};
		app.sel = null;
		renderBrowser();
	});
	$('#b-cat').addEventListener('change', (e) => {
		b.cat = e.target.value;
		b.limits = {};
		renderBrowser();
	});
	$('#b-sort').addEventListener('change', (e) => {
		b.sort = e.target.value;
		b.limits = {};
		renderBrowser();
	});
	$('#b-all').addEventListener('change', (e) => {
		b.all = e.target.checked;
		b.cat = fillCategories($('#b-cat'), b.all, b.cat);
		b.limits = {};
		renderBrowser();
	});
	// Liederliste
	const l = app.list;
	$('#l-q').addEventListener('input', (e) => {
		l.q = e.target.value;
		renderList();
	});
	$('#l-cat').addEventListener('change', (e) => {
		l.cat = e.target.value;
		renderList();
	});
	$('#l-sort').addEventListener('change', (e) => {
		l.sort = e.target.value;
		renderList();
	});
	$('#l-desc').addEventListener('change', (e) => {
		l.desc = e.target.checked;
		renderList();
	});
	$('#list-pdf').addEventListener('click', doListPdf);
	// Strophen je Stelle
	const slotsEl = $('#stellen');
	slotsEl.addEventListener('input', (e) => {
		const name = e.target.dataset?.strophen;
		if (!name) return;
		app.plan.stellen[name].strophen = e.target.value;
		savePlan(app.plan);
		const bad = !parseStrophen(e.target.value).ok;
		e.target.toggleAttribute('aria-invalid', bad);
		$(`#str-${idOf(name)}-err`).textContent = bad ? 'Bitte so eingeben: 1-3 oder 1+3+4.' : '';
	});
	slotsEl.addEventListener('change', (e) => {
		const name = e.target.dataset?.strophen;
		if (!name) return;
		const res = parseStrophen(e.target.value);
		if (res.ok) {
			e.target.value = res.text;
			app.plan.stellen[name].strophen = res.text;
			savePlan(app.plan);
		}
	});
	// Stellen ein-/ausschalten
	$('#chooser').addEventListener('change', (e) => {
		const el = e.target;
		if (el.dataset.action !== 'toggle') return;
		app.plan.stellen[el.dataset.stelle].aktiv = el.checked;
		if (!el.checked && app.target === el.dataset.stelle) app.target = null;
		savePlan(app.plan);
		renderAll();
	});
	// Klicks und Tastatur
	document.addEventListener('click', (e) => {
		const el = e.target.closest('[data-action]');
		if (el && el.type !== 'checkbox') handleAction(el);
	});
	document.addEventListener('keydown', (e) => {
		if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('.song-main')) {
			e.preventDefault();
			handleAction(e.target);
		}
	});
	// Drag-and-drop: Lied auf eine Stelle ziehen
	document.addEventListener('dragstart', (e) => {
		const el = e.target.closest?.('.song-main');
		if (!el) return;
		app.dragKey = el.dataset.key;
		e.dataTransfer.setData('text/plain', el.dataset.key);
		e.dataTransfer.effectAllowed = 'copy';
	});
	document.addEventListener('dragend', () => {
		app.dragKey = null;
		clearDropMarks();
	});
	const slots = $('#stellen');
	slots.addEventListener('dragover', (e) => {
		const li = e.target.closest('[data-drop]');
		if (!app.dragKey || !li) return;
		e.preventDefault();
		e.dataTransfer.dropEffect = 'copy';
		if (!li.classList.contains('drop-over')) {
			clearDropMarks();
			li.classList.add('drop-over');
		}
	});
	slots.addEventListener('dragleave', (e) => {
		const li = e.target.closest('[data-drop]');
		if (li && !li.contains(e.relatedTarget)) li.classList.remove('drop-over');
	});
	slots.addEventListener('drop', (e) => {
		const li = e.target.closest('[data-drop]');
		if (!app.dragKey || !li) return;
		e.preventDefault();
		const key = app.dragKey;
		app.dragKey = null;
		clearDropMarks();
		assignKey(li.dataset.drop, key);
	});
}

function clearDropMarks() {
	document.querySelectorAll('.drop-over').forEach((el) => el.classList.remove('drop-over'));
}

function setMode(mode) {
	app.mode = mode;
	$('#view-plan').hidden = mode !== 'plan';
	$('#view-list').hidden = mode !== 'list';
	$('#mode-plan').setAttribute('aria-pressed', String(mode === 'plan'));
	$('#mode-list').setAttribute('aria-pressed', String(mode === 'list'));
	try {
		sessionStorage.setItem(MODE_KEY, mode);
	} catch (err) {
		/* ignorieren */
	}
	if (mode === 'list') renderList();
}
/* ================= Hilfen zur Darstellung ================= */
function keepFocus(fn) {
	const key = document.activeElement?.dataset?.focus;
	fn();
	if (key) focusByKey(key);
}

function focusByKey(key) {
	const el = document.querySelector(`[data-focus="${CSS.escape(key)}"]`);
	if (el) el.focus();
}

function renderAll() {
	renderSlots();
	renderNotes();
	renderBrowser();
}

function warnLine(song) {
	if (song.playable) return '';
	return `<p class="warn-line" role="note"><strong>Achtung:</strong> ${
    song.lied ? 'Dieses Lied ist nicht spielbar (nicht in Ihrem Repertoire).' : 'Dieser Eintrag ist kein Lied und nicht spielbar.'
  } Es steht in den besonderen Hinweisen.</p>`;
}
/* ================= Plan: Stellen ================= */
function strophenField(name, st) {
	const id = idOf(name);
	const bad = !parseStrophen(st.strophen).ok;
	return `<div class="strophen">
    <label for="str-${id}">Strophen (freiwillig)</label>
    <input id="str-${id}" type="text" autocomplete="off" value="${esc(st.strophen || '')}" data-strophen="${esc(name)}" data-focus="str-${id}" placeholder="z. B. 1-3 oder 1+3+4" aria-describedby="str-${id}-hint str-${id}-err"${bad ? ' aria-invalid="true"' : ''}>
    <p id="str-${id}-hint" class="hint">Bereich mit Bindestrich (1-3), mehrere mit Plus (1+3+4). Leer lassen für alle Strophen.</p>
    <p id="str-${id}-err" class="field-error" role="alert">${bad ? 'Bitte so eingeben: 1-3 oder 1+3+4.' : ''}</p>
  </div>`;
}

function renderSlots() {
	keepFocus(() => {
		const active = activeStellen();
		if (!active.length) {
			$('#stellen').innerHTML = `<li class="empty">Es ist keine Stelle ausgewählt. Setzen Sie oben bei mindestens einer Stelle einen Haken.</li>`;
			return;
		}
		$('#stellen').innerHTML = active.map((name) => {
			const st = app.plan.stellen[name];
			const id = idOf(name);
			const song = songOf(app.plan, app.dir, name);
			let body;
			if (song) {
				body = `<div class="song"><span class="nr">${esc(nrText(song))}</span><span class="titel">${esc(song.titel)}</span></div>` + (song.kategorien.length ? `<p class="kat">${esc(catText(song))}</p>` : '') + warnLine(song) + strophenField(name, st);
			} else if (st.frei) {
				body = `<p class="frei"><strong>Frei:</strong> Der Organist wählt, was gespielt wird.</p>`;
			} else {
				body = `<p class="empty">Noch kein Lied. Ziehen Sie ein Lied hierher oder tippen Sie auf „Lied wählen“.</p>`;
			}
			let actions = `<button type="button" class="btn btn-primary" data-action="choose" data-stelle="${esc(name)}" data-focus="choose-${id}">${
          song || st.frei ? 'Lied ändern' : 'Lied wählen'
        }</button>`;
			actions += st.frei ? `<button type="button" class="btn" data-action="frei" data-stelle="${esc(name)}" data-focus="frei-${id}">Frei aufheben</button>` : `<button type="button" class="btn" data-action="frei" data-stelle="${esc(name)}" data-focus="frei-${id}">Frei</button>`;
			if (song) actions += `<button type="button" class="btn" data-action="clear" data-stelle="${esc(name)}" data-focus="clear-${id}">Entfernen</button>`;
			if (song && !song.playable) {
				actions += `<button type="button" class="btn" data-action="replace" data-stelle="${esc(name)}" data-focus="replace-${id}">Ersatz vorschlagen</button>`;
			}
			return `<li class="stelle${app.target === name ? ' is-target' : ''}" data-drop="${esc(name)}">
          <h3 class="stelle-name">${esc(name)}</h3>
          <div class="stelle-body">${body}<div class="actions">${actions}</div></div>
        </li>`;
		}).join('');
	});
}

function renderNotes() {
	const notes = unplayableNotes(app.plan, app.dir);
	$('#auto-notes').innerHTML = notes.length ? `<div class="card warn"><p><strong>Diese Hinweise stehen automatisch im Export:</strong></p><ul>${notes
        .map((n) => `<li>${esc(n)}</li>`)
        .join('')}</ul></div>` : '';
}

function assignKey(stelle, key) {
	const song = app.dir.byKey.get(key);
	if (!song || !app.plan.stellen[stelle]?.aktiv) return;
	const st = app.plan.stellen[stelle];
	if (st.nr !== song.nr) st.strophen = '';
	st.nr = song.nr;
	st.frei = false;
	app.target = null;
	app.sel = null;
	savePlan(app.plan);
	renderAll();
	focusByKey(`choose-${idOf(stelle)}`);
}

function armTarget(stelle, {
	q = null
} = {}) {
	app.target = stelle;
	app.sel = null;
	if (q !== null) {
		app.browser.q = q;
		app.browser.cat = fillCategories($('#b-cat'), app.browser.all, '');
		app.browser.limits = {};
		$('#b-q').value = q;
	}
	renderAll();
	if (!window.matchMedia('(min-width: 64em)').matches) $('#browser').scrollIntoView();
	$('#b-q').focus();
}
/* ================= Plan: Auswahl-Bereich ================= */
function insertControls(song) {
	const active = activeStellen();
	if (!active.length) return `<p class="hint">Bitte zuerst oben mindestens eine Stelle auswählen.</p>`;
	if (app.target) {
		return `<div class="insert"><button type="button" class="btn btn-primary" data-action="insert" data-stelle="${esc(app.target)}" data-key="${esc(
      song.key
    )}">Bei „${esc(app.target)}“ einfügen</button></div>`;
	}
	return `<div class="insert"><p class="insert-title">Einfügen bei:</p><ul class="chips">${active
    .map((n) => {
      const st = app.plan.stellen[n];
      const filled = st.nr !== null || st.frei;
      return `<li><button type="button" class="chip" data-action="insert" data-stelle="${esc(n)}" data-key="${esc(song.key)}">${esc(n)}${
        filled ? ' <small>(ersetzen)</small>' : ''
      }</button></li>`;
    })
    .join('')}</ul></div>`;
}

function songRow(song, listId, extra = '') {
	const selected = app.sel === song.key && !app.target;
	return `<li class="song-row${selected ? ' is-selected' : ''}">
    <div class="song-main" role="button" tabindex="0" draggable="true" data-action="select" data-key="${esc(song.key)}" data-focus="song-${listId}-${esc(
      song.key
    )}"${app.target ? '' : ` aria-expanded="${selected}"`} aria-label="Lied ${esc(nrText(song))} ${esc(song.titel)}">
      <span class="nr">${esc(nrText(song))}</span>
      <span class="titel">${esc(song.titel)}</span>
      ${song.playable ? '' : '<span class="badge">nicht spielbar</span>'}
      <span class="kat">${esc(catText(song))}</span>
      ${extra ? `<span class="extra">${esc(extra)}</span>` : ''}
    </div>
    ${selected ? warnLine(song) + insertControls(song) : ''}
  </li>`;
}

function listSection(id, heading, items, opts = {}) {
	const lvl = opts.level || 3;
	let html = `<section class="group"><h${lvl}>${esc(heading)}${items.length ? ` <span class="count">(${items.length})</span>` : ''}</h${lvl}>`;
	if (opts.hint) html += `<p class="hint">${esc(opts.hint)}</p>`;
	if (!items.length) {
		if (opts.empty) html += `<p class="empty">${esc(opts.empty)}</p>`;
		return `${html}</section>`;
	}
	const limit = app.browser.limits[id] || PAGE;
	const shown = items.slice(0, limit);
	html += `<ul class="results" data-list="${id}">${shown
    .map((it) => songRow(it.song, id, opts.extra ? opts.extra(it) : ''))
    .join('')}</ul>`;
	if (items.length > shown.length) {
		html += `<button type="button" class="btn" data-action="more" data-list="${id}">Weitere anzeigen (${items.length - shown.length})</button>`;
	}
	return `${html}</section>`;
}

function statusCard(exact, q) {
	if (exact.status === 'unbekannt') {
		return `<div class="card error" role="status"><p><strong>Nummer ${esc(q)}:</strong> Diese Nummer gibt es im Verzeichnis nicht.</p></div>`;
	}
	const song = exact.song;
	const text = exact.status === 'kein-lied' ? 'Vermutlich kein Lied. Der Eintrag ist im Verzeichnis nicht als Lied gekennzeichnet und nicht spielbar.' : 'Dieses Lied ist nicht in Ihrem Repertoire und daher nicht spielbar.';
	return `<div class="card warn" role="status">
    <p><strong>Nr. ${esc(nrText(song))}: ${esc(song.titel)}</strong></p>
    ${song.kategorien.length ? `<p class="kat">${esc(catText(song))}</p>` : ''}
    <p>${esc(text)}</p>
    <p class="hint">Sie können es trotzdem einfügen. Im Plan erscheint dann automatisch ein Hinweis, dass es nicht spielbar ist.</p>
    ${insertControls(song)}
  </div>`;
}

function replacementView(song) {
	const near = S.suggestNearby(app.dir, app.cfg, song);
	const byCat = S.suggestByCategory(app.dir, song);
	const catHint = song.kategorien.length ? `Kategorien von Nr. ${nrText(song)}: ${catText(song)}` : '';
	return (`<h3 class="repl-title">Ersatzvorschläge für Nr. ${esc(nrText(song))}</h3>` + listSection('near', 'Lieder im Nummernumkreis', near.items, {
		level: 4,
		hint: `Spielbare Lieder von Nr. ${S.formatNumber(near.from)} bis Nr. ${S.formatNumber(near.to)}`,
		empty: `Im Nummernumkreis (plus/minus ${S.formatNumber(near.radius)}) gibt es kein spielbares Lied.`,
		extra: (it) => `Abstand ${S.formatNumber(it.distance)}`,
	}) + listSection('cat', 'Lieder aus passenden Kategorien', byCat.items, {
		level: 4,
		hint: catHint,
		empty: song.kategorien.length ? 'Keine spielbaren Lieder mit passenden Kategorien gefunden.' : 'Dieses Lied hat keine Kategorie, deshalb gibt es keine Vorschläge nach Kategorien.',
	}));
}

function renderBanner() {
	const t = app.target;
	$('#target-banner').innerHTML = t ? `<div class="card target" role="status"><p><strong>Lied für „${esc(t)}“ wählen.</strong> Tippen Sie ein Lied an, es wird sofort eingefügt.</p><button type="button" class="btn" data-action="cancel-target">Abbrechen</button></div>` : '';
}

function renderBrowser() {
	keepFocus(() => {
		renderBanner();
		const b = app.browser;
		const q = b.q.trim();
		const pool = b.all ? app.dir.lieder : app.dir.playable;
		let html = '';
		let excludeKey = null;
		if (q && S.isNumericQuery(q)) {
			const n = S.parseNumberInput(q);
			const exact = n === null ? null : S.lookupNumber(app.dir, n);
			if (exact && (exact.status === 'nicht-im-repertoire' || exact.status === 'kein-lied')) {
				excludeKey = exact.song.key;
				html += statusCard(exact, q) + replacementView(exact.song);
			} else if (exact && exact.status === 'unbekannt') {
				html += statusCard(exact, q);
			}
		}
		let list = S.filterSongs(app.dir, {
			q: b.q,
			cat: b.cat,
			pool
		});
		if (excludeKey) list = list.filter((s) => s.key !== excludeKey);
		if (!(b.sort === 'auto' && q)) list = S.sortSongs(list, b.sort === 'auto' ? 'nr' : b.sort);
		const catName = b.cat ? app.dir.categories.get(b.cat)?.name : '';
		const heading = q ? `Treffer für „${q}“` : catName ? `Lieder in „${catName}“` : b.all ? 'Alle Lieder des Verzeichnisses' : 'Spielbare Lieder';
		html += listSection('main', heading, list.map((song) => ({
			song
		})), {
			hint: b.all ? 'Lieder, die Sie nicht spielen können, sind als „nicht spielbar“ markiert.' : '',
			empty: 'Kein Lied gefunden. Tipp: Probieren Sie weniger Wörter oder geben Sie die Liednummer ein.',
		});
		$('#browser-results').innerHTML = html;
	});
}
/* ================= Liederliste ================= */
function currentListItems() {
	const l = app.list;
	return S.sortSongs(S.filterSongs(app.dir, {
		q: l.q,
		cat: l.cat
	}), l.sort, l.desc);
}

function renderList() {
	const l = app.list;
	const items = currentListItems();
	$('#l-sort').value = l.sort;
	$('#l-desc').checked = l.desc;
	$('#list-body').innerHTML = items.map(
		(s) => `<tr><td class="c-nr">${esc(nrText(s))}</td><td class="c-titel">${esc(s.titel)}</td><td class="c-kat">${esc(catText(s))}</td></tr>`).join('');
	$('#list-empty').hidden = items.length > 0;
	$('#list-count').textContent = `${items.length} von ${app.dir.playable.length} spielbaren Liedern`;
	document.querySelectorAll('.song-table th[data-col]').forEach((th) => {
		const active = th.dataset.col === l.sort;
		th.setAttribute('aria-sort', active ? (l.desc ? 'descending' : 'ascending') : 'none');
		th.querySelector('.sort-ind').textContent = active ? (l.desc ? '▼' : '▲') : '';
	});
}
async function doListPdf() {
	const msg = $('#list-msg');
	msg.classList.remove('is-error');
	const l = app.list;
	const items = currentListItems();
	if (!items.length) {
		msg.classList.add('is-error');
		msg.textContent = 'Die Liste ist leer. Bitte Suche oder Kategorie ändern.';
		return;
	}
	const info = [`${items.length} Lieder`];
	if (l.q.trim()) info.push(`Suche: „${l.q.trim()}“`);
	if (l.cat) info.push(`Kategorie: ${app.dir.categories.get(l.cat)?.name ?? l.cat}`);
	info.push(`Sortierung: ${SORT_LABEL[l.sort]}${l.desc ? ' (absteigend)' : ''}`);
	const model = {
		titel: 'Spielbare Lieder',
		info: [info.join('  |  ')],
		rows: items.map((s) => ({
			nr: nrText(s),
			titel: s.titel,
			kat: catText(s)
		})),
	};
	const btn = $('#list-pdf');
	btn.disabled = true;
	msg.textContent = 'Das PDF wird erstellt …';
	try {
		await exportListPdf(model, 'Spielbare-Lieder.pdf');
		msg.textContent = 'Das PDF wurde erstellt und gespeichert.';
	} catch (err) {
		console.error(err);
		msg.classList.add('is-error');
		msg.textContent = `Der Export hat nicht funktioniert: ${err.message}`;
	} finally {
		btn.disabled = false;
	}
}
/* ================= Aktionen ================= */
function handleAction(el) {
	const a = el.dataset.action;
	const stelle = el.dataset.stelle;
	const key = el.dataset.key;
	switch (a) {
		case 'mode':
			setMode(el.dataset.mode);
			break;
		case 'sort': {
			const l = app.list;
			if (l.sort === el.dataset.sort) l.desc = !l.desc;
			else {
				l.sort = el.dataset.sort;
				l.desc = false;
			}
			renderList();
			break;
		}
		case 'choose':
			armTarget(stelle);
			break;
		case 'replace': {
			const song = songOf(app.plan, app.dir, stelle);
			armTarget(stelle, {
				q: song ? nrText(song) : ''
			});
			break;
		}
		case 'cancel-target':
			app.target = null;
			renderAll();
			break;
		case 'frei': {
			const st = app.plan.stellen[stelle];
			st.frei = !st.frei;
			if (st.frei) {
				st.nr = null;
				st.strophen = '';
			}
			savePlan(app.plan);
			renderAll();
			break;
		}
		case 'clear':
			app.plan.stellen[stelle].nr = null;
			app.plan.stellen[stelle].strophen = '';
			savePlan(app.plan);
			renderAll();
			focusByKey(`choose-${idOf(stelle)}`);
			break;
		case 'select':
			if (app.target) assignKey(app.target, key);
			else {
				app.sel = app.sel === key ? null : key;
				renderBrowser();
			}
			break;
		case 'insert':
			assignKey(stelle, key);
			break;
		case 'more': {
			const id = el.dataset.list;
			const before = app.browser.limits[id] || PAGE;
			app.browser.limits[id] = before + PAGE;
			renderBrowser();
			const first = document.querySelector(`#browser-results ul[data-list="${id}"] li:nth-child(${before + 1}) .song-main`);
			if (first) first.focus();
			break;
		}
		default:
			break;
	}
}

function doReset() {
	if (!window.confirm('Möchten Sie den gesamten Plan wirklich zurücksetzen? Alle Lieder und Hinweise gehen verloren.')) return;
	app.plan = resetPlan();
	app.target = null;
	app.sel = null;
	syncInputs();
	$('#export-msg').textContent = '';
	renderAll();
}
/* ================= Export des Plans ================= */
function exportFilename(ext) {
	const slug = S.foldText(app.plan.titel).replace(/\s+/g, '-').slice(0, 40);
	const d = new Date();
	const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
	return `Liedplan_${slug || date}.${ext}`;
}
async function doExport(kind) {
	const msg = $('#export-msg');
	msg.classList.remove('is-error');
	const model = buildExportModel(app.plan, app.dir);
	if (!model.rows.length) {
		msg.classList.add('is-error');
		msg.textContent = 'Es ist keine Stelle aktiviert. Bitte setzen Sie mindestens einen Haken.';
		return;
	}
	const bad = invalidStrophen(app.plan);
	if (bad.length) {
		msg.classList.add('is-error');
		msg.textContent = `Bitte die Strophenangabe korrigieren bei: ${bad.join(', ')}.`;
		return;
	}
	const buttons = [$('#export-pdf'), $('#export-png')];
	buttons.forEach((b) => (b.disabled = true));
	msg.textContent = 'Der Plan wird erstellt …';
	try {
		if (kind === 'pdf') await exportPdf(model, exportFilename('pdf'));
		else await exportPng(model, exportFilename('png'));
		msg.textContent = kind === 'pdf' ? 'Das PDF wurde erstellt und gespeichert.' : 'Das Bild wurde erstellt und gespeichert.';
	} catch (err) {
		console.error(err);
		msg.classList.add('is-error');
		msg.textContent = `Der Export hat nicht funktioniert: ${err.message}`;
	} finally {
		buttons.forEach((b) => (b.disabled = false));
	}
}
init();
