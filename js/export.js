/*
 * export.js
 * PDF (jsPDF, lokal in vendor/) und PNG (Canvas, ohne Bibliothek).
 * Beide Exporte nutzen dasselbe Datenmodell aus plan.js und sind unabhängig von der Bildschirmdarstellung.
 */
const COLOR = {
	dark: '#2c3030',
	red: '#a61627',
	gold: '#e3be46',
	green: '#001b17',
	cream: '#faf2e5',
	gray: '#5f6464',
};
const EMPTY_TEXT = '(kein Lied gewählt)';
const OFF_TEXT = '(entfällt)';
const FREI_TEXT = 'Frei (nach Wahl des Organisten)';
/* ================= Hilfen ================= */
function hexToRgb(hex) {
	const n = parseInt(hex.slice(1), 16);
	return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const CP1252_EXTRA = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';
/** Die eingebauten PDF-Schriften kennen nur Latin-1 und einige Satzzeichen. Anderes wird zu "?". */
function pdfSafe(text) {
	return [...String(text ?? '').normalize('NFC').replace(/\t/g, ' ')].map((ch) => {
		if (ch === '\n') return ch;
		const code = ch.charCodeAt(0);
		if (code < 32) return '';
		return code <= 255 || CP1252_EXTRA.includes(ch) ? ch : '?';
	}).join('');
}
export function downloadBlob(blob, filename) {
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	a.remove();
	setTimeout(() => URL.revokeObjectURL(url), 15000);
}
/* ================= PDF ================= */
export function createPdf(model, JsPDF) {
	const doc = new JsPDF({
		unit: 'mm',
		format: 'a4',
		orientation: 'portrait'
	});
	const W = 210;
	const H = 297;
	const M = 20;
	const BOTTOM = H - M - 4;
	const LABEL_X = M;
	const NR_X = M + 40;
	const TXT_X = NR_X + 20;
	const TXT_W = W - M - TXT_X;
	const LH = 5.6;
	let y = M;
	const color = (hex) => doc.setTextColor(...hexToRgb(hex));
	const font = (style, size) => {
		doc.setFont('courier', style);
		doc.setFontSize(size);
	};
	const ensure = (h) => {
		if (y + h > BOTTOM) {
			doc.addPage();
			y = M;
		}
	};
	const wrap = (text, width) => doc.splitTextToSize(pdfSafe(text), width);
	// Kopf
	font('bold', 26);
	color(COLOR.green);
	y += 8;
	doc.text('Liedplan', M, y);
	if (model.titel) {
		font('normal', 14);
		color(COLOR.dark);
		for (const line of wrap(model.titel, W - 2 * M)) {
			y += 7;
			doc.text(line, M, y);
		}
	}
	y += 5;
	doc.setDrawColor(...hexToRgb(COLOR.gold));
	doc.setLineWidth(1);
	doc.line(M, y, W - M, y);
	y += 8;
	// Stellen
	for (const r of model.rows) {
		font('normal', 12);
		const hasSong = r.aktiv && r.titel;
		const titleLines = hasSong || r.frei ? wrap(hasSong ? r.titel : FREI_TEXT, TXT_W) : [r.aktiv ? EMPTY_TEXT : OFF_TEXT];
		font('normal', 11);
		const strLines = r.strophen ? wrap(`Strophen: ${r.strophen}`, TXT_W) : [];
		font('italic', 11);
		const warnLines = r.warnung ? wrap(r.warnung, TXT_W) : [];
		const h = titleLines.length * LH + strLines.length * 5 + warnLines.length * 5 + 5;
		ensure(h);
		font('bold', 11);
		color(r.aktiv ? COLOR.red : COLOR.gray);
		doc.text(pdfSafe(r.stelle), LABEL_X, y + 4);
		if (hasSong) {
			font('bold', 12);
			color(COLOR.dark);
			doc.text(pdfSafe(r.nr), NR_X, y + 4);
		}
		font('normal', 12);
		color(hasSong || r.frei ? COLOR.dark : COLOR.gray);
		titleLines.forEach((line, i) => doc.text(line, TXT_X, y + 4 + i * LH));
		if (strLines.length) {
			font('normal', 11);
			color(COLOR.dark);
			strLines.forEach((line, i) => doc.text(line, TXT_X, y + 4 + titleLines.length * LH + i * 5));
		}
		if (warnLines.length) {
			font('italic', 11);
			color(COLOR.red);
			warnLines.forEach((line, i) => doc.text(line, TXT_X, y + 4 + titleLines.length * LH + strLines.length * 5 + i * 5));
		}
		y += h;
		doc.setDrawColor(...hexToRgb('#d9cdb4'));
		doc.setLineWidth(0.2);
		doc.line(M, y - 2.5, W - M, y - 2.5);
	}
	// Besondere Hinweise
	if (model.notes.length || model.hinweise) {
		ensure(24);
		y += 6;
		font('bold', 15);
		color(COLOR.green);
		doc.text('Besondere Hinweise', M, y);
		y += 3;
		doc.setDrawColor(...hexToRgb(COLOR.gold));
		doc.setLineWidth(0.6);
		doc.line(M, y, W - M, y);
		y += 6;
		font('normal', 11);
		color(COLOR.red);
		for (const note of model.notes) {
			for (const [i, line] of wrap(note, W - 2 * M - 5).entries()) {
				ensure(LH);
				if (i === 0) doc.text('-', M, y + 3.5);
				doc.text(line, M + 5, y + 3.5);
				y += LH;
			}
		}
		if (model.notes.length && model.hinweise) y += 2;
		color(COLOR.dark);
		for (const paragraph of pdfSafe(model.hinweise).split('\n')) {
			if (!paragraph.trim()) {
				y += LH * 0.7;
				continue;
			}
			for (const line of doc.splitTextToSize(paragraph, W - 2 * M)) {
				ensure(LH);
				doc.text(line, M, y + 3.5);
				y += LH;
			}
		}
	}
	// Seitenzahlen
	const pages = doc.getNumberOfPages();
	if (pages > 1) {
		for (let i = 1; i <= pages; i++) {
			doc.setPage(i);
			font('normal', 9);
			color(COLOR.gray);
			doc.text(`Seite ${i} von ${pages}`, W / 2, H - 10, {
				align: 'center'
			});
		}
	}
	return doc;
}
export async function exportPdf(model, filename) {
	const JsPDF = window.jspdf?.jsPDF;
	if (!JsPDF) {
		throw new Error('Die PDF-Bibliothek wurde nicht geladen. Bitte prüfen Sie, ob die Datei vendor/jspdf.umd.min.js vorhanden ist, und laden Sie die Seite neu.');
	}
	createPdf(model, JsPDF).save(filename);
}
/* ================= PDF: Liederliste ================= */
export function createListPdf(model, JsPDF) {
	const doc = new JsPDF({
		unit: 'mm',
		format: 'a4',
		orientation: 'portrait'
	});
	const W = 210;
	const H = 297;
	const M = 15;
	const BOTTOM = H - M - 6;
	const X_NR = M;
	const X_T = M + 20;
	const W_T = 86;
	const X_K = X_T + W_T + 4;
	const W_K = W - M - X_K;
	const LH = 4.3;
	let y = M;
	const color = (hex) => doc.setTextColor(...hexToRgb(hex));
	const font = (face, style, size) => {
		doc.setFont(face, style);
		doc.setFontSize(size);
	};
	const header = () => {
		font('helvetica', 'bold', 10);
		color(COLOR.red);
		doc.text('Nr.', X_NR, y + 4);
		doc.text('Titel', X_T, y + 4);
		doc.text('Kategorie', X_K, y + 4);
		y += 6.5;
		doc.setDrawColor(...hexToRgb(COLOR.dark));
		doc.setLineWidth(0.4);
		doc.line(M, y, W - M, y);
		y += 2;
	};
	font('courier', 'bold', 20);
	color(COLOR.green);
	y += 7;
	doc.text(pdfSafe(model.titel), M, y);
	font('helvetica', 'normal', 9.5);
	color(COLOR.gray);
	for (const info of model.info) {
		for (const line of doc.splitTextToSize(pdfSafe(info), W - 2 * M)) {
			y += 4.6;
			doc.text(line, M, y);
		}
	}
	y += 4;
	doc.setDrawColor(...hexToRgb(COLOR.gold));
	doc.setLineWidth(0.9);
	doc.line(M, y, W - M, y);
	y += 5;
	header();
	for (const r of model.rows) {
		font('helvetica', 'normal', 9.5);
		const tLines = doc.splitTextToSize(pdfSafe(r.titel), W_T);
		const kLines = doc.splitTextToSize(pdfSafe(r.kat), W_K);
		const h = Math.max(tLines.length, kLines.length) * LH + 2.6;
		if (y + h > BOTTOM) {
			doc.addPage();
			y = M;
			header();
		}
		font('helvetica', 'bold', 9.5);
		color(COLOR.dark);
		doc.text(pdfSafe(r.nr), X_NR, y + 3.6);
		font('helvetica', 'normal', 9.5);
		tLines.forEach((l, i) => doc.text(l, X_T, y + 3.6 + i * LH));
		color(COLOR.gray);
		kLines.forEach((l, i) => doc.text(l, X_K, y + 3.6 + i * LH));
		y += h;
		doc.setDrawColor(...hexToRgb('#d9cdb4'));
		doc.setLineWidth(0.15);
		doc.line(M, y - 1.3, W - M, y - 1.3);
	}
	const pages = doc.getNumberOfPages();
	for (let i = 1; i <= pages; i++) {
		doc.setPage(i);
		font('helvetica', 'normal', 9);
		color(COLOR.gray);
		doc.text(`Seite ${i} von ${pages}`, W / 2, H - 9, {
			align: 'center'
		});
	}
	return doc;
}
export async function exportListPdf(model, filename) {
	const JsPDF = window.jspdf?.jsPDF;
	if (!JsPDF) {
		throw new Error('Die PDF-Bibliothek wurde nicht geladen. Bitte prüfen Sie, ob die Datei vendor/jspdf.umd.min.js vorhanden ist, und laden Sie die Seite neu.');
	}
	createListPdf(model, JsPDF).save(filename);
}
/* ================= PNG ================= */
const TITLE_FONT = '"Courier Prime", "Times New Roman", serif';
const BODY_FONT = '"Ubuntu Mono", Arial, sans-serif';
const PNG_WIDTH = 1000;
const MAX_PIXELS = 16000000; // sichere Obergrenze für mobile Browser
async function ensureFonts() {
	if (!document.fonts?.load) return;
	try {
		await Promise.all([
			document.fonts.load('400 28px "Courier Prime"'),
			document.fonts.load('700 28px "Courier Prime"'),
			document.fonts.load('400 22px "Ubuntu Mono"'),
			document.fonts.load('700 22px "Ubuntu Mono"'),
		]);
	} catch (err) {
		/* Fallback-Schriften genügen */
	}
}

function wrapCanvasText(ctx, text, maxWidth) {
	const lines = [];
	for (const paragraph of String(text).split('\n')) {
		if (!paragraph.trim()) {
			lines.push('');
			continue;
		}
		let line = '';
		for (const word of paragraph.split(/\s+/).filter(Boolean)) {
			const test = line ? `${line} ${word}` : word;
			if (ctx.measureText(test).width <= maxWidth) {
				line = test;
				continue;
			}
			if (line) lines.push(line);
			line = word;
			// sehr lange Wörter zeichenweise umbrechen
			while (ctx.measureText(line).width > maxWidth && line.length > 1) {
				let cut = line.length - 1;
				while (cut > 1 && ctx.measureText(line.slice(0, cut)).width > maxWidth) cut--;
				lines.push(line.slice(0, cut));
				line = line.slice(cut);
			}
		}
		lines.push(line);
	}
	return lines;
}
/** Zeichnet den Plan. Mit dry=true wird nur die Höhe berechnet. */
function paint(ctx, model, dry) {
	const W = PNG_WIDTH;
	const PAD = 64;
	const LABEL_W = 220;
	const NR_W = 120;
	const TXT_X = PAD + LABEL_W + NR_W;
	const TXT_W = W - PAD - TXT_X;
	const text = (str, x, y, font, color) => {
		if (dry) return;
		ctx.font = font;
		ctx.fillStyle = color;
		ctx.fillText(str, x, y);
	};
	const setFont = (f) => {
		ctx.font = f;
	};
	// Kopfband
	const titleFont = `700 52px ${TITLE_FONT}`;
	const subFont = `400 28px ${TITLE_FONT}`;
	setFont(subFont);
	const subLines = model.titel ? wrapCanvasText(ctx, model.titel, W - 2 * PAD) : [];
	const bandH = 56 + 52 + (subLines.length ? 14 + subLines.length * 38 : 0) + 44;
	if (!dry) {
		ctx.fillStyle = COLOR.green;
		ctx.fillRect(0, 0, W, bandH);
		ctx.fillStyle = COLOR.gold;
		ctx.fillRect(0, bandH, W, 8);
	}
	let y = 56 + 44;
	text('Liedplan', PAD, y, titleFont, COLOR.cream);
	subLines.forEach((l, i) => text(l, PAD, y + 14 + 38 * (i + 1) - 6, subFont, COLOR.gold));
	y = bandH + 8 + 28;
	// Stellen
	for (const r of model.rows) {
		const hasSong = r.aktiv && r.titel;
		setFont(`400 30px ${TITLE_FONT}`);
		const titleLines = hasSong || r.frei ? wrapCanvasText(ctx, hasSong ? r.titel : FREI_TEXT, TXT_W) : [r.aktiv ? EMPTY_TEXT : OFF_TEXT];
		setFont(`400 24px ${BODY_FONT}`);
		const strLines = r.strophen ? wrapCanvasText(ctx, `Strophen: ${r.strophen}`, TXT_W) : [];
		const warnLines = r.warnung ? wrapCanvasText(ctx, r.warnung, TXT_W) : [];
		const rowH = Math.max(titleLines.length * 40, 40) + (strLines.length + warnLines.length) * 32 + 30;
		text(r.stelle, PAD, y + 30, `700 24px ${BODY_FONT}`, r.aktiv ? COLOR.red : COLOR.gray);
		if (hasSong) text(r.nr, PAD + LABEL_W, y + 30, `700 30px ${TITLE_FONT}`, COLOR.dark);
		titleLines.forEach((l, i) => text(l, TXT_X, y + 30 + i * 40, `400 30px ${TITLE_FONT}`, hasSong || r.frei ? COLOR.dark : COLOR.gray));
		strLines.forEach((l, i) => text(l, TXT_X, y + 30 + titleLines.length * 40 + 4 + i * 32, `400 24px ${BODY_FONT}`, COLOR.dark));
		warnLines.forEach((l, i) => text(l, TXT_X, y + 30 + titleLines.length * 40 + 4 + (strLines.length + i) * 32, `700 24px ${BODY_FONT}`, COLOR.red));
		y += rowH;
		if (!dry) {
			ctx.fillStyle = '#d9cdb4';
			ctx.fillRect(PAD, y - 12, W - 2 * PAD, 2);
		}
	}
	// Besondere Hinweise
	if (model.notes.length || model.hinweise) {
		y += 20;
		text('Besondere Hinweise', PAD, y + 30, `700 36px ${TITLE_FONT}`, COLOR.green);
		y += 50;
		if (!dry) {
			ctx.fillStyle = COLOR.gold;
			ctx.fillRect(PAD, y, W - 2 * PAD, 5);
		}
		y += 26;
		setFont(`400 26px ${BODY_FONT}`);
		for (const note of model.notes) {
			const lines = wrapCanvasText(ctx, note, W - 2 * PAD - 30);
			lines.forEach((l, i) => {
				if (i === 0) text('-', PAD, y + 26, `700 26px ${BODY_FONT}`, COLOR.red);
				text(l, PAD + 30, y + 26, `400 26px ${BODY_FONT}`, COLOR.red);
				y += 36;
			});
			setFont(`400 26px ${BODY_FONT}`);
		}
		if (model.notes.length && model.hinweise) y += 10;
		setFont(`400 26px ${BODY_FONT}`);
		for (const l of wrapCanvasText(ctx, model.hinweise, W - 2 * PAD)) {
			text(l, PAD, y + 26, `400 26px ${BODY_FONT}`, COLOR.dark);
			y += l ? 36 : 20;
		}
	}
	return y + PAD;
}
export function renderCanvas(model) {
	const measure = document.createElement('canvas').getContext('2d');
	const height = Math.ceil(paint(measure, model, true));
	let scale = 2;
	while (PNG_WIDTH * scale * height * scale > MAX_PIXELS && scale > 0.5) scale -= 0.25;
	const canvas = document.createElement('canvas');
	canvas.width = Math.round(PNG_WIDTH * scale);
	canvas.height = Math.round(height * scale);
	const ctx = canvas.getContext('2d');
	ctx.scale(scale, scale);
	ctx.textBaseline = 'alphabetic';
	ctx.fillStyle = COLOR.cream;
	ctx.fillRect(0, 0, PNG_WIDTH, height);
	paint(ctx, model, false);
	return canvas;
}
export async function exportPng(model, filename) {
	await ensureFonts();
	const canvas = renderCanvas(model);
	const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
	if (!blob) throw new Error('Das Bild konnte nicht erzeugt werden. Bitte versuchen Sie es erneut oder nutzen Sie den PDF-Export.');
	downloadBlob(blob, filename);
}
