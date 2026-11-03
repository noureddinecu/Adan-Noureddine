import type { Dataset, Violation } from '../data/types';
import { LEXICON } from './lexicon';
import { levenshtein, normalize, STOP_WORDS, tokenize, variants } from './normalize';

interface Posting { doc: number; w: number }

export interface SearchHit {
  violation: Violation;
  score: number;
  coverage: number;
  /** Normalized vocabulary terms that matched — used for highlighting. */
  terms: Set<string>;
}

export interface SearchIndex {
  docs: Violation[];
  vocab: Map<string, Posting[]>;
  keys: string[];
  descNorm: string[];
  allNorm: string[];
  codeNorm: string[];
  articles: Map<string, Set<number>>;
  lexicon: Map<string, string[][]>;
}

const W = { code: 12, related: 7, desc: 5, section: 2, refs: 3, proc: 1.2 } as const;

export function buildIndex(ds: Dataset): SearchIndex {
  const vocab = new Map<string, Posting[]>();
  const best = new Map<string, Map<number, number>>();
  const add = (doc: number, text: string, w: number) => {
    for (const tok of tokenize(normalize(text))) {
      for (const v of variants(tok)) {
        const weight = v === tok ? w : w * 0.92;
        let m = best.get(v);
        if (!m) best.set(v, (m = new Map()));
        if ((m.get(doc) ?? 0) < weight) m.set(doc, weight);
      }
    }
  };
  const sectionTitle = new Map(ds.sections.map((s) => [s.key, `${s.title} ${s.short}`]));
  const articles = new Map<string, Set<number>>();
  ds.violations.forEach((v, i) => {
    add(i, v.code, W.code);
    v.relatedCodes.forEach((c) => add(i, c, W.related));
    if (v.codeNote) add(i, v.codeNote, W.section);
    add(i, v.description, W.desc);
    add(i, sectionTitle.get(v.section) ?? '', W.section);
    v.legalRefs.forEach((r) => add(i, r, W.refs));
    v.procedure.forEach((p) => add(i, p, W.proc));
    for (const a of v.articles) {
      let s = articles.get(a);
      if (!s) articles.set(a, (s = new Set()));
      s.add(i);
    }
  });
  for (const [k, m] of best) vocab.set(k, [...m].map(([doc, w]) => ({ doc, w })));
  const lexicon = new Map<string, string[][]>();
  for (const [k, vals] of Object.entries(LEXICON)) lexicon.set(normalize(k), vals.map((v) => tokenize(normalize(v))));
  return {
    docs: ds.violations,
    vocab,
    keys: [...vocab.keys()],
    descNorm: ds.violations.map((v) => normalize(v.description).replace(/\s+/g, ' ')),
    allNorm: ds.violations.map((v) => normalize([v.code, v.codeRaw, v.description, ...v.legalRefs, ...v.procedure].join(' ')).replace(/\s+/g, ' ')),
    codeNorm: ds.violations.map((v) => normalize(v.code)),
    articles,
    lexicon,
  };
}

/** Matches one query token against the vocabulary → (key, quality). */
function matchToken(idx: SearchIndex, q: string, cache: Map<string, [string, number][]>): [string, number][] {
  const cached = cache.get(q);
  if (cached) return cached;
  const out = new Map<string, number>();
  const put = (k: string, s: number) => { if ((out.get(k) ?? 0) < s) out.set(k, s); };
  const qv = variants(q);
  for (const v of qv) if (idx.vocab.has(v)) put(v, v === q ? 1 : 0.95);
  const isNum = /^\d+$/.test(q);
  const maxEdit = q.length >= 7 ? 2 : q.length >= 4 ? 1 : 0;
  const fuzzyCandidates: string[] = [];
  for (const k of idx.keys) {
    if (k.length > q.length && k.startsWith(q) && (q.length >= 2 || isNum)) { put(k, 0.82); continue; }
    if (q.length >= 3 && !isNum && k.includes(q)) { put(k, 0.55); continue; }
    if (isNum && q.length >= 4 && k.includes(q)) { put(k, 0.6); continue; }
    if (maxEdit && !isNum && Math.abs(k.length - q.length) <= maxEdit + 2) fuzzyCandidates.push(k);
  }
  // typo tolerance only when the word itself is not found
  if (!out.size) for (const k of fuzzyCandidates) {
    {
      const d = levenshtein(q, k, maxEdit);
      if (d <= maxEdit) { put(k, 0.62 - d * 0.1); continue; }
      // typo inside a word prefix ("السرغة" → "السرعه...")
      if (k.length > q.length) {
        const dp = levenshtein(q, k.slice(0, q.length), maxEdit);
        if (dp <= maxEdit) put(k, 0.45 - dp * 0.08);
      }
    }
  }
  const res = [...out];
  cache.set(q, res);
  return res;
}

const ARTICLE_RE = /(?:^|\s)(?:الماده|المادتان|المادتين|المواد|ماده|مادتان|م|art|article|articles)\.?\s*(\d{1,3})(?:\s*[-‐]\s*1)?\s*(?:\(\s*(\d{1,2})\s*\))?/;

