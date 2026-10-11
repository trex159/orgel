/*
 * plan.js
 * Zustand des Liedplans, Speicherung in sessionStorage und Aufbereitung für den Export.
 */
import {
	numberKey,
	formatNumber
} from './search.js';
/** Feste Reihenfolge der liturgischen Stellen. Sie ändert sich nie. */
export const STELLEN = ['Eingang', 'Kyrie', 'Gloria', 'Zwischengesang', 'Halleluja', 'Christusruf', 'Credo', 'Gabenbereitung', 'Sanctus', 'Agnus Dei', 'Kommunion', 'Danksagung', 'Schluss', ];
const STORAGE_KEY = 'orgelplaner.plan.v1';
export function defaultPlan() {
	const stellen = {};
	for (const name of STELLEN) stellen[name] = {
		aktiv: true,
		nr: null,
		frei: false,
		strophen: ''
	};
	return {
		titel: '',
		stellen,
		hinweise: '',
		exportAlle: false
	};
}
/** Stellt den Plan aus sessionStorage wieder her und verwirft ungültige Inhalte. */
export function loadPlan(directory) {
	const notices = [];
	const plan = defaultPlan();
	let stored = null;
	try {
		const raw = sessionStorage.getItem(STORAGE_KEY);
		if (raw) stored = JSON.parse(raw);
	} catch (err) {
		stored = null;
	}
	if (!stored || typeof stored !== 'object') return {
		plan,
		notices
	};
	if (typeof stored.titel === 'string') plan.titel = stored.titel.slice(0, 200);
	if (typeof stored.hinweise === 'string') plan.hinweise = stored.hinweise;
	plan.exportAlle = stored.exportAlle === true;
	for (const name of STELLEN) {
		const s = stored.stellen?.[name];
		if (!s || typeof s !== 'object') continue;
		plan.stellen[name].aktiv = s.aktiv !== false;
		plan.stellen[name].frei = s.frei === true && (s.nr === null || s.nr === undefined);
		if (s.nr !== null && s.nr !== undefined) {
			const n = Number(s.nr);
			if (Number.isFinite(n) && directory.byKey.has(numberKey(n))) {
				plan.stellen[name].nr = n;
				if (typeof s.strophen === 'string') plan.stellen[name].strophen = s.strophen.slice(0, 60);
			} else notices.push(`Die gespeicherte Nummer ${s.nr} (${name}) gibt es im Verzeichnis nicht mehr und wurde entfernt.`);
		}
	}
	return {
		plan,
		notices
	};
}
export function savePlan(plan) {
	try {
		sessionStorage.setItem(STORAGE_KEY, JSON.stringify(plan));
		return true;
	} catch (err) {
		return false; // z. B. blockierter Speicher: die Anwendung funktioniert weiter, nur ohne Wiederherstellung
	}
}
export function resetPlan() {
	try {
		sessionStorage.removeItem(STORAGE_KEY);
	} catch (err) {
		/* ignorieren */
	}
	return defaultPlan();
}
/** Das Lied zu einer Stelle (oder null). */
export function songOf(plan, directory, name) {
	const nr = plan.stellen[name]?.nr;
	return nr === null || nr === undefined ? null : directory.byKey.get(numberKey(nr)) ?? null;
}
/**
 * Prüft und vereinheitlicht eine Strophenangabe.
 * Erlaubt: "2", "1-3", "1 bis 3", "1+3+4", "1, 3 und 4", "1-2 + 4". Leer ist erlaubt.
 * Ergebnis: { ok: true, text: "1 - 3" } oder { ok: false }.
 */
export function parseStrophen(raw) {
	const input = String(raw ?? '').replace(/\bund\b/gi, '+').replace(/\bbis\b/gi, '-').trim();
	if (!input) return {
		ok: true,
		text: ''
	};
	const parts = input.split(/[+,;]/).map((p) => p.trim());
	const out = [];
	for (const part of parts) {
		const m = part.match(/^(\d{1,3})(?:\s*[-\u2013\u2014]\s*(\d{1,3}))?$/);
		if (!m) return {
			ok: false
		};
		const a = Number(m[1]);
		if (a < 1) return {
			ok: false
		};
		if (m[2] === undefined) {
			out.push(String(a));
		} else {
			const b = Number(m[2]);
			if (b <= a) return {
				ok: false
			};
			out.push(`${a} - ${b}`);
		}
	}
	return {
		ok: true,
		text: out.join(' + ')
	};
}
/** Stellen, deren Strophenangabe ungültig ist (für die Prüfung vor dem Export). */
export function invalidStrophen(plan) {
	return STELLEN.filter((n) => {
		const st = plan.stellen[n];
		return st.aktiv && st.nr !== null && !parseStrophen(st.strophen).ok;
	});
}

function noteText(song, stelle) {
	const n = formatNumber(song.nr);
	return song.lied ? `Das Lied mit der Nummer ${n} (${stelle}) ist nicht spielbar.` : `Die Nummer ${n} (${stelle}) ist kein Lied und nicht spielbar.`;
}
/** Automatische Hinweise für aktive Stellen mit nicht spielbarem Lied. */
export function unplayableNotes(plan, directory) {
	const notes = [];
	for (const name of STELLEN) {
		if (!plan.stellen[name].aktiv) continue;
		const song = songOf(plan, directory, name);
		if (song && !song.playable) notes.push(noteText(song, name));
	}
	return notes;
}
/** Gemeinsames Datenmodell für PDF und PNG. */
export function buildExportModel(plan, directory) {
	const rows = [];
	for (const name of STELLEN) {
		const st = plan.stellen[name];
		if (!st.aktiv && !plan.exportAlle) continue;
		const song = st.aktiv ? songOf(plan, directory, name) : null;
		rows.push({
			stelle: name,
			aktiv: st.aktiv,
			frei: st.aktiv && st.frei === true && !song,
			nr: song ? formatNumber(song.nr) : '',
			strophen: song ? parseStrophen(st.strophen).text ?? '' : '',
			titel: song ? song.titel : '',
			warnung: song && !song.playable ? (song.lied ? 'Nicht spielbar' : 'Kein Lied, nicht spielbar') : '',
		});
	}
	return {
		titel: plan.titel.trim(),
		rows,
		notes: unplayableNotes(plan, directory),
		hinweise: plan.hinweise.trim(),
	};
}
