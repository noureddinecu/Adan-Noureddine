// نظام اختيار الأسئلة: التصنيفات، الاستبعاد، الصعوبة، النسب الثقافية، وعدم التكرار
// Question selection: category include/exclude, difficulty, cultural quotas, no repeats.
import { isStale, DIFFICULTIES } from './schema.js';

/** 65% Arab & Moroccan culture, 25% world culture, 10% miscellaneous foreign questions. */
export const DEFAULT_QUOTA = { arab: 0.65, world: 0.25, foreign: 0.1 };

function shuffle(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Split `n` questions between regions according to `quota` (largest remainder),
 * then move any shortfall to regions that still have questions available.
 */
export function allocate(n, quota, available) {
  const regions = Object.keys(quota);
  const total = regions.reduce((s, r) => s + quota[r], 0) || 1;
  const exact = regions.map((r) => (n * quota[r]) / total);
  const counts = Object.fromEntries(regions.map((r, i) => [r, Math.floor(exact[i])]));
  let rest = n - Object.values(counts).reduce((a, b) => a + b, 0);
  regions
    .map((r, i) => ({ r, frac: exact[i] - Math.floor(exact[i]) }))
    .sort((a, b) => b.frac - a.frac)
    .forEach(({ r }) => { if (rest > 0) { counts[r]++; rest--; } });

  let shortfall = 0;
  for (const r of regions) {
    const cap = available[r] || 0;
    if (counts[r] > cap) { shortfall += counts[r] - cap; counts[r] = cap; }
  }
  // Redistribute in quota order (arab first, then world, then foreign).
  const order = regions.slice().sort((a, b) => quota[b] - quota[a]);
  while (shortfall > 0) {
    const r = order.find((x) => (available[x] || 0) > counts[x]);
    if (!r) break;
    counts[r]++;
    shortfall--;
  }
  return counts;
}

/** Filter the bank down to playable questions for the given settings. */
export function filterPool(bank, opts = {}) {
  const {
    categories = [], // include list; empty = all categories (random mode)
    excludeCategories = [],
    excludeSubcategories = [], // ids in the form "category/subcategory"
    difficulties = [],
    types = [],
    maxAgeDays = 180,
    now = Date.now(),
  } = opts;
  return bank.filter((q) => {
    if (q.status !== 'published') return false;
    if (isStale(q, maxAgeDays, now)) return false; // changing sports info that needs re-verification
    if (categories.length && !categories.includes(q.category)) return false;
    if (excludeCategories.includes(q.category)) return false;
    if (q.subcategory && excludeSubcategories.includes(`${q.category}/${q.subcategory}`)) return false;
    if (difficulties.length && !difficulties.includes(q.difficulty)) return false;
    if (types.length && !types.includes(q.type)) return false;
    return true;
  });
}

/**
 * Pick `count` questions. Guarantees: no duplicate ids and no two questions about the same
 * fact (factKey) in one round; prefers questions not in `recentIds` (asked in earlier rounds);
 * spreads picks across categories; follows the cultural quota as closely as the pool allows.
 */
export function selectQuestions(bank, opts = {}, rng = Math.random) {
  const { count = 10, quota = DEFAULT_QUOTA, recentIds = [], progressive = false } = opts;
  const pool = filterPool(bank, opts);
  const recent = new Set(recentIds);

  const byRegion = {};
  for (const r of Object.keys(quota)) byRegion[r] = [];
  for (const q of pool) (byRegion[q.region] ||= []).push(q);

  // Count distinct facts available per region (a factKey counts once).
  const available = {};
  for (const [r, qs] of Object.entries(byRegion)) available[r] = new Set(qs.map((q) => q.factKey || q.id)).size;

  const target = Math.min(count, Object.values(available).reduce((a, b) => a + b, 0));
  const counts = allocate(target, quota, available);

  const usedFacts = new Set();
  const picked = [];
  for (const [region, n] of Object.entries(counts)) {
    if (!n) continue;
    // Fresh questions first, previously-asked ones only as a fallback.
    const candidates = byRegion[region] || [];
    const fresh = shuffle(candidates.filter((q) => !recent.has(q.id)), rng);
    const old = shuffle(candidates.filter((q) => recent.has(q.id)), rng);
    // Round-robin across categories for variety: fresh questions first, then old ones.
    let taken = 0;
    for (const tier of [fresh, old]) {
      const groups = new Map();
      for (const q of tier) {
        if (!groups.has(q.category)) groups.set(q.category, []);
        groups.get(q.category).push(q);
      }
      const queues = shuffle([...groups.values()], rng);
      while (taken < n && queues.some((g) => g.length)) {
        for (const g of queues) {
          if (taken >= n) break;
          while (g.length) {
            const q = g.shift();
            const key = q.factKey || q.id;
            if (usedFacts.has(key)) continue;
            usedFacts.add(key);
            picked.push(q);
            taken++;
            break;
          }
        }
      }
    }
  }

  let ordered = shuffle(picked, rng);
  if (progressive) {
    const rank = Object.fromEntries(DIFFICULTIES.map((d, i) => [d, i]));
    ordered = ordered.sort((a, b) => rank[a.difficulty] - rank[b.difficulty]);
  }

  const stats = { requested: count, returned: ordered.length, pool: pool.length, available, byRegion: {} };
  for (const q of ordered) stats.byRegion[q.region] = (stats.byRegion[q.region] || 0) + 1;
  return { questions: ordered, stats };
}
