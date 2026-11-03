// Parses data-source/transcription.txt (faithful manual transcription of the scanned PDF)
// into public/data/violations.json + docs/extraction-report.json.
// The legal text is copied verbatim; this script only structures it.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(root, 'data-source/transcription.txt'), 'utf8').split('\n');

export const SECTIONS = [
  { key: 'deg1', title: 'مخالفات من الدرجة الأولى', short: 'الدرجة الأولى', color: '#ef2426', main: true },
  { key: 'deg2', title: 'مخالفات من الدرجة الثانية', short: 'الدرجة الثانية', color: '#f3e922', main: true },
  { key: 'deg3', title: 'مخالفات من الدرجة الثالثة', short: 'الدرجة الثالثة', color: '#5fe8a8', main: true },
  { key: 'admin', title: 'مخالفات إدارية', short: 'المخالفات الإدارية', color: '#24d8f0', main: true },
  { key: 'delit', title: 'الجنح', short: 'الجنح', color: '#ef832e', main: true },
  { key: 'art94', title: 'المخالفات لقواعد السير المقررة تطبيقا للمادة 94', short: 'مخالفات الراجلين (المادة 94)', color: '#141414', main: false },
  { key: 'stop', title: 'المخالفات التي تستوجب القيام بمسطرة التوقيف إلى حين إنهاء المخالفة', short: 'مسطرة التوقيف إلى حين إنهاء المخالفة', color: '#5f1a39', main: false },
];
const ORDER = ['deg1', 'deg2', 'deg3', 'art94', 'admin', 'stop', 'delit']; // order of appearance in the PDF

const macros = {};
const records = [];
const errors = [];
let cur = null, field = null, inMacro = null;

for (let i = 0; i < src.length; i++) {
  const line = src[i].replace(/\s+$/, '');
  if (inMacro) {
    if (line === 'PEND') { macros[inMacro.name] = inMacro.lines.join('\n'); inMacro = null; }
    else inMacro.lines.push(line);
    continue;
  }
  if (line.startsWith('PDEF ')) { inMacro = { name: line.slice(5).trim(), lines: [] }; cur = null; continue; }
  if (line.startsWith('#') || line.startsWith('===')) { cur = null; continue; }
  if (line.startsWith('@@ ')) {
    const parts = line.slice(3).split('|').map((s) => s.trim());
    const meta = Object.fromEntries(parts.slice(1).map((p) => p.split('=').map((s) => s.trim())));
    cur = { codeRaw: parts[0], pdfPage: +meta.pdf, printedPage: +meta.printed, section: meta.section, shared: meta.shared || null, D: [], R: [], P: [], N: [], line: i + 1 };
    records.push(cur); field = null; continue;
  }
  if (!cur) { if (line.trim()) errors.push(`stray line ${i + 1}: ${line}`); continue; }
  const m = line.match(/^([DRPN]): ?(.*)$/);
  if (m) { field = m[1]; cur[field].push(m[2]); continue; }
  if (!line.trim()) { field = null; continue; }
  if (field) cur[field].push(line); else errors.push(`orphan line ${i + 1}: ${line}`);
}

const expand = (lines) => lines.flatMap((l) => {
  const mm = l.match(/^@(\w+)$/);
  if (!mm) return [l];
  if (!(mm[1] in macros)) { errors.push(`unknown macro ${mm[1]}`); return [l]; }
  return macros[mm[1]].split('\n');
});

// Extract article numbers of the road code / decrees for search ("المادة 184").
function extractArticles(refLines) {
  const set = new Set();
  for (const raw of refLines) {
    let t = raw
      .replace(/\d+[-.]\d+[-.]\d+/g, ' ') // decree / dahir numbers e.g. 2-10-420
      .replace(/\b\d{1,4}[-.]\d{3,4}\b/g, ' ') // arrêtés e.g. 10-2865, 2849.10
      .replace(/\b\d{4}[-.]\d{1,2}\b/g, ' ');
    // 112-1(04) / 61-1 / 87أ(07) / 87ب(06)
    for (const m of t.matchAll(/(\d{1,3})(?:\s*-\s*1)?\s*([أب])?\s*\(?\s*(\d{1,2})?\s*\)?/g)) {
      const n = m[1];
      if (!n || +n === 0) continue;
      set.add(String(+n));
      if (m[3]) set.add(`${+n}(${m[3].padStart(2, '0')})`);
    }
  }
  return [...set];
}