export function search(idx: SearchIndex, raw: string, limit = 200): SearchHit[] {
  let qn = normalize(raw).replace(/\s+/g, ' ').trim();
  if (!qn) return [];
  const cache = new Map<string, [string, number][]>();

  // «المادة 184» / «المادة 184(04)» → filter on legal references
  let artFilter: Set<number> | null = null;
  const am = qn.match(ARTICLE_RE);
  if (am) {
    const key = am[2] ? `${+am[1]}(${am[2].padStart(2, '0')})` : String(+am[1]);
    artFilter = idx.articles.get(key) ?? new Set();
    qn = qn.replace(am[0], ' ').trim();
  }

  let toks = tokenize(qn);
  const content = toks.filter((t) => !STOP_WORDS.has(t));
  if (content.length) toks = content;

  // each query token becomes a group of alternatives (itself + lexicon expansions)
  const groups: string[][][] = toks.map((t) => {
    const alts: string[][] = [[t]];
    for (const v of variants(t)) {
      const exp = idx.lexicon.get(v);
      if (exp) alts.push(...exp);
    }
    return alts;
  });

  const n = idx.docs.length;
  const scores = new Float64Array(n);
  const covered = new Uint16Array(n);
  const terms: Set<string>[] = Array.from({ length: n }, () => new Set());

  for (const alts of groups) {
    const groupScore = new Float64Array(n);
    const groupTerms = new Map<number, string[]>();
    for (const alt of alts) {
      // all tokens of an alternative must match the same document
      const per = alt.map((tok) => {
        const m = new Map<number, { s: number; keys: string[] }>();
        for (const [key, quality] of matchToken(idx, tok, cache)) {
          for (const p of idx.vocab.get(key)!) {
            const s = quality * p.w;
            const e = m.get(p.doc);
            if (!e) m.set(p.doc, { s, keys: [key] });
            else { e.keys.push(key); if (s > e.s) e.s = s; }
          }
        }
        return m;
      });
      if (!per.length) continue;
      const altPenalty = alt === alts[0] ? 1 : 0.9;
      for (const [doc, first] of per[0]) {
        let s = first.s;
        const keys = [...first.keys];
        let ok = true;
        for (let i = 1; i < per.length && ok; i++) {
          const e = per[i].get(doc);
          if (!e) ok = false; else { s += e.s; keys.push(...e.keys); }
        }
        if (!ok) continue;
        s = (s / per.length) * altPenalty;
        if (s > groupScore[doc]) { groupScore[doc] = s; groupTerms.set(doc, keys); }
      }
    }
    for (let d = 0; d < n; d++) {
      if (groupScore[d] > 0) {
        scores[d] += groupScore[d];
        covered[d]++;
        for (const k of groupTerms.get(d) ?? []) terms[d].add(k);
      }
    }
  }

  const G = groups.length;
  const phrase = qn.length >= 4 ? qn : '';
  const hits: SearchHit[] = [];
  for (let d = 0; d < n; d++) {
    if (artFilter && !artFilter.has(d)) continue;
    let cov = G ? covered[d] / G : 1;
    let score = scores[d];
    if (G && covered[d] === 0) continue;
    if (phrase) {
      if (idx.descNorm[d].includes(phrase)) score += 25;
      else if (idx.allNorm[d].includes(phrase)) score += 8;
    }
    if (idx.codeNorm[d] === qn) score += 200;
    // prefer rows where a matched term opens the description, and shorter (more specific) rows
    const head = tokenize(idx.descNorm[d]).slice(0, 4);
    if (head.some((t) => variants(t).some((v) => terms[d].has(v)))) score += 4;
    score += 2 * (1 - Math.min(idx.descNorm[d].length, 300) / 300);
    if (artFilter) score += 10;
    hits.push({ violation: idx.docs[d], score, coverage: cov, terms: terms[d] });
  }
  if (!hits.length) return hits;
  const maxCov = Math.max(...hits.map((h) => h.coverage));
  const threshold = G >= 3 ? Math.max(0.5, maxCov - 0.34) : maxCov;
  return hits
    .filter((h) => h.coverage >= threshold - 1e-9)
    .sort((a, b) => b.coverage - a.coverage || b.score - a.score || a.violation.id.localeCompare(b.violation.id))
    .slice(0, limit);
}

export interface Segment { text: string; hit: boolean }

/** Splits text into highlighted / plain segments according to matched terms. */
export function highlight(text: string, terms: Set<string> | undefined): Segment[] {
  if (!terms || !terms.size) return [{ text, hit: false }];
  const parts = text.split(/([\p{L}\p{N}\p{M}]+)/u);
  const segs: Segment[] = [];
  for (const part of parts) {
    if (!part) continue;
    let hit = false;
    if (/[\p{L}\p{N}]/u.test(part)) {
      const toks = tokenize(normalize(part));
      hit = toks.some((t) => variants(t).some((v) => terms.has(v)));
    }
    const last = segs[segs.length - 1];
    if (last && last.hit === hit) last.text += part; else segs.push({ text: part, hit });
  }
  // keep whitespace between two highlighted words inside a single mark
  return segs;
}
