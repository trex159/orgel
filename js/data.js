/*
 * data.js
 * Lädt data/lieder.json und data/config.json, prüft sie und baut daraus das Verzeichnis.
 * Fatale Fehler werfen eine DataError, kleinere Probleme landen als Hinweise in "warnings".
 */
import {
	numberKey,
	toScaled,
	formatNumber,
	parseNumberInput,
	foldText,
	splitCategories,
} from './search.js';
export class DataError extends Error {}
const LIEDER_PATH = 'data/lieder.json';
const CONFIG_PATH = 'data/config.json';
async function loadJson(path) {
	let response;
	try {
		response = await fetch(path, {
			cache: 'no-cache'
		});
	} catch (err) {
		const hint = location.protocol === 'file:' ? ' Die Seite wurde direkt als Datei geöffnet. Bitte starten Sie sie über einen lokalen Server (siehe README.md).' : ' Bitte prüfen Sie die Internetverbindung und den Dateipfad.';
		throw new DataError(`Die Datei ${path} konnte nicht geladen werden.${hint}`);
	}
	if (!response.ok) {
		throw new DataError(`Die Datei ${path} konnte nicht geladen werden (Fehler ${response.status}). Liegt sie im Ordner data/?`);
	}
	try {
		return await response.json();
	} catch (err) {
		throw new DataError(`Die Datei ${path} enthält kein gültiges JSON (${err.message}). Bitte Kommas, Klammern und Anführungszeichen prüfen.`);
	}
}
/* ---------- Konfiguration ---------- */
export function normalizeConfig(raw, warnings) {
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
		throw new DataError('Die Datei data/config.json hat ein ungültiges Format. Erwartet wird ein JSON-Objekt.');
	}
	if (!Array.isArray(raw.SpielbareLieder)) {
		throw new DataError('In data/config.json fehlt die Liste "SpielbareLieder".');
	}
	const spielbar = new Set();
	for (const v of raw.SpielbareLieder) {
		const n = typeof v === 'number' ? v : parseNumberInput(v);
		if (n === null || !Number.isFinite(n)) {
			warnings.push(`Ungültiger Eintrag in "SpielbareLieder" wurde ignoriert: ${JSON.stringify(v)}`);
			continue;
		}
		spielbar.add(numberKey(n));
	}
	let suchradius = 20;
	if (raw.Suchradius !== undefined) {
		const r = Number(raw.Suchradius);
		if (Number.isFinite(r) && r >= 0) suchradius = r;
		else warnings.push('"Suchradius" in data/config.json ist ungültig. Es gilt der Standardwert 20.');
	}
	return {
		spielbar,
		suchradius
	};
}
/* ---------- Verzeichnis ---------- */
export function buildDirectory(rawSongs, config, warnings) {
	if (!Array.isArray(rawSongs)) {
		throw new DataError('Die Datei data/lieder.json muss eine Liste von Einträgen enthalten.');
	}
	const byKey = new Map();
	const categories = new Map();
	const duplicates = new Set();
	rawSongs.forEach((e, i) => {
		if (!e || typeof e !== 'object') {
			warnings.push(`Eintrag ${i + 1} in lieder.json ist ungültig und wurde übersprungen.`);
			return;
		}
		const nr = typeof e.Nummer === 'number' ? e.Nummer : parseNumberInput(e.Nummer);
		const titel = typeof e.Titel === 'string' ? e.Titel.replace(/\s+/g, ' ').trim() : '';
		if (nr === null || !Number.isFinite(nr) || !titel) {
			warnings.push(`Eintrag ${i + 1} in lieder.json hat keine gültige Nummer oder keinen Titel und wurde übersprungen.`);
			return;
		}
		const key = numberKey(nr);
		let lied = e.Lied;
		if (typeof lied !== 'boolean') {
			warnings.push(`Nr. ${formatNumber(nr)} hat kein gültiges Feld "Lied" (true/false) und wird als Nicht-Lied behandelt.`);
			lied = false;
		}
		const existing = byKey.get(key);
		if (existing) {
			duplicates.add(formatNumber(nr));
			if (existing.lied || !lied) return; // erster Eintrag bleibt, außer ein späterer ist ein Lied und der erste nicht
		}
		const cats = splitCategories(e.Kategorie);
		for (const c of cats) {
			if (!categories.has(c.key)) categories.set(c.key, {
				key: c.key,
				name: c.name,
				playableCount: 0,
				liedCount: 0
			});
		}
		byKey.set(key, {
			nr,
			key,
			scaled: toScaled(nr),
			titel,
			titelFold: foldText(titel),
			lied,
			kategorien: cats.map((c) => c.name),
			catKeys: new Set(cats.map((c) => c.key)),
			playable: false,
		});
	});
	if (duplicates.size) {
		warnings.push(`Diese Nummern kommen mehrfach vor, es wird jeweils nur ein Eintrag verwendet (ein Lied hat Vorrang): ${[...duplicates].join(', ')}`);
	}
	if (byKey.size === 0) {
		throw new DataError('Die Datei data/lieder.json enthält keine gültigen Einträge.');
	}
	// Spielbar = in SpielbareLieder UND im Verzeichnis UND Lied: true
	const missing = [];
	const notSongs = [];
	for (const key of config.spielbar) {
		const song = byKey.get(key);
		if (!song) missing.push(formatNumber(Number(key)));
		else if (!song.lied) notSongs.push(formatNumber(song.nr));
		else song.playable = true;
	}
	if (missing.length) {
		warnings.push(`Diese Nummern aus "SpielbareLieder" fehlen im Verzeichnis und werden ignoriert: ${missing.join(', ')}`);
	}
	if (notSongs.length) {
		warnings.push(`Diese Nummern aus "SpielbareLieder" sind im Verzeichnis als Nicht-Lied markiert und werden ignoriert: ${notSongs.join(', ')}`);
	}
	const songs = [...byKey.values()].sort((a, b) => a.scaled - b.scaled);
	const playable = songs.filter((s) => s.playable);
	if (!playable.length) warnings.push('Es gibt kein spielbares Lied. Bitte "SpielbareLieder" in data/config.json prüfen.');
	const lieder = songs.filter((s) => s.lied);
	for (const s of lieder)
		for (const k of s.catKeys) categories.get(k).liedCount++;
	for (const s of playable)
		for (const k of s.catKeys) categories.get(k).playableCount++;
	return {
		songs,
		byKey,
		playable,
		lieder,
		categories
	};
}
export async function loadAll() {
	const warnings = [];
	const [rawSongs, rawConfig] = await Promise.all([loadJson(LIEDER_PATH), loadJson(CONFIG_PATH)]);
	const config = normalizeConfig(rawConfig, warnings);
	const directory = buildDirectory(rawSongs, config, warnings);
	return {
		directory,
		config,
		warnings
	};
}
