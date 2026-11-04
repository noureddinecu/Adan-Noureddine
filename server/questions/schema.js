// مخطط السؤال والتحقق من الجودة
// Question schema, defaults and quality validation.
import { normalize, compactKey, looseTokens } from './normalize.js';

export const LANGS = ['ar', 'fr', 'en'];
export const DIFFICULTIES = ['easy', 'medium', 'hard'];
export const REGIONS = ['arab', 'world', 'foreign']; // ثقافة عربية ومغربية / ثقافة عالمية / أسئلة أجنبية متنوعة
export const STATUSES = ['draft', 'review', 'published'];
export const TYPES = [
  'mcq', // سؤال مع أربعة اختيارات
  'open', // إجابة مباشرة من التعليقات
  'complete', // أكمل الكلمة أو العبارة
  'country', // خمّن الدولة (من وصف أو أدلة)
  'capital', // خمّن العاصمة
  'image_person', // تخمين شخصية من صورة
  'image_player', // تخمين لاعب من صورته
  'logo', // تخمين شعار نادٍ
  'flag', // تخمين علم دولة
  'landmark', // تخمين معلم سياحي
  'map', // تخمين دولة من الخريطة
];
export const IMAGE_TYPES = new Set(['image_person', 'image_player', 'logo', 'flag', 'landmark', 'map']);
export const CHOICE_COUNT = 4;

const emptyT = () => ({ ar: '', fr: '', en: '' });

function cleanT(v) {
  const out = emptyT();
  if (typeof v === 'string') out.ar = v.trim();
  else if (v && typeof v === 'object') for (const l of LANGS) out[l] = typeof v[l] === 'string' ? v[l].trim() : '';
  return out;
}

function cleanList(v) {
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
  if (typeof v === 'string') return v.split(/[|\n]/).map((x) => x.trim()).filter(Boolean);
  return [];
}

/** Answer mode is derived from the content: choices → "choice", otherwise free "text". */
export function answerMode(q) {
  return Array.isArray(q.choices) && q.choices.length > 0 ? 'choice' : 'text';
}

/** Coerce raw input (admin form, JSON or CSV import) into a clean question object. */
export function sanitizeQuestion(raw) {
  const q = {
    id: raw.id ? String(raw.id).trim() : '',
    category: String(raw.category || '').trim(),
    subcategory: String(raw.subcategory || '').trim(),
    region: String(raw.region || '').trim(),
    difficulty: String(raw.difficulty || '').trim(),
    type: String(raw.type || 'mcq').trim(),
    text: cleanT(raw.text),
    image: raw.image ? String(raw.image).trim() : '',
    choices: Array.isArray(raw.choices) ? raw.choices.map(cleanT).filter((c) => LANGS.some((l) => c[l])) : [],
    correct: raw.correct === '' || raw.correct == null ? null : Number(raw.correct),
    answers: { ar: [], fr: [], en: [] },
    source: {
      title: String(raw.source?.title || '').trim(),
      url: String(raw.source?.url || '').trim(),
    },
    factKey: String(raw.factKey || '').trim(),
    volatile: raw.volatile === true || raw.volatile === 'true' || raw.volatile === '1',
    verifiedAt: raw.verifiedAt ? String(raw.verifiedAt).trim().slice(0, 10) : '',
    tags: cleanList(raw.tags),
    notes: String(raw.notes || '').trim(),
    status: STATUSES.includes(raw.status) ? raw.status : 'draft',
    createdAt: raw.createdAt || '',
    updatedAt: raw.updatedAt || '',
  };
  for (const l of LANGS) q.answers[l] = cleanList(raw.answers?.[l]);
  if (q.choices.length === 0) q.correct = null;
  return q;
}

/** Text of a translated field in the requested language, falling back to Arabic then any. */
export function tr(t, lang = 'ar') {
  if (!t) return '';
  return t[lang] || t.ar || t.fr || t.en || '';
}

/** All accepted textual answers across languages (choice text included for choice questions). */
export function acceptedAnswers(q) {
  const list = LANGS.flatMap((l) => q.answers?.[l] || []);
  if (answerMode(q) === 'choice' && q.choices[q.correct]) list.push(...LANGS.map((l) => q.choices[q.correct][l]).filter(Boolean));
  return [...new Set(list)];
}

export function displayAnswer(q) {
  if (answerMode(q) === 'choice') return { ...q.choices[q.correct] };
  const out = {};
  for (const l of LANGS) out[l] = q.answers[l]?.[0] || q.answers.ar?.[0] || '';
  return out;
}

export function isStale(q, maxAgeDays = 180, now = Date.now()) {
  if (!q.volatile) return false;
  const t = Date.parse(q.verifiedAt);
  if (Number.isNaN(t)) return true;
  return now - t > maxAgeDays * 86400000;
}

