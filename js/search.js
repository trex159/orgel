/*
 * search.js
 * Reine Such- und Vorschlagslogik. Kein Zugriff auf die Oberfläche.
 * Repertoire und Radius kommen aus der Konfiguration, Kategorien ausschließlich aus lieder.json.
 */
const SCALE = 10000; // Nummern werden als ganze Zahlen (x 10000) verglichen, das vermeidet Rundungsfehler
/* ---------- Hilfsfunktionen für Nummern ---------- */
export function toScaled(n) {
	return Math.round(n * SCALE);
}
/** Einheitlicher Schlüssel: 380, 380.0 und "380" ergeben immer "380"; 174.2 ergibt "174.2". */
export function numberKey(n) {
	return String(toScaled(Number(n)) / SCALE);
}
/** Anzeige im deutschen Format (Komma). */
export function formatNumber(n) {
	return numberKey(n).replace('.', ',');
}
/** Liest "174", "174.2" oder "174,2". Gibt null zurück, wenn es keine vollständige Zahl ist. */
export function parseNumberInput(text) {
	const t = String(text ?? '').trim().replace(',', '.');
	if (!/^\d+(\.\d+)?$/.test(t)) return null;
	const n = Number(t);
	return Number.isFinite(n) ? n : null;
}
/** Auch unvollständige Eingaben wie "17" oder "174." gelten als Nummernsuche. */
export function isNumericQuery(text) {
	return /^\d+[.,]?\d*$/.test(String(text ?? '').trim());
}
/* ---------- Text und Kategorien ---------- */
/** Vereinheitlicht Text für die tolerante Suche (Umlaute, ß, Satzzeichen, Groß-/Kleinschreibung). */
export function foldText(value) {
	return String(value ?? '').toLowerCase().replace(/ß/g, 'ss').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ae/g, 'a').replace(/oe/g, 'o').replace(/ue/g, 'u').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}