const bySection = Object.fromEntries(SECTIONS.map((s) => [s.key, []]));
const out = records.map((r, idx) => {
  const codes = r.codeRaw.split('+').map((s) => s.trim()).filter(Boolean);
  const isCode = (c) => /^[0-9]{6}[A-Z0-9]{2,3}$/i.test(c);
  const primary = codes.find(isCode) || r.codeRaw;
  const rec = {
    id: '',
    code: primary,
    codeRaw: r.codeRaw,
    relatedCodes: codes.filter((c) => c !== primary && isCode(c)),
    codeNote: codes.filter((c) => !isCode(c)).join(' ') || null,
    section: r.section,
    description: r.D.join('\n').trim(),
    legalRefs: r.R.map((s) => s.trim()).filter(Boolean),
    procedure: expand(r.P).map((s) => s.trim()).filter(Boolean),
    extractionNotes: r.N.map((s) => s.replace(/^\[ملاحظة الاستخراج\]\s*/, '').trim()).filter(Boolean),
    pdfPage: r.pdfPage,
    printedPage: r.printedPage,
    sharedCell: r.shared,
    sharedWith: [],
    articles: extractArticles(r.R),
  };
  if (!SECTIONS.find((s) => s.key === rec.section)) errors.push(`bad section ${rec.section} line ${r.line}`);
  if (!rec.description) errors.push(`missing D at line ${r.line}`);
  if (!rec.legalRefs.length) errors.push(`missing R at line ${r.line}`);
  if (!rec.procedure.length) errors.push(`missing P at line ${r.line}`);
  bySection[rec.section].push(rec);
  rec.order = bySection[rec.section].length;
  rec.id = `${rec.section}-${String(rec.order).padStart(3, '0')}`;
  return rec;
});

// shared (merged) procedure cells
const groups = {};
for (const r of out) if (r.sharedCell) (groups[r.sharedCell] ||= []).push(r);
for (const g of Object.values(groups)) for (const r of g) r.sharedWith = g.filter((x) => x !== r).map((x) => x.id);

// duplicate codes (kept separately, as in the source)
const codeCount = {};
for (const r of out) codeCount[r.code] = (codeCount[r.code] || 0) + 1;
for (const r of out) r.duplicateCode = codeCount[r.code] > 1 && !/^\*+$/.test(r.code);

const pages = [...new Set(out.map((r) => r.pdfPage))].sort((a, b) => a - b);
const source = {
  title: 'دليل المراقبة الطرقية الخاص بأعوان الشرطة محرري المحاضر',
  subtitle: 'مدونة السير على الطرق — القانون 05-52 وفق آخر التعديلات',
  edition: 'يناير 2025',
  pdfPages: 35,
};
const data = {
  version: createHash('sha1').update(JSON.stringify(out)).digest('hex').slice(0, 12),
  source,
  sections: SECTIONS.map((s) => ({ ...s, count: bySection[s.key].length, firstPdfPage: Math.min(...bySection[s.key].map((r) => r.pdfPage)), lastPdfPage: Math.max(...bySection[s.key].map((r) => r.pdfPage)) }))
    .sort((a, b) => ORDER.indexOf(a.key) - ORDER.indexOf(b.key)),
  violations: out,
};
mkdirSync(join(root, 'public/data'), { recursive: true });
writeFileSync(join(root, 'public/data/violations.json'), JSON.stringify(data));

const report = {
  source,
  pagesInPdf: 35,
  pagesWithTables: pages,
  pagesWithoutViolations: Array.from({ length: 35 }, (_, i) => i + 1).filter((p) => !pages.includes(p)),
  totalViolations: out.length,
  perSection: data.sections.map((s) => ({ key: s.key, title: s.title, count: s.count, pdfPages: `${s.firstPdfPage}-${s.lastPdfPage}` })),
  sharedCells: Object.fromEntries(Object.entries(groups).map(([k, v]) => [k, v.map((r) => r.code)])),
  duplicateCodes: Object.entries(codeCount).filter(([c, n]) => n > 1).map(([c, n]) => ({ code: c, occurrences: n })),
  recordsWithExtractionNotes: out.filter((r) => r.extractionNotes.length).map((r) => ({ id: r.id, code: r.code, pdfPage: r.pdfPage, notes: r.extractionNotes })),
  errors,
};
mkdirSync(join(root, 'docs'), { recursive: true });
writeFileSync(join(root, 'docs/extraction-report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ total: out.length, perSection: report.perSection.map((s) => `${s.key}:${s.count}`), pages: pages.join(','), errors }, null, 1));
if (errors.length) process.exit(1);
