// يتحقق من جودة بنك الأسئلة كاملاً — Validate the whole question bank.
// Usage: npm run validate
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { QuestionStore } from '../src/store.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const store = new QuestionStore(path.join(root, 'data'));
let errors = 0;
let warnings = 0;
for (const q of store.all()) {
  const v = store.validate(q);
  const blocking = q.status === 'published' ? v.errors : v.structural;
  if (blocking.length) { errors += blocking.length; console.log(`❌ ${q.id}: ${blocking.join(' | ')}`); }
  if (v.warnings.length) { warnings += v.warnings.length; if (process.argv.includes('--warnings')) console.log(`⚠️  ${q.id}: ${v.warnings.join(' | ')}`); }
}
const s = store.stats();
console.log(`\n${s.total} سؤال — منشور: ${s.byStatus.published || 0}، قيد المراجعة: ${s.byStatus.review || 0}، مسودة: ${s.byStatus.draft || 0}`);
const pub = s.publishedByRegion;
const total = Object.values(pub).reduce((a, b) => a + b, 0) || 1;
console.log(`النسب (المنشور): عربي ${(100 * (pub.arab || 0) / total).toFixed(0)}% · عالمي ${(100 * (pub.world || 0) / total).toFixed(0)}% · أجنبي ${(100 * (pub.foreign || 0) / total).toFixed(0)}%   (الهدف 65/25/10)`);
console.log(`معلومات متغيرة تحتاج إعادة تحقق: ${s.stale}`);
console.log(`أخطاء: ${errors} · تنبيهات: ${warnings}${process.argv.includes('--warnings') ? '' : ' (أضف --warnings لعرضها)'}`);
process.exit(errors ? 1 : 0);