/** Schlüssel für den Kategorievergleich: exakt, nur Leerzeichen und Groß-/Kleinschreibung werden angeglichen. */
export function catKey(name) {
	return String(name ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
}
/** Zerlegt "A; B ;; A" in [{key, name}] ohne Leerwerte und ohne Doppelte. */
export function splitCategories(raw) {
	const seen = new Map();
	String(raw ?? '').split(';').forEach((part) => {
		const name = part.replace(/\s+/g, ' ').trim();
		if (!name) return;
		const key = catKey(name);
		if (!seen.has(key)) seen.set(key, name);
	});
	return [...seen].map(([key, name]) => ({
		key,
		name
	}));
}
/* ---------- Nachschlagen und Suchen ---------- */
/**
 * Prüft eine ausdrücklich eingegebene Nummer.
 * status: 'spielbar' | 'nicht-im-repertoire' | 'kein-lied' | 'unbekannt'
 */
export function lookupNumber(dir, nr) {
	const song = dir.byKey.get(numberKey(nr));
	if (!song) return {
		status: 'unbekannt',
		nr
	};
	if (!song.lied) return {
		status: 'kein-lied',
		song
	};
	if (!song.playable) return {
		status: 'nicht-im-repertoire',
		song
	};
	return {
		status: 'spielbar',
		song
	};
}
/** Sucht in einer Liedermenge (Standard: spielbare Lieder) nach Titel, Teilbegriffen oder Nummer. */
export function searchSongs(dir, query, pool = dir.playable) {
	const q = String(query ?? '').trim();
	if (!q) return [];
	if (isNumericQuery(q)) {
		const qn = q.replace(',', '.');
		const exact = parseNumberInput(q);
		const exactKey = exact === null ? null : numberKey(exact);
		return pool.filter((s) => s.key === exactKey || s.key.startsWith(qn)).sort((a, b) => (b.key === exactKey) - (a.key === exactKey) || a.scaled - b.scaled);
	}
	const joined = foldText(q);
	const tokens = joined.split(' ').filter(Boolean);
	if (!tokens.length) return [];
	const scored = [];
	for (const song of pool) {
		const hay = song.titelFold;
		if (!tokens.every((t) => hay.includes(t) || song.key.startsWith(t))) continue;
		const words = hay.split(' ');
		const wordStart = tokens.every((t) => words.some((w) => w.startsWith(t)) || song.key.startsWith(t));
		const score = hay.startsWith(joined) ? 0 : wordStart ? 1 : 2;
		scored.push({
			song,
			score
		});
	}
	scored.sort((a, b) => a.score - b.score || a.song.scaled - b.song.scaled);
	return scored.map((x) => x.song);
}
export const searchPlayable = (dir, query) => searchSongs(dir, query, dir.playable);
/** Kategorien mit mindestens einem Lied (spielbar oder, mit all=true, alle Lieder), alphabetisch. */
export function listCategories(dir, all = false) {
	return [...dir.categories.values()].map((c) => ({
		key: c.key,
		name: c.name,
		count: all ? c.liedCount : c.playableCount
	})).filter((c) => c.count > 0).sort((a, b) => a.name.localeCompare(b.name, 'de'));
}
/** Suche und Kategorie-Filter über einer Liedermenge. */
export function filterSongs(dir, {
	q = '',
	cat = '',
	pool = dir.playable
} = {}) {
	let list = q.trim() ? searchSongs(dir, q, pool) : pool;
	if (cat) list = list.filter((s) => s.catKeys.has(cat));
	return list;
}
/** Sortiert nach 'nr', 'titel' oder 'kategorie' (deutsche Alphabetreihenfolge). */
export function sortSongs(list, sort = 'nr', desc = false) {
	const col = new Intl.Collator('de', {
		sensitivity: 'base',
		numeric: true,
		ignorePunctuation: true
	});
	const byNr = (a, b) => a.scaled - b.scaled;
	const cmp = {
		nr: byNr,
		titel: (a, b) => col.compare(a.titel, b.titel) || byNr(a, b),
		kategorie: (a, b) => col.compare(a.kategorien.join('; '), b.kategorien.join('; ')) || byNr(a, b),
	} [sort] ?? byNr;
	const out = [...list].sort(cmp);
	return desc ? out.reverse() : out;
}
/* ---------- Kategorien-Abgleich ---------- */
/**
 * Findet spielbare Lieder, die mindestens eine der Kategorien besitzen (exakter Vergleich der
 * einzelnen Kategorien aus lieder.json). Sortierung: mehr gemeinsame Kategorien zuerst, dann
 * (falls angegeben) nähere Nummer, dann aufsteigende Nummer.
 */
export function matchByCategories(dir, keys, {
	exclude = null,
	near = null
} = {}) {
	const wanted = new Set(keys);
	const items = [];
	for (const song of dir.playable) {
		if (exclude && song.key === exclude) continue;
		let shared = 0;
		for (const k of song.catKeys)
			if (wanted.has(k)) shared++;
		if (shared > 0) items.push({
			song,
			shared
		});
	}
	const dist = (s) => (near === null ? 0 : Math.abs(s.scaled - near));
	items.sort((a, b) => b.shared - a.shared || dist(a.song) - dist(b.song) || a.song.scaled - b.song.scaled);
	return {
		items
	};
}
/** Kategoriesuche über das Dropdown. */
export function songsInCategory(dir, key) {
	return matchByCategories(dir, [key]);
}
/* ---------- Ersatzlieder ---------- */
/** Methode A: spielbare Lieder im Nummernumkreis (Grenzen einschließlich). */
export function suggestNearby(dir, config, song) {
	const radius = Math.round(config.suchradius * SCALE);
	const items = dir.playable.filter((s) => s.key !== song.key && Math.abs(s.scaled - song.scaled) <= radius).map((s) => ({
		song: s,
		distance: Math.abs(s.scaled - song.scaled) / SCALE
	})).sort((a, b) => a.distance - b.distance || a.song.scaled - b.song.scaled);
	return {
		items,
		from: (song.scaled - radius) / SCALE,
		to: (song.scaled + radius) / SCALE,
		radius: config.suchradius,
	};
}
/** Methode B: spielbare Lieder, die mindestens eine Kategorie teilen. */
export function suggestByCategory(dir, song) {
	if (!song.catKeys.size) return {
		items: []
	};
	return matchByCategories(dir, [...song.catKeys], {
		exclude: song.key,
		near: song.scaled
	});
}