function jaccard(a, b) {
  const A = new Set(a);
  const B = new Set(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}

/**
 * Validate a question.
 *  - errors: block saving (structural) or block publishing (quality) — see `blocking`.
 *  - warnings: shown to the admin during review.
 * `others` is the rest of the bank, used for duplicate detection.
 */
export function validateQuestion(q, { categories = [], others = [], maxAgeDays = 180 } = {}) {
  const structural = [];
  const quality = [];
  const warnings = [];
  const cat = categories.find((c) => c.id === q.category);

  if (!cat) structural.push('تصنيف غير معروف / unknown category');
  else if (q.subcategory && !cat.subcategories.some((s) => s.id === q.subcategory)) warnings.push('تصنيف فرعي غير معروف / unknown subcategory');
  if (!REGIONS.includes(q.region)) structural.push('المنطقة الثقافية مطلوبة (arab / world / foreign)');
  if (!DIFFICULTIES.includes(q.difficulty)) structural.push('مستوى الصعوبة مطلوب (easy / medium / hard)');
  if (!TYPES.includes(q.type)) structural.push('نوع السؤال غير معروف');
  if (!q.text.ar && !q.text.fr && !q.text.en) structural.push('نص السؤال مطلوب');

  for (const l of LANGS) if (!q.text[l]) warnings.push(`ترجمة السؤال ناقصة (${l})`);

  const mode = answerMode(q);
  if (q.type === 'mcq' && mode !== 'choice') quality.push('سؤال الاختيارات يحتاج إلى أربعة اختيارات');
  if ((q.type === 'open' || q.type === 'complete') && mode === 'choice') quality.push('سؤال الإجابة المباشرة لا يحتوي على اختيارات');

  if (mode === 'choice') {
    if (q.choices.length !== CHOICE_COUNT) quality.push(`يجب أن يكون عدد الاختيارات ${CHOICE_COUNT}`);
    if (!Number.isInteger(q.correct) || q.correct < 0 || q.correct >= q.choices.length) quality.push('حدد الاختيار الصحيح');
    const keys = q.choices.map((c) => compactKey(c.ar || c.fr || c.en));
    if (new Set(keys).size !== keys.length) quality.push('اختيارات مكررة — الإجابة قد تكون غامضة');
    q.choices.forEach((c, i) => {
      for (const l of LANGS) if (!c[l]) { warnings.push(`ترجمة الاختيار ${i + 1} ناقصة (${l})`); break; }
    });
  } else {
    if (!LANGS.some((l) => q.answers[l].length)) quality.push('أضف إجابة مقبولة واحدة على الأقل');
    for (const l of LANGS) if (!q.answers[l].length) warnings.push(`الإجابة ناقصة باللغة (${l})`);
  }

  if (IMAGE_TYPES.has(q.type) && !q.image) quality.push('هذا النوع يحتاج إلى صورة');
  if (!q.source.title && !q.source.url) quality.push('أضف مرجعاً أو مصدراً للمعلومة');
  if (q.source.url && !/^https?:\/\//i.test(q.source.url)) warnings.push('رابط المصدر يجب أن يبدأ بـ http');
  if (q.volatile && !q.verifiedAt) quality.push('المعلومة المتغيرة تحتاج إلى تاريخ آخر تحقق');
  if (q.volatile && isStale(q, maxAgeDays)) warnings.push('معلومة متغيرة: آخر تحقق قديم — أعد التحقق قبل الاستعمال (مستبعدة من اللعب)');

  // The answer must not be given away by the question text.
  const qText = ` ${looseTokens(q.text.ar).join(' ')} `;
  const ans = displayAnswer(q).ar;
  const ansTokens = looseTokens(ans);
  if (ans && compactKey(ans).length > 3 && qText.includes(` ${ansTokens.join(' ')} `)) warnings.push('الإجابة مذكورة في نص السؤال');

  // Duplicate detection: same wording (and same image), the same fact (factKey),
  // or a near-identical wording that leads to the same answer (a rephrased duplicate).
  const myTokens = looseTokens(q.text.ar || q.text.fr || q.text.en);
  const myNorm = normalize(q.text.ar || q.text.fr || q.text.en);
  const myAnswer = compactKey(displayAnswer(q).ar || displayAnswer(q).en || '');
  for (const o of others) {
    if (o.id === q.id) continue;
    const oText = o.text.ar || o.text.fr || o.text.en;
    const sameImage = (o.image || '') === (q.image || '');
    const oAnswer = compactKey(displayAnswer(o).ar || displayAnswer(o).en || '');
    if (normalize(oText) === myNorm && sameImage) {
      structural.push(`سؤال مكرر: ${o.id}`);
      continue;
    }
    if (q.factKey && o.factKey === q.factKey) warnings.push(`نفس المعلومة موجودة في السؤال ${o.id} (factKey) — لن يظهرا في نفس الجولة`);
    else if (sameImage && myAnswer && oAnswer === myAnswer && jaccard(myTokens, looseTokens(oText)) >= 0.5) {
      warnings.push(`قد يكون إعادة صياغة للسؤال ${o.id} (نفس الإجابة وصياغة مشابهة)`);
    }
  }

  return {
    errors: [...structural, ...quality],
    structural,
    quality,
    warnings: [...new Set(warnings)],
    publishable: structural.length === 0 && quality.length === 0,
  };
}
